import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

// Auth gate no nível da raiz: sessão ausente cai pro login, sessão
// presente entra nas tabs. O que fazer com um `cliente` logado ou um
// funcionário desativado é resolvido dentro de (tabs)/_layout — aqui só
// decide "está autenticado ou não".
function RootNavigator() {
  const { loading, session } = useAuth()

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {})
  }, [loading])

  if (loading) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  )
}
