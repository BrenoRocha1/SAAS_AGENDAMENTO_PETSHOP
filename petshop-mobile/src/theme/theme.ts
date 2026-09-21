import { colors } from './colors'

export { colors, statusColors } from './colors'

// Espaçamento, raio e sombra espelhados das mesmas variáveis do web
// (--space-*, --radius-*, --shadow-*) — mesma escala, mesma sensação.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 999,
} as const

// RN não tem box-shadow do CSS — elevation cobre Android, shadow* cobre
// iOS. Sombras discretas, iguais ao --shadow-sm/md do web.
export const shadow = {
  sm: {
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const

// Sem fonte customizada nesta primeira fase (ver nota no README do
// projeto) — usa a fonte do sistema (San Francisco/Roboto), que já é
// limpa por padrão. A hierarquia vem de peso/tamanho/cor, não da fonte.
export const typography = {
  heading: {
    xl: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
    lg: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
    md: { fontSize: 18, fontWeight: '700' as const },
    sm: { fontSize: 15, fontWeight: '600' as const },
  },
  body: {
    lg: { fontSize: 16, fontWeight: '400' as const },
    md: { fontSize: 14, fontWeight: '400' as const },
    sm: { fontSize: 12.5, fontWeight: '400' as const },
  },
  label: {
    md: { fontSize: 13, fontWeight: '600' as const },
    sm: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.4 },
  },
} as const

export const theme = { colors, spacing, radius, shadow, typography }
export type Theme = typeof theme
