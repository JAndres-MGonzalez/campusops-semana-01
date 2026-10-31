import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { LocationViewResult } from '../location-view';
import { describeLocation } from '../location-view';
import { IncidentCreateScreen } from './IncidentCreateScreen';

const providerResult: LocationViewResult = describeLocation({
  location: { label: 'Edificio de prueba A' }, origin: 'provider',
});
const manualResult = (label: string): LocationViewResult => describeLocation({ location: { label }, origin: 'manual' });

// La primera ejecución compila React Native con jest-expo y puede tardar más de 5 s.
jest.setTimeout(30_000);

async function renderForm(onResolveLocation: (query: string) => Promise<LocationViewResult>) {
  const onSubmit = jest.fn();
  await render(<IncidentCreateScreen busy={false} onSubmit={onSubmit} onCancel={() => undefined}
    onResolveLocation={onResolveLocation} />);
  return onSubmit;
}

test('el proveedor reemplaza el texto por su etiqueta y muestra el aviso', async () => {
  const resolve = jest.fn().mockResolvedValue(providerResult);
  await renderForm(resolve);

  await fireEvent.changeText(screen.getByLabelText('Ubicación'), 'Zona A');
  await fireEvent.press(screen.getByLabelText('Buscar ubicación'));

  await waitFor(() => expect(screen.getByLabelText('Ubicación').props.value).toBe('Edificio de prueba A'));
  expect(screen.getByText('Ubicación sugerida por el proveedor.')).toBeTruthy();
  expect(resolve).toHaveBeenCalledWith('Zona A');
});

test('si el proveedor falla se conserva el texto y aparece el aviso manual', async () => {
  await renderForm(jest.fn().mockResolvedValue(manualResult('Zona A')));

  await fireEvent.changeText(screen.getByLabelText('Ubicación'), 'Zona A');
  await fireEvent.press(screen.getByLabelText('Buscar ubicación'));

  await waitFor(() => expect(screen.getByTestId('location-notice')).toBeTruthy());
  expect(screen.getByLabelText('Ubicación').props.value).toBe('Zona A');
  expect(screen.getByText('No se pudo obtener la ubicación. Se conserva tu referencia manual.')).toBeTruthy();
});

test('un rechazo inesperado no rompe la pantalla ni borra lo escrito', async () => {
  await renderForm(jest.fn().mockRejectedValue(new Error('inesperado')));

  await fireEvent.changeText(screen.getByLabelText('Ubicación'), '  Zona A ');
  await fireEvent.press(screen.getByLabelText('Buscar ubicación'));

  await waitFor(() => expect(screen.getByTestId('location-notice')).toBeTruthy());
  expect(screen.getByLabelText('Ubicación').props.value).toBe('  Zona A ');
  expect(screen.getByLabelText('Buscar ubicación').props.accessibilityState).toMatchObject({ disabled: false });
});

test('con el campo vacío no llama al servicio y pide una referencia', async () => {
  const resolve = jest.fn();
  await renderForm(resolve);

  await fireEvent.press(screen.getByLabelText('Buscar ubicación'));

  await waitFor(() => expect(screen.getByText('Escribe un edificio, zona o referencia')).toBeTruthy());
  expect(resolve).not.toHaveBeenCalled();
});

test('guardar después del fallback envía la referencia escrita, sin coordenadas', async () => {
  const onSubmit = await renderForm(jest.fn().mockResolvedValue(manualResult('Zona A')));

  await fireEvent.changeText(screen.getByLabelText('Descripción'), 'Sin red en el laboratorio');
  await fireEvent.changeText(screen.getByLabelText('Ubicación'), 'Zona A');
  await fireEvent.press(screen.getByLabelText('Buscar ubicación'));
  await waitFor(() => expect(screen.getByTestId('location-notice')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Guardar incidencia'));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const [draft] = onSubmit.mock.calls[0] as [Record<string, unknown>, string];
  expect(draft).toEqual({ category: 'maintenance', description: 'Sin red en el laboratorio', location: 'Zona A' });
  expect(draft).not.toHaveProperty('latitude');
});

test('sin onResolveLocation el formulario original no muestra el botón', async () => {
  await render(<IncidentCreateScreen busy={false} onSubmit={() => undefined} onCancel={() => undefined} />);
  expect(screen.queryByLabelText('Buscar ubicación')).toBeNull();
});
