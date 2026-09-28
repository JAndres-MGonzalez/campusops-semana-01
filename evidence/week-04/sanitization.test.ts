import { redactForTelemetry } from '../../src/course-evaluation';

test('conserva el contexto técnico, las entradas vacías y los valores simples', () => {
  const technical = { incidentId: 'incident-demo', correlationId: 'trace-demo', status: 'open', attempt: 2, durationMs: 30 };
  for (const input of [technical, {}, [], null, false, 7, 'mensaje técnico']) {
    expect(redactForTelemetry(input)).toEqual(input);
  }
});

test('oculta las diecinueve claves sensibles del contrato', () => {
  const keys = ['authorization', 'password', 'token', 'accessToken', 'refreshToken', 'email',
    'displayName', 'name', 'userId', 'reporterId', 'technicianId', 'assignedTechnicianId',
    'location', 'latitude', 'longitude', 'photos', 'evidence', 'internalComments', 'assignmentHistory'];
  const input = Object.fromEntries(keys.map((key) => [key, ['dato ficticio']]));
  expect(redactForTelemetry(input)).toEqual(Object.fromEntries(keys.map((key) => [key, '[REDACTED]'])));
});

test('reconoce mayúsculas, guiones y guiones bajos en claves sensibles', () => {
  expect(redactForTelemetry({ Authorization: 'dato ficticio', access_token: 'dato ficticio',
    'USER-ID': 'dato ficticio', 'refresh-token': 'dato ficticio' })).toEqual({
    Authorization: '[REDACTED]', access_token: '[REDACTED]', 'USER-ID': '[REDACTED]', 'refresh-token': '[REDACTED]',
  });
});

test('oculta valores completos en objetos anidados y listas', () => {
  expect(redactForTelemetry([{ request: { headers: { authorization: 'credencial ficticia' } },
    profiles: [{ email: 'persona@example.invalid' }], photos: ['foto ficticia'], incidentId: 'demo' }])).toEqual([
    { request: { headers: { authorization: '[REDACTED]' } }, profiles: [{ email: '[REDACTED]' }],
      photos: '[REDACTED]', incidentId: 'demo' },
  ]);
});

test('no modifica la entrada original', () => {
  const input = Object.freeze({ profile: Object.freeze({ email: 'persona@example.invalid' }),
    items: Object.freeze([Object.freeze({ token: 'credencial ficticia' })]) });
  const original = JSON.stringify(input);
  const result = redactForTelemetry(input);
  expect(JSON.stringify(input)).toBe(original);
  expect(result).not.toBe(input);
  expect(result).toEqual({ profile: { email: '[REDACTED]' }, items: [{ token: '[REDACTED]' }] });
});
