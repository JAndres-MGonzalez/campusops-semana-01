import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { IncidentDetail } from '../../domain/incident';
import { CATEGORY_LABEL, STATUS_LABEL } from '../incident-labels';

type StartAction = Readonly<{
  busy: boolean;
  /** Sólo una incidencia asignada puede iniciarse. */
  enabled: boolean;
  onStart: (input: Readonly<{ note: string; photoRef: string }>) => void;
}>;

type Props = Readonly<{
  incident: IncidentDetail | null;
  onBack: () => void;
  emptyMessage?: string;
  start?: StartAction;
}>;

function formatDate(value: string | null): string {
  return value === null ? 'No informada por el servidor' : new Date(value).toLocaleString('es-MX');
}

export function IncidentDetailScreen({ incident, onBack, emptyMessage = 'Incidencia no encontrada.', start }: Props) {
  const [note, setNote] = useState('');
  const [photoRef, setPhotoRef] = useState('');
  return (
    <View style={styles.screen}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>{'<- Volver a la lista'}</Text>
      </Pressable>
      {incident ? (
        <ScrollView>
          <Text style={styles.title}>{incident.title}</Text>
          <Text style={styles.meta}>ID: {incident.id}</Text>
          <Text style={styles.meta}>Estado: {STATUS_LABEL[incident.status]}</Text>
          <Text style={styles.meta}>Categoría: {CATEGORY_LABEL[incident.category]}</Text>
          <Text style={styles.meta}>Ubicación: {incident.locationLabel}</Text>
          <Text style={styles.meta}>Reportado por: {incident.reportedBy}</Text>
          <Text style={styles.meta}>Versión: {incident.version ?? 'no informada'}</Text>
          <Text style={styles.meta}>Técnico asignado: {incident.assignedTechnicianId ?? 'sin asignar'}</Text>
          <Text style={styles.meta}>Creada: {formatDate(incident.createdAt)}</Text>
          <Text style={styles.meta}>Actualizada: {formatDate(incident.updatedAt)}</Text>
          <Text style={styles.description}>{incident.description}</Text>
          {start ? (
            <View style={styles.startBlock}>
              <Text style={styles.section}>Iniciar atención</Text>
              <Text style={styles.meta}>
                {start.enabled
                  ? 'La operación se guarda primero en la cola: si no hay conexión, se envía al reconectar.'
                  : 'Sólo se puede iniciar una incidencia en estado Asignada.'}
              </Text>
              <Text>Nota de inicio</Text>
              <TextInput accessibilityLabel="Nota de inicio" value={note} onChangeText={setNote}
                multiline editable={!start.busy && start.enabled} style={styles.input} />
              <Text>Referencia de fotografía</Text>
              <TextInput accessibilityLabel="Referencia de fotografía" value={photoRef} onChangeText={setPhotoRef}
                editable={!start.busy && start.enabled} style={styles.input}
                placeholder="foto://lab-a/ingreso-01.jpg" autoCapitalize="none" />
              <Pressable accessibilityRole="button" accessibilityLabel="Iniciar atención"
                disabled={start.busy || !start.enabled} accessibilityState={{ disabled: start.busy || !start.enabled }}
                onPress={() => start.onStart({ note, photoRef })} style={styles.choice}>
                <Text>{start.busy ? 'Guardando inicio...' : 'Iniciar atención'}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <Text style={styles.notFound}>{emptyMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  back: { paddingVertical: 8 },
  backText: { color: '#0a4', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  meta: { color: '#555', marginTop: 4 },
  description: { marginTop: 12, fontSize: 15, lineHeight: 22 },
  startBlock: { marginTop: 20, gap: 8 },
  section: { fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#888', padding: 12, minHeight: 44 },
  choice: { padding: 12, borderWidth: 1, borderColor: '#17479e', borderRadius: 4 },
  notFound: { padding: 16, textAlign: 'center', color: '#777' },
});
