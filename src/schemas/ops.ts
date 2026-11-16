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

/** Respuesta de `POST /api/ops/auth/login` y de `GET /api/ops/auth/me`. */
export const opsSessionSchema = z.object({
  message: z.string(),
  grant: opsGrantSchema,
});
export type OpsSession = z.infer<typeof opsSessionSchema>;

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
