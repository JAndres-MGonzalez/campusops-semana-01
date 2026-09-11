import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { IncidentDetail } from '../../domain/incident';
import { CATEGORY_LABEL, STATUS_LABEL } from '../incident-labels';

type Props = Readonly<{
  incident: IncidentDetail | null;
  onBack: () => void;
}>;

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-MX');
}

export function IncidentDetailScreen({ incident, onBack }: Props) {
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
          <Text style={styles.meta}>Creada: {formatDate(incident.createdAt)}</Text>
          <Text style={styles.meta}>Actualizada: {formatDate(incident.updatedAt)}</Text>
          <Text style={styles.description}>{incident.description}</Text>
        </ScrollView>
      ) : (
        <Text style={styles.notFound}>Incidencia no encontrada.</Text>
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
  notFound: { padding: 16, textAlign: 'center', color: '#777' },
});