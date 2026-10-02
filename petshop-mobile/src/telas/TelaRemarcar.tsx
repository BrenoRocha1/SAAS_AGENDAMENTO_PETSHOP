import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { SeletorDia } from '@/components/SeletorDia'
import { GradeHorarios } from '@/components/GradeHorarios'
import { dataBR, dataExtensaISO, hojeBrasilISO, removerHorariosPassados } from '@/lib/agenda'
import {
  carregarAgendamento,
  horariosParaRemarcar,
  remarcarAgendamento,
  whatsappRemarcado,
  type AgendamentoDetalhe,
  type Slot,
} from '@/lib/agendamentos'
import { nomeDaLoja } from '@/lib/loja'
import { colors, spacing, typography } from '@/theme/theme'

// Remarca o pedido inteiro (os serviços marcados juntos) — as regras
// (loja fechada, conflito, TaxiDog, plano) são de fn_remarcar_agendamento.
// A loja remarca Pendente ou Aceito; o cliente, o próprio agendamento só
// enquanto Pendente (migration 071) e dentro da antecedência da loja.
export function TelaRemarcar({ modo }: { modo: 'loja' | 'cliente' }) {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const hoje = hojeBrasilISO()
  const [ag, setAg] = useState<AgendamentoDetalhe | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [data, setData] = useState(hoje)
  const [hora, setHora] = useState('')
  const [motivo, setMotivo] = useState('')
  const [slots, setSlots] = useState<{ chave: string; lista: Slot[]; erro?: string } | null>(null)
  // Depois de uma recusa, os horários são buscados de novo.
  const [recarga, setRecarga] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<{ avisos: string[]; whatsapp: string | null } | null>(null)

  useEffect(() => {
    let cancelado = false
    carregarAgendamento(id).then(r => {
      if (cancelado) return
      setAg(r.dados ?? null)
      setErroCarga(r.erro ?? null)
      // Começa no dia atual do agendamento (se ainda não passou).
      if (r.dados && r.dados.dt_agendamento >= hoje) setData(r.dados.dt_agendamento)
    })
    return () => { cancelado = true }
  }, [id, hoje])

  const chave = `${data}|${recarga}`
  useEffect(() => {
    let cancelado = false
    horariosParaRemarcar(id, data).then(r => {
      if (cancelado) return
      const lista = removerHorariosPassados(r.slots, data)
      setSlots({ chave: `${data}|${recarga}`, lista, erro: r.erro })
      // O horário escolhido deixou de estar livre: desmarca.
      setHora(h => (lista.some(s => s.disponivel && s.hr_slot.slice(0, 5) === h) ? h : ''))
    })
    return () => { cancelado = true }
  }, [id, data, recarga])

  if (!ag) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Remarcar" />
        {erroCarga ? (
          <EmptyState icon="alert-circle-outline" title="Agendamento não encontrado" subtitle={erroCarga} />
        ) : (
          <View style={styles.centro}><ActivityIndicator color={colors.primary600} /></View>
        )}
      </ScreenContainer>
    )
  }

  const a = ag
  const carregandoSlots = slots?.chave !== chave
  const mesmoHorario = data === a.dt_agendamento && hora === a.hr_agendamento.slice(0, 5)

  async function confirmar() {
    if (!hora) {
      setErro('Escolha o novo horário.')
      return
    }
    setErro(null)
    setEnviando(true)
    const r = await remarcarAgendamento(a.id_agendamento, data, hora, motivo)
    if (r.erro) {
      setEnviando(false)
      setErro(r.erro)
      setRecarga(n => n + 1)
      return
    }
    // Só a loja avisa o cliente; pro cliente, quem vê a mudança é a loja.
    const loja = modo === 'loja' ? await nomeDaLoja(a.id_lojista) : ''
    setEnviando(false)
    setFeito({ avisos: modo === 'loja' ? r.avisos ?? [] : [], whatsapp: modo === 'loja' ? whatsappRemarcado(a, loja, data, hora) : null })
  }

  if (feito) {
    return (
      <ScreenContainer>
        <DetailHeader title="Remarcar" />
        <View style={{ gap: spacing.md }}>
          <Aviso tipo="sucesso" texto={`Remarcado para ${dataBR(data)} às ${hora}.${modo === 'cliente' ? ' A loja vê a mudança no seu pedido.' : ''}`} />
          {feito.avisos.map((av, i) => <Aviso key={i} tipo="info" texto={av} />)}
          {feito.whatsapp && (
            <Botao
              rotulo="Avisar o cliente no WhatsApp"
              icone="logo-whatsapp"
              variante="secundario"
              onPress={() => Linking.openURL(feito.whatsapp!)}
            />
          )}
          <Botao rotulo="Concluir" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Remarcar" />

      <Card style={styles.resumo}>
        <Text style={styles.resumoTitulo}>{a.pet?.nome ?? 'Pet'} — {a.servico?.nome ?? 'Serviço'}</Text>
        <Text style={styles.resumoTexto}>
          Hoje marcado para {dataExtensaISO(a.dt_agendamento).toLowerCase()}, às {a.hr_agendamento.slice(0, 5)}.
        </Text>
        <Text style={styles.resumoTexto}>Os serviços marcados juntos neste pedido mudam juntos.</Text>
      </Card>

      <Text style={styles.secao}>Nova data</Text>
      <SeletorDia inicio={hoje} dias={90} valor={data} onChange={setData} />
      <Text style={styles.dataEscolhida}>{dataExtensaISO(data)}</Text>

      <Text style={styles.secao}>Novo horário</Text>
      {slots?.erro && !carregandoSlots ? (
        <Aviso tipo="erro" texto={slots.erro} />
      ) : (
        <GradeHorarios
          slots={slots?.lista ?? []}
          carregando={carregandoSlots}
          valor={hora}
          onChange={setHora}
          vazio={modo === 'cliente' ? 'Nenhum horário neste dia. Escolha outra data.' : 'Nenhum horário neste dia — a loja não abre ou está fechada. Escolha outra data.'}
        />
      )}

      <View style={styles.rodape}>
        <Campo
          rotulo="Motivo (opcional)"
          value={motivo}
          onChangeText={setMotivo}
          placeholder={modo === 'cliente' ? 'Ex.: surgiu um compromisso' : 'Ex.: cliente pediu outro horário'}
          maxLength={300}
          multiline
        />
        {erro && <Aviso tipo="erro" texto={erro} />}
        {mesmoHorario && <Aviso tipo="info" texto="Este já é o horário atual do agendamento." />}
        <Botao rotulo="Remarcar" icone="calendar-outline" onPress={confirmar} carregando={enviando} desativado={!hora || mesmoHorario} />
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resumo: { gap: 4 },
  resumoTitulo: { ...typography.heading.sm, color: colors.text },
  resumoTexto: { ...typography.body.md, color: colors.textMuted },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  dataEscolhida: { ...typography.body.md, color: colors.textMuted, marginTop: spacing.sm },
  rodape: { marginTop: spacing.xl, gap: spacing.md },
})
