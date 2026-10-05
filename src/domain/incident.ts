import type { IncidentCategory, IncidentStatus } from '../campusops/contracts';

export type IncidentSummary = Readonly<{
  id: string;
  title: string;
  category: IncidentCategory;
  status: IncidentStatus;
  locationLabel: string;
}>;

export type IncidentDetail = Readonly<
  IncidentSummary & {
    description: string;
    reportedBy: string;
    createdAt: string | null;
    updatedAt: string | null;
  }
>;

export type IncidentDraft = Readonly<{
  category: IncidentCategory;
  description: string;
  location: string;
}>;
