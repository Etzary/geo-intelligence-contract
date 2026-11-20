import { z } from 'zod';
import { emptyToUndefined, idSchema } from './common.js';

/**
 * Dominio de soporte del usuario final: comentarios y sugerencias, reportes de
 * error y las preguntas frecuentes que se publican en el sitio.
 *
 * Los comentarios y los reportes comparten forma (`kind` los distingue) porque
 * se capturan con el mismo formulario y se revisan en la misma consola. Las
 * preguntas frecuentes son contenido editable que la web pública lee del
 * backend, de modo que se pueden cambiar sin desplegar.
 */

/** Topes que aplica el backend antes de guardar un comentario o reporte. */
export const FEEDBACK_MAX_MESSAGE = 2000;
export const FEEDBACK_MAX_CONTACT = 200;
export const FEEDBACK_MAX_CONTEXT = 300;

/** Topes de una pregunta frecuente. */
export const FAQ_MAX_QUESTION = 300;
export const FAQ_MAX_ANSWER = 3000;

/**
 * Tipo de mensaje del usuario. `suggestion` es un comentario o sugerencia;
 * `error` es un reporte de un problema que la persona encontró.
 */
export const feedbackKindSchema = z.enum(['suggestion', 'error']);
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

/**
 * Cuerpo de `POST /api/feedback`. El contacto es opcional: sirve para responder
 * al usuario, pero no se exige para poder enviar el mensaje.
 */
export const submitFeedbackInputSchema = z.object({
  kind: feedbackKindSchema,
  message: z.string().trim().min(1, 'Escribe tu mensaje').max(FEEDBACK_MAX_MESSAGE),
  /** Correo o teléfono de contacto, si el usuario quiere respuesta. */
  contact: emptyToUndefined(z.string().trim().max(FEEDBACK_MAX_CONTACT)),
  /** Contexto que ayuda a reproducir un problema (pantalla, versión, plataforma). */
  context: emptyToUndefined(z.string().trim().max(FEEDBACK_MAX_CONTEXT)),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackInputSchema>;

/** Una pregunta frecuente tal como la ve el sitio público. */
export const faqPublicSchema = z.object({
  id: idSchema,
  question: z.string(),
  answer: z.string(),
});
export type FaqPublic = z.infer<typeof faqPublicSchema>;

/** Respuesta de `GET /api/faqs` (ruta pública, sin sesión). */
export const faqsResponseSchema = z.object({
  faqs: z.array(faqPublicSchema).nullish().transform((value) => value ?? []),
});
export type FaqsResponse = z.infer<typeof faqsResponseSchema>;
