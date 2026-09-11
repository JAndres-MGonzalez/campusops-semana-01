import type { IncidentDetail, IncidentSummary } from '../../domain/incident';
import type { IncidentRepository } from '../../domain/ports/incident-repository';

const SEED: readonly IncidentDetail[] = [
  {
    id: 'camp-inc-001',
    title: 'Fuga de agua en el laboratorio 2',
    category: 'water',
    status: 'in_progress',
    locationLabel: 'Edificio C, laboratorio 2',
    description: 'Se observa filtración constante junto a la pileta frontal.',
    reportedBy: 'reporter-1',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-02T12:30:00.000Z',
  },
  {
    id: 'camp-inc-002',
    title: 'Sin internet en la biblioteca',
    category: 'connectivity',
    status: 'assigned',
    locationLabel: 'Edificio D, biblioteca',
    description: 'El acceso Wi-Fi no responde en la planta baja.',
    reportedBy: 'reporter-2',
    createdAt: '2026-09-03T14:05:00.000Z',
    updatedAt: '2026-09-03T14:05:00.000Z',
  },
  {
    id: 'camp-inc-003',
    title: 'Luz parpadeante en el auditorio',
    category: 'electrical',
    status: 'open',
    locationLabel: 'Edificio A, auditorio',
    description: 'El panel frontal presenta parpadeos al encender.',
    reportedBy: 'reporter-1',
    createdAt: '2026-09-05T18:20:00.000Z',
    updatedAt: '2026-09-05T18:20:00.000Z',
  },
  {
    id: 'camp-inc-004',
    title: 'Proyector dañado en salón 305',
    category: 'equipment',
    status: 'resolved',
    locationLabel: 'Edificio B, salón 305',
    description: 'El proyector no proyecta imagen; se reemplazó el lente.',
    reportedBy: 'reporter-2',
    createdAt: '2026-08-28T08:00:00.000Z',
    updatedAt: '2026-09-06T10:45:00.000Z',
  },
];

export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly items: IncidentDetail[];

  constructor(items: readonly IncidentDetail[] = SEED) {
    this.items = items.map((item) => ({ ...item }));
  }

  async list(): Promise<readonly IncidentSummary[]> {
    return this.items.map(({ id, title, category, status, locationLabel }) => ({
      id,
      title,
      category,
      status,
      locationLabel,
    }));
  }

  async findById(id: string): Promise<IncidentDetail | null> {
    const item = this.items.find((candidate) => candidate.id === id);
    return item ? { ...item } : null;
  }
}