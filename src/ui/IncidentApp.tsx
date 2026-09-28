import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { IncidentDetail, IncidentSummary } from '../domain/incident';
import { IncidentDetailScreen } from './screens/IncidentDetailScreen';
import { IncidentListScreen } from './screens/IncidentListScreen';

type Props = Readonly<{
  loadList: () => Promise<readonly IncidentSummary[]>;
  loadDetail: (id: string) => Promise<IncidentDetail | null>;
  reportFailure?: (operation: 'list' | 'detail', error: unknown) => void;
}>;

export function IncidentApp({ loadList, loadDetail, reportFailure }: Props) {
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([]);
  const [selected, setSelected] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setError('No se pudo cargar la lista de incidencias.');
        }
      });
    return () => {
      active = false;
    };
  }, [loadList, reportFailure]);

  const openDetail = useCallback(
    (id: string) => {
      setError(null);
      setSelected(null);
      loadDetail(id)
        .then((detail) => setSelected(detail))
        .catch((error: unknown) => {
          reportFailure?.('detail', error);
          setError('No se pudo cargar el detalle de la incidencia.');
        });
    },
    [loadDetail, reportFailure],
  );

  const goBack = useCallback(() => {
    setSelected(null);
    setError(null);
  }, []);

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {selected ? (
        <IncidentDetailScreen incident={selected} onBack={goBack} />
      ) : (
        <IncidentListScreen incidents={incidents} onSelect={openDetail} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  error: { color: '#a00', padding: 12 },
});
