import type { IncidentCategory, IncidentStatus } from '../../campusops/contracts';
import type { IncidentDetail, IncidentDraft, IncidentSummary } from '../../domain/incident';
import type { IncidentRepository } from '../../domain/ports/incident-repository';
import { IncidentRequestError } from '../../domain/incident-request-error';
import { validateRemoteResource } from '../../domain/remote-resource';

const categories = new Set(['electrical', 'laboratory', 'water', 'connectivity', 'equipment', 'safety', 'maintenance']);
const statuses = new Set(['open', 'assigned', 'in_progress', 'resolved', 'closed']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function mapIncident(input: unknown): IncidentDetail | null {
  const parsed = validateRemoteResource(input);
  if (!parsed.ok) throw new IncidentRequestError('contract');
  const { id, status, payload } = parsed.value;
  if (payload === null) return null;
  if (!statuses.has(status) || !nonempty(payload.category) || !categories.has(payload.category)
    || !nonempty(payload.description) || !nonempty(payload.location) || !nonempty(payload.reporterId)) {
    throw new IncidentRequestError('contract');
  }
  const date = (value: unknown): string | null => {
    if (value === undefined || value === null) return null;
    if (!nonempty(value) || !Number.isFinite(Date.parse(value))) throw new IncidentRequestError('contract');
    return value;
  };
  return {
    id, title: payload.description, category: payload.category as IncidentCategory,
    status: status as IncidentStatus, description: payload.description,
    locationLabel: payload.location, reportedBy: payload.reporterId,
    createdAt: date(payload.createdAt), updatedAt: date(payload.updatedAt),
  };
}

type Options = Readonly<{ actorId?: string; timeoutMs?: number; fetchImpl?: typeof fetch; scenario?: string }>;

export class HttpIncidentRepository implements IncidentRepository {
  constructor(private readonly baseUrl: string, private readonly options: Options = {}) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 2000);
    try {
      const response = await (this.options.fetchImpl ?? fetch)(`${this.baseUrl}${path}`, {
        ...init, signal: controller.signal,
        headers: {
          Authorization: 'Bearer course-valid-token',
          'X-Course-Actor': this.options.actorId ?? 'reporter-1',
          ...(this.options.scenario ? { 'X-Course-Scenario': this.options.scenario } : {}),
          ...init.headers,
        },
      });
      if (!response.ok) {
        const kind = response.status === 429 ? 'rate_limit'
          : response.status === 404 ? 'not_found'
          : response.status === 401 || response.status === 403 ? 'forbidden'
          : response.status === 409 ? 'conflict'
          : response.status === 400 || response.status === 422 ? 'validation' : 'server';
        const retryAfter = response.headers.get('retry-after');
        const seconds = retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
        throw new IncidentRequestError(kind, response.status,
          seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined);
      }
      try { return await response.json(); } catch { throw new IncidentRequestError('contract'); }
    } catch (error) {
      if (controller.signal.aborted) throw new IncidentRequestError('timeout');
      if (error instanceof IncidentRequestError) throw error;
      throw new IncidentRequestError('network');
    } finally { clearTimeout(timer); }
  }

  async list(): Promise<readonly IncidentSummary[]> {
    const body = await this.request('/v1/incidents');
    if (!isRecord(body) || !Array.isArray(body.items)) throw new IncidentRequestError('contract');
    return body.items.map(mapIncident).filter((item): item is IncidentDetail => item !== null);
  }

  async findById(id: string): Promise<IncidentDetail | null> {
    if (!nonempty(id)) throw new IncidentRequestError('validation');
    return mapIncident(await this.request(`/v1/incidents/${encodeURIComponent(id)}`));
  }

  async create(draft: IncidentDraft, operationId: string): Promise<IncidentDetail | null> {
    if (!categories.has(draft.category) || !nonempty(draft.description) || !nonempty(draft.location)
      || !nonempty(operationId) || operationId.length < 8) throw new IncidentRequestError('validation');
    const body = await this.request('/v1/incidents', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operationId },
      body: JSON.stringify(draft),
    });
    if (!isRecord(body)) throw new IncidentRequestError('contract');
    return mapIncident(body.incident);
  }
}
