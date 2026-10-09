import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function ProfileScreen() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUsername('');
      }
    });

    return () => authListener?.unsubscribe();
  }, []);

  // Écouter les modifications en temps réel
  useEffect(() => {
    if (!session?.user) return;
    const userId = session.user.id;
    const channelName = `profile-changes-${userId}-${Math.random()}`;

    const profileSubscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: any) => {
          if (payload.new && payload.new.username) {
            setUsername(payload.new.username);
          }
        }
      ).subscribe();

    return () => {
      supabase.removeChannel(profileSubscription);
    };
  }, [session?.user?.id]);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();

      if (data?.username) setUsername(data.username);
    } catch (error) {
      console.log('Erreur chargement profil:', error);
    }
  }

  async function updateProfile() {
    if (!session?.user) return;
    const cleanUsername = username.trim();
    setErrorMessage(null);

    if (!cleanUsername) {
      setErrorMessage("⚠️ Le pseudo ne peut pas être vide.");
      return;
    }

    setLoading(true);

    try {
      const { data: existingUsers, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .neq('id', session.user.id);

      if (checkError) throw checkError;

      if (existingUsers && existingUsers.length > 0) {
        setErrorMessage("❌ Ce pseudo est déjà utilisé par un autre utilisateur !");
        setLoading(false);
        return;
      }

      const updates = {
        id: session.user.id,
        username: cleanUsername,
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').upsert(updates);

      if (error) throw error;
      Alert.alert('Succès 🎉', 'Ton pseudo a été mis à jour !');
      
    } catch (error: any) {
      setErrorMessage(`❌ Erreur : ${error.message || "Une erreur est survenue."}`);
    } finally {
      setLoading(false);
    }
  }

  // --- NOUVELLE FONCTION PRO : Mettre à jour le mot de passe ---
  async function updatePassword() {
    if (newPassword.length < 6) {
      setErrorMessage("⚠️ Le nouveau mot de passe doit faire au moins 6 caractères.");
      return;
    }

    setLoadingPassword(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setErrorMessage(`❌ Erreur : ${error.message}`);
    } else {
      Alert.alert('Succès 🔒', 'Ton mot de passe a été mis à jour avec succès.');
      setNewPassword(''); // On vide le champ après succès
    }
    setLoadingPassword(false);
  }

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Erreur', error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      Alert.alert('Succès', 'Vérifie tes e-mails pour valider ton compte !');
    }
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#0F172A' }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {session && session.user ? (
          <View style={styles.contentBox}>
            
            {/* EN-TÊTE DU PROFIL */}
            <View style={styles.header}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarEmoji}>👨‍🍳</Text>
              </View>
              <Text style={styles.title}>Mon Profil</Text>
              <Text style={styles.userEmail}>{session.user.email}</Text>
            </View>

            {/* BANDEAU D'ERREUR */}
            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* CARTE : INFORMATIONS PUBLIQUES */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Informations Publiques</Text>
              <Text style={styles.label}>Ton Pseudo</Text>
              <TextInput
                style={styles.input}
                onChangeText={(text) => {
                  setUsername(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                value={username}
                placeholder="Ex: ChefGordon"
                placeholderTextColor="#64748B"
                autoCapitalize="none"
              />
              <TouchableOpacity 
                style={[styles.btnPrimary, loading && { opacity: 0.7 }]} 
                onPress={updateProfile} 
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.btnPrimaryText}>Enregistrer le pseudo</Text>}
              </TouchableOpacity>
            </View>

            {/* CARTE : SÉCURITÉ */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sécurité</Text>
              <Text style={styles.label}>Nouveau mot de passe</Text>
              <TextInput
                style={styles.input}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                value={newPassword}
                placeholder="••••••••"
                placeholderTextColor="#64748B"
                secureTextEntry
              />
              <TouchableOpacity 
                style={[styles.btnOutline, loadingPassword && { opacity: 0.7 }]} 
                onPress={updatePassword} 
                disabled={loadingPassword || !newPassword}
              >
                {loadingPassword ? <ActivityIndicator color="#F8FAFC" /> : <Text style={styles.btnOutlineText}>Modifier le mot de passe</Text>}
              </TouchableOpacity>
            </View>

            {/* BOUTON DÉCONNEXION */}
            <TouchableOpacity style={styles.btnDanger} onPress={signOut}>
              <Text style={styles.btnDangerText}>Se déconnecter</Text>
            </TouchableOpacity>

          </View>
        ) : (
          
          /* SECTION CONNEXION / INSCRIPTION */
          <View style={styles.authBox}>
            <Text style={styles.title}>Connexion 🔑</Text>
            <Text style={styles.subtitle}>Connecte-toi pour sauvegarder ton compte</Text>
            
            <TextInput
              style={styles.input}
              onChangeText={setEmail}
              value={email}
              placeholder="email@exemple.com"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            
            <TextInput
              style={styles.input}
              onChangeText={setPassword}
              value={password}
              secureTextEntry
              placeholder="Mot de passe"
              placeholderTextColor="#64748B"
            />

            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.btnPrimary} onPress={signInWithEmail} disabled={loading}>
                {loading ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.btnPrimaryText}>Se connecter</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnSecondary} onPress={signUpWithEmail} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnSecondaryText}>S'inscrire</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* RETOUR ACCUEIL */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/')}>
          <Text style={styles.backButtonText}>← Retour au fil d'actualité</Text>
        </TouchableOpacity>
        
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { 
    flexGrow: 1, 
    padding: 20, 
    justifyContent: 'center' 
  },
  contentBox: { 
    width: '100%', 
    maxWidth: 450, 
    alignSelf: 'center' 
  },
  authBox: { 
    width: '100%', 
    maxWidth: 400, 
    alignSelf: 'center',
    marginTop: 40
  },
  
  // En-tête
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    backgroundColor: '#1E293B',
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#38BDF8',
    marginBottom: 12,
  },
  avatarEmoji: { fontSize: 45 },
  title: { fontSize: 26, fontWeight: '800', color: '#F8FAFC', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 24 },
  userEmail: { color: '#94A3B8', fontSize: 15, fontWeight: '500' },

  // Cartes (Cards)
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 8,
  },

  // Alertes
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderLeftWidth: 4,
    borderColor: '#EF4444',
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { color: '#FCA5A5', fontWeight: '600', fontSize: 14 },

  // Inputs
  label: { color: '#94A3B8', marginBottom: 8, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  input: { 
    borderWidth: 1, 
    borderColor: '#334155', 
    backgroundColor: '#0F172A', 
    color: '#F8FAFC', 
    padding: 14, 
    borderRadius: 10, 
    marginBottom: 16, 
    fontSize: 15, 
  },

  // Boutons
  buttonContainer: { gap: 12, marginTop: 8 },
  btnPrimary: { 
    backgroundColor: '#38BDF8', 
    paddingVertical: 14, 
    borderRadius: 10, 
    alignItems: 'center', 
  },
  btnPrimaryText: { color: '#0F172A', fontWeight: 'bold', fontSize: 15 },
  
  btnSecondary: { 
    backgroundColor: '#334155', 
    paddingVertical: 14, 
    borderRadius: 10, 
    alignItems: 'center', 
  },
  btnSecondaryText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  
  btnOutline: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#64748B',
  },
  btnOutlineText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 15 },

  btnDanger: { 
    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
    paddingVertical: 14, 
    borderRadius: 10, 
    alignItems: 'center', 
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  btnDangerText: { color: '#EF4444', fontWeight: 'bold', fontSize: 15 },
  
  backButton: { marginTop: 30, alignItems: 'center', marginBottom: 20 },
  backButtonText: { color: '#38BDF8', fontSize: 14, fontWeight: '600' },
});