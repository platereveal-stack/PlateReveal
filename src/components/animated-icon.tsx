import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet } from 'react-native';

export default function AnimatedIcon() {
  return (
    <LinearGradient
      colors={['#3c9ffe', '#0274df']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.expoLogoBackground}
    />
  );
}

const styles = StyleSheet.create({
  expoLogoBackground: {
    width: 128,
    height: 128,
    borderRadius: 40,
  },
});