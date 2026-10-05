export type RemoteParseResult =
  | Readonly<{ ok: true; value: { id: string; version: number; status: string; payload: Readonly<Record<string, unknown>> | null } }>
  | Readonly<{ ok: false; error: 'contract' }>;

export function validateRemoteResource(input: unknown): RemoteParseResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'contract' };
  }
  const { id, version, status, payload } = input as Readonly<Record<string, unknown>>;
  if (typeof id !== 'string' || id.trim().length === 0
    || typeof status !== 'string' || status.trim().length === 0
    || typeof version !== 'number' || !Number.isInteger(version) || version < 0
    || (payload !== null && (typeof payload !== 'object' || Array.isArray(payload)))) {
    return { ok: false, error: 'contract' };
  }
  return { ok: true, value: { id, version, status, payload: payload as Readonly<Record<string, unknown>> | null } };
}
