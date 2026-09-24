import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { addDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { useTaxiDogTempoReal } from '@/contexts/TaxiDogContext'
import { supabase } from '@/lib/supabase'
import { agoraBrasil } from '@/lib/agenda'
import { ROTULO_MODALIDADE } from '@/lib/taxidog'
import { montarPlanoInicial, normalizarTrecho, type ParadaPlano, type TrechoPendente } from '@/lib/taxidog-rotas'
import { colors, radius, spacing, typography } from '@/theme/theme'

// O TaxiDog monta uma rota pra si (migration 053) com as corridas sem
// TaxiDog ou que já são dele. Dependendo da configuração da loja, a rota
// já pode sair ou fica "Aguardando aprovação". Reordenar paradas fica no
// painel web.

const chave = (t: Pick<TrechoPendente, 'id_corrida' | 'trecho'>) => `${t.id_corrida}:${t.trecho}`

function textoTrecho(t: TrechoPendente): string {
  if (t.trecho === 'busca') return `Buscar às ${t.hr_agendamento.slice(0, 5)}`
  return t.hr_fim_visita ? `Entregar após ${t.hr_fim_visita.slice(0, 5)}` : 'Entregar após o serviço'
}

function descreverPlano(plano: ParadaPlano[], trechos: TrechoPendente[]): string[] {
  const nome = (id: string) => trechos.find(t => t.id_corrida === id)?.pet_nome ?? 'Pet'
  return plano.map(p => {
    const juntar = (acao: string) => p.itens.filter(i => i.acao === acao).map(i => nome(i.id_corrida)).join(' + ')
    if (p.local === 'loja') {
      return ['Pet Shop', juntar('deixar_loja') && `deixar ${juntar('deixar_loja')}`, juntar('pegar_loja') && `pegar ${juntar('pegar_loja')}`]
        .filter(Boolean).join(' · ')
    }
    return [juntar('embarcar') && `Buscar ${juntar('embarcar')}`, juntar('entregar') && `Entregar ${juntar('entregar')}`]
      .filter(Boolean).join(' · ')
  })
}

export default function MontarRotaScreen() {
  const router = useRouter()
  const { contexto } = useAuth()
  const { marcarFeitoPorMim } = useTaxiDogTempoReal()
  const dias = useMemo(() => [0, 1, 2, 3].map(n => addDays(agoraBrasil(), n)), [])
  const [dia, setDia] = useState(format(dias[0], 'yyyy-MM-dd'))
  const [trechos, setTrechos] = useState<TrechoPendente[]>([])
  const [precisaAprovacao, setPrecisaAprovacao] = useState(true)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const idLojista = contexto?.idLojista

  const carregar = useCallback(async () => {
    setLoading(true)
    const [pend, aprov] = await Promise.all([
      supabase.rpc('fn_trechos_pendentes', { p_data: dia }),
      idLojista ? supabase.rpc('fn_taxidog_precisa_aprovacao', { p_id_lojista: idLojista }) : Promise.resolve({ data: true }),
    ])
    if (pend.error) {
      setErro(pend.error.code === 'PGRST202' || pend.error.message.includes('Could not find')
        ? 'As rotas ainda não foram ativadas no sistema da loja.'
        : pend.error.message)
      setTrechos([])
    } else {
      setErro(null)
      setTrechos(((pend.data ?? []) as Record<string, unknown>[]).map(normalizarTrecho))
    }
    setPrecisaAprovacao(aprov.data !== false)
    setMarcados(new Set())
    setLoading(false)
  }, [dia, idLojista])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  const escolhidos = trechos.filter(t => marcados.has(chave(t)))
  const previa = useMemo(() => descreverPlano(montarPlanoInicial(escolhidos), escolhidos), [escolhidos])

  function alternar(t: TrechoPendente) {
    setMarcados(prev => {
      const novo = new Set(prev)
      if (novo.has(chave(t))) novo.delete(chave(t))
      else novo.add(chave(t))
      return novo
    })
  }

  async function montar() {
    if (escolhidos.length === 0) return
    setErro(null)
    setEnviando(true)
    const { data, error } = await supabase.rpc('fn_criar_rota', {
      p_data: dia,
      p_id_funcionario: null,
      p_paradas: montarPlanoInicial(escolhidos),
    })
    setEnviando(false)
    if (error || !data) {
      setErro(error?.message ?? 'Não foi possível montar a rota.')
      carregar()
      return
    }
    marcarFeitoPorMim(data as string)
    router.replace(`/taxidog/rota/${data}` as never)
  }

  const renderTrecho = (t: TrechoPendente) => {
    const aguardandoAceite = t.status_agendamento === 'Pendente'
    const marcado = marcados.has(chave(t))
    return (
      <Pressable
        key={chave(t)}
        disabled={aguardandoAceite}
        onPress={() => alternar(t)}
        style={[styles.trecho, marcado && styles.trechoMarcado, aguardandoAceite && { opacity: 0.55 }]}
      >
        <Ionicons name={marcado ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={marcado ? colors.primary600 : colors.textFaint} />
        <View style={{ flex: 1 }}>
          <View style={styles.trechoTopo}>
            <Text style={styles.trechoPet}>{t.pet_nome}</Text>
            <Text style={styles.trechoHora}>{textoTrecho(t)}</Text>
          </View>
          <Text style={styles.trechoLinha} numberOfLines={1}>{t.logradouro}, {t.numero} · {t.bairro}</Text>
          <Text style={styles.trechoLinha}>{t.cliente_nome} · {ROTULO_MODALIDADE[t.modalidade]}</Text>
          {aguardandoAceite && <Text style={styles.trechoAviso}>Aguardando aceite da loja</Text>}
          {!aguardandoAceite && t.trecho === 'entrega' && t.status_corrida !== 'pronto_entrega' && (
            <Text style={styles.trechoInfo}>Serviço ainda não terminou</Text>
          )}
          {t.id_funcionario && <Text style={styles.trechoInfo}>Sua corrida</Text>}
        </View>
      </Pressable>
    )
  }

  const busca = trechos.filter(t => t.trecho === 'busca')
  const entrega = trechos.filter(t => t.trecho === 'entrega')

  return (
    <ScreenContainer refreshing={false} onRefresh={carregar}>
      <DetailHeader title="Montar rota" />

      <View style={styles.dias}>
        {dias.map((d, i) => {
          const iso = format(d, 'yyyy-MM-dd')
          const ativo = iso === dia
          return (
            <Pressable key={iso} onPress={() => setDia(iso)} style={[styles.dia, ativo && styles.diaAtivo]}>
              <Text style={[styles.diaTexto, ativo && styles.diaTextoAtivo]}>
                {i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : format(d, 'EEE dd', { locale: ptBR })}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {precisaAprovacao && (
        <Text style={styles.nota}>A rota que você montar vai para aprovação da loja antes de sair.</Text>
      )}

      {erro && (
        <View style={styles.alertaErro}>
          <Ionicons name="alert-circle" size={16} color={colors.dangerFg} />
          <Text style={styles.alertaErroTexto}>{erro}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary600} style={{ marginTop: spacing.xl }} />
      ) : trechos.length === 0 ? (
        <EmptyState icon="car-outline" title="Nenhuma corrida livre" subtitle="Não há corridas sem TaxiDog ou suas para montar rota neste dia." />
      ) : (
        <>
          {busca.length > 0 && (
            <>
              <Text style={styles.grupo}>Para buscar ({busca.length})</Text>
              <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>{busca.map(renderTrecho)}</View>
            </>
          )}
          {entrega.length > 0 && (
            <>
              <Text style={styles.grupo}>Para entregar ({entrega.length})</Text>
              <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>{entrega.map(renderTrecho)}</View>
            </>
          )}

          {previa.length > 0 && (
            <View style={styles.previa}>
              <Text style={styles.grupo}>Paradas</Text>
              {previa.map((p, i) => (
                <Text key={i} style={styles.previaLinha}>{i + 1}. {p}</Text>
              ))}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.botao, (pressed || enviando || escolhidos.length === 0) && { opacity: 0.7 }]}
            disabled={enviando || escolhidos.length === 0}
            onPress={montar}
          >
            {enviando
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.botaoTexto}>
                  {escolhidos.length === 0 ? 'SELECIONE AS CORRIDAS' : precisaAprovacao ? 'ENVIAR PARA APROVAÇÃO' : 'MONTAR ROTA'}
                </Text>}
          </Pressable>
        </>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  dias: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  dia: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.surfaceMuted },
  diaAtivo: { backgroundColor: colors.primary600 },
  diaTexto: { ...typography.label.md, color: colors.textDim, textTransform: 'capitalize' },
  diaTextoAtivo: { color: colors.white },
  nota: { ...typography.body.md, color: colors.textMuted, marginBottom: spacing.lg },
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
  grupo: { ...typography.heading.sm, color: colors.text, marginBottom: spacing.sm },
  trecho: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  trechoMarcado: { borderColor: colors.primary600, backgroundColor: colors.primary50 },
  trechoTopo: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  trechoPet: { ...typography.heading.sm, color: colors.text },
  trechoHora: { ...typography.body.sm, color: colors.textMuted },
  trechoLinha: { ...typography.body.sm, color: colors.textMuted },
  trechoAviso: { ...typography.body.sm, color: colors.warningFg, fontWeight: '600', marginTop: 2 },
  trechoInfo: { ...typography.body.sm, color: colors.primary600, fontWeight: '600', marginTop: 2 },
  previa: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, gap: 4 },
  previaLinha: { ...typography.body.md, color: colors.text },
  botao: {
    backgroundColor: colors.primary600,
    borderRadius: radius.md,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoTexto: { ...typography.heading.md, color: colors.white, letterSpacing: 0.5 },
})
