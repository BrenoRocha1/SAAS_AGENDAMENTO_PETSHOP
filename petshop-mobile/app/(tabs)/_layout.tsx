import { IconeApp } from '@/components/IconeApp'
import { Tabs } from 'expo-router/js-tabs'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { barraDeAbas, opcoesTabBar, tabIcon } from '@/components/tabBar'
import { IconeAgenda, IconeClientes, IconeInicio, IconePets } from '@/components/IconesAbas'
import { Text } from '@/components/Texto'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function TabsLayout() {
  const { role, contexto, funcionarioInativo, signOut } = useAuth()

  // Área da equipe (lojista/funcionário). O cliente tem a área dele
  // (app/cliente) e nem chega aqui; um funcionário desativado perdeu o
  // acesso (mesma checagem do loginAction do dashboard web).
  // Logo depois de entrar, o papel e as permissões ainda estão chegando.
  if (role === null) {
    return (
      <SafeAreaView style={styles.bloqueioSafe}>
        <View style={styles.bloqueioContent}>
          <ActivityIndicator color={colors.primary600} />
        </View>
      </SafeAreaView>
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
    <Tabs screenOptions={opcoesTabBar} tabBar={barraDeAbas}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: tabIcon(IconeInicio) }} />
      <Tabs.Screen name="agendamentos" options={{ title: 'Agendamentos', tabBarIcon: tabIcon(IconeAgenda) }} />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: tabIcon(IconeClientes) }} />
      <Tabs.Screen name="pets" options={{ title: 'Pets', tabBarIcon: tabIcon(IconePets) }} />
      {/* O menu da loja não é aba: abre pela barra do topo da Início. */}
      <Tabs.Screen name="mais" options={{ href: null }} />
    </Tabs>
  )
}

function BloqueioAcesso({ titulo, mensagem, onSignOut }: { titulo: string; mensagem: string; onSignOut: () => void }) {
  return (
    <SafeAreaView style={styles.bloqueioSafe}>
      <View style={styles.bloqueioContent}>
        <IconeApp name="lock-closed-outline" size={32} color={colors.textFaint} />
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
