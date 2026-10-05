export type IncidentFailureKind = 'contract' | 'timeout' | 'server' | 'rate_limit'
  | 'network' | 'not_found' | 'forbidden' | 'validation' | 'conflict';

export class IncidentRequestError extends Error {
  constructor(
    public readonly kind: IncidentFailureKind,
    public readonly httpStatus?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(kind);
    this.name = 'IncidentRequestError';
  }
}
