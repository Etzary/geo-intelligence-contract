import { z } from 'zod';
import { timestampSchema } from './common.js';
import { medicalDataSchema } from './medical.js';

/**
 * Respuesta de `GET /api/emergency/:token` (ruta pública, sin sesión).
 * Cuando `degraded` es `true` la suscripción venció y `medical_data` solo trae
 * tipo de sangre, alergias y contactos de emergencia.
 */
export const emergencyInfoSchema = z.object({
  name: z.string(),
  updated_at: timestampSchema,
  medical_data: medicalDataSchema,
  degraded: z.boolean(),
  message: z.string().optional(),
  /** `true` si hay contactos de emergencia a los que avisar. */
  can_alert: z.boolean(),
  /** Canales configurados hoy: `["sms","email","whatsapp"]`. */
  alert_channels: z.array(z.string()).optional(),
});
export type EmergencyInfo = z.infer<typeof emergencyInfoSchema>;

/** Cuerpo **opcional** de `POST /api/emergency/:token/alert`: ubicación de quien escanea. */
export const alertLocationInputSchema = z.object({
  lat: z.number().min(-90, 'Latitud fuera de rango').max(90, 'Latitud fuera de rango'),
  lng: z.number().min(-180, 'Longitud fuera de rango').max(180, 'Longitud fuera de rango'),
  accuracy: z.number().nonnegative().optional(),
});
export type AlertLocationInput = z.infer<typeof alertLocationInputSchema>;

/** Respuesta de `POST /api/emergency/:token/alert`. */
export const emergencyAlertResultSchema = z.object({
  message: z.string(),
  /** Contactos alcanzados por al menos un canal. */
  notified: z.number().int().nonnegative(),
  /** Contactos sin ningún canal exitoso. */
  failed: z.number().int().nonnegative(),
  /** Contactos considerados. */
  total: z.number().int().nonnegative(),
  channels: z.array(z.string()),
});
export type EmergencyAlertResult = z.infer<typeof emergencyAlertResultSchema>;
