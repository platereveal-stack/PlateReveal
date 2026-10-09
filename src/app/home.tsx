import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  // On sépare le chargement initial du rafraîchissement manuel
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (data) {
        setPosts(data);
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement des posts :', error.message);
    }
  };

  // 🔥 LE SECRET DU PRO : useFocusEffect
  // Cette fonction s'exécute à chaque fois que tu arrives sur cette page (même après un retour)
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadFocusData = async () => {
        await fetchPosts();
        if (isActive) {
          setInitialLoading(false);
        }
      };

      loadFocusData();

      // Nettoyage si on quitte la page pendant le chargement
      return () => {
        isActive = false;
      };
    }, [])
  );

  // Fonction pour le "Tirer pour rafraîchir" (Pull-to-refresh)
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  // Affichage du loader uniquement au tout premier lancement
  if (initialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Chargement des plats...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Fil d'actualité 🍽️</Text>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.postCard}>
            {item.image_url && (
              // J'ai ajouté resizeMode="cover" directement ici pour éviter le warning que tu avais !
              <Image 
                source={{ uri: item.image_url }} 
                style={styles.postImage} 
                resizeMode="cover" 
              />
            )}

            <View style={styles.postContent}>
              <Text style={styles.postDescription}>{item.description}</Text>

              <View style={styles.footerRow}>
                <Text style={styles.visibilityBadge}>
                  {item.visibility === 'public' ? '🌍 Public' : '👥 Amis'}
                </Text>
                <Text style={styles.dateText}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>
              Aucun plat publié pour le moment. Sois le premier ! 🚀
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingTop: 60, paddingHorizontal: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 20, textAlign: 'center' },
  centered: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 14, color: '#94A3B8' },
  
  postCard: { 
    width: '100%', 
    backgroundColor: '#1E293B',
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#334155',
    marginBottom: 20, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  postImage: { width: '100%', height: 250 },
  postContent: { padding: 15 },
  postDescription: { fontSize: 15, color: '#F8FAFC', marginBottom: 12, lineHeight: 22 },

  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  visibilityBadge: { fontSize: 12, fontWeight: '600', color: '#38BDF8' },
  dateText: { fontSize: 12, color: '#94A3B8' },

  emptyText: { textAlign: 'center', fontSize: 15, color: '#94A3B8', marginTop: 40 },
});