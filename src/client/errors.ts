/** Clasificación de un fallo de la API, derivada del código HTTP. */
export type ApiErrorKind =
  | 'network'
  | 'bad_request'
  | 'unauthorized'
  | 'payment_required'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'unknown';

export function kindFromStatus(status: number): ApiErrorKind {
  switch (status) {
    case 0:
      return 'network';
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 402:
      return 'payment_required';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'server' : 'unknown';
  }
}

/**
 * Error de la API con el código HTTP y una clasificación lista para decidir la UX:
 * `401` → cerrar sesión, `402` → ir a planes, `429` → esperar y reintentar.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: ApiErrorKind = kindFromStatus(status),
    readonly details?: unknown,
    /** Segundos sugeridos por la cabecera `Retry-After`, si el backend la envía. */
    readonly retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.kind === 'network';
  }

  get isUnauthorized() {
    return this.kind === 'unauthorized';
  }

  get isPaymentRequired() {
    return this.kind === 'payment_required';
  }

  get isNotFound() {
    return this.kind === 'not_found';
  }

  get isConflict() {
    return this.kind === 'conflict';
  }

  get isRateLimited() {
    return this.kind === 'rate_limited';
  }
}

/**
 * La respuesta no cumple el contrato (esquema Zod). Solo se lanza en desarrollo:
 * sirve para detectar desajustes entre frontend y backend cuanto antes.
 */
export class ApiContractError extends Error {
  constructor(
    readonly endpoint: string,
    readonly issues: unknown,
  ) {
    super(`La respuesta de ${endpoint} no cumple el contrato esperado`);
    this.name = 'ApiContractError';
  }
}
