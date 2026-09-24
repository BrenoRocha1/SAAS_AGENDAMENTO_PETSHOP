import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO } from '@/lib/agenda'
import { normalizarCorrida, trechoAtual } from '@/lib/taxidog'
import { useAuth } from './AuthContext'
import { colors, radius, shadow, spacing, typography } from '@/theme/theme'

// ============================================================
// TaxiDog em tempo real — corridas (Kanban) e rotas (migration 053)
// ============================================================
// Escuta (Supabase Realtime) as corridas e as rotas da loja — a RLS só
// entrega as do TaxiDog logado (e as corridas ainda sem TaxiDog). Duas
// coisas:
//   • `versao` sobe a cada mudança — as telas recarregam;
//   • aviso dentro do app: "Corrida disponível", "Nova corrida", "Pronto
//     para entrega", "Nova rota atribuída", "Rota aprovada", "Rota
//     atualizada".
// Não duplica: guarda o último estado de cada corrida/rota e só avisa uma
// vez por (item, tipo/versão). O que o próprio TaxiDog fez não vira aviso.

interface Aviso {
  chave: string
  titulo: string
  mensagem: string
  destino: string
  icone: keyof typeof Ionicons.glyphMap
}

interface TaxiDogState {
  versao: number
  // O TaxiDog vai mexer nesta corrida/rota (pegou a corrida, pet não
  // embarcou, montou a rota...): o aviso que chega logo depois não é
  // novidade pra ele.
  marcarFeitoPorMim: (id: string) => void
}

const TaxiDogContext = createContext<TaxiDogState>({ versao: 0, marcarFeitoPorMim: () => {} })

type LinhaRota = {
  id_rota: string
  numero: number
  id_funcionario: string | null
  status: string
  versao: number
  ultima_alteracao: string | null
  criada_por?: string | null
}
type LinhaCorrida = { id_corrida: string; status: string; id_funcionario: string | null }

const encerrada = (status: string) => status === 'concluida' || status === 'cancelada'

