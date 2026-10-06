import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { TaxiDogProvider } from '@/contexts/TaxiDogContext'
import { DialogoHost } from '@/components/DialogoHost'
import { FONTES } from '@/theme/fontes'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          {/* Fica acima das duas áreas: o TaxiDog recebe o aviso de corrida
              nova mesmo se estiver olhando o painel da loja. */}
          <TaxiDogProvider>
            <RootNavigator />
          </TaxiDogProvider>
          {/* Perguntas de confirmação quando o app roda no navegador. */}
          <DialogoHost />
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
  // As fontes do site (Inter e Plus Jakarta Sans). Se o carregamento
  // falhar, o app abre assim mesmo, com a fonte do aparelho.
  const [fontesProntas, erroNasFontes] = useFonts(FONTES)
  const esperando = loading || (!fontesProntas && !erroNasFontes)

  useEffect(() => {
    if (!esperando) SplashScreen.hideAsync().catch(() => {})
  }, [esperando])

  if (esperando) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && modo === 'loja'}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && modo === 'taxidog'}>
        <Stack.Screen name="taxidog" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && modo === 'cliente'}>
        <Stack.Screen name="cliente" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        <Stack.Screen name="cadastro" />
        <Stack.Screen name="codigo" />
      </Stack.Protected>
      {/* Retorno do login com Google (saip://auth) — ver app/auth.tsx. */}
      <Stack.Screen name="auth" />
    </Stack>
  )
}
