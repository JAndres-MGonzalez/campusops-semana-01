import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { IncidentCategory } from '../../campusops/contracts';
import type { IncidentDraft } from '../../domain/incident';
import { CATEGORY_LABEL } from '../incident-labels';

type Props = Readonly<{
  busy: boolean;
  onSubmit: (draft: IncidentDraft, operationId: string) => void;
  onCancel: () => void;
}>;

export function IncidentCreateScreen({ busy, onSubmit, onCancel }: Props) {
  const [category, setCategory] = useState<IncidentCategory>('maintenance');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const submit = () => {
    const draft = { category, description: description.trim(), location: location.trim() };
    const fingerprint = JSON.stringify(draft);
    if (operation.current?.fingerprint !== fingerprint) {
      operation.current = { fingerprint, id: `week05-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    }
    onSubmit(draft, operation.current.id);
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
      <TextInput accessibilityLabel="Ubicación" value={location} onChangeText={setLocation}
        editable={!busy} style={styles.input} />
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