export function TaxiDogProvider({ children }: { children: ReactNode }) {
  const { session, contexto, modo, setModo } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [versao, setVersao] = useState(0)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const rotas = useRef(new Map<string, LinhaRota>())
  const corridas = useRef(new Map<string, LinhaCorrida>())
  const jaAvisados = useRef(new Set<string>())
  const feitoPorMim = useRef(new Map<string, number>())
  const ultimaRotaMinha = useRef(0)
  const opacidade = useRef(new Animated.Value(0)).current

  const userId = session?.user.id
  const idLojista = contexto?.idLojista
  const ativo = !!userId && !!contexto?.podeTaxidog

  const marcarFeitoPorMim = useCallback((id: string) => {
    feitoPorMim.current.set(id, Date.now())
  }, [])

  const recente = useCallback((id: string) => {
    const quando = feitoPorMim.current.get(id)
    return !!quando && Date.now() - quando < 60_000
  }, [])

  const avisar = useCallback((a: Aviso) => {
    if (jaAvisados.current.has(a.chave)) return
    jaAvisados.current.add(a.chave)
    setAviso(a)
  }, [])

  const avisoCorrida = useCallback(async (idCorrida: string, tipo: 'disponivel' | 'nova' | 'pronta') => {
    const hoje = hojeBrasilISO()
    const { data } = await supabase.rpc('fn_listar_corridas', { p_data_ini: hoje, p_data_fim: hoje, p_id_corrida: idCorrida })
    const linha = (data as Record<string, unknown>[] | null)?.[0]
    if (!linha) return
    const c = normalizarCorrida(linha)
    const quando = c.dt_agendamento === hoje
      ? `às ${c.hr_agendamento.slice(0, 5)}`
      : `em ${c.dt_agendamento.split('-').reverse().slice(0, 2).join('/')} às ${c.hr_agendamento.slice(0, 5)}`
    const trecho = `${trechoAtual(c) === 'busca' ? 'Buscar' : 'Entregar'} ${c.pet_nome} ${quando}`
    avisar({
      chave: `${idCorrida}:${tipo}`,
      titulo: tipo === 'disponivel' ? 'Corrida disponível' : tipo === 'nova' ? 'Nova corrida' : 'Pronto para entrega',
      mensagem: tipo === 'disponivel' ? `${trecho} — toque para ver e pegar.` : tipo === 'nova' ? trecho : `${c.pet_nome} está pronto para entrega.`,
      destino: `/taxidog/corrida/${idCorrida}`,
      icone: tipo === 'pronta' ? 'checkmark-done' : 'car',
    })
  }, [avisar])

  useEffect(() => {
    if (!ativo || !userId || !idLojista) return
    let cancelado = false

    // Semente: o que já existe ao abrir o app não gera aviso.
    supabase
      .from('taxidog_rota')
      .select('id_rota, numero, id_funcionario, status, versao, ultima_alteracao')
      .eq('id_funcionario', userId)
      .in('status', ['aguardando_aprovacao', 'aguardando_saida', 'em_andamento'])
      .then(({ data }) => {
        if (cancelado) return
        for (const r of (data ?? []) as LinhaRota[]) if (!rotas.current.has(r.id_rota)) rotas.current.set(r.id_rota, r)
      })

    const avisoNovaRota = async (r: LinhaRota) => {
      const { count } = await supabase.from('taxidog_parada').select('id_parada', { count: 'exact', head: true }).eq('id_rota', r.id_rota)
      avisar({
        chave: `${r.id_rota}:atribuida`,
        titulo: 'Nova rota atribuída',
        mensagem: count ? `Você tem uma nova rota com ${count} ${count === 1 ? 'parada' : 'paradas'}.` : `A Rota #${r.numero} é sua.`,
        destino: `/taxidog/rota/${r.id_rota}`,
        icone: 'map',
      })
    }

    const canal = supabase
      .channel(`taxidog-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_rota', filter: `id_lojista=eq.${idLojista}` }, payload => {
        const nova = payload.new as LinhaRota | null
        if (!nova?.id_rota) return
        const anterior = rotas.current.get(nova.id_rota)
        rotas.current.set(nova.id_rota, nova)
        setVersao(v => v + 1)
        if (nova.id_funcionario !== userId) return
        ultimaRotaMinha.current = Date.now()

        if (!anterior || anterior.id_funcionario !== userId) {
          // Rota que ele mesmo montou não é novidade.
          if (nova.criada_por !== userId && (nova.status === 'aguardando_saida' || nova.status === 'em_andamento')) avisoNovaRota(nova)
          return
        }
        if (anterior.status === 'aguardando_aprovacao' && nova.status === 'aguardando_saida') {
          avisar({
            chave: `${nova.id_rota}:aprovada:${nova.versao}`,
            titulo: 'Rota aprovada',
            mensagem: `A Rota #${nova.numero} foi aprovada — você já pode iniciar.`,
            destino: `/taxidog/rota/${nova.id_rota}`,
            icone: 'checkmark-circle',
          })
          return
        }
        if (recente(nova.id_rota)) return
        // Toda mudança de verdade traz o que mudou em ultima_alteracao (os
        // passos internos da criação da rota, não).
        const cancelou = nova.status === 'cancelada' && anterior.status !== 'cancelada'
        const mudou = cancelou || (nova.versao > anterior.versao && !!nova.ultima_alteracao)
        if (!mudou || nova.status === 'concluida') return
        avisar({
          chave: `${nova.id_rota}:v${nova.versao}:${nova.status}`,
          titulo: 'Rota atualizada',
          mensagem: nova.ultima_alteracao ?? (cancelou ? `A Rota #${nova.numero} foi cancelada.` : 'As paradas mudaram.'),
          destino: `/taxidog/rota/${nova.id_rota}`,
          icone: 'refresh-circle',
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${idLojista}` }, payload => {
        const nova = payload.new as LinhaCorrida | null
        if (!nova?.id_corrida) return
        const anterior = corridas.current.get(nova.id_corrida)
        corridas.current.set(nova.id_corrida, nova)
        setVersao(v => v + 1)
        if (encerrada(nova.status)) return

        if (payload.eventType === 'INSERT') {
          if (!nova.id_funcionario) avisoCorrida(nova.id_corrida, 'disponivel')
          else if (nova.id_funcionario === userId) avisoCorrida(nova.id_corrida, 'nova')
          return
        }
        if (nova.id_funcionario !== userId) return
        if (anterior && anterior.id_funcionario !== userId) {
          // Ele mesmo pegou, ou ela veio junto com uma rota (o aviso é o da rota).
          if (recente(nova.id_corrida) || nova.status !== 'agendada') return
          setTimeout(() => {
            if (Date.now() - ultimaRotaMinha.current > 5000) avisoCorrida(nova.id_corrida, 'nova')
          }, 1500)
        } else if (anterior && anterior.status !== 'pronto_entrega' && nova.status === 'pronto_entrega') {
          avisoCorrida(nova.id_corrida, 'pronta')
        }
      })
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [ativo, userId, idLojista, avisar, avisoCorrida, recente])

  // Aparece, fica 6 s e some sozinho.
  useEffect(() => {
    if (!aviso) return
    Animated.timing(opacidade, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    const timer = setTimeout(() => {
      Animated.timing(opacidade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setAviso(null))
    }, 6000)
    return () => clearTimeout(timer)
  }, [aviso, opacidade])

  function abrirAviso() {
    if (!aviso) return
    const destino = aviso.destino
    setAviso(null)
    if (modo !== 'taxidog') {
      // A área do TaxiDog precisa existir na navegação antes do push.
      setModo('taxidog')
      setTimeout(() => router.push(destino as never), 300)
    } else {
      router.push(destino as never)
    }
  }

  return (
    <TaxiDogContext.Provider value={{ versao, marcarFeitoPorMim }}>
      {children}
      {aviso && (
        <Animated.View pointerEvents="box-none" style={[styles.avisoWrap, { top: insets.top + spacing.sm, opacity: opacidade }]}>
          <Pressable onPress={abrirAviso} style={styles.aviso}>
            <View style={styles.avisoIcone}>
              <Ionicons name={aviso.icone} size={18} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.avisoTitulo}>{aviso.titulo}</Text>
              <Text style={styles.avisoMensagem} numberOfLines={2}>{aviso.mensagem}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </Pressable>
        </Animated.View>
      )}
    </TaxiDogContext.Provider>
  )
}

export function useTaxiDogTempoReal() {
  return useContext(TaxiDogContext)
}

const styles = StyleSheet.create({
  avisoWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 100 },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary600,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.md,
  },
  avisoIcone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avisoTitulo: { ...typography.label.md, color: colors.white },
  avisoMensagem: { ...typography.body.md, color: colors.white, opacity: 0.95 },
})
