import { Tabs } from 'expo-router'
import { opcoesTabBar, tabIcon } from '@/components/tabBar'

// Área do TaxiDog — mesmo app, mesma barra inferior, abas próprias. Só é
// montada quando AuthContext.modo === 'taxidog' (ver app/_layout.tsx).
export default function TaxiDogLayout() {
  return (
    <Tabs screenOptions={opcoesTabBar}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="rotas" options={{ title: 'Rotas', tabBarIcon: tabIcon('map', 'map-outline') }} />
      <Tabs.Screen name="historico" options={{ title: 'Histórico', tabBarIcon: tabIcon('time', 'time-outline') }} />
      <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: tabIcon('grid', 'grid-outline') }} />
      {/* Tela da rota (execução): rota da área, mas sem aba própria. */}
      <Tabs.Screen name="rota/[id]" options={{ href: null }} />
    </Tabs>
  )
}
