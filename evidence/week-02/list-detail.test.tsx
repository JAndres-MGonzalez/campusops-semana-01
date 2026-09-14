import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { getIncidentDetail, getIncidentList } from '../../src/application/incidents/use-cases';
import type { IncidentDetail } from '../../src/domain/incident';
import type { IncidentRepository } from '../../src/domain/ports/incident-repository';
import { InMemoryIncidentRepository } from '../../src/infrastructure/incidents/in-memory-incident-repository';
import { IncidentApp } from '../../src/ui/IncidentApp';

test('opens a synthetic incident, displays its detail and returns to the list', async () => {
  const repository = new InMemoryIncidentRepository();
  const incidents = await getIncidentList(repository);
  expect(incidents).toHaveLength(4);
  const first = incidents[0]!;
  const detail = await getIncidentDetail(repository, first.id);
  expect(detail).not.toBeNull();

  const view = await render(
    <IncidentApp
      loadList={() => getIncidentList(repository)}
      loadDetail={(id) => getIncidentDetail(repository, id)}
    />,
  );
  await waitFor(() => expect(view.getByText(first.title)).toBeTruthy());
  await fireEvent.press(view.getByText(first.title));
  await waitFor(() => expect(view.getByText(detail!.description)).toBeTruthy());
  expect(view.getByText(`ID: ${first.id}`)).toBeTruthy();
  await fireEvent.press(view.getByText('<- Volver a la lista'));
  await waitFor(() => expect(view.queryByText(detail!.description)).toBeNull());
  expect(view.getByText(first.title)).toBeTruthy();
});

test('uses another repository through the same application and UI contracts', async () => {
  const alternate: IncidentDetail = {
    id: 'test-port-01',
    title: 'Incidencia sintética de otro adaptador',
    category: 'water',
    status: 'open',
    locationLabel: 'Laboratorio ficticio de prueba',
    description: 'Detalle suministrado únicamente por el adaptador alternativo.',
    reportedBy: 'reporter-1',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
  const repository: IncidentRepository = {
    list: jest.fn(async () => [alternate]),
    findById: jest.fn(async (id: string) => (id === alternate.id ? alternate : null)),
  };
  const view = await render(
    <IncidentApp
      loadList={() => getIncidentList(repository)}
      loadDetail={(id) => getIncidentDetail(repository, id)}
    />,
  );
  await waitFor(() => expect(view.getByText(alternate.title)).toBeTruthy());
  await fireEvent.press(view.getByText(alternate.title));
  await waitFor(() => expect(view.getByText(alternate.description)).toBeTruthy());
  expect(repository.findById).toHaveBeenCalledWith(alternate.id);
  expect(await getIncidentDetail(repository, 'missing-test-id')).toBeNull();
});

test('shows an empty list when the repository contains no incidents', async () => {
  const loadList = jest.fn(async () => []);
  const view = await render(<IncidentApp loadList={loadList} loadDetail={async () => null} />);
  await waitFor(() => expect(loadList).toHaveBeenCalledTimes(1));
  expect(view.getByText('No hay incidencias registradas.')).toBeTruthy();
});

test('shows a recoverable message when the repository cannot load the list', async () => {
  const view = await render(
    <IncidentApp
      loadList={async () => { throw new Error('Synthetic repository unavailable'); }}
      loadDetail={async () => null}
    />,
  );
  await waitFor(() => expect(view.getByText('No se pudo cargar la lista de incidencias.')).toBeTruthy());
});
