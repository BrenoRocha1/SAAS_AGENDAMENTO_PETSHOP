import type { ComponentType } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/Texto'
import type { IconeProps } from '@/components/IconesDoSite'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, radius, spacing } from '@/theme/theme'

// Mesmo visual do Indicador do relatório de vendas do site
// (petshop-app/src/components/relatorio/Indicador.tsx, modo compacto):
// rótulo e ícone numa linha, número grande embaixo. Usado no Início do
// cliente e no Início do lojista.
export function Indicador({ rotulo, valor, icone: Icone }: { rotulo: string; valor: string | number; icone: ComponentType<IconeProps> }) {
  return (
    <View style={styles.cartao}>
      <View style={styles.topo}>
        <Text style={styles.rotulo}>{rotulo}</Text>
        <Icone size={16} color={colors.primary600} />
      </View>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  cartao: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, gap: 6,
  },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  // 12px/500 — igual ao "text-xs font-medium" do rótulo no site.
  rotulo: { fontSize: 12, lineHeight: 16.8, fontWeight: '500', color: colors.textMuted, flexShrink: 1 },
  // 20px/600 — igual ao "text-xl font-semibold" do cartão compacto no site.
  valor: { fontFamily: FONTE_TITULO, fontWeight: '600', fontSize: 20, lineHeight: 28, letterSpacing: 0, color: colors.text },
})
