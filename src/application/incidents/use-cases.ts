import type { IncidentDetail, IncidentSummary } from '../../domain/incident';
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