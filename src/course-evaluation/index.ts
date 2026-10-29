import { redactTelemetryData } from '../infrastructure/telemetry/safe-telemetry';
import { reduceAuthSignals } from '../infrastructure/session/auth-reducer';
import { validateRemoteResource } from '../domain/remote-resource';
import type {
  AuthEvent,
  JsonObject,
  ParseResult,
  PermissionEvent,
  RemoteResponse,
  SyncRecord,
} from './contracts';
import type { IncidentLocation } from '../campusops/contracts';
import { resolveSyncReal } from '../infrastructure/sync/resolve';
import { deduplicateOperationsReal } from '../infrastructure/sync/deduplicate';
import { planRetryReal } from '../infrastructure/resilience/retry-policy';
import { selectIncidentLocationReal } from '../infrastructure/geocoding/select-location';

function pending(name: string): never {
  throw new Error(`${name} must be implemented in the assigned week`);
}

export function redactForTelemetry(input: unknown): unknown {
  return redactTelemetryData(input);
}

export function parseRemoteResource(input: unknown): ParseResult {
  return validateRemoteResource(input);
}

export function coordinateRefresh(events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  return reduceAuthSignals(events);
}

export function resolveSync(
  base: SyncRecord,
  local: SyncRecord,
  remote: SyncRecord,
): Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  return resolveSyncReal(base, local, remote);
}

export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  operations: readonly T[],
): readonly T[] {
  return deduplicateOperationsReal(operations);
}

export function planRetry(input: Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>): Readonly<{ retry: boolean; delayMs: number; requiresStableIdempotencyKey: boolean }> {
  return planRetryReal(input);
}

export function reduceRemoteResponses(_input: Readonly<{
  activeRequestId: string;
  responses: readonly RemoteResponse[];
}>): Readonly<{ state: 'success' | 'error' | 'loading'; value?: unknown; error?: string }> {
  return pending('reduceRemoteResponses');
}

export function reducePermissionLifecycle(
  _events: readonly PermissionEvent[],
): Readonly<{ status: 'available' | 'denied' | 'blocked'; resourceActive: boolean }> {
  return pending('reducePermissionLifecycle');
}

/** Week 09: see docs/CAMPUSOPS_API.md; this is not a completed solution. */
export function selectIncidentLocation(provider: unknown, manualLabel: string): IncidentLocation {
  return selectIncidentLocationReal(provider, manualLabel);
}
