import type { IncidentDetail, IncidentDraft, IncidentSummary } from '../../domain/incident';
import type { IncidentRepository } from '../../domain/ports/incident-repository';

export async function getIncidentList(
  repository: IncidentRepository,
): Promise<readonly IncidentSummary[]> {
  return repository.list();
}

export async function getIncidentDetail(
  repository: IncidentRepository,
  id: string,
): Promise<IncidentDetail | null> {
  return repository.findById(id);
}

export async function createIncident(
  repository: { create: (draft: IncidentDraft, operationId: string) => Promise<IncidentDetail | null> },
  draft: IncidentDraft,
  operationId: string,
): Promise<IncidentDetail | null> {
  return repository.create(draft, operationId);
}
