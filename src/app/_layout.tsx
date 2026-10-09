import { Session } from "@supabase/supabase-js";
import { Stack, useRootNavigationState, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();
  
  // 💡 L'arme secrète : vérifier que le système de navigation est prêt avant de rediriger
  const navigationState = useRootNavigationState(); 

  useEffect(() => {
    let isMounted = true; // Empêche les fuites de mémoire (Memory Leaks)

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          setSession(session);
        }
      } catch (error) {
        console.error("Erreur lors de la récupération de la session Supabase :", error);
      } finally {
        if (isMounted) setIsAppReady(true);
      }
    };

    initAuth();

    // Écoute des changements (connexion, déconnexion, retour d'email)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (isMounted) {
        setSession(newSession);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // 1. On bloque la redirection si l'app ou le routeur ne sont pas 100% prêts
    if (!isAppReady || !navigationState?.key) return;

    const inAuthGroup = segments[0] === 'auth';

    // 2. Protection spéciale Web (Vercel) : 
    // Si l'URL contient un token de connexion Supabase, on NE DOIT PAS rediriger vers /auth tout de suite.
    // On laisse le temps à Supabase de lire le token en arrière-plan.
    const hasHashToken = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.includes('access_token');

    if (!session && !inAuthGroup && !hasHashToken) {
      // Pas de session et pas de token en cours de lecture -> go Auth
      router.replace('/auth');
    } else if (session && inAuthGroup) {
      // Connecté mais sur la page auth -> go Accueil
      router.replace('/');
    }
  }, [session, isAppReady, segments, navigationState?.key]);

  // Affiche le loader de sécurité
  if (!isAppReady || !navigationState?.key) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A111F', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0A111F" }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0A111F" },
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="home" />
        <Stack.Screen name="explore" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="shop" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="post" />
      </Stack>
    </View>
  );
}