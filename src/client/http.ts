import type { ZodType } from 'zod';
import { apiErrorSchema } from '../schemas/common.js';
import { ApiContractError, ApiError, kindFromStatus, type ApiErrorKind } from './errors.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export type TokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

/**
 * Firma una petición: recibe la cadena canónica y devuelve el HMAC-SHA256 en
 * hexadecimal, o `null` para no firmarla (p. ej. el móvil antes de iniciar
 * sesión, cuando aún no tiene clave). La implementación del HMAC vive en cada
 * plataforma (Node en el BFF, `expo-crypto` en el móvil); la cadena canónica la
 * construye este cliente para que cliente y backend no puedan divergir.
 */
export type RequestSigner = (canonical: string) => Promise<string | null> | string | null;

/** Nombres de las cabeceras con las que viaja la firma de cada petición. */
export const SIGNATURE_HEADERS = {
  timestamp: 'X-GI-Timestamp',
  nonce: 'X-GI-Nonce',
  signature: 'X-GI-Signature',
} as const;

export type RequestOptions<T> = {
  /** Por defecto `GET`. */
  method?: HttpMethod;
  /** Ruta relativa a `baseUrl`, p. ej. `/api/medical/profile`. */
  path: string;
  query?: QueryParams;
  /** Se serializa a JSON y se envía como cuerpo. */
  body?: unknown;
  /** Esquema con el que validar la respuesta. */
  schema?: ZodType<T>;
  signal?: AbortSignal;
  /** Adjunta el token si está disponible. Por defecto `true`. */
  auth?: boolean;
  /** Fuerza o desactiva la validación de esta petición concreta. */
  validate?: boolean;
  headers?: Record<string, string>;
};

export type ApiClientOptions = {
  /** Base URL del backend, sin barra final. P. ej. `http://localhost:8080`. */
  baseUrl: string;
  getToken?: TokenProvider;
  /** Se invoca ante un `401` para que la app limpie la sesión y redirija a login. */
  onUnauthorized?: (error: ApiError) => void;
  fetchImpl?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  /** Validación global con Zod. Por defecto: activa. */
  validateResponses?: boolean;
  /**
   * Firma cada petición con HMAC-SHA256 para que el backend pueda detectar que
   * alguien la modificó, y rechazar un reenvío (replay) por su nonce. Si no se
   * define, las peticiones viajan sin firma y el backend decide si las acepta.
   */
  signRequest?: RequestSigner;
};

export type ApiClient = {
  readonly baseUrl: string;
  request<T = unknown>(options: RequestOptions<T>): Promise<T>;
  get<T = unknown>(
    path: string,
    options?: Omit<RequestOptions<T>, 'path' | 'method' | 'body'>,
  ): Promise<T>;
  post<T = unknown>(
    path: string,
    options?: Omit<RequestOptions<T>, 'path' | 'method'>,
  ): Promise<T>;
  put<T = unknown>(path: string, options?: Omit<RequestOptions<T>, 'path' | 'method'>): Promise<T>;
  patch<T = unknown>(
    path: string,
    options?: Omit<RequestOptions<T>, 'path' | 'method'>,
  ): Promise<T>;
  del<T = unknown>(path: string, options?: Omit<RequestOptions<T>, 'path' | 'method'>): Promise<T>;
};

const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Los datos enviados no son válidos',
  401: 'Tu sesión expiró. Inicia sesión de nuevo',
  402: 'Necesitas una suscripción activa para continuar',
  404: 'No encontramos lo que buscabas',
  409: 'La operación no se pudo completar por el estado actual',
  429: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo',
};

