import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ShopScreen() {
  const router = useRouter();

  const [streakRestorers, setStreakRestorers] = useState<number>(0);
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserShopData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const userId = session.user.id;
        setCurrentUserId(userId);

        const { data, error } = await supabase
          .from('profiles')
          .select('streak_restorers, active_plan, last_restorer_date') 
          .eq('id', userId)
          .single();

        if (error) {
          console.error("Erreur lecture profil :", error.message);
          return;
        }

        if (data) {
          let currentRestorers = data.streak_restorers || 0;
          const plan = data.active_plan;
          const lastDate = data.last_restorer_date;

          // 🎁 VÉRIFICATION DE LA RÉCOMPENSE HEBDOMADAIRE
          if (plan === 'premium' || plan === 'restorerPass') {
            const now = new Date();
            let shouldReward = false;

            if (!lastDate) {
              // Premier bonus si aucune date n'est renseignée
              shouldReward = true;
            } else {
              const lastRewardDate = new Date(lastDate);
              const diffInTime = now.getTime() - lastRewardDate.getTime();
              const diffInDays = Math.floor(diffInTime / (1000 * 60 * 60 * 24));
              
              if (diffInDays >= 7) {
                shouldReward = true;
              }
            }

            if (shouldReward) {
              currentRestorers += 1;
              const newDate = now.toISOString();

              const { error: updateErr } = await supabase
                .from('profiles')
                .update({ 
                  streak_restorers: currentRestorers,
                  last_restorer_date: newDate
                })
                .eq('id', userId);

              if (updateErr) {
                console.error("Erreur mise à jour reward hebdo :", updateErr.message);
              } else {
                Alert.alert(
                  'Cadeau Hebdomadaire 🎁', 
                  'Merci pour ton abonnement ! Tu as reçu ton restaurateur de flamme de la semaine.'
                );
              }
            }
          }

          setStreakRestorers(currentRestorers);
          setActivePlan(plan || null);
        }
      } catch (err) {
        console.error("Erreur chargement boutique :", err);
      }
    };

    fetchUserShopData();
  }, []);

  const updateUserInDatabase = async (newRestorers: number, newPlan?: string | null) => {
    if (!currentUserId) return;

    try {
      const updateData: Record<string, any> = { streak_restorers: newRestorers };
      
      if (newPlan !== undefined) {
        updateData.active_plan = newPlan;
        updateData.last_restorer_date = new Date().toISOString(); 
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', currentUserId);

      if (error) {
        console.error("Erreur mise à jour Supabase :", error.message);
      }
    } catch (err) {
      console.error("Erreur générale base de données :", err);
    }
  };

  const handleStripeCheckout = async (productId: string) => {
    try {
      console.log(`[Stripe] Lancement du paiement pour : ${productId}`);
      return true; 
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Le paiement a échoué. Veuillez réessayer.');
      return false;
    }
  };

  const handleBuyRestorer = async () => {
    const success = await handleStripeCheckout('prod_restorer_050');
    if (success) {
      const updatedRestorers = streakRestorers + 1;
      setStreakRestorers(updatedRestorers);
      await updateUserInDatabase(updatedRestorers);
      
      Alert.alert(
        'Achat confirmé 🛍️',
        'Tu as acheté 1 restaurateur de flamme pour 0,50 € !'
      );
    }
  };

  const handleSubscribeRestorerPass = async () => {
    const success = await handleStripeCheckout('prod_restorer_pass_299');
    if (success) {
      const updatedRestorers = streakRestorers + 1;
      setActivePlan('restorerPass');
      setStreakRestorers(updatedRestorers);
      await updateUserInDatabase(updatedRestorers, 'restorerPass'); 

      Alert.alert(
        'Pass Restaurateur Actif 🛡️',
        'Ton abonnement à 2,99 € est actif ! Tu reçois 1 restaurateur immédiatement, puis 1 par semaine.'
      );
    }
  };

  const handleSubscribePremium = async () => {
    const success = await handleStripeCheckout('prod_premium_pass_299');
    if (success) {
      setActivePlan('premium');
      const updatedRestorers = streakRestorers + 1;
      setStreakRestorers(updatedRestorers);
      await updateUserInDatabase(updatedRestorers, 'premium');

      Alert.alert(
        'Bienvenue dans le Pass Premium ! 👑',
        'Ton abonnement à 2,99 € est actif ! Badge VIP et 1 restaurateur par semaine pendant 1 mois.'
      );
    }
  };

  const handleUseRestorer = async () => {
    if (streakRestorers > 0) {
      const updatedRestorers = streakRestorers - 1;
      setStreakRestorers(updatedRestorers);
      await updateUserInDatabase(updatedRestorers);

      Alert.alert('🔥 Flamme Sauvée !', 'Ton restaurateur a été utilisé avec succès. Ta série est sauvée !');
    } else {
      Alert.alert('Oups 😅', 'Tu n\'as plus de restaurateur de flamme en stock.');
    }
  };

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={styles.content}>
      <Text style={styles.headerEmoji}>🛍️</Text>
      <Text style={styles.title}>Boutique PlateReveal</Text>
      <Text style={styles.subtitle}>Débloque tout le potentiel de l'application</Text>

      <View style={styles.stockCard}>
        <Text style={styles.stockTitle}>🔥 Tes Restaurateurs en stock : <Text style={styles.stockCount}>{streakRestorers}</Text></Text>
        {streakRestorers > 0 && (
          <TouchableOpacity style={styles.useButton} onPress={handleUseRestorer}>
            <Text style={styles.useButtonText}>✨ Utiliser un restaurateur maintenant</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.itemEmoji}>🛡️</Text>
        <Text style={styles.itemTitle}>Restaurateur de Flamme</Text>
        <Text style={styles.itemDesc}>
          Raté ton post hier ? Utilise cet item pour récupérer ta flamme perdue instantanément.
        </Text>
        <Text style={styles.priceText}>0,50 €</Text>
        <TouchableOpacity style={styles.buyButton} onPress={handleBuyRestorer}>
          <Text style={styles.buyButtonText}>Acheter (0,50 €)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.itemEmoji}>🎟️</Text>
        <Text style={styles.itemTitle}>Pass Restaurateur</Text>
        <Text style={styles.priceTag}>2,99 € / mois</Text>
        
        <View style={styles.featuresList}>
          <Text style={styles.featureItem}>✨ 1 restaurateur / semaine pendant 1 mois</Text>
          <Text style={styles.featureItem}>✨ Idéal pour sécuriser tes séries de flammes</Text>
        </View>

        <TouchableOpacity 
          style={[styles.buyButton, activePlan === 'restorerPass' && styles.disabledButton]} 
          onPress={handleSubscribeRestorerPass}
          disabled={activePlan === 'restorerPass'}
        >
          <Text style={styles.buyButtonText}>
            {activePlan === 'restorerPass' ? '✅ Pass Actif' : 'Acheter le Pass'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, styles.vipBorder]}>
        <Text style={styles.itemEmoji}>👑</Text>
        <Text style={styles.itemTitle}>Pass Premium Illimité</Text>
        <Text style={styles.priceTag}>2,99 € / mois</Text>
        
        <View style={styles.featuresList}>
          <Text style={styles.featureItem}>✨ Badge VIP exclusif sur ton profil</Text>
          <Text style={[styles.featureItem, { color: '#38BDF8', fontWeight: 'bold' }]}>✨ 1 restaurateur / semaine pendant 1 mois</Text>
        </View>

        <TouchableOpacity 
          style={[styles.buyButton, activePlan === 'premium' && styles.disabledButton]} 
          onPress={handleSubscribePremium}
          disabled={activePlan === 'premium'}
        >
          <Text style={styles.buyButtonText}>
            {activePlan === 'premium' ? '✅ Pass Actif' : 'Acheter le Pass'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => router.push('/')}>
        <Text style={styles.backButtonText}>← Retour au fil d'actualité</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: { 
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
    marginBottom: 25 
  },
  stockCard: { 
    borderRadius: 20, 
    padding: 16, 
    width: '100%', 
    maxWidth: 400, 
    borderWidth: 1, 
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    alignItems: 'center', 
    marginBottom: 20 
  },
  stockTitle: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#F8FAFC',
    marginBottom: 10 
  },
  stockCount: { 
    color: '#38BDF8', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  useButton: { 
    backgroundColor: '#10B981', 
    paddingVertical: 10, 
    paddingHorizontal: 16, 
    borderRadius: 10, 
    width: '100%', 
    alignItems: 'center' 
  },
  useButtonText: { 
    color: '#FFFFFF', 
    fontWeight: 'bold', 
    fontSize: 13 
  },
  card: { 
    borderRadius: 20, 
    padding: 20, 
    width: '100%', 
    maxWidth: 400, 
    borderWidth: 1, 
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    alignItems: 'center', 
    marginBottom: 20 
  },
  vipBorder: { 
    borderColor: '#38BDF8' 
  },
  itemEmoji: { 
    fontSize: 40, 
    marginBottom: 8 
  },
  itemTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#F8FAFC',
    marginBottom: 4, 
    textAlign: 'center' 
  },
  priceTag: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#38BDF8', 
    marginBottom: 14 
  },
  itemDesc: { 
    color: '#94A3B8', 
    fontSize: 13, 
    textAlign: 'center', 
    marginBottom: 12, 
    lineHeight: 18 
  },
  priceText: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    color: '#F8FAFC',
    marginBottom: 14 
  },
  featuresList: { 
    width: '100%', 
    marginBottom: 16, 
    alignItems: 'flex-start' 
  },
  featureItem: { 
    fontSize: 13, 
    color: '#F8FAFC',
    marginBottom: 6 
  },
  buyButton: { 
    backgroundColor: '#38BDF8', 
    paddingVertical: 12, 
    paddingHorizontal: 20, 
    borderRadius: 12, 
    width: '100%', 
    alignItems: 'center' 
  },
  buyButtonText: { 
    color: '#0F172A', 
    fontWeight: 'bold', 
    fontSize: 14 
  },
  disabledButton: { 
    backgroundColor: '#475569' 
  },
  backButton: { 
    marginTop: 5, 
    marginBottom: 30 
  },
  backButtonText: { 
    color: '#38BDF8', 
    fontSize: 14, 
    fontWeight: '600' 
  },
});