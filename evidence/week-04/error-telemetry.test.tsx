import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { InMemoryIncidentRepository } from '../../src/infrastructure/incidents/in-memory-incident-repository';
import { reportIncidentFailure } from '../../src/infrastructure/telemetry/safe-telemetry';
import { IncidentApp } from '../../src/ui/IncidentApp';

const observations: unknown[] = [];
const privateError = {
  message: 'Error con persona@example.invalid y credencial-ficticia',
  authorization: 'credencial-ficticia',
  location: 'ubicacion-ficticia',
  photos: ['foto-ficticia'],
};

afterAll(() => {
  const logs = join(__dirname, 'logs');
  mkdirSync(logs, { recursive: true });
  writeFileSync(join(logs, 'error-telemetry.json'), JSON.stringify(observations, null, 2) + '\n');
});

test.each(['list', 'detail'] as const)('el error de %s no filtra datos en pantalla ni en el registro', async (operation) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const repository = new InMemoryIncidentRepository();
  try {
    const view = await render(<IncidentApp
      loadList={async () => {
        if (operation === 'list') throw privateError;
        return repository.list();
      }}
      loadDetail={async () => { throw privateError; }}
      reportFailure={reportIncidentFailure}
    />);
    if (operation === 'detail') {
      const first = (await repository.list())[0]!;
      await waitFor(() => expect(view.getByText(first.title)).toBeTruthy());
      await fireEvent.press(view.getByText(first.title));
    }
    const message = operation === 'list'
      ? 'No se pudo cargar la lista de incidencias.'
      : 'No se pudo cargar el detalle de la incidencia.';
    await waitFor(() => expect(view.getByText(message)).toBeTruthy());
    expect(warn).toHaveBeenCalledTimes(1);
    const output = warn.mock.calls[0]![0] as string;
    expect(JSON.parse(output)).toEqual({ event: 'incident_load_failed', operation, error: '[REDACTED]' });
    for (const value of ['persona@example.invalid', 'credencial-ficticia', 'ubicacion-ficticia', 'foto-ficticia']) {
      expect(output).not.toContain(value);
      expect(view.queryByText(value, { exact: false })).toBeNull();
    }
    observations.push({ operation, output: JSON.parse(output), result: 'pass' });
  } finally {
    warn.mockRestore();
  }
});
