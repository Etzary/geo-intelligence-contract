import { z } from 'zod';

/**
 * Cuerpo de error estándar del backend: `{ "error": "mensaje" }`.
 * Algunas validaciones agregan `details`.
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/** Respuesta genérica de confirmación: `{ "message": "..." }`. */
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/** Correo electrónico validado. Único punto para cambiar de librería de validación. */
export const emailSchema = z.string().email('Correo electrónico no válido');

/** Identificador devuelto por el backend (ObjectID en hexadecimal). */
export const idSchema = z.string().min(1);

/** Fecha/hora ISO 8601 tal como la serializa Go (`time.Time`). */
export const timestampSchema = z.string().min(1);

/** Código de verificación de 6 dígitos. */
export const verificationCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'El código debe tener 6 dígitos');

/** Día en formato AAAA-MM-DD. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');

/** Coordenadas geográficas válidas. */
export const geoPointSchema = z.object({
  lat: z.number().min(-90, 'Latitud fuera de rango').max(90, 'Latitud fuera de rango'),
  lng: z.number().min(-180, 'Longitud fuera de rango').max(180, 'Longitud fuera de rango'),
  accuracy: z.number().nonnegative().optional(),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

/**
 * Convierte cadenas vacías o en blanco en `undefined` antes de validar, para que
 * los formularios puedan enviar `""` en campos opcionales sin fallar.
 */
export const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );
