import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

// --- TYPES & INTERFACES ---

type TrancheType = 'morning' | 'evening' | 'closed';
type VisibilityType = 'public' | 'friends';

interface ProfileStreakData {
  streak_count: number | null;
  last_streak_date: string | null;
  streak_saver_available: boolean | null;
}

// --- UTILS ---

const showAlert = (title: string, message: string, onPress?: () => void): void => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    if (onPress) onPress();
  } else {
    Alert.alert(
      title,
      message,
      onPress ? [{ text: 'OK', onPress }] : [{ text: 'OK' }],
      { cancelable: false }
    );
  }
};

const getCurrentTranche = (): TrancheType => {
  const now = new Date();
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

  const tranche1End = 15 * 60; // 15:00
  const tranche2End = 21 * 60; // 21:00

  if (currentTimeInMinutes < tranche1End) return 'morning';
  if (currentTimeInMinutes >= tranche1End && currentTimeInMinutes < tranche2End) return 'evening';
  return 'closed';
};

export default function PostScreen() {
  const router = useRouter();

  // --- ÉTATS ---
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [recipe, setRecipe] = useState<string>(''); // NOUVEAU CHAMP RECETTE
  const [visibility, setVisibility] = useState<VisibilityType>('public');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');

  // --- SÉLECTION DE L'IMAGE ---
  const pickImage = async (): Promise<void> => {
    if (loading) return;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        showAlert(
          'Permission refusée 🛑',
          "L'accès à la galerie d'images est indispensable pour publier votre plat."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Erreur lors de la sélection de l'image :", error);
      showAlert('Erreur', 'Impossible d’accéder à la galerie d’images.');
    }
  };

  // --- LOGIQUE METIER : STREAKS ---
  const updateStreakData = async (userId: string, todayIsoDate: string): Promise<void> => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('streak_count, last_streak_date, streak_saver_available')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.warn("Impossible de récupérer le profil pour la mise à jour de la flamme :", profileError);
      return;
    }

    const streakData = profile as ProfileStreakData;
    const lastPostDateStr = streakData.last_streak_date;
    let newStreak = streakData.streak_count || 0;
    let streakSaverAvailable = streakData.streak_saver_available ?? true;

    if (!lastPostDateStr) {
      newStreak = 1;
    } else {
      const lastDate = new Date(lastPostDateStr).setHours(0, 0, 0, 0);
      const currentDate = new Date(todayIsoDate).setHours(0, 0, 0, 0);
      const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays === 2 && streakSaverAvailable) {
        streakSaverAvailable = false;
        newStreak += 1;
      } else if (diffDays > 2) {
        newStreak = 1;
        streakSaverAvailable = true;
      }
    }

    await supabase
      .from('profiles')
      .update({
        streak_count: newStreak,
        last_streak_date: todayIsoDate,
        streak_saver_available: streakSaverAvailable,
        missed_date: null,
      })
      .eq('id', userId);
  };

  // --- TRAITEMENT DU FICHIER ---
  const processImageUpload = async (userId: string, uri: string): Promise<string> => {
    const uriParts = uri.split('.');
    const rawExt = uriParts.length > 1 ? uriParts.pop()?.toLowerCase().split('?')[0] : 'jpeg';
    const fileExt = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt || '') ? rawExt : 'jpeg';
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

    let uploadData: ArrayBuffer;

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      uploadData = await response.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      uploadData = decode(base64);
    }

    // 🔥 CORRECTION DU BUCKET ICI (posts) 🔥
    const { error: uploadError } = await supabase.storage
      .from('posts')
      .upload(fileName, uploadData, { contentType, upsert: false });

    if (uploadError) {
      throw new Error(`Échec du transfert vers le stockage : ${uploadError.message}`);
    }

    // 🔥 CORRECTION DU BUCKET ICI (posts) 🔥
    const { data: publicUrlData } = supabase.storage.from('posts').getPublicUrl(fileName);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      throw new Error("Impossible d'obtenir l'URL publique de l'image.");
    }

    return publicUrlData.publicUrl;
  };

  // --- SOUMISSION DE LA PUBLICATION ---
  const handlePublish = async (): Promise<void> => {
    if (!imageUri) {
      return showAlert('Photo requise 📸', 'Veuillez sélectionner une photo de votre plat.');
    }

    const trimmedDescription = description.trim();
    const trimmedRecipe = recipe.trim();

    if (!trimmedDescription) {
      return showAlert('Description requise ✍️', 'Ajoutez un mot de description pour présenter votre plat.');
    }

    const currentTranche = getCurrentTranche();
    if (currentTranche === 'closed') {
      return showAlert(
        'Service fermé 🌙',
        "Les publications ne sont plus autorisées après 21h. Rendez-vous demain !"
      );
    }

    setLoading(true);

    try {
      // 1. Authentification
      setLoadingStep('Authentification...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        setLoading(false);
        if (Platform.OS === 'web') {
          if (window.confirm("Connexion requise 🔑\n\nVous devez être connecté pour publier. Redirection ?")) {
            router.push('/profile');
          }
        } else {
          Alert.alert('Connexion requise 🔑', 'Vous devez être connecté pour publier.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Se connecter', onPress: () => router.push('/profile') },
          ]);
        }
        return;
      }

      const user = session.user;
      const todayIsoDate = new Date().toISOString().split('T')[0];

      // 2. Vérification d'unicité sur la tranche horaire
      setLoadingStep('Vérification du statut du service...');
      const { data: existingPosts, error: checkError } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id)
        .eq('tranche', currentTranche)
        .gte('created_at', `${todayIsoDate}T00:00:00`);

      if (checkError) throw checkError;

      if (existingPosts && existingPosts.length > 0) {
        const trancheLabel = currentTranche === 'morning' ? 'du midi' : 'du soir';
        setLoading(false);
        return showAlert('Déjà partagé 🛑', `Vous avez déjà publié votre plat ${trancheLabel} aujourd'hui.`);
      }

      // 3. Importation et hébergement de l'image
      setLoadingStep('Traitement et hébergement de la photo...');
      const publicImageUrl = await processImageUpload(user.id, imageUri);

      // 4. Insertion en BDD (avec description ET recipe)
      setLoadingStep('Enregistrement de la publication...');
      const { error: insertError } = await supabase.from('posts').insert([
        {
          user_id: user.id,
          image_url: publicImageUrl,
          description: trimmedDescription,
          recipe: trimmedRecipe || null, // Inclusion propre de la recette
          visibility: visibility,
          tranche: currentTranche,
          created_at: new Date().toISOString(),
        },
      ]);

      if (insertError) {
        throw new Error(`Erreur d'insertion en base de données : ${insertError.message}`);
      }

      // 5. Calcul des Flammes (Streaks)
      setLoadingStep('Mise à jour des flammes 🔥...');
      await updateStreakData(user.id, todayIsoDate);

      // 6. Succès et redirection
      setLoading(false);
      showAlert('Succès 🎉', 'Votre plat a été publié sur le fil d’actualité !', () => {
        router.replace('/');
      });

    } catch (error: any) {
      setLoading(false);
      console.error("❌ Erreur critique lors de la publication :", error);
      showAlert('Erreur de publication', error.message || 'Une erreur inattendue est survenue.');
    }
  };

  return (
    <View style={styles.mainContainer}>
      <ScrollView
        contentContainerStyle={styles.wrapper}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Partager mon plat 🍳</Text>

        <TouchableOpacity
          style={[styles.imagePickerBox, loading && styles.disabledBox]}
          onPress={pickImage}
          activeOpacity={0.8}
          disabled={loading}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderEmoji}>📷</Text>
              <Text style={styles.placeholderText}>Sélectionner une photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Champ Légende / Description */}
        <Text style={styles.label}>Légende</Text>
        <TextInput
          style={[styles.input, loading && styles.disabledInput]}
          placeholder="Ex: Mon meilleur risotto maison !"
          placeholderTextColor="#94A3B8"
          multiline
          value={description}
          onChangeText={setDescription}
          editable={!loading}
          maxLength={300}
        />

        {/* Champ Recette */}
        <Text style={styles.label}>Recette (Optionnelle)</Text>
        <TextInput
          style={[styles.input, loading && styles.disabledInput]}
          placeholder="Ingrédients, étapes de préparation..."
          placeholderTextColor="#94A3B8"
          multiline
          value={recipe}
          onChangeText={setRecipe}
          editable={!loading}
          maxLength={1000} // Plus long pour une recette détaillée
        />

        {/* Choix de la Visibilité */}
        <Text style={styles.label}>Visibilité</Text>
        <View style={styles.visibilityContainer}>
          <TouchableOpacity
            style={[styles.visibilityBtn, visibility === 'public' && styles.visibilityBtnActive]}
            onPress={() => setVisibility('public')}
            disabled={loading}
          >
            <Text style={[styles.visibilityText, visibility === 'public' && styles.visibilityTextActive]}>
              🌍 Public
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.visibilityBtn, visibility === 'friends' && styles.visibilityBtnActive]}
            onPress={() => setVisibility('friends')}
            disabled={loading}
          >
            <Text style={[styles.visibilityText, visibility === 'friends' && styles.visibilityTextActive]}>
              👥 Amis
            </Text>
          </TouchableOpacity>
        </View>

        {/* Boutons d'Action */}
        <TouchableOpacity
          style={[styles.publishButton, loading && styles.publishButtonDisabled]}
          onPress={handlePublish}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <Text style={styles.publishButtonText}>🚀 Publier sur le fil</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/')}
          disabled={loading}
        >
          <Text style={styles.backButtonText}>← Annuler et revenir au fil</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Overlay de Chargement */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingStepText}>{loadingStep}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  wrapper: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    marginBottom: 25,
  },
  imagePickerBox: {
    width: '100%',
    maxWidth: 400,
    height: 250,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 25,
  },
  disabledBox: {
    opacity: 0.5,
    borderColor: '#334155',
  },
  placeholderContainer: {
    alignItems: 'center',
  },
  placeholderEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  placeholderText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  input: {
    width: '100%',
    maxWidth: 400,
    minHeight: 110,
    borderWidth: 1,
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    color: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  disabledInput: {
    opacity: 0.6,
  },
  label: {
    width: '100%',
    maxWidth: 400,
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8, // Ajustement léger du margin pour coller à l'input
  },
  visibilityContainer: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 400,
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 30,
  },
  visibilityBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderRadius: 14,
    alignItems: 'center',
  },
  visibilityBtnActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  visibilityText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
  },
  visibilityTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  publishButton: {
    backgroundColor: '#38BDF8',
    width: '100%',
    maxWidth: 400,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    flexDirection: 'row',
  },
  publishButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  publishButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 16,
  },
  backButton: {
    padding: 10,
    marginBottom: 30,
  },
  backButtonText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingStepText: {
    color: '#38BDF8',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '700',
  },
});