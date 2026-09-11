import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getIncidentDetail, getIncidentList } from './src/application/incidents/use-cases';
import { getBackendHealth } from './src/api/courseBackend';
import { InMemoryIncidentRepository } from './src/infrastructure/incidents/in-memory-incident-repository';
import { IncidentApp } from './src/ui/IncidentApp';

const repository = new InMemoryIncidentRepository();

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, []);

  const loadList = useCallback(() => getIncidentList(repository), []);
  const loadDetail = useCallback((id: string) => getIncidentDetail(repository, id), []);

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
      </View>
      <IncidentApp loadList={loadList} loadDetail={loadDetail} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24 },
  card: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: '700' },
});