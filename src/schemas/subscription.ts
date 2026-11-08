import { z } from 'zod';
import { emailSchema, timestampSchema } from './common.js';

export const subscriptionStatusSchema = z.enum([
  /** El backend usa `none` cuando el usuario todavía no tiene suscripción. */
  'none',
  'pending',
  'active',
  'paused',
  'cancelled',
  'expired',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const paymentProviderSchema = z.enum(['mercadopago', 'openpay']);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const planSchema = z.object({
  /** Códigos habituales: `monthly`, `quarterly`, `semiannual`, `annual`. */
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  amount: z.number(),
  currency: z.string(),
  interval_months: z.number(),
  active: z.boolean(),
});
export type Plan = z.infer<typeof planSchema>;

/** Respuesta de `GET /api/subscriptions/plans`. */
export const plansResponseSchema = z.object({
  plans: z.array(planSchema).nullish().transform((value) => value ?? []),
  providers: z.array(z.string()).nullish().transform((value) => value ?? []),
});
export type PlansResponse = z.infer<typeof plansResponseSchema>;

/** Respuesta de `GET /api/subscriptions/me` y de `POST /api/subscriptions/resync`. */
export const subscriptionViewSchema = z.object({
  provider: z.string().optional(),
  plan_code: z.string().optional(),
  plan_name: z.string().optional(),
  status: subscriptionStatusSchema,
  active: z.boolean(),
  current_period_end: timestampSchema.optional(),
  cancelled_at: timestampSchema.optional(),
  /** Pasarelas habilitadas hoy. */
  available_providers: z.array(z.string()).optional(),
});
export type SubscriptionView = z.infer<typeof subscriptionViewSchema>;

/**
 * Cuerpo de `POST /api/subscriptions/subscribe`.
 * `card_token` y `device_session_id` solo hacen falta con OpenPay: la tarjeta se
 * tokeniza en el navegador (Openpay.js) y **nunca** viaja al backend.
 * `payer_email` lo envía el flujo de fallback de Mercado Pago cuando el correo
 * de la cuenta de la app no es una cuenta de Mercado Pago.
 */
export const subscribeInputSchema = z.object({
  plan_code: z.string().min(1, 'Elige un plan'),
  provider: paymentProviderSchema,
  card_token: z.string().optional(),
  device_session_id: z.string().optional(),
  payer_email: emailSchema.optional(),
});
export type SubscribeInput = z.infer<typeof subscribeInputSchema>;

/** Respuesta de `POST /api/subscriptions/subscribe`. */
export const subscribeOutcomeSchema = z.object({
  message: z.string(),
  provider: z.string(),
  status: z.string(),
  /** Mercado Pago: URL del checkout alojado a la que redirigir el navegador. */
  redirect_url: z.string().optional(),
  current_period_end: timestampSchema.optional(),
});
export type SubscribeOutcome = z.infer<typeof subscribeOutcomeSchema>;
