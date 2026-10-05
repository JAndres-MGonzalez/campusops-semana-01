export type JsonObject = Readonly<Record<string, unknown>>;

export type { RemoteParseResult as ParseResult } from '../domain/remote-resource';

export type AuthEvent = Readonly<{
  type: 'request401' | 'refreshSucceeded' | 'refreshFailed' | 'logout';
  requestId?: string;
  generation?: number;
  token?: string;
}>;

export type SyncRecord = Readonly<{ id: string; version: number; fields: JsonObject }>;

export type RemoteResponse = Readonly<{ requestId: string; value?: unknown; error?: string }>;

export type PermissionEvent = 'granted' | 'paused' | 'revoked' | 'resumed' | 'denied_permanently';
