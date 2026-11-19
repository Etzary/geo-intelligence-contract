import { z } from 'zod';
import { emailSchema, idSchema, timestampSchema } from './common.js';
import { planSchema, subscriptionViewSchema } from './subscription.js';

/**
 * Dominio de la consola de operaciones: el panel de administración que vive
 * **solo** en la web, con su propio inicio de sesión y sus propios roles.
 *
 * Estos tipos no se mezclan con los del usuario final: una cuenta de usuario
 * nunca puede llegar aquí, y el token de la consola es independiente del JWT
 * de sesión normal.
 */

/** Roles disponibles en la consola. `owner` puede todo; `analyst` solo consulta. */
export const opsRoleSchema = z.enum(['owner', 'analyst']);
export type OpsRole = z.infer<typeof opsRoleSchema>;

/** Identidad del operador que ve la consola. Nunca incluye credenciales. */
export const opsGrantSchema = z.object({
  email: emailSchema,
  name: z.string(),
  role: opsRoleSchema,
});
export type OpsGrant = z.infer<typeof opsGrantSchema>;

/** Cuerpo de `POST /api/ops/auth/login`. */
export const opsLoginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña'),
});
export type OpsLoginInput = z.infer<typeof opsLoginInputSchema>;

/**
 * Respuesta de `POST /api/ops/auth/login`: el token de la consola y la identidad
 * del operador. El token es propio de la consola y no sirve para las rutas de
 * usuario, ni al revés.
 */
export const opsSessionSchema = z.object({
  message: z.string(),
  token: z.string().min(1),
  grant: opsGrantSchema,
});
export type OpsSession = z.infer<typeof opsSessionSchema>;

/** Respuesta de `GET /api/ops/auth/me`: solo la identidad, sin volver a emitir token. */
export const opsGrantResponseSchema = z.object({
  message: z.string(),
  grant: opsGrantSchema,
});
export type OpsGrantResponse = z.infer<typeof opsGrantResponseSchema>;

/** Conteo agrupado por una clave (proveedor, plan, estado…). */
export const countBreakdownSchema = z.object({
  key: z.string(),
  count: z.number(),
});
export type CountBreakdown = z.infer<typeof countBreakdownSchema>;

export const userAnalyticsSchema = z.object({
  total: z.number(),
  email_verified: z.number(),
  phone_verified: z.number(),
  two_factor_users: z.number(),
});
export type UserAnalytics = z.infer<typeof userAnalyticsSchema>;

export const medicalAnalyticsSchema = z.object({
  profiles: z.number(),
  emergency_enabled: z.number(),
  access_logs_24h: z.number(),
  /** Señales verdes ("estoy bien") enviadas en las últimas 24 h. */
  check_ins_24h: z.number(),
});
export type MedicalAnalytics = z.infer<typeof medicalAnalyticsSchema>;

export const subscriptionAnalyticsSchema = z.object({
  total: z.number(),
  active: z.number(),
  pending: z.number(),
  paused: z.number(),
  cancelled: z.number(),
  expired: z.number(),
  payment_events_24h: z.number(),
  needs_reconciliation: z.number(),
  /** Ingreso mensual recurrente estimado, en la moneda del catálogo. */
  estimated_monthly_revenue: z.number(),
  by_provider: z.array(countBreakdownSchema),
  by_plan: z.array(countBreakdownSchema),
});
export type SubscriptionAnalytics = z.infer<typeof subscriptionAnalyticsSchema>;

/** Respuesta de `GET /api/ops/analytics/overview`. */
export const analyticsOverviewSchema = z.object({
  generated_at: timestampSchema,
  providers: z.array(z.string()),
  users: userAnalyticsSchema,
  medical: medicalAnalyticsSchema,
  subscriptions: subscriptionAnalyticsSchema,
});
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;

/** Respuesta de `GET /api/ops/analytics/subscriptions`. */
export const opsSubscriptionSummarySchema = subscriptionAnalyticsSchema;
export type OpsSubscriptionSummary = z.infer<typeof opsSubscriptionSummarySchema>;

/** Respuesta de `GET /api/ops/analytics/medical`. */
export const opsMedicalSummarySchema = medicalAnalyticsSchema;
export type OpsMedicalSummary = z.infer<typeof opsMedicalSummarySchema>;

/** Respuesta de `GET /api/ops/plans` (catálogo completo, incluidos los inactivos). */
export const opsPlansResponseSchema = z.object({
  plans: z.array(planSchema).nullish().transform((value) => value ?? []),
});
export type OpsPlansResponse = z.infer<typeof opsPlansResponseSchema>;

/** Cuerpo de `PATCH /api/ops/plans/:code`. Solo se aplican los campos enviados. */
export const updatePlanInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  interval_months: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;

/** Respuesta de `PATCH /api/ops/plans/:code`. */
export const opsPlanUpdateResponseSchema = z.object({
  message: z.string(),
  plan: planSchema,
});
export type OpsPlanUpdateResponse = z.infer<typeof opsPlanUpdateResponseSchema>;

/** Cuerpo de `POST /api/ops/subscriptions/resync`. */
export const opsResyncInputSchema = z.object({
  user_id: idSchema,
});
export type OpsResyncInput = z.infer<typeof opsResyncInputSchema>;

/** Respuesta de `POST /api/ops/subscriptions/resync`. */
export const opsResyncResponseSchema = z.object({
  message: z.string(),
  subscription: subscriptionViewSchema,
});
export type OpsResyncResponse = z.infer<typeof opsResyncResponseSchema>;

/**
 * Origen del valor que está surtiendo efecto en un ajuste. Se resuelve en
 * cascada: el documento de la base de datos manda, luego la variable de entorno
 * y, si no hay ninguno, el valor por defecto que trae el código.
 */
export const opsSettingSourceSchema = z.enum(['database', 'env', 'default']);
export type OpsSettingSource = z.infer<typeof opsSettingSourceSchema>;

/** Un ajuste operativo editable en caliente desde la consola. */
export const opsSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  source: opsSettingSourceSchema,
  /** Variable de entorno de la que hereda el ajuste si no hay documento. */
  env_var: z.string(),
  /** Valor que trae el código por defecto. */
  default: z.string(),
  description: z.string(),
});
export type OpsSetting = z.infer<typeof opsSettingSchema>;

/** Respuesta de `GET /api/ops/settings`. */
export const opsSettingsResponseSchema = z.object({
  settings: z.array(opsSettingSchema).nullish().transform((value) => value ?? []),
});
export type OpsSettingsResponse = z.infer<typeof opsSettingsResponseSchema>;

/** Cuerpo de `PATCH /api/ops/settings/:key`. El valor usa el mismo formato que su variable de entorno. */
export const updateSettingInputSchema = z.object({
  value: z.string().min(1, 'Escribe un valor'),
});
export type UpdateSettingInput = z.infer<typeof updateSettingInputSchema>;

/** Respuesta de `PATCH /api/ops/settings/:key`. */
export const opsSettingUpdateResponseSchema = z.object({
  message: z.string(),
  setting: opsSettingSchema,
});
export type OpsSettingUpdateResponse = z.infer<typeof opsSettingUpdateResponseSchema>;
