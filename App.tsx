import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createIncident, getIncidentDetail, getIncidentList } from './src/application/incidents/use-cases';
import type { IncidentDraft } from './src/domain/incident';
import { getBackendHealth } from './src/api/courseBackend';
import { HttpIncidentRepository } from './src/infrastructure/incidents/http-incident-repository';
import { createSessionManager } from './src/infrastructure/session/manager';
import { createSecureSessionStorage } from './src/infrastructure/session/secure-storage';
import { reportIncidentFailure } from './src/infrastructure/telemetry/safe-telemetry';
import { IncidentApp } from './src/ui/IncidentApp';

const backendUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL
  ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4310' : 'http://127.0.0.1:4310');
const session = createSessionManager({
  storage: createSecureSessionStorage(),
  now: () => Date.now(),
  baseUrl: backendUrl,
});
const repository = new HttpIncidentRepository(backendUrl, {
  tokenProvider: () => session.getValidToken(),
  onUnauthorized: () => session.renew(),
});

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [sessionState, setSessionState] = useState<'anonymous' | 'autenticado'>('anonymous');
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getBackendHealth(backendUrl)
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, []);

  const startSession = useCallback(async () => {
    setSessionBusy(true);
    try {
      await session.login('reporter-1');
      setSessionState('autenticado');
      setStatus('available');
    } catch {
      setStatus('offline');
    } finally {
      setSessionBusy(false);
    }
  }, []);

  const endSession = useCallback(async () => {
    await session.logout();
    setSessionState('anonymous');
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
        {sessionState === 'anonymous' ? (
          <Pressable accessibilityRole="button" onPress={startSession} disabled={sessionBusy} style={styles.button}>
            <Text style={styles.buttonLabel}>{sessionBusy ? 'Iniciando sesión…' : 'Iniciar sesión (reportante)'}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={endSession} style={styles.button}>
            <Text style={styles.buttonLabel}>Cerrar sesión</Text>
          </Pressable>
        )}
      </View>
      {sessionState === 'autenticado' ? (
        <IncidentApp key="autenticado" loadList={loadList} loadDetail={loadDetail} createIncident={saveIncident} reportFailure={reportIncidentFailure} />
      ) : (
        <View style={styles.card}>
          <Text testID="session-hint">Inicia sesión para consultar las incidencias.</Text>
        </View>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24 },
  card: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: '700' },
  button: { alignSelf: 'flex-start', backgroundColor: '#17479e', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  buttonLabel: { color: '#fff', fontWeight: '600' },
});
