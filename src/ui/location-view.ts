/**
 * Vista de la ubicación para la UI (Semana 9).
 *
 * `ui` no puede importar `infrastructure`; por eso el tipo de vista vive aquí y
 * `App.tsx` (fuera de las capas) adapta el resultado del servicio.
 */

export type LocationViewResult = Readonly<{
  label: string;
  origin: 'provider' | 'cache' | 'manual';
  notice: string;
}>;

const NOTICES: Record<LocationViewResult['origin'], string> = {
  provider: 'Ubicación sugerida por el proveedor.',
  cache: 'Ubicación reutilizada de una búsqueda reciente.',
  manual: 'No se pudo obtener la ubicación. Se conserva tu referencia manual.',
};

export function describeLocation(result: Readonly<{
  location: Readonly<{ label: string }>;
  origin: LocationViewResult['origin'];
}>): LocationViewResult {
  return { label: result.location.label, origin: result.origin, notice: NOTICES[result.origin] };
}
