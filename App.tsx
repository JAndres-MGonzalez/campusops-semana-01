import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createIncident, getIncidentDetail, getIncidentList } from './src/application/incidents/use-cases';
import type { IncidentDetail, IncidentDraft } from './src/domain/incident';
import { IncidentRequestError } from './src/domain/incident-request-error';
import { getBackendHealth } from './src/api/courseBackend';
import { HttpIncidentRepository } from './src/infrastructure/incidents/http-incident-repository';
import { initializePersistence } from './src/infrastructure/persistence';
import { createSessionManager } from './src/infrastructure/session/manager';
import { createSecureSessionStorage } from './src/infrastructure/session/secure-storage';
import { outbox } from './src/infrastructure/sync/outbox';
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
  onUnauthorized: (rejectedToken) => session.renew(rejectedToken),
});

function isOfflineFailure(error: unknown): boolean {
  return error instanceof IncidentRequestError
    && (error.kind === 'network' || error.kind === 'timeout');
}

/**
 * Representación local de una incidencia guardada sin conexión. Se muestra de
 * inmediato, pero no sustituye la confirmación del servidor: la operación sigue
 * en la cola persistente hasta que el envío se confirme.
 */
function localIncidentDetail(draft: IncidentDraft, operationId: string): IncidentDetail {
  const createdAt = new Date().toISOString();
  return {
    id: `pending-${operationId}`,
    title: draft.description,
    category: draft.category,
    status: 'open',
    locationLabel: draft.location,
    description: draft.description,
    reportedBy: 'reporter-1',
    createdAt,
    updatedAt: null,
  };
}

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [sessionState, setSessionState] = useState<'anonymous' | 'autenticado'>('anonymous');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      const count = await outbox.pendingCount();
      setPendingCount(count);
      return count;
    } catch {
      return 0;
    }
  }, []);

  // Al arrancar: migrar si hace falta y recuperar la cola guardada en el
  // almacenamiento duradero (esto es lo que sobrevive a cerrar y abrir la app).
  useEffect(() => {
    initializePersistence()
      .then(() => refreshPending())
      .then((count) => {
        if (count > 0) {
          setNotice(`Recuperadas ${count} operación(es) pendientes de la sesión anterior.`);
        }
      })
      .catch(() => undefined);
  }, [refreshPending]);

  useEffect(() => {
    let active = true;
    getBackendHealth(backendUrl)
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, []);

  const syncPending = useCallback(async () => {
    const result = await outbox.flush((draft, operationId) => repository.create(draft, operationId));
    await refreshPending();
    if (result.confirmed.length > 0) {
      setRefreshKey((key) => key + 1);
      setNotice(`Sincronizadas ${result.confirmed.length} operación(es) pendientes.`);
    } else if (result.failed.length > 0) {
      setNotice('Las operaciones pendientes no se confirmaron; siguen guardadas.');
    }
    return result;
  }, [refreshPending]);

  const startSession = useCallback(async () => {
    setSessionBusy(true);
    try {
      await session.login('reporter-1');
      setSessionState('autenticado');
      setStatus('available');
      try {
        await syncPending();
      } catch {
        // Si falla la reanudación, la cola permanece intacta para el reintento.
      }
    } catch {
      setStatus('offline');
    } finally {
      setSessionBusy(false);
    }
  }, [syncPending]);

  const endSession = useCallback(async () => {
    await session.logout();
    setSessionState('anonymous');
  }, []);

  // Reintento explícito al reconectar: revalida la salud y reenvía la cola.
  const syncNow = useCallback(async () => {
    setSyncBusy(true);
    setNotice(null);
    try {
      try {
        await getBackendHealth(backendUrl);
        setStatus('available');
      } catch {
        setStatus('offline');
        setNotice('Sin conexión: los cambios siguen guardados en la cola.');
        return;
      }
      await syncPending();
    } finally {
      setSyncBusy(false);
    }
  }, [syncPending]);

  const loadList = useCallback(() => getIncidentList(repository), []);
  const loadDetail = useCallback((id: string) => getIncidentDetail(repository, id), []);
  const saveIncident = useCallback(
    async (draft: IncidentDraft, operationId: string): Promise<IncidentDetail | null> => {
      try {
        const detail = await createIncident(repository, draft, operationId);
        await refreshPending();
        return detail;
      } catch (error) {
        if (!isOfflineFailure(error)) {
          throw error;
        }
        // Sin conexión: guardar en la cola persistente y devolver el borrador
        // local. No se pierde la intención del usuario.
        await outbox.saveOffline(draft, operationId, { author: 'reporter-1' });
        await refreshPending();
        setNotice('Sin conexión: la incidencia se guardó y se enviará al reconectar.');
        return localIncidentDetail(draft, operationId);
      }
    },
    [refreshPending],
  );

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
        <Text testID="pending-count">Pendientes sin conexión: {pendingCount}</Text>
        {notice ? <Text testID="sync-notice">{notice}</Text> : null}
        {sessionState === 'anonymous' ? (
          <Pressable accessibilityRole="button" onPress={startSession} disabled={sessionBusy} style={styles.button}>
            <Text style={styles.buttonLabel}>{sessionBusy ? 'Iniciando sesión…' : 'Iniciar sesión (reportante)'}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable accessibilityRole="button" onPress={syncNow} disabled={syncBusy} style={styles.button}>
              <Text style={styles.buttonLabel}>{syncBusy ? 'Sincronizando…' : 'Sincronizar pendientes'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={endSession} style={styles.button}>
              <Text style={styles.buttonLabel}>Cerrar sesión</Text>
            </Pressable>
          </>
        )}
      </View>
      {sessionState === 'autenticado' ? (
        <IncidentApp
          key={`autenticado-${refreshKey}`}
          loadList={loadList}
          loadDetail={loadDetail}
          createIncident={saveIncident}
          reportFailure={reportIncidentFailure}
        />
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
