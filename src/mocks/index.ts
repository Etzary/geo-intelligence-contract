import { HttpResponse, http, type RequestHandler } from 'msw';
import type { AuthSession, User } from '../schemas/auth.js';
import type { EmergencyAlertResult, EmergencyInfo } from '../schemas/emergency.js';
import type { AccessLogEntry, MedicalData, MedicalProfileView } from '../schemas/medical.js';
import type { Plan, SubscribeOutcome, SubscriptionView } from '../schemas/subscription.js';

/** Estado en memoria que respaldan los handlers; se puede precargar o mutar en los tests. */
export type MockState = {
  user: User;
  token: string;
  requires2fa: boolean;
  medicalData: MedicalData;
  emergencyEnabled: boolean;
  emergencyToken: string;
  emergencyBaseUrl: string;
  accessLog: AccessLogEntry[];
  plans: Plan[];
  providers: string[];
  subscription: SubscriptionView | null;
};

const now = () => new Date().toISOString();

export function createMockState(overrides: Partial<MockState> = {}): MockState {
  const timestamp = now();

  const user: User = {
    id: '665f00000000000000000001',
    email: 'ana@example.com',
    first_name: 'Ana',
    last_name: 'García',
    phone: '+525512345678',
    is_email_verified: true,
    is_phone_verified: false,
    is_2fa_enabled: false,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const medicalData: MedicalData = {
    blood_type: 'O+',
    date_of_birth: '1990-04-12',
    allergies: ['Penicilina'],
    chronic_conditions: ['Asma'],
    medications: [{ name: 'Salbutamol', dose: '100 µg', frequency: 'Según necesidad' }],
    emergency_contacts: [
      {
        name: 'Luis García',
        relationship: 'Hermano',
        phone: '+525587654321',
        email: 'luis@example.com',
      },
    ],
    share_address: false,
  };

  return {
    user,
    token: 'mock.jwt.token',
    requires2fa: false,
    medicalData,
    emergencyEnabled: true,
    emergencyToken: 'mock-emergency-token',
    emergencyBaseUrl: 'http://localhost:3000/e',
    accessLog: [
      {
        id: '665f00000000000000000010',
        user_id: user.id,
        ip: '203.0.113.10',
        user_agent: 'Mozilla/5.0 (iPhone)',
        created_at: timestamp,
        expires_at: timestamp,
      },
    ],
    plans: [
      {
        code: 'monthly',
        name: 'Mensual',
        amount: 99,
        currency: 'MXN',
        interval_months: 1,
        active: true,
      },
      {
        code: 'annual',
        name: 'Anual',
        amount: 899,
        currency: 'MXN',
        interval_months: 12,
        active: true,
      },
    ],
    providers: ['mercadopago', 'openpay'],
    subscription: {
      provider: 'mercadopago',
      plan_code: 'monthly',
      plan_name: 'Mensual',
      status: 'active',
      active: true,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      available_providers: ['mercadopago', 'openpay'],
    },
    ...overrides,
  };
}

export type MockHandlersOptions = {
  /** Base URL del backend, sin barra final. Debe coincidir con la del cliente. */
  baseUrl: string;
  state?: MockState;
};

const session = (state: MockState): AuthSession => ({
  message: 'Inicio de sesión exitoso',
  token: state.token,
  user: state.user,
});

/**
 * Handlers de MSW derivados del contrato. Reutilizables por web y mobile para
 * desarrollar y testear sin el backend levantado.
 */
export function createMockHandlers({ baseUrl, state = createMockState() }: MockHandlersOptions): RequestHandler[] {
  const url = (path: string) => `${baseUrl.replace(/\/+$/, '')}${path}`;

  return [
    http.get(url('/ping'), () => HttpResponse.json({ message: 'pong' })),

    // --- Autenticación ---
    http.post(url('/api/auth/register'), () =>
      HttpResponse.json({ message: '¡Usuario registrado con éxito!', user: state.user }, { status: 201 }),
    ),
    http.post(url('/api/auth/login'), () =>
      state.requires2fa
        ? HttpResponse.json({
            requires_2fa: true,
            message: 'Se envió un código a tu correo',
            email: state.user.email,
          })
        : HttpResponse.json(session(state)),
    ),
    http.post(url('/api/auth/verify-2fa'), () => HttpResponse.json(session(state))),
    http.post(url('/api/auth/google'), () =>
      HttpResponse.json({ ...session(state), message: '¡Inicio de sesión con Google exitoso!' }),
    ),
    http.post(url('/api/auth/logout'), () => HttpResponse.json({ message: 'Sesión cerrada exitosamente' })),
    http.post(url('/api/auth/verify-email'), () =>
      HttpResponse.json({ message: '¡Correo verificado exitosamente!', token: state.token }),
    ),
    http.post(url('/api/auth/verify-phone'), () =>
      HttpResponse.json({ message: '¡Teléfono verificado exitosamente!', token: state.token }),
    ),
    http.post(url('/api/auth/send-verification-email'), () =>
      HttpResponse.json({ message: 'Se ha enviado un nuevo código de verificación a tu correo.' }),
    ),
    http.post(url('/api/auth/send-verification-phone'), () =>
      HttpResponse.json({ message: 'Se ha enviado un nuevo código de verificación a tu teléfono.' }),
    ),
    http.patch(url('/api/auth/password'), () =>
      HttpResponse.json({ message: 'Contraseña actualizada correctamente. Inicia sesión nuevamente.' }),
    ),
    http.patch(url('/api/auth/2fa/configure'), () =>
      HttpResponse.json({ message: 'Autenticación de doble factor (2FA) actualizada exitosamente.' }),
    ),

    // --- Ficha médica ---
    http.get(url('/api/medical/profile'), () =>
      HttpResponse.json({
        medical_data: state.medicalData,
        emergency_access: { enabled: state.emergencyEnabled, url: state.emergencyEnabled ? emergencyUrl(state) : undefined },
        updated_at: now(),
      } satisfies MedicalProfileView),
    ),
    http.put(url('/api/medical/profile'), async ({ request }) => {
      state.medicalData = (await request.json()) as MedicalData;
      return HttpResponse.json({ message: 'Información médica guardada correctamente' });
    }),
    http.put(url('/api/medical/location'), () => HttpResponse.json({ message: 'Ubicación registrada' })),
    http.post(url('/api/medical/emergency/enable'), () => {
      if (!state.subscription?.active) {
        return HttpResponse.json(
          { error: 'necesitas una suscripción activa para publicar tu QR' },
          { status: 402 },
        );
      }
      state.emergencyEnabled = true;
      return HttpResponse.json({
        message: 'Acceso de emergencia activado. Codifica esta URL en el QR.',
        url: emergencyUrl(state),
      });
    }),
    http.post(url('/api/medical/emergency/disable'), () => {
      state.emergencyEnabled = false;
      return HttpResponse.json({ message: 'Acceso de emergencia desactivado' });
    }),
    http.get(url('/api/medical/access-log'), () => HttpResponse.json({ access_log: state.accessLog })),

    // --- Suscripciones ---
    http.get(url('/api/subscriptions/plans'), () =>
      HttpResponse.json({ plans: state.plans, providers: state.providers }),
    ),
    http.get(url('/api/subscriptions/me'), () =>
      state.subscription
        ? HttpResponse.json(state.subscription)
        : HttpResponse.json({ status: 'expired', active: false, available_providers: state.providers }),
    ),
    http.post(url('/api/subscriptions/subscribe'), async ({ request }) => {
      if (state.subscription?.active) {
        return HttpResponse.json({ error: 'ya tienes una suscripción activa' }, { status: 409 });
      }
      const body = (await request.json()) as { plan_code?: string; provider?: string };
      const outcome: SubscribeOutcome = {
        message: 'Suscripción iniciada; el acceso se activa al confirmarse el pago',
        provider: body.provider ?? 'mercadopago',
        status: 'pending',
        redirect_url:
          body.provider === 'openpay' ? undefined : 'https://www.mercadopago.com.mx/checkout/mock',
      };
      return HttpResponse.json(outcome);
    }),
    http.post(url('/api/subscriptions/cancel'), () =>
      state.subscription
        ? HttpResponse.json({ message: 'Suscripción cancelada correctamente' })
        : HttpResponse.json({ error: 'no tienes una suscripción' }, { status: 404 }),
    ),
    http.post(url('/api/subscriptions/resync'), () =>
      state.subscription
        ? HttpResponse.json(state.subscription)
        : HttpResponse.json({ error: 'no tienes una suscripción' }, { status: 404 }),
    ),

    // --- Rutas públicas de emergencia ---
    http.get(url('/api/emergency/:token'), ({ params }) => {
      if (!state.emergencyEnabled || params.token !== state.emergencyToken) {
        return HttpResponse.json({ error: 'enlace de emergencia no válido o desactivado' }, { status: 404 });
      }
      const info: EmergencyInfo = {
        name: `${state.user.first_name} ${state.user.last_name}`.trim(),
        updated_at: now(),
        medical_data: state.medicalData,
        degraded: false,
        can_alert: (state.medicalData.emergency_contacts ?? []).length > 0,
        alert_channels: ['sms', 'email'],
      };
      return HttpResponse.json(info);
    }),
    http.post(url('/api/emergency/:token/alert'), () => {
      const contacts = state.medicalData.emergency_contacts ?? [];
      if (contacts.length === 0) {
        return HttpResponse.json(
          { error: 'este perfil no tiene contactos de emergencia registrados' },
          { status: 400 },
        );
      }
      const result: EmergencyAlertResult = {
        message: `Se avisó a ${contacts.length} contacto(s) de emergencia.`,
        notified: contacts.length,
        failed: 0,
        total: contacts.length,
        channels: ['sms', 'email'],
      };
      return HttpResponse.json(result);
    }),
  ];
}

function emergencyUrl(state: MockState): string {
  return `${state.emergencyBaseUrl.replace(/\/+$/, '')}/${state.emergencyToken}`;
}
