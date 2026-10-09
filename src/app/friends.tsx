import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  username: string;
}

interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  username: string;
}

const withTimeout = (promise: PromiseLike<any>, timeoutMs: number = 5000) => {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Le réseau est trop lent (Timeout).")), timeoutMs);
  });
  return Promise.race([promise, timeout]);
};

export default function FriendsScreen() {
  const router = useRouter();
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]); // Demandes reçues
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);       // Demandes envoyées
  const [acceptedFriends, setAcceptedFriends] = useState<FriendRequest[]>([]);
  
  const [isSearching, setIsSearching] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    let channel: any;

    const setupDataAndRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      
      const userId = session.user.id;
      setCurrentUserId(userId);

      await fetchFriendships(userId);

      channel = supabase
        .channel(`friendships_changes_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friendships' },
          () => { if (isMounted.current) fetchFriendships(userId); }
        )
        .subscribe();
    };

    setupDataAndRealtime();

    return () => {
      isMounted.current = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        executeSearch(searchQuery.trim());
      } else {
        setSearchResults([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const fetchFriendships = async (userId: string) => {
    try {
      const { data: friendships, error: friendError } = await supabase
        .from('friendships')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

      if (friendError) throw friendError;

      if (friendships && friendships.length > 0) {
        const otherUserIds = friendships.map(f => f.sender_id === userId ? f.receiver_id : f.sender_id);
        
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', otherUserIds);

        if (profileError) throw profileError;

        const pending: FriendRequest[] = [];
        const sent: FriendRequest[] = [];
        const accepted: FriendRequest[] = [];

        friendships.forEach(f => {
          const otherId = f.sender_id === userId ? f.receiver_id : f.sender_id;
          const profile = profiles?.find(p => p.id === otherId);
          const item = {
            id: f.id,
            sender_id: f.sender_id,
            receiver_id: f.receiver_id,
            status: f.status,
            username: profile?.username || "Utilisateur inconnu"
          };

          if (f.status === 'pending') {
            if (f.receiver_id === userId) {
              pending.push(item); // Demande reçue
            } else if (f.sender_id === userId) {
              sent.push(item);    // Demande envoyée
            }
          } else if (f.status === 'accepted') {
            accepted.push(item);
          }
        });

        if (isMounted.current) {
          setPendingRequests(pending);
          setSentRequests(sent);
          setAcceptedFriends(accepted);
        }
      } else {
        if (isMounted.current) {
          setPendingRequests([]);
          setSentRequests([]);
          setAcceptedFriends([]);
        }
      }
    } catch (error: any) {
      console.log("Erreur chargement :", error.message);
    }
  };

  const executeSearch = async (cleanText: string) => {
    if (!currentUserId) return;
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${cleanText}%`)
        .neq('id', currentUserId)
        .limit(10);

      if (error) throw error;
      
      if (data && isMounted.current) {
        const filteredData = data.filter(user => 
          !acceptedFriends.some(f => f.sender_id === user.id || f.receiver_id === user.id) &&
          !pendingRequests.some(f => f.sender_id === user.id || f.receiver_id === user.id) &&
          !sentRequests.some(f => f.sender_id === user.id || f.receiver_id === user.id)
        );
        setSearchResults(filteredData);
      }
    } catch (error: any) {
      console.log("Erreur recherche :", error.message);
    } finally {
      if (isMounted.current) setIsSearching(false);
    }
  };

  const sendFriendRequest = async (receiverId: string) => {
    if (!currentUserId || actionLoadingId) return;
    setActionLoadingId(receiverId);

    try {
      const { data: existing, error: checkError } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUserId})`);

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        Alert.alert("Oups 😅", "Une relation ou une demande existe déjà avec cet utilisateur !");
        if (isMounted.current) setActionLoadingId(null);
        return;
      }

      const response: any = await withTimeout(
        supabase
          .from('friendships')
          .insert([{ sender_id: currentUserId, receiver_id: receiverId, status: 'pending' }])
          .select() as any
      );

      if (response && response.error) {
        if (response.error.code === '23505') {
          Alert.alert("Oups 😅", "Tu as déjà envoyé une demande à cet utilisateur !");
        } else {
          throw response.error;
        }
        return;
      }

      Alert.alert("Succès 🤝", "Demande envoyée !");
      setSearchQuery('');
      setSearchResults([]);
      
      if (currentUserId) fetchFriendships(currentUserId);
      
    } catch (error: any) {
      Alert.alert("Erreur", error.message || "Un problème est survenu lors de l'envoi de la demande.");
    } finally {
      if (isMounted.current) setActionLoadingId(null);
    }
  };

  const acceptRequest = async (friendshipId: string) => {
    if (actionLoadingId) return;
    setActionLoadingId(friendshipId);

    try {
      const response: any = await withTimeout(
        supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId).select() as any
      );

      if (response && response.error) throw response.error;

      if (currentUserId) fetchFriendships(currentUserId);
      
    } catch (error: any) {
      Alert.alert("Erreur", error.message || "Impossible d'accepter. Vérifie ta connexion.");
    } finally {
      if (isMounted.current) setActionLoadingId(null);
    }
  };

  const executeDelete = async (friendshipId: string) => {
    if (!isMounted.current) return;
    setActionLoadingId(friendshipId);
    
    try {
      const response: any = await withTimeout(
        supabase.from('friendships').delete().eq('id', friendshipId) as any
      );

      if (response && response.error) throw response.error;

      setPendingRequests(prev => prev.filter(req => req.id !== friendshipId));
      setSentRequests(prev => prev.filter(req => req.id !== friendshipId));
      setAcceptedFriends(prev => prev.filter(req => req.id !== friendshipId));

      if (currentUserId) fetchFriendships(currentUserId);
      
    } catch (error: any) {
      Alert.alert("Erreur", error.message || "Un problème inattendu est survenu.");
    } finally {
      if (isMounted.current) setActionLoadingId(null);
    }
  };

  const confirmDelete = (friendshipId: string, label: string) => {
    if (actionLoadingId) return;

    if (Platform.OS === 'web') {
      const isConfirmed = window.confirm(`Es-tu sûr de vouloir ${label.toLowerCase()} ?`);
      if (isConfirmed) executeDelete(friendshipId);
      return;
    }

    Alert.alert(
      "Confirmation",
      `Es-tu sûr de vouloir ${label.toLowerCase()} ?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", style: "destructive", onPress: () => executeDelete(friendshipId) }
      ]
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>👥 Gestion des Amis</Text>

      <Text style={styles.label}>Rechercher un utilisateur :</Text>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ex: ChefGordon"
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          maxLength={30}
        />
        {isSearching && <ActivityIndicator style={styles.searchLoader} color="#38BDF8" />}
      </View>

      {searchResults.length > 0 && (
        <View style={styles.resultsContainer}>
          {searchResults.map((item) => (
            <View key={item.id} style={styles.userRow}>
              <Text style={styles.username}>@{item.username}</Text>
              <TouchableOpacity 
                style={[styles.addButton, actionLoadingId === item.id && styles.buttonDisabled]} 
                onPress={() => sendFriendRequest(item.id)}
                disabled={actionLoadingId === item.id || actionLoadingId !== null}
              >
                {actionLoadingId === item.id ? (
                  <ActivityIndicator size="small" color="#0A111F" />
                ) : (
                  <Text style={styles.addButtonText}>Ajouter</Text>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Demandes reçues */}
      <Text style={styles.sectionTitle}>Demandes reçues</Text>
      {pendingRequests.length === 0 ? (
        <Text style={styles.emptyText}>Aucune demande reçue</Text>
      ) : (
        pendingRequests.map((item) => (
          <View key={item.id} style={styles.requestRow}>
            <Text style={styles.username}>@{item.username}</Text>
            <View style={styles.actionGroup}>
              <TouchableOpacity 
                style={[styles.acceptButton, actionLoadingId === item.id && styles.buttonDisabled]} 
                onPress={() => acceptRequest(item.id)}
                disabled={actionLoadingId !== null}
              >
                {actionLoadingId === item.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.acceptButtonText}>Accepter</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.deleteButton, actionLoadingId === item.id && styles.buttonDisabled]} 
                onPress={() => confirmDelete(item.id, "Refuser la demande")}
                disabled={actionLoadingId !== null}
              >
                {actionLoadingId === item.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteButtonText}>✕</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Demandes envoyées */}
      <Text style={styles.sectionTitle}>Demandes envoyées</Text>
      {sentRequests.length === 0 ? (
        <Text style={styles.emptyText}>Aucune demande envoyée en attente</Text>
      ) : (
        sentRequests.map((item) => (
          <View key={item.id} style={styles.requestRow}>
            <Text style={styles.username}>@{item.username}</Text>
            <TouchableOpacity 
              style={[styles.deleteButton, actionLoadingId === item.id && styles.buttonDisabled]} 
              onPress={() => confirmDelete(item.id, "Annuler la demande")}
              disabled={actionLoadingId !== null}
            >
              {actionLoadingId === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteButtonText}>Annuler</Text>
              )}
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Mes Amis */}
      <Text style={styles.sectionTitle}>Mes Amis</Text>
      {acceptedFriends.length === 0 ? (
        <Text style={styles.emptyText}>Aucun ami pour le moment</Text>
      ) : (
        acceptedFriends.map((item) => (
          <View key={item.id} style={styles.requestRow}>
            <Text style={styles.username}>@{item.username}</Text>
            
            <TouchableOpacity 
              style={[styles.deleteButton, actionLoadingId === item.id && styles.buttonDisabled]} 
              onPress={() => confirmDelete(item.id, "Retirer cet ami")}
              disabled={actionLoadingId !== null}
            >
              {actionLoadingId === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteButtonText}>Supprimer</Text>
              )}
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
        <Text style={styles.backButtonText}>← Retour au fil d'actualité</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A111F' },
  contentContainer: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC', textAlign: 'center', marginBottom: 20 },
  label: { color: '#F8FAFC', marginBottom: 6, fontSize: 14, fontWeight: '600' },
  searchContainer: { position: 'relative', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B', color: '#fff', padding: 14, borderRadius: 12, fontSize: 15 },
  searchLoader: { position: 'absolute', right: 15, top: 15 },
  resultsContainer: { marginBottom: 10 },
  userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A2333', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2A364B' },
  requestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A2333', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2A364B' },
  username: { color: '#38BDF8', fontWeight: 'bold', fontSize: 14 },
  actionGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addButton: { backgroundColor: '#38BDF8', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, minWidth: 70, alignItems: 'center' },
  addButtonText: { color: '#0A111F', fontWeight: 'bold', fontSize: 13 },
  acceptButton: { backgroundColor: '#10B981', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, minWidth: 75, alignItems: 'center' },
  acceptButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  deleteButton: { backgroundColor: '#EF4444', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, minWidth: 75, alignItems: 'center' },
  deleteButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  buttonDisabled: { opacity: 0.5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC', marginTop: 20, marginBottom: 10 },
  emptyText: { color: '#94A3B8', fontSize: 13, fontStyle: 'italic', marginBottom: 10 },
  backButton: { marginTop: 30, alignItems: 'center' },
  backButtonText: { color: '#38BDF8', fontSize: 14, fontWeight: '600' },
});