import { z } from 'zod';
import { dateOnlySchema, emptyToUndefined, geoPointSchema, idSchema, timestampSchema } from './common.js';

/** Topes que aplica el backend antes de cifrar y guardar la ficha. */
export const MEDICAL_MAX_LIST_ITEMS = 20;
export const MEDICAL_MAX_SHORT_TEXT = 120;
export const MEDICAL_MAX_LONG_TEXT = 2000;

export const bloodTypeSchema = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
export type BloodType = z.infer<typeof bloodTypeSchema>;

const shortText = () =>
  emptyToUndefined(
    z.string().max(MEDICAL_MAX_SHORT_TEXT, `Máximo ${MEDICAL_MAX_SHORT_TEXT} caracteres`),
  );

const longText = () =>
  emptyToUndefined(
    z.string().max(MEDICAL_MAX_LONG_TEXT, `Máximo ${MEDICAL_MAX_LONG_TEXT} caracteres`),
  );

const textList = () =>
  z
    .array(z.string().trim().min(1))
    .max(MEDICAL_MAX_LIST_ITEMS, `Máximo ${MEDICAL_MAX_LIST_ITEMS} elementos`)
    .optional();

export const medicationSchema = z.object({
  name: z.string().trim().min(1, 'El medicamento necesita un nombre').max(MEDICAL_MAX_SHORT_TEXT),
  dose: shortText(),
  frequency: shortText(),
});
export type Medication = z.infer<typeof medicationSchema>;

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'El contacto necesita un nombre').max(MEDICAL_MAX_SHORT_TEXT),
  relationship: shortText(),
  phone: z.string().trim().min(1, 'El contacto necesita un teléfono').max(MEDICAL_MAX_SHORT_TEXT),
  email: emptyToUndefined(z.string().email('Correo electrónico no válido')),
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

/**
 * Cuerpo de `PUT /api/medical/profile`. El backend hace un **upsert completo**:
 * los campos omitidos se pierden, así que el formulario debe enviar la ficha entera.
 */
export const medicalDataSchema = z.object({
  blood_type: bloodTypeSchema.optional(),
  date_of_birth: emptyToUndefined(dateOnlySchema),
  allergies: textList(),
  allergy_notes: longText(),
  chronic_conditions: textList(),
  medications: z.array(medicationSchema).max(MEDICAL_MAX_LIST_ITEMS).optional(),
  medical_history: longText(),
  notes: longText(),
  emergency_contacts: z.array(emergencyContactSchema).max(MEDICAL_MAX_LIST_ITEMS).optional(),
  address: longText(),
  /** Si es `true`, el domicilio se muestra a quien escanea el QR. Por defecto `false`. */
  share_address: z.boolean().optional(),
  social_security_number: shortText(),
  national_id: shortText(),
  insurance_provider: shortText(),
  insurance_policy: shortText(),
});
export type MedicalData = z.infer<typeof medicalDataSchema>;

export const emergencyAccessViewSchema = z.object({
  enabled: z.boolean(),
  url: z.string().optional(),
});
export type EmergencyAccessView = z.infer<typeof emergencyAccessViewSchema>;

export const lastLocationViewSchema = z.object({
  location: geoPointSchema,
  recorded_at: timestampSchema,
  expires_at: timestampSchema,
});
export type LastLocationView = z.infer<typeof lastLocationViewSchema>;

/** Respuesta de `GET /api/medical/profile`. */
export const medicalProfileViewSchema = z.object({
  medical_data: medicalDataSchema.nullish(),
  emergency_access: emergencyAccessViewSchema,
  last_location: lastLocationViewSchema.optional(),
  updated_at: timestampSchema.optional(),
});
export type MedicalProfileView = z.infer<typeof medicalProfileViewSchema>;

/** Respuesta de `POST /api/medical/emergency/enable`. */
export const emergencyEnableResponseSchema = z.object({
  message: z.string(),
  url: z.string(),
});
export type EmergencyEnableResponse = z.infer<typeof emergencyEnableResponseSchema>;

/** Cuerpo de `PUT /api/medical/location`. La app móvil lo envía periódicamente. */
export const updateLocationInputSchema = z.object({
  lat: z.number().min(-90, 'Latitud fuera de rango').max(90, 'Latitud fuera de rango'),
  lng: z.number().min(-180, 'Longitud fuera de rango').max(180, 'Longitud fuera de rango'),
  accuracy: z.number().nonnegative().optional(),
  recorded_at: timestampSchema.optional(),
});
export type UpdateLocationInput = z.infer<typeof updateLocationInputSchema>;

export const accessLogEntrySchema = z.object({
  id: idSchema,
  user_id: idSchema,
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  created_at: timestampSchema,
  expires_at: timestampSchema,
});
export type AccessLogEntry = z.infer<typeof accessLogEntrySchema>;

/**
 * Respuesta de `GET /api/medical/access-log`.
 * Ojo: el backend la envuelve en `access_log`, no es una lista suelta.
 */
export const accessLogResponseSchema = z.object({
  access_log: z.array(accessLogEntrySchema),
});
export type AccessLogResponse = z.infer<typeof accessLogResponseSchema>;
