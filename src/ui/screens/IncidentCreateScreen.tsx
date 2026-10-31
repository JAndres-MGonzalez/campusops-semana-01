import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { IncidentCategory } from '../../campusops/contracts';
import type { IncidentDraft } from '../../domain/incident';
import { CATEGORY_LABEL } from '../incident-labels';
import type { LocationViewResult } from '../location-view';

type Props = Readonly<{
  busy: boolean;
  onSubmit: (draft: IncidentDraft, operationId: string) => void;
  onCancel: () => void;
  /**
   * Búsqueda opcional de ubicación. Nunca bloquea el guardado: si falla, la
   * persona conserva lo que escribió.
   */
  onResolveLocation?: (query: string) => Promise<LocationViewResult>;
}>;

const EMPTY_LOCATION_NOTICE = 'Escribe un edificio, zona o referencia';
const MANUAL_LOCATION_NOTICE = 'No se pudo obtener la ubicación. Se conserva tu referencia manual.';

export function IncidentCreateScreen({ busy, onSubmit, onCancel, onResolveLocation }: Props) {
  const [category, setCategory] = useState<IncidentCategory>('maintenance');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const submit = () => {
    const draft = { category, description: description.trim(), location: location.trim() };
    const fingerprint = JSON.stringify(draft);
    if (operation.current?.fingerprint !== fingerprint) {
      operation.current = { fingerprint, id: `week05-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    }
    onSubmit(draft, operation.current.id);
  };
  const searchLocation = async () => {
    if (onResolveLocation === undefined) return;
    const query = location.trim();
    if (query.length === 0) {
      setLocationNotice(EMPTY_LOCATION_NOTICE);
      return;
    }
    setLocating(true);
    try {
      const result = await onResolveLocation(query);
      // Sólo una ubicación del proveedor (o de la caché) reemplaza el texto;
      // en el respaldo se conserva EXACTAMENTE lo que la persona escribió.
      if (result.origin !== 'manual') setLocation(result.label);
      setLocationNotice(result.notice);
    } catch {
      setLocationNotice(MANUAL_LOCATION_NOTICE);
    } finally {
      setLocating(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Nueva incidencia</Text>
      <Text>Categoría</Text>
      <View style={styles.categories}>
        {(Object.keys(CATEGORY_LABEL) as IncidentCategory[]).map((value) => (
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === category, disabled: busy }}
            disabled={busy} onPress={() => setCategory(value)} style={styles.choice}>
            <Text>{value === category ? '✓ ' : ''}{CATEGORY_LABEL[value]}</Text>
          </Pressable>
        ))}
      </View>
      <Text>Descripción</Text>
      <TextInput accessibilityLabel="Descripción" value={description} onChangeText={setDescription}
        multiline editable={!busy} style={styles.input} />
      <Text>Ubicación</Text>
      <TextInput accessibilityLabel="Ubicación" value={location}
        onChangeText={(value) => { setLocation(value); setLocationNotice(null); }}
        editable={!busy && !locating} style={styles.input} />
      {onResolveLocation !== undefined ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Buscar ubicación"
          accessibilityState={{ disabled: busy || locating }} disabled={busy || locating}
          onPress={() => { void searchLocation(); }} style={styles.choice}>
          <Text>{locating ? 'Buscando ubicación...' : 'Buscar ubicación'}</Text>
        </Pressable>
      ) : null}
      {locationNotice !== null ? <Text testID="location-notice">{locationNotice}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Guardar incidencia" disabled={busy}
        accessibilityState={{ disabled: busy }} onPress={submit} style={styles.choice}>
        <Text>{busy ? 'Guardando incidencia...' : 'Guardar incidencia'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.choice}>
        <Text>Cancelar</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: { padding: 12, gap: 10 }, title: { fontSize: 20, fontWeight: '700' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { padding: 12, borderWidth: 1, borderColor: '#888', borderRadius: 4 },
  input: { borderWidth: 1, borderColor: '#888', padding: 12, minHeight: 44 },
});
