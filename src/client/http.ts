import type { ZodType } from 'zod';
import { apiErrorSchema } from '../schemas/common.js';
import { ApiContractError, ApiError, kindFromStatus, type ApiErrorKind } from './errors.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export type TokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

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
  /** Validación global con Zod. Por defecto: activa fuera de producción. */
  validateResponses?: boolean;
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

/** Valida las respuestas en desarrollo; en producción depende del consumidor. */
function defaultValidateResponses(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.NODE_ENV !== 'production';
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

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: finalHeaders,
        signal,
        body: body === undefined ? undefined : JSON.stringify(body),
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
