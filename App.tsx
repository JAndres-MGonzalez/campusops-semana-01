import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { createIncident, getIncidentDetail, getIncidentList } from './src/application/incidents/use-cases';
import type { IncidentDetail, IncidentDraft } from './src/domain/incident';
import { IncidentRequestError } from './src/domain/incident-request-error';
import { getBackendHealth } from './src/api/courseBackend';
import { createHttpGeocodingProvider, createLocationCache, createLocationService } from './src/infrastructure/geocoding';
import { HttpIncidentRepository } from './src/infrastructure/incidents/http-incident-repository';
import { initializePersistence } from './src/infrastructure/persistence';
import type { PendingOperation } from './src/infrastructure/persistence';
import { createSessionManager } from './src/infrastructure/session/manager';
import { createSecureSessionStorage } from './src/infrastructure/session/secure-storage';
import { outbox, readOutboxPayload } from './src/infrastructure/sync/outbox';
import type { OutboxSubmit, StartPayload } from './src/infrastructure/sync/outbox';
import { submitTechnicianStart } from './src/infrastructure/sync/technician-start';
import { reportIncidentFailure } from './src/infrastructure/telemetry/safe-telemetry';
import { IncidentApp } from './src/ui/IncidentApp';
import { describeLocation } from './src/ui/location-view';

const backendUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL
  ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4310' : 'http://127.0.0.1:4310');

/**
 * Actor vigente de la sesión. El backend autoriza por `X-Course-Actor`, así que
 * el repositorio lo consulta en cada solicitud: cambiar de reportante a técnico
 * no obliga a recrear el cliente HTTP.
 */
let activeActor: string | null = null;

const session = createSessionManager({
  storage: createSecureSessionStorage(),
  now: () => Date.now(),
  baseUrl: backendUrl,
});
const repository = new HttpIncidentRepository(backendUrl, {
  actorProvider: () => activeActor,
  tokenProvider: () => session.getValidToken(),
  onUnauthorized: (rejectedToken) => session.renew(rejectedToken),
});

/**
 * Servicio de ubicación: lectura opcional con caché y alternativa manual. Usa
 * la sesión vigente (token y actor) y nunca lanza ni bloquea el guardado.
 */
const geocoding = createLocationService({
  lookup: createHttpGeocodingProvider({
    baseUrl: backendUrl,
    tokenProvider: () => session.getValidToken(),
    actorProvider: () => activeActor,
  }),
  cache: createLocationCache(),
});

const resolveLocation = async (query: string) =>
  describeLocation(await geocoding.resolve(query, query));

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

/**
 * Texto de la operación pendiente. Es lo que debe verse igual antes y después
 * de cerrar la app: identidad estable, incidencia, nota y referencia de foto.
 */
