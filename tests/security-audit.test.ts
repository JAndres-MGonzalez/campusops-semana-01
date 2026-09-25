import { spawnSync } from 'node:child_process';
import { InMemoryIncidentRepository } from '../src/infrastructure/incidents/in-memory-incident-repository';

function git(args: string[], input?: string) {
  const result = spawnSync('git', args, { encoding: 'utf8', input, windowsHide: true });
  if (result.error) throw result.error;
  return result;
}

describe('Protección de archivos de configuración', () => {
  const privateFiles = ['.env', '.env.local', '.env.production', '.env.test', 'config/.env.local'];

  test.each(privateFiles)('%s queda fuera de Git', (file) => {
    const result = git(['check-ignore', '--no-index', '--stdin'], file + '\n');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(file);
  });

  test('la plantilla sin secretos se puede versionar', () => {
    const result = git(['check-ignore', '--no-index', '.env.example']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  test('no hay archivos de entorno privados en el índice de Git', () => {
    const result = git(['ls-files', '--', '.env', '.env.*', ':(glob)**/.env', ':(glob)**/.env.*']);
    expect(result.status).toBe(0);
    const privateFiles = result.stdout.trim().split('\n')
      .filter((file) => file && file.split('/').at(-1) !== '.env.example');
    expect(privateFiles).toEqual([]);
  });
});

test('el detalle de una incidencia no devuelve datos privados fuera del contrato', async () => {
  const input = {
    id: 'audit-incident-1',
    title: 'Incidencia ficticia de auditoría',
    category: 'water' as const,
    status: 'open' as const,
    locationLabel: 'Zona de prueba',
    description: 'Descripción ficticia',
    reportedBy: 'reporter-demo',
    createdAt: '2026-09-24T12:00:00.000Z',
    updatedAt: '2026-09-24T12:00:00.000Z',
    contactEmail: 'persona@example.invalid',
    privateNote: 'Dato privado ficticio fuera del contrato',
  };
  const repository = new InMemoryIncidentRepository([input]);
  const detail = await repository.findById(input.id);

  expect(detail).not.toBeNull();
  expect(detail).not.toHaveProperty('contactEmail');
  expect(detail).not.toHaveProperty('privateNote');
  expect(detail).toMatchObject({ id: input.id, description: input.description });
  expect(await repository.findById('missing')).toBeNull();
});
