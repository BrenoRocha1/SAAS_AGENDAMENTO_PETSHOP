// Paleta espelhada de petshop-app/src/app/globals.css (:root) — mesma
// identidade visual do dashboard web: fundo off-white, cards brancos,
// texto chumbo e acento índigo. Não é um tema novo, é o mesmo produto.
export const colors = {
  // Marca — índigo SAIP (ações primárias, item ativo da tab bar)
  primary50: '#eef2ff',
  primary100: '#e0e7ff',
  primary200: '#c7d2fe',
  primary300: '#4338ca',
  primary400: '#4f46e5',
  primary500: '#6366f1',
  primary600: '#4f46e5',
  primary700: '#4338ca',
  primary800: '#3730a3',
  primary900: '#312e81',

  // Acento secundário (âmbar) — avisos, destaques pontuais
  accent400: '#fbbf24',
  accent500: '#f59e0b',
  accent600: '#d97706',

  // Neutros — canvas off-white, superfícies brancas, texto chumbo
  bg: '#f9fafb', // canvas da aplicação
  surface: '#ffffff', // cards, tab bar
  surfaceMuted: '#f3f4f6', // inputs, chips, superfície rebaixada
  border: '#e5e7eb', // bordas e preenchimentos suaves
  borderStrong: '#d1d5db',
  textFaint: '#9ca3af', // ícones apagados, placeholder
  textMuted: '#6b7280', // texto secundário
  textDim: '#4b5563',
  text: '#111827', // texto principal / títulos

  // Status genéricos
  success: '#10b981',
  successBg: '#f0fdf4',
  successFg: '#15803d',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  warningFg: '#b45309',
  danger: '#ef4444',
  dangerBg: '#fef2f2',
  dangerFg: '#b91c1c',
  info: '#3b82f6',
  infoBg: '#eff6ff',
  infoFg: '#1d4ed8',

  white: '#ffffff',
  black: '#000000',
} as const

// Status do atendimento — mesma paleta pastel do Kanban/badges web
// (globals.css --status-*). Chave é o STATUS DO BANCO, não o rótulo
// (ver src/lib/statusAgendamento.ts para o rótulo em pt-BR).
export const statusColors = {
  Pendente: { bg: '#fde68a99', fg: '#92400e', solid: '#f59e0b' },
  Confirmado: { bg: '#bfdbfe99', fg: '#1e40af', solid: '#3b82f6' },
  'Em andamento': { bg: '#ddd6fe99', fg: '#5b21b6', solid: '#8b5cf6' },
  'Concluído': { bg: '#a7f3d099', fg: '#065f46', solid: '#10b981' },
  Cancelado: { bg: '#fecaca99', fg: '#991b1b', solid: '#ef4444' },
} as const
