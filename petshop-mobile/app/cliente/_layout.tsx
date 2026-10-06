import { Tabs } from 'expo-router/js-tabs'
import { CompletarCadastro } from '@/components/CompletarCadastro'
import { barraDeAbas, opcoesTabBar, tabIcon } from '@/components/tabBar'
import { IconeAgenda, IconeInicio, IconePets, IconePetshops } from '@/components/IconesAbas'
import { useAuth } from '@/contexts/AuthContext'

// Área do cliente — mesmo app, mesma barra inferior, abas próprias. Só é
// montada quando AuthContext.modo === 'cliente' (ver app/_layout.tsx).
export default function ClienteLayout() {
  const { role } = useAuth()

  // Entrou pelo Google e ainda não tem cadastro de cliente.
  if (role === 'novo') return <CompletarCadastro />

  return (
    <Tabs screenOptions={opcoesTabBar} tabBar={barraDeAbas}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: tabIcon(IconeInicio) }} />
      <Tabs.Screen name="agendamentos" options={{ title: 'Agendamentos', tabBarIcon: tabIcon(IconeAgenda) }} />
      <Tabs.Screen name="pets" options={{ title: 'Pets', tabBarIcon: tabIcon(IconePets) }} />
      <Tabs.Screen name="petshops" options={{ title: 'Petshops', tabBarIcon: tabIcon(IconePetshops) }} />
      {/* O menu (planos, perfil, sair) abre pela barra do topo da Início. */}
      <Tabs.Screen name="menu" options={{ href: null }} />
    </Tabs>
  )
}
