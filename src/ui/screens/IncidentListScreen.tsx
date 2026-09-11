import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import type { IncidentSummary } from '../../domain/incident';
import { CATEGORY_LABEL, STATUS_LABEL } from '../incident-labels';

type Props = Readonly<{
  incidents: readonly IncidentSummary[];
  onSelect: (id: string) => void;
}>;

export function IncidentListScreen({ incidents, onSelect }: Props) {
  return (
    <FlatList
      style={styles.list}
      data={[...incidents]}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No hay incidencias registradas.</Text>}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onSelect(item.id)}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>
            {STATUS_LABEL[item.status]} · {CATEGORY_LABEL[item.category]}
          </Text>
          <Text style={styles.meta}>{item.locationLabel}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowPressed: { opacity: 0.6 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#555', marginTop: 2 },
  empty: { padding: 16, textAlign: 'center', color: '#777' },
});