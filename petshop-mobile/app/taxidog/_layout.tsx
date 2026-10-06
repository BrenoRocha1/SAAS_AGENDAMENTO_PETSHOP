import { Tabs } from 'expo-router/js-tabs'
import { barraDeAbas, opcoesTabBar, tabIcon } from '@/components/tabBar'
import { IconeCorridas, IconeHistorico, IconeInicio, IconeRotas } from '@/components/IconesAbas'

// Área do TaxiDog — mesmo app, mesma barra inferior, abas próprias. Só é
// montada quando AuthContext.modo === 'taxidog' (ver app/_layout.tsx).
export default function TaxiDogLayout() {
  return (
    <Tabs screenOptions={opcoesTabBar} tabBar={barraDeAbas}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: tabIcon(IconeInicio) }} />
      <Tabs.Screen name="corridas" options={{ title: 'Corridas', tabBarIcon: tabIcon(IconeCorridas) }} />
      <Tabs.Screen name="rotas" options={{ title: 'Rotas', tabBarIcon: tabIcon(IconeRotas) }} />
      <Tabs.Screen name="historico" options={{ title: 'Histórico', tabBarIcon: tabIcon(IconeHistorico) }} />
      {/* Telas da área sem aba própria (o menu abre pela barra do topo da Início). */}
      <Tabs.Screen name="mais" options={{ href: null }} />
      <Tabs.Screen name="corrida/[id]" options={{ href: null }} />
      <Tabs.Screen name="rota/[id]" options={{ href: null }} />
      <Tabs.Screen name="montar-rota" options={{ href: null }} />
    </Tabs>
  )
}
