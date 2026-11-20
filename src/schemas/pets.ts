import { z } from 'zod';
import { dateOnlySchema, emptyToUndefined, idSchema, timestampSchema } from './common.js';

/**
 * Dominio del QR de mascotas: un complemento de pago que el titular contrata
 * aparte de su plan. Cada mascota registrada tiene su propio token secreto y su
 * propio QR, y su información vive cifrada igual que la ficha médica.
 *
 * Deliberadamente **no** incluye el domicilio del titular: lo que se publica en
 * el QR es solo lo necesario para devolver a la mascota a su casa.
 */

/** Topes que aplica el backend antes de cifrar y guardar la ficha de la mascota. */
export const PET_MAX_LIST_ITEMS = 20;
export const PET_MAX_SHORT_TEXT = 120;
export const PET_MAX_LONG_TEXT = 2000;

/** Especie de la mascota. `other` cubre cualquier animal que no esté en la lista. */
export const petSpeciesSchema = z.enum(['dog', 'cat', 'bird', 'rabbit', 'other']);
export type PetSpecies = z.infer<typeof petSpeciesSchema>;

export const petSexSchema = z.enum(['male', 'female', 'unknown']);
export type PetSex = z.infer<typeof petSexSchema>;

const shortText = () =>
  emptyToUndefined(
    z.string().max(PET_MAX_SHORT_TEXT, `Máximo ${PET_MAX_SHORT_TEXT} caracteres`),
  );

const longText = () =>
  emptyToUndefined(
    z.string().max(PET_MAX_LONG_TEXT, `Máximo ${PET_MAX_LONG_TEXT} caracteres`),
  );

const textList = () =>
  z
    .array(z.string().trim().min(1))
    .max(PET_MAX_LIST_ITEMS, `Máximo ${PET_MAX_LIST_ITEMS} elementos`)
    .optional();

/**
 * Ficha de la mascota. El backend la guarda cifrada y solo la entrega a su
 * dueño o a quien abra el QR con el token correcto.
 */
export const petDataSchema = z.object({
  species: petSpeciesSchema.optional(),
  breed: shortText(),
  color: shortText(),
  sex: petSexSchema.optional(),
  birth_date: emptyToUndefined(dateOnlySchema),
  /** Número de microchip o de la placa de identificación. */
  microchip: shortText(),
  /** Señas particulares: lo que ayuda a reconocerla si se pierde. */
  description: longText(),
  /** Cuidados especiales o padecimientos que quien la encuentre deba conocer. */
  notes: longText(),
  allergies: textList(),
  vet_name: shortText(),
  vet_phone: shortText(),
  /** A quién debe llamar quien encuentre a la mascota. */
  contact_name: shortText(),
  contact_phone: shortText(),
});
export type PetData = z.infer<typeof petDataSchema>;

/** Estado del QR de una mascota. `url` solo llega cuando está habilitado. */
export const petEmergencyViewSchema = z.object({
  enabled: z.boolean(),
  url: z.string().optional(),
});
export type PetEmergencyView = z.infer<typeof petEmergencyViewSchema>;

/** Una mascota tal como la ve su dueño. */
export const petViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  data: petDataSchema.nullish(),
  emergency_access: petEmergencyViewSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema.optional(),
});
export type PetView = z.infer<typeof petViewSchema>;

/**
 * Cuánto del complemento está contratado y cuánto permite. El precio y el tope
 * salen de los ajustes operativos, así que pueden cambiar sin recompilar.
 */
export const petQuotaViewSchema = z.object({
  /** Mascotas permitidas por el complemento. */
  limit: z.number().int().nonnegative(),
  /** Mascotas registradas hoy. */
  used: z.number().int().nonnegative(),
  /** Precio por mascota. */
  price: z.number().nonnegative(),
  /** Moneda en la que está ese precio. */
  currency: z.string(),
  /** `true` si todavía cabe otra mascota. */
  can_add: z.boolean(),
});
export type PetQuotaView = z.infer<typeof petQuotaViewSchema>;

/** Respuesta de `GET /api/pets`. */
export const petsResponseSchema = z.object({
  pets: z.array(petViewSchema).nullish().transform((value) => value ?? []),
  quota: petQuotaViewSchema,
});
export type PetsResponse = z.infer<typeof petsResponseSchema>;

/**
 * Cuerpo de `POST /api/pets`. Registrar una mascota activa el complemento: la
 * suscripción sube de monto a partir de la siguiente renovación.
 */
export const createPetInputSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la mascota').max(PET_MAX_SHORT_TEXT),
  data: petDataSchema.optional(),
});
export type CreatePetInput = z.infer<typeof createPetInputSchema>;

/**
 * Cuerpo de `PUT /api/pets/:id`. Al igual que la ficha médica, es un **upsert
 * completo**: los campos omitidos se pierden, así que el formulario debe enviar
 * la mascota entera.
 */
export const updatePetInputSchema = createPetInputSchema;
export type UpdatePetInput = z.infer<typeof updatePetInputSchema>;

/** Respuesta de `GET /api/pets/:id`, `POST /api/pets` y `PUT /api/pets/:id`. */
export const petResponseSchema = z.object({
  message: z.string(),
  pet: petViewSchema,
});
export type PetResponse = z.infer<typeof petResponseSchema>;

/** Respuesta de `POST /api/pets/:id/emergency/enable`. */
export const petEmergencyEnableResponseSchema = z.object({
  message: z.string(),
  url: z.string(),
});
export type PetEmergencyEnableResponse = z.infer<typeof petEmergencyEnableResponseSchema>;

/**
 * Respuesta de `GET /api/pet-qr/:token` (ruta pública, sin sesión). Cuando
 * `degraded` es `true` el complemento ya no está pagado y solo se muestra el
 * nombre de la mascota.
 */
export const petPublicViewSchema = z.object({
  name: z.string(),
  data: petDataSchema,
  updated_at: timestampSchema,
  /** Titular de la cuenta, por si el contacto configurado no responde. */
  owner_name: z.string(),
  degraded: z.boolean(),
  message: z.string().optional(),
});
export type PetPublicView = z.infer<typeof petPublicViewSchema>;
