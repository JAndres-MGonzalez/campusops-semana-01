import { request } from 'node:http';

// Transporta HTTP real al fixture local; evita el fetch simulado del preset de Expo.
export const fetchFromLocalBackend: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new Promise<Response>((resolve, reject) => {
    const outgoing = request(url, {
      method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>,
      signal: init?.signal ?? undefined,
    }, (incoming) => {
      let text = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => { text += chunk; });
      incoming.on('error', reject);
      incoming.on('end', () => resolve({
        ok: (incoming.statusCode ?? 0) >= 200 && (incoming.statusCode ?? 0) < 300,
        status: incoming.statusCode ?? 0,
        headers: { get: (name: string) => {
          const value = incoming.headers[name.toLowerCase()];
          return Array.isArray(value) ? value.join(',') : value ?? null;
        } },
        json: async () => JSON.parse(text), text: async () => text,
      } as unknown as Response));
    });
    outgoing.on('error', reject);
    if (typeof init?.body === 'string') outgoing.write(init.body);
    outgoing.end();
  });
};
