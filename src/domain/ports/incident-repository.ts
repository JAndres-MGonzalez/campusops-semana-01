import type { IncidentDetail, IncidentSummary } from '../incident';

export interface IncidentRepository {
  list(): Promise<readonly IncidentSummary[]>;
  findById(id: string): Promise<IncidentDetail | null>;
}