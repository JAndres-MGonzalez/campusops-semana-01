import type { IncidentCategory, IncidentStatus } from '../../campusops/contracts';
import type { IncidentDetail, IncidentDraft, IncidentSummary } from '../../domain/incident';
import type { IncidentRepository } from '../../domain/ports/incident-repository';
import { IncidentRequestError } from '../../domain/incident-request-error';
import { validateRemoteResource } from '../../domain/remote-resource';
import { runWithRetry } from '../resilience/retry-executor';
import type { RetryObservation } from '../resilience/retry-executor';
import type { RetryStatus } from '../resilience/retry-policy';

const categories = new Set(['electrical', 'laboratory', 'water', 'connectivity', 'equipment', 'safety', 'maintenance']);
const statuses = new Set(['open', 'assigned', 'in_progress', 'resolved', 'closed']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function mapIncident(input: unknown): IncidentDetail | null {
  const parsed = validateRemoteResource(input);
  if (!parsed.ok) throw new IncidentRequestError('contract');
  const { id, status, payload, version } = parsed.value;
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
  const technician = payload.assignedTechnicianId;
  return {
    id, title: payload.description, category: payload.category as IncidentCategory,
    status: status as IncidentStatus, description: payload.description,
    locationLabel: payload.location, reportedBy: payload.reporterId,
    createdAt: date(payload.createdAt), updatedAt: date(payload.updatedAt),
    version,
    assignedTechnicianId: typeof technician === 'string' && technician.trim().length > 0 ? technician : null,
  };
}

type Options = Readonly<{
  actorId?: string;
  /**
   * Actor vigente en tiempo de ejecución. Permite cambiar de reportante a
   * técnico sin recrear el repositorio: el backend autoriza según
   * `X-Course-Actor`, así que el encabezado debe seguir a la sesión activa.
   */
  actorProvider?: () => string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  scenario?: string;
  /**
   * Provee el token de sesión vigente (renovando si expiró). Si devuelve `null`
   * la solicitud se BLOQUEA antes de tocar la red. En ausencia de este proveedor
   * se conserva el token didáctico de las evidencias de la semana 5.
   */
  tokenProvider?: () => Promise<string | null>;
  /**
   * Renovación forzada (single-flight compartido) cuando el servidor responde
   * HTTP 401, con el token rechazado como argumento: si ese token ya dejó de
   * ser el vigente (generación anterior), se reutiliza el actual sin renovar.
   * Permite reintentar cada solicitud una sola vez con el token correcto.
   */
  onUnauthorized?: (rejectedToken: string) => Promise<string | null>;
  /**
   * Espera entre reintentos. Se inyecta en las pruebas para comprobar los
   * límites sin dormir de verdad.
   */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Observación sanitizada de cada reintento: intento, estado y demora. */
  observeRetry?: (event: RetryObservation) => void;
}>;

const idempotencyKeyOf = (init: RequestInit): string | undefined => {
  const headers = init.headers;
  if (headers === undefined || Array.isArray(headers)) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get('Idempotency-Key') ?? undefined;
  }
  const value = (headers as Record<string, string>)['Idempotency-Key'];
  return typeof value === 'string' ? value : undefined;
};

/** Sólo lo transitorio se reintenta; un 4xx de contrato no cambia al repetir. */
const retryStatusOf = (error: unknown): RetryStatus | null => {
  if (!(error instanceof IncidentRequestError)) return null;
  switch (error.kind) {
    case 'timeout': return 'timeout';
    case 'network': return 503;
    case 'rate_limit': return error.httpStatus ?? 429;
    case 'server': return error.httpStatus ?? 500;
    default: return null;
  }
};

const retryAfterMsOf = (error: unknown): number | undefined =>
  error instanceof IncidentRequestError && error.retryAfterSeconds !== undefined
    ? error.retryAfterSeconds * 1000
    : undefined;

export class HttpIncidentRepository implements IncidentRepository {
  constructor(private readonly baseUrl: string, private readonly options: Options = {}) {}

  private resolveToken(): Promise<string | null> {
    const provider = this.options.tokenProvider;
    return provider === undefined ? Promise.resolve('course-valid-token') : provider();
  }

  private send(controller: AbortController, path: string, init: RequestInit, token: string): Promise<Response> {
    const actor = this.options.actorProvider?.() ?? this.options.actorId ?? 'reporter-1';
    return (this.options.fetchImpl ?? fetch)(`${this.baseUrl}${path}`, {
      ...init, signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Course-Actor': actor,
        ...(this.options.scenario ? { 'X-Course-Scenario': this.options.scenario } : {}),
        ...init.headers,
      },
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const idempotencyKey = idempotencyKeyOf(init);
    const outcome = await runWithRetry<unknown>({
      method: init.method === 'POST' ? 'POST' : 'GET',
      execute: () => this.attempt(path, init),
      classify: retryStatusOf,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      retryAfterMs: retryAfterMsOf,
      ...(this.options.sleepImpl !== undefined ? { sleep: this.options.sleepImpl } : {}),
      ...(this.options.observeRetry !== undefined ? { observe: this.options.observeRetry } : {}),
    });
    if (outcome.ok) return outcome.value;
    throw outcome.error;
  }

  /**
   * Un intento completo: token vigente, envío, renovación por 401 y lectura del
   * cuerpo. El controlador de aborto y su temporizador son de ESTE intento, así
   * que un timeout no arrastra al siguiente.
   */
  private async attempt(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 2000);
    try {
      const token = await this.resolveToken();
      if (token === null) {
        // Sin sesión la solicitud se bloquea antes de tocar la red.
        throw new IncidentRequestError('forbidden');
      }
      let response = await this.send(controller, path, init, token);
      // HTTP 401: renovación forzada compartida y un único reintento por
      // solicitud, siempre con el token que el servidor acaba de rechazar.
      if (response.status === 401 && this.options.onUnauthorized !== undefined) {
        const renewed = await this.options.onUnauthorized(token);
        if (renewed !== null) {
          response = await this.send(controller, path, init, renewed);
        }
      }
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

  /**
   * Inicia la atención de una incidencia asignada al actor vigente.
   *
   * `baseVersion` es el candado del servidor: si la incidencia cambió (por
   * ejemplo, una reasignación), responde 409 y la operación sigue en la cola.
   * `note` y `evidenceIds` viajan en el cuerpo como metadatos de la operación;
   * la referencia de fotografía identifica el recurso, no lo sube.
   */
  async start(
    incidentId: string,
    baseVersion: number,
    operationId: string,
    input: Readonly<{ note?: string; evidenceIds?: readonly string[] }> = {},
  ): Promise<IncidentDetail | null> {
    if (!nonempty(incidentId) || !Number.isInteger(baseVersion) || baseVersion < 1
      || !nonempty(operationId) || operationId.length < 8) throw new IncidentRequestError('validation');
    const body: Record<string, unknown> = { action: 'start', baseVersion };
    if (input.note !== undefined) body.note = input.note;
    if (input.evidenceIds !== undefined) body.evidenceIds = [...input.evidenceIds];
    const response = await this.request(`/v1/incidents/${encodeURIComponent(incidentId)}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operationId },
      body: JSON.stringify(body),
    });
    if (!isRecord(response)) throw new IncidentRequestError('contract');
    return mapIncident(response.incident);
  }
}
