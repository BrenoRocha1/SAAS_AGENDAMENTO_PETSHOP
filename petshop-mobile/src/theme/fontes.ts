import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold'
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold'
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold'
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold'
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold'

// As fontes do site (petshop-app/src/app/layout.tsx): Inter no texto e
// Plus Jakarta Sans nos títulos de página e na marca. Carregadas na raiz
// do app (app/_layout.tsx) com o useFonts do expo-font.
export const FONTES = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
}

// Nome que os estilos usam para pedir a fonte de título — o componente Text
// (components/Texto) troca pelo arquivo do peso certo.
export const FONTE_TITULO = 'PlusJakartaSans'

type Peso = string | number | undefined

function numeroDoPeso(peso: Peso): number {
  if (peso === 'bold') return 700
  const n = Number(peso)
  return Number.isFinite(n) && n > 0 ? n : 400
}

// No celular cada peso é um arquivo com nome próprio; `fontWeight` sozinho
// não escolhe o arquivo (e no navegador engrossa o traço por cima).
export function arquivoDaFonte(familia: string | undefined, peso: Peso): keyof typeof FONTES {
  const n = numeroDoPeso(peso)
  if (familia === FONTE_TITULO) {
    return n >= 800 ? 'PlusJakartaSans_800ExtraBold' : n >= 700 ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_600SemiBold'
  }
  return n >= 800 ? 'Inter_800ExtraBold'
    : n >= 700 ? 'Inter_700Bold'
    : n >= 600 ? 'Inter_600SemiBold'
    : n >= 500 ? 'Inter_500Medium'
    : 'Inter_400Regular'
}
