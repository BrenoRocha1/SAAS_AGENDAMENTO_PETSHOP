import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { opcoesTabBar, tabIcon } from '@/components/tabBar'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function TabsLayout() {
  const { role, contexto, funcionarioInativo, signOut } = useAuth()

  // App mobile é o painel operacional da equipe (lojista/funcionário) —
  // um `cliente` não tem o que fazer aqui, e um funcionário desativado
  // perdeu o acesso (mesma checagem do loginAction do dashboard web).
  if (role === 'cliente') {
    return (
      <BloqueioAcesso
        titulo="Este app é da equipe do petshop"
        mensagem="Sua conta é de cliente. Use o painel do cliente no site para acompanhar seus agendamentos."
        onSignOut={signOut}
      />
    )
  }

  if (funcionarioInativo || !contexto) {
    return (
      <BloqueioAcesso
        titulo="Acesso desativado"
        mensagem="Sua conta de funcionário foi desativada. Fale com o responsável pelo petshop."
        onSignOut={signOut}
      />
    )
  }

  return (
    <Tabs screenOptions={opcoesTabBar}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen
        name="agendamentos"
        options={{ title: 'Agendamentos', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
      />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: tabIcon('people', 'people-outline') }} />
      <Tabs.Screen name="pets" options={{ title: 'Pets', tabBarIcon: tabIcon('paw', 'paw-outline') }} />
      <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: tabIcon('grid', 'grid-outline') }} />
    </Tabs>
  )
}

function BloqueioAcesso({ titulo, mensagem, onSignOut }: { titulo: string; mensagem: string; onSignOut: () => void }) {
  return (
    <SafeAreaView style={styles.bloqueioSafe}>
      <View style={styles.bloqueioContent}>
        <Ionicons name="lock-closed-outline" size={32} color={colors.textFaint} />
        <Text style={styles.bloqueioTitulo}>{titulo}</Text>
        <Text style={styles.bloqueioMensagem}>{mensagem}</Text>
        <Pressable style={styles.bloqueioBotao} onPress={onSignOut}>
          <Text style={styles.bloqueioBotaoTexto}>Sair</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  bloqueioSafe: { flex: 1, backgroundColor: colors.bg },
  bloqueioContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'], gap: spacing.sm },
  bloqueioTitulo: { ...typography.heading.md, color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  bloqueioMensagem: { ...typography.body.lg, color: colors.textMuted, textAlign: 'center' },
  bloqueioBotao: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary600,
    borderRadius: radius.md,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  bloqueioBotaoTexto: { color: colors.white, ...typography.heading.sm },
})
