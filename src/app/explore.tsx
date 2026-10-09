import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ExploreScreen() {
  const router = useRouter();

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Découverte 🌐</Text>
      <Text style={styles.subtitle}>Explore les repas partagés dans le monde entier</Text>

      {/* Carte d'exemple */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.username}>@chef_sami</Text>
          <Text style={styles.badge}>🌐 Public</Text>
        </View>

        <View style={styles.imagePlaceholder}>
          <Text style={styles.emoji}>🍣</Text>
          <Text style={styles.plateTitle}>Plateau Sushi Maison</Text>
        </View>

        <TouchableOpacity 
          style={styles.actionButton}
          activeOpacity={0.8}
          onPress={() => router.push('/post')}
        >
          <Text style={styles.actionText}>Voir plus</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#94A3B8', marginBottom: 20 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  username: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 16 },
  badge: { color: '#38BDF8', fontSize: 12, fontWeight: '500' },
  imagePlaceholder: { height: 160, backgroundColor: '#0F172A', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emoji: { fontSize: 48 },
  plateTitle: { color: '#F8FAFC', fontWeight: '600', marginTop: 8 },
  actionButton: { backgroundColor: '#38BDF8', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  actionText: { color: '#0F172A', fontWeight: 'bold', fontSize: 14 },
});