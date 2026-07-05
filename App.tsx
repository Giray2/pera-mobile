import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// SENTRY: sentry-expo paketi iOS'ta Pod kurulumunu bozdu (native config plugin
// sorunu) ve şu an zaten pasifti (DSN yok) — geçici olarak geri alındı. Gerçek
// bir Sentry DSN alındığında düzgün şekilde (ve build'i bozmadan) tekrar eklenecek.

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