function describeOperation(operation: PendingOperation): string {
  const payload = readOutboxPayload(operation);
  const label = payload?.action === 'start' ? 'Inicio de atención' : 'Nueva incidencia';
  const parts = [label, operation.incidentId, operation.operationId];
  if (payload?.action === 'start') {
    if (payload.note !== undefined) parts.push(`nota: ${payload.note}`);
    if (payload.evidenceIds !== undefined) parts.push(`foto: ${payload.evidenceIds.join(', ')}`);
  }
  parts.push(`estado: ${operation.status}`);
  return parts.join(' · ');
}

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [sessionState, setSessionState] = useState<'anonymous' | 'autenticado'>('anonymous');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [actor, setActor] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<readonly PendingOperation[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      const items = await outbox.pending();
      setPendingItems(items);
      setPendingCount(items.length);
      return items.length;
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

  /**
   * Envío de una operación de la cola. Las creaciones se envían tal cual; los
   * inicios de atención pasan por la decisión de reasignación antes de tocar la
   * acción del servidor.
   */
  const submitOperation = useCallback<OutboxSubmit>(async (payload, operationId, operation) => {
    if (payload.action === 'create_incident') {
      return repository.create(payload.draft, operationId);
    }
    return submitTechnicianStart(operation, payload, {
      find: (id) => repository.findById(id),
      start: (id, baseVersion, idempotencyKey, input) =>
        repository.start(id, baseVersion, idempotencyKey, input),
    });
  }, []);

  /** Reenvía la cola sin tocar el estado de la pantalla. */
  const flushPending = useCallback(async () => {
    const result = await outbox.flush(submitOperation);
    await refreshPending();
    return result;
  }, [refreshPending, submitOperation]);

  const syncPending = useCallback(async () => {
    const result = await flushPending();
    if (result.conflicts.length > 0) {
      setNotice('La incidencia fue reasignada: el inicio queda pendiente y no se sobrescribió la asignación.');
    } else if (result.confirmed.length > 0) {
      setRefreshKey((key) => key + 1);
      setNotice(`Sincronizadas ${result.confirmed.length} operación(es) pendientes.`);
    } else if (result.failed.length > 0) {
      setNotice('Las operaciones pendientes no se confirmaron; siguen guardadas.');
    }
    return result;
  }, [flushPending]);

  const startSession = useCallback(async (actorId: string) => {
    setSessionBusy(true);
    try {
      await session.login(actorId);
      activeActor = actorId;
      setActor(actorId);
      setSessionState('autenticado');
      setStatus('available');
      try {
        await syncPending();
      } catch {
        // Si falla la reanudación, la cola permanece intacta para el reintento.
      }
    } catch {
      setStatus('offline');
      setNotice('Sin conexión: no se pudo abrir la sesión, pero los pendientes siguen guardados.');
    } finally {
      setSessionBusy(false);
    }
  }, [syncPending]);

  const endSession = useCallback(async () => {
    await session.logout();
    activeActor = null;
    setActor(null);
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
        await outbox.saveOffline(draft, operationId, { author: actor ?? 'reporter-1' });
        await refreshPending();
        setNotice('Sin conexión: la incidencia se guardó y se enviará al reconectar.');
        return localIncidentDetail(draft, operationId);
      }
    },
    [actor, refreshPending],
  );

  /**
   * Inicio de atención sobre una incidencia existente. Siempre pasa por la cola
   * (outbox-first): así el caso sin conexión y el caso con conexión comparten el
   * mismo camino y la operación sólo sale cuando el servidor la confirma.
   */
  const startAttention = useCallback(
    async (incident: IncidentDetail, input: Readonly<{ note: string; photoRef: string }>) => {
      const note = input.note.trim();
      const photoRef = input.photoRef.trim();
      const payload: StartPayload = {
        action: 'start',
        ...(note.length > 0 ? { note } : {}),
        ...(photoRef.length > 0 ? { evidenceIds: [photoRef] } : {}),
      };
      const operationId = `start-${incident.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await outbox.saveAction({
        operationId,
        incidentId: incident.id,
        author: actor ?? 'technician-1',
        payload,
        baseVersion: incident.version ?? 1,
      });
      await refreshPending();
      setNotice(`Inicio de atención guardado (${operationId}); se enviará al reconectar.`);
      try {
        const result = await flushPending();
        if (result.conflicts.length > 0) {
          setNotice('La incidencia fue reasignada: el inicio queda pendiente y no se sobrescribió la asignación.');
        } else if (result.confirmed.includes(operationId)) {
          setNotice('Inicio de atención confirmado por el servidor.');
        }
      } catch {
        // La operación queda en la cola para el siguiente intento.
      }
      return { ...incident, status: 'in_progress' as const };
    },
    [actor, flushPending, refreshPending],
  );

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus en un entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
        <Text testID="pending-count">Pendientes sin conexión: {pendingCount}</Text>
        {notice ? <Text testID="sync-notice">{notice}</Text> : null}
        {sessionState === 'anonymous' ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => startSession('reporter-1')}
              disabled={sessionBusy} style={styles.button}>
              <Text style={styles.buttonLabel}>
                {sessionBusy ? 'Iniciando sesión...' : 'Iniciar sesión (reportante)'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => startSession('technician-1')}
              disabled={sessionBusy} style={styles.button}>
              <Text style={styles.buttonLabel}>
                {sessionBusy ? 'Iniciando sesión...' : 'Iniciar sesión (técnico)'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text testID="active-actor">Sesión: {actor ?? 'sin actor'}</Text>
            <Pressable accessibilityRole="button" onPress={syncNow} disabled={syncBusy} style={styles.button}>
              <Text style={styles.buttonLabel}>{syncBusy ? 'Sincronizando...' : 'Sincronizar pendientes'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={endSession} style={styles.button}>
              <Text style={styles.buttonLabel}>Cerrar sesión</Text>
            </Pressable>
          </>
        )}
      </View>
      {pendingItems.length > 0 ? (
        <View style={styles.card}>
          <Text testID="pending-title" style={styles.subtitle}>Pendientes sin conexión</Text>
          {pendingItems.map((operation) => (
            <Text key={operation.operationId} testID={`pending-${operation.operationId}`} style={styles.pending}>
              {describeOperation(operation)}
            </Text>
          ))}
        </View>
      ) : null}
      {sessionState === 'autenticado' ? (
        <IncidentApp
          key={`autenticado-${refreshKey}`}
          loadList={loadList}
          loadDetail={loadDetail}
          createIncident={saveIncident}
          startAttention={startAttention}
          reportFailure={reportIncidentFailure}
          resolveLocation={resolveLocation}
        />
      ) : (
        <View style={styles.card}>
          <Text testID="session-hint">Inicia sesión para consultar las incidencias.</Text>
          {pendingCount > 0
            ? <Text>Las operaciones pendientes se conservan aunque cierres la app.</Text>
            : null}
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
  subtitle: { fontSize: 16, fontWeight: '600' },
  pending: { color: '#333' },
  button: { alignSelf: 'flex-start', backgroundColor: '#17479e', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  buttonLabel: { color: '#fff', fontWeight: '600' },
});
