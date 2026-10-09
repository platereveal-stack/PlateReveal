import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase'; // Ajuste le chemin selon ton projet

// -----------------------------------------------------------------------------
// ABSTRACTION SÉCURISÉE DES MODULES NATIFS POUR LE WEB
// -----------------------------------------------------------------------------
let FileSystem: any = null;
let MediaLibrary: any = null;

if (Platform.OS !== 'web') {
  try {
    FileSystem = require('expo-file-system');
    MediaLibrary = require('expo-media-library');
  } catch (e) {
    console.warn('Modules natifs non disponibles sur cette plateforme');
  }
}

// -----------------------------------------------------------------------------
// INTERFACES & UTILITAIRES
// -----------------------------------------------------------------------------
interface Post {
  id: string;
  user_id: string;
  description: string;
  recipe?: string | null;
  image_url: string;
  visibility: 'public' | 'friends';
  tranche?: 'morning' | 'evening';
  created_at: string;
  profiles?: { username: string } | null;
  likes?: { user_id: string }[];
  likes_count: number;
  userHasLiked: boolean;
}

const timeAgo = (dateString: string): string => {
  const now = new Date();
  const past = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return "À l'instant";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}j`;
};

const isPostUnlockedByTranche = (post: Post): boolean => {
  if (!post.created_at) return true;

  const now = new Date();
  const currentHour = now.getHours();
  const postDate = new Date(post.created_at);

  const isToday =
    postDate.getFullYear() === now.getFullYear() &&
    postDate.getMonth() === now.getMonth() &&
    postDate.getDate() === now.getDate();

  if (!isToday) return true;

  if (post.tranche === 'morning') return currentHour >= 15;
  if (post.tranche === 'evening') return currentHour >= 21;

  return true;
};

// -----------------------------------------------------------------------------
// COMPOSANT POST (MÉMOÏSÉ POUR LES PERFORMANCES)
// Empêche le re-rendu de toute la liste quand on like un seul post
// -----------------------------------------------------------------------------
const PostCard = memo(({ 
  item, 
  onLike, 
  onDownload 
}: { 
  item: Post; 
  onLike: (id: string, isLiked: boolean) => void;
  onDownload: (url: string) => void;
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.username}>@{item.profiles?.username || 'Anonyme'}</Text>
        <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
      </View>

      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={styles.postImage}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.cardBody}>
        {!!item.description && (
          <Text style={styles.postDescription}>{item.description}</Text>
        )}

        {item.recipe && (
          <View style={styles.recipeBox}>
            <Text style={styles.recipeTitle}>📖 Recette</Text>
            <Text style={styles.recipeText} numberOfLines={3}>{item.recipe}</Text>
          </View>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.visibilityBadge}>
            {item.visibility === 'friends' ? '👥 Amis' : '🌍 Public'}
          </Text>

          <View style={styles.actionsRight}>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={() => onLike(item.id, item.userHasLiked)}
              activeOpacity={0.7}
            >
              <Text style={styles.likeText}>
                {item.userHasLiked ? '❤️' : '🤍'} {item.likes_count}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => onDownload(item.image_url)}
              activeOpacity={0.7}
            >
              <Text style={styles.downloadIcon}>📥</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
});

// -----------------------------------------------------------------------------
// ÉCRAN PRINCIPAL (FEED / INDEX)
// -----------------------------------------------------------------------------
export default function FeedScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'public' | 'friends'>('public');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userStreak, setUserStreak] = useState<number>(0);

  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  // Vérification de l'Onboarding
  useEffect(() => {
    async function checkTutorial() {
      try {
        const hasSeen = await AsyncStorage.getItem('@has_seen_tutorial');
        if (hasSeen === null) setShowOnboarding(true);
      } catch (error) {
        console.error('Erreur AsyncStorage:', error);
      } finally {
        setIsCheckingOnboarding(false);
      }
    }
    checkTutorial();
  }, []);

  const completeTutorial = async () => {
    try {
      await AsyncStorage.setItem('@has_seen_tutorial', 'true');
      setShowOnboarding(false);
    } catch (error) {
      console.error(error);
    }
  };

  // Récupération des données utilisateur (Streak)
  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('streak_count')
        .eq('id', userId)
        .single();

      if (data && !error) setUserStreak(data.streak_count || 0);
    } catch (err) {
      console.error('Erreur streak :', err);
    }
  }, []);

  // Chargement principal des publications
  const fetchPosts = useCallback(async (showLoader = false) => {
    if (showLoader) setInitialLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      setCurrentUserId(userId);

      if (userId) fetchUserData(userId);

      let acceptedFriendIds: string[] = [];
      if (userId) {
        const { data: friendships, error: friendError } = await supabase
          .from('friendships')
          .select('sender_id, receiver_id')
          .eq('status', 'accepted')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

        if (!friendError && friendships) {
          acceptedFriendIds = friendships.map((f) =>
            f.sender_id === userId ? f.receiver_id : f.sender_id
          );
        }
      }

      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles ( username ),
          likes ( user_id )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const filtered = data.filter((post) => {
          if (!isPostUnlockedByTranche(post as Post)) return false;

          const isOwner = Boolean(userId && post.user_id === userId);
          const isFriend = Boolean(userId && acceptedFriendIds.includes(post.user_id));

          return activeTab === 'public' ? post.visibility === 'public' : (isOwner || isFriend);
        });

        const processedPosts: Post[] = filtered.map((post) => ({
          ...post,
          profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
          likes_count: post.likes ? post.likes.length : 0,
          userHasLiked: userId
            ? post.likes?.some((l: { user_id: string }) => l.user_id === userId)
            : false,
        }));

        setPosts(processedPosts);
      }
    } catch (err: any) {
      console.error('Erreur fetchPosts :', err.message);
      Alert.alert('Erreur', 'Impossible de charger le fil d\'actualité.');
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [activeTab, fetchUserData]);

  // Référence pour utiliser la version à jour de fetchPosts dans les listeners
  const fetchPostsRef = useRef(fetchPosts);
  useEffect(() => {
    fetchPostsRef.current = fetchPosts;
  }, [fetchPosts]);

  // Chargement initial et au changement d'onglet
  useEffect(() => {
    fetchPosts(true);
  }, [activeTab, fetchPosts]);

  // Abonnement Realtime aux modifications de la base de données
  useEffect(() => {
    const channelId = `feed_realtime_${Date.now()}`;
    const realtimeChannel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        fetchPostsRef.current(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => {
        fetchPostsRef.current(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPostsRef.current(false);
    }, [])
  );

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchPosts(false);
  };

  // Mise à jour optimiste du Like pour ne pas bloquer l'interface
  const handleLike = useCallback(async (postId: string, isLiked: boolean) => {
    if (!currentUserId) {
      Alert.alert('Connexion requise', 'Tu dois être connecté pour liker un plat !');
      router.push('/auth' as any);
      return;
    }

    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.id === postId) {
          const newLikesCount = isLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1;
          return { ...p, userHasLiked: !isLiked, likes_count: newLikesCount };
        }
        return p;
      })
    );

    try {
      if (isLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', currentUserId);
      } else {
        await supabase
          .from('likes')
          .upsert(
            [{ post_id: postId, user_id: currentUserId }],
            { onConflict: 'post_id,user_id' }
          );
      }
    } catch (error) {
      // En cas d'erreur, on rafraîchit pour annuler la mise à jour optimiste
      console.error('Erreur like :', error);
      fetchPostsRef.current(false);
    }
  }, [currentUserId, router]);

  const handleDownload = useCallback(async (imageUrl: string) => {
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `plat_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } catch (error) {
        window.open(imageUrl, '_blank');
      }
      return;
    }

    try {
      if (!MediaLibrary || !FileSystem) {
        Alert.alert('Erreur', 'Fonctionnalité non supportée sur cet appareil.');
        return;
      }
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission refusée', "Accès à la galerie nécessaire pour enregistrer l'image.");
        return;
      }
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;

      const filename = imageUrl.split('/').pop() || `plat_${Date.now()}.jpg`;
      const fileUri = `${cacheDir}${filename}`;
      const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);

      if (downloadResult.status !== 200) throw new Error("Erreur serveur.");

      await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
      Alert.alert('Succès 📥', 'L\'image a été enregistrée dans ta galerie !');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de télécharger l\'image.');
    }
  }, []);

  const renderPostItem = useCallback(({ item }: { item: Post }) => (
    <PostCard item={item} onLike={handleLike} onDownload={handleDownload} />
  ), [handleLike, handleDownload]);

  // Écrans de blocage (Chargement onboarding & Tutoriel)
  if (isCheckingOnboarding) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <View style={styles.onboardingContainer}>
        <Text style={styles.onboardingTitle}>Bienvenue sur PlateReveal ! 🍽️</Text>
        <Text style={styles.onboardingText}>
          Découvre les plats de tes amis, partage tes meilleures recettes et garde un œil sur le compteur de flammes. Attention, les plats ne se dévoilent qu'à certaines heures ! 🤫
        </Text>
        <TouchableOpacity style={styles.onboardingButton} onPress={completeTutorial} activeOpacity={0.8}>
          <Text style={styles.onboardingButtonText}>J'ai compris, c'est parti ! 🔥</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        
        {/* EN TÊTE */}
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>🔥 Fil du Jour</Text>

          <View style={styles.headerRightActions}>
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {userStreak}</Text>
            </View>

            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/friends')}>
              <Text style={styles.iconEmoji}>👥</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/profile')}>
              <Text style={styles.iconEmoji}>👤</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings')}>
              <Text style={styles.iconEmoji}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTRÔLES (Onglets + Bouton Partager) */}
        <View style={styles.controlsRow}>
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'public' && styles.activeTab]}
              onPress={() => setActiveTab('public')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'public' && styles.activeTabText]}>
                🌍 Public
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
              onPress={() => setActiveTab('friends')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
                👥 Amis
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.shareButton} onPress={() => router.push('/post')} activeOpacity={0.8}>
            <Text style={styles.shareButtonText}>📸 Partager</Text>
          </TouchableOpacity>
        </View>

        {/* CONTENU PRINCIPAL */}
        {initialLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#38BDF8" />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            // Optimisations de rendu massives
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={11}
            removeClippedSubviews={Platform.OS !== 'web'}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleManualRefresh}
                tintColor="#38BDF8"
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {activeTab === 'public'
                  ? 'Aucune publication publique récente.'
                  : 'Aucun plat partagé par tes amis 👥'}
              </Text>
            }
            renderItem={renderPostItem}
          />
        )}
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// STYLES
// -----------------------------------------------------------------------------
const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#0A111F',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    backgroundColor: '#0A111F',
    paddingTop: Platform.OS === 'ios' ? 55 : 40,
    paddingHorizontal: 12,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0A111F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingContainer: {
    flex: 1,
    backgroundColor: '#0A111F',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    maxWidth: 500,
    alignSelf: 'center',
  },
  onboardingTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  onboardingText: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  onboardingButton: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  onboardingButtonText: {
    color: '#0A111F',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  streakText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  iconButton: {
    backgroundColor: '#1E293B',
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: {
    fontSize: 15,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    alignItems: 'center',
  },
  tabsContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#38BDF8',
  },
  tabText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  activeTabText: {
    color: '#0A111F',
    fontWeight: 'bold',
  },
  shareButton: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#0A111F',
    fontWeight: 'bold',
    fontSize: 13,
  },
  listContainer: {
    paddingBottom: 60,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  username: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 14,
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  postImage: {
    width: '100%',
    height: 320,
    backgroundColor: '#090D16',
  },
  cardBody: {
    padding: 12,
  },
  postDescription: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  recipeBox: {
    backgroundColor: '#0A111F',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
    marginBottom: 10,
  },
  recipeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  recipeText: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  visibilityBadge: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#0A111F',
    borderRadius: 8,
  },
  likeText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  downloadButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#0A111F',
    borderRadius: 8,
  },
  downloadIcon: {
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    marginTop: 40,
    fontSize: 15,
  },
});