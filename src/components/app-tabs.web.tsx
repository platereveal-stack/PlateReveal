import { Tabs } from 'expo-router';
import React from 'react';

export function AppTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
    </Tabs>
  );
}

export default AppTabs;