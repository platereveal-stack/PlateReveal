import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    // 1. Nettoyage des champs pour éviter les espaces invisibles
    const cleanEmail = email.trim();
    const cleanUsername = username.trim();

    // 2. Validations de sécurité
    if (!cleanEmail || !password) {
      Alert.alert('Champs requis', 'Veuillez renseigner votre email et mot de passe.');
      return;
    }

    if (isSignUp && !cleanUsername) {
      Alert.alert('Champs requis', "Veuillez choisir un nom d'utilisateur (pseudo).");
      return;
    }

    if (isSignUp && password.length < 6) {
      Alert.alert('Mot de passe trop court', 'Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);

    // 3. Détermination de l'URL de redirection (Vercel en ligne ou localhost en dev)
    const redirectUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://plate-reveal.vercel.app';

    try {
      if (isSignUp) {
        // --- INSCRIPTION ---
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { username: cleanUsername },
            emailRedirectTo: redirectUrl, // 👈 LE CORRECTIF EST ICI !
          },
        });

        if (error) throw error;

        // Création du profil public
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              username: cleanUsername,
              updated_at: new Date().toISOString(),
            });

          if (profileError) {
            console.error('Erreur lors de la création du profil :', profileError.message);
          }
        }

        Alert.alert(
          'Compte créé ! 🎉',
          'Un e-mail de confirmation t\'a été envoyé. Clique sur le lien à l\'intérieur pour activer ton compte.'
        );
        
        // On bascule sur l'écran de connexion après l'inscription
        setIsSignUp(false);
        setPassword(''); 

      } else {
        // --- CONNEXION ---
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          // Gestion personnalisée des erreurs fréquentes
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Email ou mot de passe incorrect.');
          } else if (error.message.includes('Email not confirmed')) {
            throw new Error('Veuillez confirmer votre adresse e-mail avant de vous connecter.');
          }
          throw error;
        }
      }
    } catch (error: any) {
      Alert.alert("Erreur d'authentification", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isSignUp ? 'Créer un compte 🍽️' : 'Se connecter 🔥'}
      </Text>

      {isSignUp && (
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Nom d'utilisateur (Pseudo)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: gourmet_chef"
            placeholderTextColor="#64748B"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Adresse e-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: basile@example.com"
          placeholderTextColor="#64748B"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Mot de passe</Text>
          {isSignUp && <Text style={styles.hintText}>(6 caractères min.)</Text>}
        </View>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#64748B"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.7 }]}
        onPress={handleAuth}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#0F172A" />
        ) : (
          <Text style={styles.buttonText}>
            {isSignUp ? "S'inscrire" : 'Se connecter'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.switchButton}
        onPress={() => {
          setIsSignUp(!isSignUp);
          setPassword(''); // On vide le mot de passe quand on change d'écran
        }}
        disabled={loading}
      >
        <Text style={styles.switchText}>
          {isSignUp
            ? 'Déjà un compte ? Connecte-toi'
            : "Pas encore de compte ? S'inscrire"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A111F',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    color: '#64748B',
    fontSize: 12,
  },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  button: {
    backgroundColor: '#38BDF8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 16,
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: '#38BDF8',
    fontSize: 14,
  },
});