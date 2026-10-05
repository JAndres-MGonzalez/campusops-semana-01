import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IncidentDetail, IncidentDraft, IncidentSummary } from '../domain/incident';
import { IncidentRequestError } from '../domain/incident-request-error';
import { IncidentCreateScreen } from './screens/IncidentCreateScreen';
import { IncidentDetailScreen } from './screens/IncidentDetailScreen';
import { IncidentListScreen } from './screens/IncidentListScreen';

type Props = Readonly<{
  loadList: () => Promise<readonly IncidentSummary[]>;
  loadDetail: (id: string) => Promise<IncidentDetail | null>;
  createIncident?: (draft: IncidentDraft, operationId: string) => Promise<IncidentDetail | null>;
  reportFailure?: (operation: 'list' | 'detail' | 'create', error: unknown) => void;
}>;

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof IncidentRequestError)) return fallback;
  const messages = {
    contract: 'La respuesta del servidor no es válida.', timeout: 'El servidor tardó demasiado. Intenta de nuevo.',
    server: 'El servidor no pudo completar la solicitud.', rate_limit: 'Hay demasiadas solicitudes. Intenta más tarde.',
    network: 'No hay conexión con el servidor.', not_found: 'Incidencia no encontrada.',
    forbidden: 'No tienes permiso para esta operación.', validation: 'Revisa la categoría, descripción y ubicación.',
    conflict: 'La operación no coincide con la solicitud anterior.',
  };
  return messages[error.kind];
}

export function IncidentApp({ loadList, loadDetail, createIncident, reportFailure }: Props) {
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([]);
  const [selected, setSelected] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'list' | 'detail' | 'create'>('list');
  const [loading, setLoading] = useState(true);
  const [listAttempt, setListAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadList()
      .then((items) => {
        if (active) {
          setIncidents(items);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          reportFailure?.('list', error);
          setError(errorMessage(error, 'No se pudo cargar la lista de incidencias.'));
          setIncidents([]);
        }
      }).finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
    };
  }, [loadList, reportFailure, listAttempt]);

  const openDetail = useCallback(
    (id: string) => {
      setError(null);
      setSelected(null);
      setSelectedId(id);
      setScreen('detail');
      setLoading(true);
      loadDetail(id)
        .then((detail) => setSelected(detail))
        .catch((error: unknown) => {
          reportFailure?.('detail', error);
          setError(errorMessage(error, 'No se pudo cargar el detalle de la incidencia.'));
        }).finally(() => setLoading(false));
    },
    [loadDetail, reportFailure],
  );

  const goBack = useCallback(() => {
    setSelected(null);
    setError(null);
    setNotice(null);
    setScreen('list');
    setLoading(false);
  }, []);

  const saveIncident = async (draft: IncidentDraft, operationId: string) => {
    if (!createIncident) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const detail = await createIncident(draft, operationId);
      if (detail === null) {
        setNotice('El servidor no devolvió datos de la incidencia.');
        return;
      }
      setIncidents((items) => [...items.filter((item) => item.id !== detail.id), detail]);
      setSelected(detail);
      setSelectedId(detail.id);
      setScreen('detail');
    } catch (error) {
      reportFailure?.('create', error);
      setError(errorMessage(error, 'No se pudo crear la incidencia.'));
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text>{notice}</Text> : null}
      {error && screen !== 'create' ? <Pressable accessibilityRole="button"
        onPress={() => {
          if (screen === 'detail') openDetail(selectedId);
          else { setLoading(true); setError(null); setListAttempt((attempt) => attempt + 1); }
        }}>
        <Text>Reintentar</Text>
      </Pressable> : null}
      {screen === 'create' ? (
        <IncidentCreateScreen busy={loading} onSubmit={saveIncident} onCancel={goBack} />
      ) : loading ? <Text>Cargando incidencias...</Text> : screen === 'detail' ? (
        <IncidentDetailScreen incident={selected} onBack={goBack}
          emptyMessage={error ? '' : 'No hay datos disponibles para esta incidencia.'} />
      ) : (
        <>
          {createIncident ? <Pressable accessibilityRole="button" onPress={() => {
            setError(null); setNotice(null); setLoading(false); setScreen('create');
          }}><Text>Nueva incidencia</Text></Pressable> : null}
          {!error ? <IncidentListScreen incidents={incidents} onSelect={openDetail} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  error: { color: '#a00', padding: 12 },
});
