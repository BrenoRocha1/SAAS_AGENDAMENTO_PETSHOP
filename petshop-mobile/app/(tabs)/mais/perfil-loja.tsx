import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { formatarTelefone } from '@/lib/format'
import { colors, radius, spacing, typography } from '@/theme/theme'
import type { LojistaInfo } from '@/types/database'

// Já lê os dados reais da loja (tabela `lojista`, a mesma do dashboard).
// Edição fica pro dashboard web por enquanto — aqui é consulta rápida
// durante o expediente.
export default function PerfilLojaScreen() {
  const { contexto } = useAuth()
  const [loja, setLoja] = useState<LojistaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      let ativo = true
      async function carregar() {
        if (!contexto?.idLojista) return
        setLoading(true)
        const { data, error } = await supabase
          .from('lojista')
          .select('nome_loja, email, telefone, endereco, cidade, estado, logo_url')
          .eq('id_lojista', contexto.idLojista)
          .maybeSingle()
        if (!ativo) return
        if (error || !data) setErro('Não foi possível carregar os dados da loja.')
        else setLoja(data as LojistaInfo)
        setLoading(false)
      }
      carregar()
      return () => {
        ativo = false
      }
    }, [contexto?.idLojista])
  )

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Perfil da loja" />
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary600} />
        </View>
      </ScreenContainer>
    )
  }

  if (erro || !loja) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Perfil da loja" />
        <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro ?? undefined} />
      </ScreenContainer>
    )
  }

  const localizacao = [loja.endereco, [loja.cidade, loja.estado].filter(Boolean).join(' - ')]
    .filter(Boolean)
    .join(', ')

  return (
    <ScreenContainer>
      <DetailHeader title="Perfil da loja" />

      <View style={styles.perfil}>
        <Avatar nome={loja.nome_loja} fotoUrl={loja.logo_url} size={72} />
        <Text style={styles.nome}>{loja.nome_loja}</Text>
      </View>

      <Card style={styles.infoCard}>
        <InfoRow icon="call-outline" label="Telefone" valor={formatarTelefone(loja.telefone)} />
        <InfoRow icon="mail-outline" label="E-mail" valor={loja.email} />
        <InfoRow icon="location-outline" label="Endereço" valor={localizacao || '—'} />
      </Card>

      <View style={styles.nota}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
        <Text style={styles.notaTexto}>Para editar os dados da loja, use o painel web por enquanto.</Text>
      </View>
    </ScreenContainer>
  )
}

function InfoRow({ icon, label, valor }: { icon: keyof typeof Ionicons.glyphMap; label: string; valor: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textFaint} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  perfil: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  nome: { ...typography.heading.lg, color: colors.text, textAlign: 'center' },
  infoCard: { gap: spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  infoLabel: { ...typography.body.sm, color: colors.textMuted, width: 76, marginTop: 2 },
  infoValor: { ...typography.body.lg, color: colors.text, flex: 1 },
  nota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  notaTexto: { ...typography.body.sm, color: colors.textMuted, flex: 1 },
})
