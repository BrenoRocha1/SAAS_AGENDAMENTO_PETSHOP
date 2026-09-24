import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { format, parseISO } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { PillStatusCorrida } from '@/components/CorridaCard'
import { useCorridasTempoReal } from '@/contexts/CorridasContext'
import { buscarCorrida } from '@/hooks/useMinhasCorridas'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO } from '@/lib/agenda'
import { formatarTelefone } from '@/lib/format'
import {
  ROTULO_MODALIDADE,
  enderecoCliente,
  formatarCep,
  formatarKm,
  formatarReais,
  disponivel,
  proximaAcaoCorrida,
  trechoAtual,
  type Corrida,
} from '@/lib/taxidog'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Etapas finais pedem confirmação — evita um toque errado com o celular
// na mão, andando.
const CONFIRMAR: Record<string, string> = {
  entregue_loja: 'Confirma que o pet foi entregue na loja?',
  concluida: 'Confirma que o pet foi entregue ao tutor? A corrida será concluída.',
}

function abrirMapa(destino: string) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`)
}

export default function CorridaDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { versao, marcarComoVista } = useCorridasTempoReal()
  const [corrida, setCorrida] = useState<Corrida | null>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const c = await buscarCorrida(id, hojeBrasilISO())
    setCorrida(c)
    setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))
  useEffect(() => { if (versao > 0) carregar() }, [versao, carregar])

  async function avancar(novoStatus: string) {
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.rpc('fn_avancar_corrida', { p_id_corrida: id, p_novo_status: novoStatus })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    carregar()
  }

  async function assumir() {
    setErro(null)
    setEnviando(true)
    marcarComoVista(id)
    const { error } = await supabase.rpc('fn_assumir_corrida', { p_id_corrida: id })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    carregar()
  }

  function pedirAvanco(novoStatus: string) {
    const pergunta = CONFIRMAR[novoStatus]
    if (!pergunta) {
      avancar(novoStatus)
      return
    }
    Alert.alert('Confirmar', pergunta, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => avancar(novoStatus) },
    ])
  }

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Corrida" />
        <View style={styles.centro}><ActivityIndicator color={colors.primary600} /></View>
      </ScreenContainer>
    )
  }

  if (!corrida) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Corrida" />
        <EmptyState icon="alert-circle-outline" title="Corrida não encontrada" subtitle="Ela pode ter sido atribuída a outro TaxiDog." />
      </ScreenContainer>
    )
  }

  const c = corrida
  // Sem TaxiDog (migration 046): em vez da etapa, "Atribuir para mim" —
  // que só libera depois de a loja aceitar o agendamento.
  const semTaxiDog = disponivel(c)
  // A busca só sai depois de a loja aceitar o agendamento (migration 043).
  const aguardandoAceite = c.status === 'agendada' && c.status_agendamento === 'Pendente' && (semTaxiDog || c.modalidade !== 'entregar')
  const acao = aguardandoAceite || semTaxiDog ? null : proximaAcaoCorrida(c.status, c.modalidade)
  const indoParaLoja = c.status === 'pet_embarcado'
  // loja_endereco vem '' (não null) quando a loja não tem endereço.
  const destino = indoParaLoja ? c.loja_endereco || c.loja_nome : `${enderecoCliente(c)}, ${formatarCep(c.cep)}, Brasil`
  const aguardandoServico = !semTaxiDog && (c.status === 'entregue_loja' || (c.status === 'agendada' && c.modalidade === 'entregar'))
  const comportamento = (c.pet_comportamento ?? []).filter(Boolean)
  const observacoes = [c.obs_agendamento, c.pet_obs, c.pet_obs_comportamento].filter(Boolean) as string[]
  const telefone = c.cliente_telefone.replace(/\D/g, '')

  return (
    <ScreenContainer onRefresh={carregar} refreshing={false}>
      <DetailHeader title={trechoAtual(c) === 'entrega' ? 'Entrega' : 'Busca'} />

      {c.status === 'pronto_entrega' && (
        <View style={styles.bannerPronto}>
          <Ionicons name="checkmark-done-circle" size={22} color={colors.successFg} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitulo}>{c.pet_nome} está pronto para entrega.</Text>
            <Text style={styles.bannerTexto}>Endereço: {c.logradouro}, {c.numero}</Text>
          </View>
        </View>
      )}

      <View style={styles.perfil}>
        {c.pet_foto_url
          ? <Image source={{ uri: c.pet_foto_url }} style={styles.foto} />
          : <Avatar nome={c.pet_nome} size={88} />}
        <Text style={styles.nomePet}>{c.pet_nome}</Text>
        <Text style={styles.detalhePet}>{[c.pet_especie, c.pet_raca, c.pet_porte].filter(Boolean).join(' · ')}</Text>
        <PillStatusCorrida corrida={c} />
      </View>

      {erro && (
        <View style={styles.alertaErro}>
          <Ionicons name="alert-circle" size={16} color={colors.dangerFg} />
          <Text style={styles.alertaErroTexto}>{erro}</Text>
        </View>
      )}

      {/* Ações — conforme a etapa atual */}
      <View style={styles.acoes}>
        {!aguardandoServico && c.status !== 'concluida' && c.status !== 'cancelada' && (
          <Pressable style={styles.botaoRota} onPress={() => abrirMapa(destino)}>
            <Ionicons name="navigate" size={18} color={colors.primary600} />
            <Text style={styles.botaoRotaTexto}>{indoParaLoja ? 'Abrir rota até a loja' : 'Abrir rota'}</Text>
          </Pressable>
        )}
        {acao && (
          <Pressable
            style={({ pressed }) => [styles.botaoAcao, (pressed || enviando) && { opacity: 0.85 }]}
            disabled={enviando}
            onPress={() => pedirAvanco(acao.status)}
          >
            {enviando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoAcaoTexto}>{acao.rotulo.toUpperCase()}</Text>}
          </Pressable>
        )}
        {aguardandoAceite && (
          <View style={styles.aguardando}>
            <Ionicons name="hourglass-outline" size={18} color={colors.warningFg} />
            <Text style={styles.aguardandoTexto}>
              {semTaxiDog
                ? 'Aguardando aceite da loja. Assim que ela aceitar, você pode pegar esta corrida.'
                : 'A loja ainda não aceitou este agendamento. A busca libera assim que ela aceitar.'}
            </Text>
          </View>
        )}
        {semTaxiDog && !aguardandoAceite && (
          <Pressable
            style={({ pressed }) => [styles.botaoAcao, (pressed || enviando) && { opacity: 0.85 }]}
            disabled={enviando}
            onPress={assumir}
          >
            {enviando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoAcaoTexto}>ATRIBUIR PARA MIM</Text>}
          </Pressable>
        )}
        {aguardandoServico && (
          <View style={styles.aguardando}>
            <Ionicons name="hourglass-outline" size={18} color={colors.warningFg} />
            <Text style={styles.aguardandoTexto}>
              {c.status === 'entregue_loja'
                ? 'Pet na loja. Você recebe um aviso quando o serviço terminar e ele estiver pronto para entrega.'
                : 'A entrega libera quando o serviço terminar — você recebe um aviso.'}
            </Text>
          </View>
        )}
      </View>

      <Card style={styles.infoCard}>
        <InfoRow icon="person-outline" label="Tutor" valor={c.cliente_nome} />
        <View style={styles.infoRow}>
          <Ionicons name="call-outline" size={16} color={colors.textFaint} />
          <Text style={styles.infoLabel}>Telefone</Text>
          <Text style={styles.infoValor}>{formatarTelefone(c.cliente_telefone)}</Text>
        </View>
        <View style={styles.contatoRow}>
          <Pressable style={styles.contatoBotao} onPress={() => Linking.openURL(`tel:${telefone}`)}>
            <Ionicons name="call" size={16} color={colors.primary600} />
            <Text style={styles.contatoTexto}>Ligar</Text>
          </Pressable>
          <Pressable style={styles.contatoBotao} onPress={() => Linking.openURL(`https://wa.me/55${telefone}`)}>
            <Ionicons name="logo-whatsapp" size={16} color={colors.primary600} />
            <Text style={styles.contatoTexto}>WhatsApp</Text>
          </Pressable>
        </View>
        <InfoRow icon="location-outline" label="Endereço" valor={`${enderecoCliente(c)}\nCEP ${formatarCep(c.cep)}`} />
        <InfoRow icon="time-outline" label="Horário" valor={`${format(parseISO(c.dt_agendamento), 'dd/MM')} às ${c.hr_agendamento.slice(0, 5)}`} />
        <InfoRow icon="car-outline" label="Transporte" valor={ROTULO_MODALIDADE[c.modalidade]} />
        {c.servicos && <InfoRow icon="cut-outline" label="Serviço" valor={c.servicos} />}
        <InfoRow
          icon="cash-outline"
          label="Corrida"
          valor={`${formatarReais(c.valor)}${c.distancia_km != null ? ` · ~${formatarKm(c.distancia_km)}` : ''}`}
        />
      </Card>

      {(comportamento.length > 0 || observacoes.length > 0) && (
        <Card style={styles.obsCard}>
          <Text style={styles.secaoTitulo}>Observações importantes</Text>
          {comportamento.length > 0 && (
            <View style={styles.tags}>
              {comportamento.map(t => (
                <View key={t} style={styles.tag}><Text style={styles.tagTexto}>{t}</Text></View>
              ))}
            </View>
          )}
          {observacoes.map((o, i) => <Text key={i} style={styles.obsTexto}>{o}</Text>)}
        </Card>
      )}

      {c.eventos.length > 0 && (
        <Card style={styles.obsCard}>
          <Text style={styles.secaoTitulo}>Histórico</Text>
          {c.eventos.map((e, i) => (
            <View key={i} style={styles.evento}>
              <Text style={styles.eventoHora}>{format(parseISO(e.created_at), 'HH:mm')}</Text>
              <Text style={styles.eventoTexto}>{e.descricao}</Text>
            </View>
          ))}
        </Card>
      )}
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
  bannerPronto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerTitulo: { ...typography.heading.sm, color: colors.successFg },
  bannerTexto: { ...typography.body.md, color: colors.successFg },
  perfil: { alignItems: 'center', gap: 4, marginBottom: spacing.lg },
  foto: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surfaceMuted },
  nomePet: { ...typography.heading.lg, color: colors.text, marginTop: spacing.sm },
  detalhePet: { ...typography.body.md, color: colors.textMuted, marginBottom: spacing.xs },
  alertaErro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  alertaErroTexto: { ...typography.body.md, color: colors.dangerFg, flex: 1 },
  acoes: { gap: spacing.md, marginBottom: spacing.xl },
  botaoRota: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary50,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  botaoRotaTexto: { ...typography.heading.sm, color: colors.primary600 },
  botaoAcao: {
    backgroundColor: colors.primary600,
    borderRadius: radius.md,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoAcaoTexto: { ...typography.heading.md, color: colors.white, letterSpacing: 0.5 },
  aguardando: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  aguardandoTexto: { ...typography.body.md, color: colors.warningFg, flex: 1 },
  infoCard: { gap: spacing.md, marginBottom: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  infoLabel: { ...typography.body.sm, color: colors.textMuted, width: 78, marginTop: 2 },
  infoValor: { ...typography.body.lg, color: colors.text, flex: 1 },
  contatoRow: { flexDirection: 'row', gap: spacing.md, marginLeft: 24 },
  contatoBotao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary50,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  contatoTexto: { ...typography.label.md, color: colors.primary600 },
  obsCard: { gap: spacing.sm, marginBottom: spacing.lg },
  secaoTitulo: { ...typography.heading.sm, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { backgroundColor: colors.warningBg, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  tagTexto: { ...typography.label.md, color: colors.warningFg },
  obsTexto: { ...typography.body.lg, color: colors.text },
  evento: { flexDirection: 'row', gap: spacing.md },
  eventoHora: { ...typography.body.sm, color: colors.textMuted, width: 42 },
  eventoTexto: { ...typography.body.md, color: colors.text, flex: 1 },
})
