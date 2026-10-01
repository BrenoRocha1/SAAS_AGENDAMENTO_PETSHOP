import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { formatarTelefone, linkWhatsApp } from '@/lib/format'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Funcionario {
  id_funcionario: string
  nome: string
  email: string
  telefone: string
  cargo: string | null
  ativo: boolean
  pode_gerenciar_agenda: boolean
  pode_gerenciar_servicos: boolean
  // Colunas de migrations posteriores — ausentes antes delas.
  pode_gerenciar_produtos?: boolean
  pode_gerenciar_clientes_pets?: boolean
  acesso_total?: boolean
  pode_taxidog?: boolean
}

function permissoes(f: Funcionario): string[] {
  if (f.acesso_total) return ['Administrador']
  return [
    f.pode_gerenciar_agenda && 'Agenda',
    f.pode_gerenciar_clientes_pets && 'Clientes e pets',
    f.pode_gerenciar_servicos && 'Serviços',
    f.pode_gerenciar_produtos && 'Produtos',
  ].filter(Boolean) as string[]
}

// Equipe da loja (tabela `funcionario`, a mesma da tela Equipe do painel
// web). Pelo celular: ver quem é quem e ativar/desativar o acesso.
// Cadastrar, convidar e mudar permissões ficam no painel web (o convite
// por e-mail só sai do servidor).
export default function FuncionariosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  // A RLS só deixa o dono da conta gravar na equipe (o administrador
  // grava pelo painel web).
  const podeAlterar = contexto?.role === 'lojista'
  const [equipe, setEquipe] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [alterando, setAlterando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const { data, error } = await supabase
      .from('funcionario')
      .select('*')
      .eq('id_lojista', idLojista)
      .order('ativo', { ascending: false })
      .order('nome')
    if (error) setErro('Não foi possível carregar a equipe.')
    else {
      setErro(null)
      setEquipe((data ?? []) as Funcionario[])
    }
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Funcionários" />
        <SemPermissao area="ver a equipe" />
      </ScreenContainer>
    )
  }

  async function alternar(f: Funcionario, ativo: boolean) {
    if (!idLojista) return
    setErro(null)
    setAlterando(f.id_funcionario)
    const { data, error } = await supabase
      .from('funcionario')
      .update({ ativo })
      .eq('id_funcionario', f.id_funcionario)
      .eq('id_lojista', idLojista)
      .select('id_funcionario')
    setAlterando(null)
    if (error || !data || data.length === 0) {
      setErro(ativo ? 'Não foi possível reativar este membro.' : 'Não foi possível desativar este membro.')
      return
    }
    setEquipe(lista => lista.map(x => (x.id_funcionario === f.id_funcionario ? { ...x, ativo } : x)))
  }

  function pedirAlternar(f: Funcionario, ativo: boolean) {
    if (ativo) {
      alternar(f, true)
      return
    }
    Alert.alert('Desativar acesso', `${f.nome} deixa de conseguir entrar no painel e no app. Dá para reativar depois.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Desativar', style: 'destructive', onPress: () => alternar(f, false) },
    ])
  }

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Funcionários" />

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {!loading && equipe.length === 0 && !erro ? (
        <EmptyState icon="people-circle-outline" title="Nenhum funcionário cadastrado" subtitle="Convide a equipe pelo painel web — quem for cadastrado aparece aqui." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {equipe.map(f => {
            const tags = permissoes(f)
            const whatsapp = linkWhatsApp(f.telefone)
            return (
              <Card key={f.id_funcionario} style={{ gap: spacing.md }}>
                <View style={styles.topo}>
                  <Avatar nome={f.nome} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.nome, !f.ativo && styles.apagado]} numberOfLines={1}>{f.nome}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{f.cargo || 'Equipe'}{f.ativo ? '' : ' · Desativado'}</Text>
                  </View>
                  {podeAlterar && (
                    <Switch
                      value={f.ativo}
                      disabled={alterando === f.id_funcionario}
                      onValueChange={v => pedirAlternar(f, v)}
                      trackColor={{ true: colors.primary500, false: colors.borderStrong }}
                      thumbColor={colors.white}
                      accessibilityLabel={`Acesso de ${f.nome}`}
                    />
                  )}
                </View>

                <View style={styles.tags}>
                  {tags.length === 0 && !f.pode_taxidog && <Text style={styles.sub}>Sem permissões de gestão</Text>}
                  {tags.map(t => (
                    <View key={t} style={styles.tag}><Text style={styles.tagTexto}>{t}</Text></View>
                  ))}
                  {f.pode_taxidog && (
                    <View style={[styles.tag, styles.tagTaxi]}><Text style={[styles.tagTexto, styles.tagTaxiTexto]}>TaxiDog</Text></View>
                  )}
                </View>

                <Text style={styles.sub} numberOfLines={1}>{f.email}</Text>
                <View style={styles.acoes}>
                  <Botao rotulo={formatarTelefone(f.telefone)} icone="call-outline" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${f.telefone}`)} />
                  {whatsapp && (
                    <Botao rotulo="WhatsApp" icone="logo-whatsapp" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Linking.openURL(whatsapp)} />
                  )}
                </View>
              </Card>
            )
          })}
        </View>
      )}

      <Aviso
        tipo="info"
        style={{ marginTop: spacing.xl }}
        texto={
          podeAlterar
            ? 'Para convidar alguém ou mudar permissões, use Equipe no painel web.'
            : 'Para convidar, desativar ou mudar permissões, use Equipe no painel web.'
        }
      />
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { backgroundColor: colors.primary50, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  tagTexto: { ...typography.label.md, color: colors.primary700, fontSize: 12 },
  tagTaxi: { backgroundColor: colors.warningBg },
  tagTaxiTexto: { color: colors.warningFg },
  acoes: { flexDirection: 'row', gap: spacing.md },
})
