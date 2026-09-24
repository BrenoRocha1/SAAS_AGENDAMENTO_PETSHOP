import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { RotasProvider } from '@/contexts/RotasContext'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          {/* Fica acima das duas áreas: o TaxiDog recebe o aviso de corrida
              nova mesmo se estiver olhando o painel da loja. */}
          <RotasProvider>
            <RootNavigator />
          </RotasProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

// Auth gate no nível da raiz: sem sessão -> login; com sessão -> a área
// escolhida (AuthContext.modo). Quem não é TaxiDog sempre fica em
// 'loja'. O que fazer com um `cliente` logado ou um funcionário
// desativado é resolvido dentro de (tabs)/_layout.
function RootNavigator() {
  const { loading, session, modo } = useAuth()

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {})
  }, [loading])

  if (loading) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && modo === 'loja'}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && modo === 'taxidog'}>
        <Stack.Screen name="taxidog" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  )
}