function defaultErrorMessage(status: number): string {
  const known = HTTP_STATUS_MESSAGES[status];
  if (known) return known;
  return status >= 500
    ? 'El servidor tuvo un problema. Inténtalo más tarde'
    : 'Ocurrió un error inesperado';
}

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = isAbsoluteUrl(path)
    ? path
    : `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }

  const queryString = params.toString();
  if (!queryString) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
}

/** `Retry-After` puede venir en segundos o como fecha HTTP. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.max(0, Math.round((timestamp - Date.now()) / 1000));
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;

  const text = await response.text();
  if (text.trim() === '') return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Valida las respuestas con Zod siempre, también en producción. Antes se
 * desactivaba en producción por rendimiento, pero una respuesta con forma
 * inesperada (backend comprometido o intermediario que altera el tráfico) debe
 * rechazarse en lugar de propagarse a la UI sin comprobar.
 */
function defaultValidateResponses(): boolean {
  return true;
}

/** Nonce de 16 bytes para la firma: solo necesita ser irrepetible, no secreto. */
function createNonce(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => void } })
    .crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Cadena canónica que el backend reconstruye para verificar la firma. Cualquier
 * cambio en método, ruta, query, marca de tiempo, nonce o cuerpo invalida el
 * HMAC, de modo que una petición alterada no puede pasar la verificación.
 */
function buildCanonicalRequest(
  method: string,
  pathname: string,
  search: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return [method, pathname, search.replace(/^\?/, ''), timestamp, nonce, body].join('\n');
}

/**
 * Cliente HTTP único del contrato: inyecta el token, centraliza los errores
 * (`401` → `onUnauthorized`, `429` → `retryAfterSeconds`) y valida las respuestas
 * con Zod cuando está en desarrollo. No persiste nada en disco ni en `localStorage`.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const validateByDefault = options.validateResponses ?? defaultValidateResponses();

  async function request<T = unknown>(req: RequestOptions<T>): Promise<T> {
    const {
      method = 'GET',
      path,
      query,
      body,
      schema,
      signal,
      auth = true,
      headers = {},
      validate = validateByDefault,
    } = req;

    const url = buildUrl(baseUrl, path, query);

    const finalHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...options.defaultHeaders,
      ...headers,
    };

    if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';

    if (auth && options.getToken) {
      const token = await options.getToken();
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }

    const serializedBody = body === undefined ? undefined : JSON.stringify(body);

    // Firma de la petición: el backend recalcula el HMAC sobre los mismos datos
    // y rechaza la petición si no cuadra o si el nonce ya se usó.
    if (options.signRequest) {
      const { pathname, search } = new URL(url);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = createNonce();
      const canonical = buildCanonicalRequest(
        method,
        pathname,
        search,
        timestamp,
        nonce,
        serializedBody ?? '',
      );
      const signature = await options.signRequest(canonical);

      // Sin clave (p. ej. el móvil antes de iniciar sesión) la petición viaja sin
      // firma: el backend decide si esa ruta puede aceptarse así.
      if (signature) {
        finalHeaders[SIGNATURE_HEADERS.timestamp] = timestamp;
        finalHeaders[SIGNATURE_HEADERS.nonce] = nonce;
        finalHeaders[SIGNATURE_HEADERS.signature] = signature;
      }
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: finalHeaders,
        signal,
        body: serializedBody,
        // Los datos médicos nunca deben quedar en la caché HTTP.
        cache: 'no-store',
      });
    } catch (cause) {
      throw new ApiError('No se pudo conectar con el servidor', 0, 'network', undefined, undefined, {
        cause,
      });
    }

    const payload = await readBody(response);

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      const error = new ApiError(
        parsed.success ? parsed.data.error : defaultErrorMessage(response.status),
        response.status,
        kindFromStatus(response.status) as ApiErrorKind,
        parsed.success ? parsed.data.details : undefined,
        parseRetryAfter(response.headers.get('Retry-After')),
      );

      if (error.isUnauthorized) options.onUnauthorized?.(error);
      throw error;
    }

    if (schema && validate) {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiContractError(`${method} ${path}`, parsed.error.issues);
      }
      return parsed.data;
    }

    return payload as T;
  }

  return {
    baseUrl,
    request,
    get: (path, opts) => request({ ...opts, path, method: 'GET' }),
    post: (path, opts) => request({ ...opts, path, method: 'POST' }),
    put: (path, opts) => request({ ...opts, path, method: 'PUT' }),
    patch: (path, opts) => request({ ...opts, path, method: 'PATCH' }),
    del: (path, opts) => request({ ...opts, path, method: 'DELETE' }),
  };
}
