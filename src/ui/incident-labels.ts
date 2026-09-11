import type { IncidentCategory, IncidentStatus } from '../campusops/contracts';

export const STATUS_LABEL: Readonly<Record<IncidentStatus, string>> = {
  open: 'Abierta',
  assigned: 'Asignada',
  in_progress: 'En proceso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
};

export const CATEGORY_LABEL: Readonly<Record<IncidentCategory, string>> = {
  electrical: 'Eléctrica',
  laboratory: 'Laboratorio',
  water: 'Agua',
  connectivity: 'Conectividad',
  equipment: 'Equipo',
  safety: 'Seguridad',
  maintenance: 'Mantenimiento',
};