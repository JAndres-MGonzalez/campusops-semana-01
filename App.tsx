import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createIncident, getIncidentDetail, getIncidentList } from './src/application/incidents/use-cases';
import type { IncidentDraft } from './src/domain/incident';
import { getBackendHealth } from './src/api/courseBackend';
import { HttpIncidentRepository } from './src/infrastructure/incidents/http-incident-repository';
import { reportIncidentFailure } from './src/infrastructure/telemetry/safe-telemetry';
import { IncidentApp } from './src/ui/IncidentApp';

const backendUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL
  ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4310' : 'http://127.0.0.1:4310');
const repository = new HttpIncidentRepository(backendUrl);

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');

  useEffect(() => {
    let active = true;
    getBackendHealth(backendUrl)
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, []);

  const loadList = useCallback(() => getIncidentList(repository), []);
  const loadDetail = useCallback((id: string) => getIncidentDetail(repository, id), []);
  const saveIncident = useCallback((draft: IncidentDraft, operationId: string) => createIncident(repository, draft, operationId), []);

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
      </View>
      <IncidentApp loadList={loadList} loadDetail={loadDetail} createIncident={saveIncident} reportFailure={reportIncidentFailure} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24 },
  card: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: '700' },
});
