import { Tabs } from 'expo-router/js-tabs'
import { barraDeAbas, opcoesTabBar, tabIcon } from '@/components/tabBar'

// Área do TaxiDog — mesmo app, mesma barra inferior, abas próprias. Só é
// montada quando AuthContext.modo === 'taxidog' (ver app/_layout.tsx).
export default function TaxiDogLayout() {
  return (
    <Tabs screenOptions={opcoesTabBar} tabBar={barraDeAbas}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="corridas" options={{ title: 'Corridas', tabBarIcon: tabIcon('car', 'car-outline') }} />
      <Tabs.Screen name="rotas" options={{ title: 'Rotas', tabBarIcon: tabIcon('map', 'map-outline') }} />
      <Tabs.Screen name="historico" options={{ title: 'Histórico', tabBarIcon: tabIcon('time', 'time-outline') }} />
      {/* Telas da área sem aba própria (o menu abre pela barra do topo da Início). */}
      <Tabs.Screen name="mais" options={{ href: null }} />
      <Tabs.Screen name="corrida/[id]" options={{ href: null }} />
      <Tabs.Screen name="rota/[id]" options={{ href: null }} />
      <Tabs.Screen name="montar-rota" options={{ href: null }} />
    </Tabs>
  )
}
