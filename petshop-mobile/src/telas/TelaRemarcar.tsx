import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { EmptyState } from '@/components/EmptyState'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { IconWhatsapp } from '@/components/IconesDoSite'
import { SeletorDataHora } from '@/components/SeletorDataHora'
import { Text } from '@/components/Texto'
import { dataBR, hojeBrasilISO, removerHorariosPassados } from '@/lib/agenda'
import {
  carregarAgendamento,
  horariosParaRemarcar,
  remarcarAgendamento,
  whatsappRemarcado,
  type AgendamentoDetalhe,
  type Slot,
} from '@/lib/agendamentos'
import { nomeDaLoja } from '@/lib/loja'
import { colors, spacing } from '@/theme/theme'

// Remarcar agendamento — a mesma janela do site (RemarcarModal em
// petshop-app/src/components/lojista/RemarcarAgendamento.tsx): mesmos
// textos, o calendário com os horários e os botões. Mudou lá, muda aqui.
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
        <DetailHeader title="Remarcar agendamento" junto />
        {erroCarga ? (
          <EmptyState icon="alert-circle-outline" ilustracao="nao-encontrado" title="Agendamento não encontrado" subtitle={erroCarga} />
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

  const cliente = modo === 'cliente'

  if (feito) {
    return (
      <ScreenContainer>
        <DetailHeader title="Remarcar agendamento" junto />
        <View style={styles.corpo}>
          <Aviso tipo="sucesso" texto={`Remarcado para ${dataBR(data)} às ${hora}.${cliente ? ' A loja vê a nova data no seu pedido.' : ''}`} />
          {feito.avisos.map((av, i) => <Aviso key={i} tipo="info" texto={av} />)}
        </View>
        <View style={styles.rodape}>
          {feito.whatsapp && (
            <BotaoPequeno normal icone={IconWhatsapp} rotulo="Avisar o cliente no WhatsApp" onPress={() => Linking.openURL(feito.whatsapp!)} />
          )}
          <BotaoPequeno normal variante="primario" rotulo="Fechar" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    )
  }

  const slotsDoDia = carregandoSlots ? null : slots

  return (
    <ScreenContainer>
      <DetailHeader title="Remarcar agendamento" junto />

      <View style={styles.corpo}>
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Text style={styles.apoio}>
          Marcado para {dataBR(a.dt_agendamento)} às {a.hr_agendamento.slice(0, 5)}.{' '}
          {cliente
            ? 'Se você marcou mais de um serviço juntos, todos mudam juntos, na mesma ordem.'
            : 'Se o cliente marcou mais de um serviço juntos, todos mudam juntos, na mesma ordem.'}
        </Text>

        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Nova data e horário<Text style={styles.estrela}> *</Text></Text>
          <SeletorDataHora
            idLojista={a.id_lojista}
            data={data}
            onData={d => { setData(d); setHora('') }}
            hora={hora}
            onHora={setHora}
            slots={slotsDoDia ? slotsDoDia.lista : null}
            aviso={
              slotsDoDia?.erro ? slotsDoDia.erro
                : slotsDoDia && slotsDoDia.lista.length === 0
                  ? (cliente ? 'Sem horário livre nesse dia. Escolha outra data.' : 'A loja não tem horário nesse dia. Escolha outra data.')
                  : undefined
            }
            dataMin={hoje}
            desativado={enviando}
            rotulo="Remarcar para"
          />
        </View>

        <Campo rotulo="Motivo (opcional)" value={motivo} onChangeText={setMotivo} placeholder="Ex: cliente pediu outro dia" maxLength={300} editable={!enviando} />
        {mesmoHorario && <Aviso tipo="info" texto="Este já é o horário atual do agendamento." />}
      </View>

      <View style={styles.rodape}>
        <BotaoPequeno normal variante="primario" rotulo={enviando ? 'Remarcando...' : 'Remarcar'} desativado={enviando || !hora || mesmoHorario} onPress={confirmar} />
        <BotaoPequeno normal variante="fantasma" rotulo="Cancelar" desativado={enviando} onPress={() => router.back()} />
      </View>
    </ScreenContainer>
  )
}

// Medidas da janela "Remarcar agendamento" do site em 375 de largura.
const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  corpo: { gap: 12 },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  estrela: { color: colors.dangerFg },
  apoio: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  rodape: { gap: 8, marginTop: spacing.xl },
})
