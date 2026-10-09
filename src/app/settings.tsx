import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);

  const handleSave = () => {
    Alert.alert('Succès 🎉', 'Vos préférences ont bien été enregistrées.');
  };

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      Alert.alert('Déconnecté', 'Tu as été déconnecté avec succès.');
      router.replace('/');
    }
  }

  return (
    <ScrollView style={styles.mainWrapper} contentContainerStyle={styles.content}>
      <Text style={styles.headerEmoji}>⚙️</Text>
      <Text style={styles.title}>Options & Paramètres</Text>
      <Text style={styles.subtitle}>Personnalisez votre expérience PlateReveal</Text>

      {/* Carte des options */}
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>Notifications de repas</Text>
            <Text style={styles.settingDesc}>Rappel à 15h00 et 21h00 pile</Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#334155', true: '#38BDF8' }}
            thumbColor={'#F8FAFC'}
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Enregistrer</Text>
        </TouchableOpacity>
      </View>

      {/* Déconnexion */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Session</Text>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>🚪 Se déconnecter</Text>
        </TouchableOpacity>
      </View>

      {/* Bouton Retour */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.push('/')}>
        <Text style={styles.backButtonText}>← Retour au fil d'actualité</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mainWrapper: { 
    flex: 1, 
    backgroundColor: '#0F172A' 
  },
  content: { 
    padding: 20, 
    paddingTop: 60, 
    alignItems: 'center' 
  },
  headerEmoji: { 
    fontSize: 50, 
    marginBottom: 10 
  },
  title: { 
    fontSize: 26, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    color: '#F8FAFC' 
  },
  subtitle: { 
    fontSize: 13, 
    color: '#94A3B8', 
    textAlign: 'center', 
    marginBottom: 30 
  },
  card: { 
    backgroundColor: '#1E293B', 
    borderRadius: 16, 
    padding: 20, 
    width: '100%', 
    maxWidth: 400, 
    borderWidth: 1, 
    borderColor: '#334155', 
    marginBottom: 20 
  },
  settingRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 8 
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 10
  },
  settingTitle: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#F8FAFC' 
  },
  settingDesc: { 
    color: '#94A3B8', 
    fontSize: 12, 
    marginTop: 2 
  },
  sectionTitle: {
    fontSize: 15, 
    fontWeight: 'bold', 
    color: '#F8FAFC',
    marginBottom: 12
  },
  saveButton: { 
    backgroundColor: '#38BDF8', 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginTop: 20 
  },
  saveButtonText: { 
    color: '#0F172A', 
    fontWeight: 'bold', 
    fontSize: 15 
  },
  signOutButton: { 
    backgroundColor: '#EF4444', 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  signOutButtonText: { 
    color: '#FFFFFF', 
    fontWeight: 'bold', 
    fontSize: 15 
  },
  backButton: { 
    marginTop: 10, 
    marginBottom: 30 
  },
  backButtonText: { 
    color: '#38BDF8', 
    fontSize: 14, 
    fontWeight: '600' 
  },
});