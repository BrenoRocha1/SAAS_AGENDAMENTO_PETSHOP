import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO } from '@/lib/agenda'
import { useAuth } from './AuthContext'
import { colors, radius, shadow, spacing, typography } from '@/theme/theme'

// ============================================================
// Rotas do TaxiDog em tempo real (migration 052)
// ============================================================
// Escuta (Supabase Realtime) as rotas e corridas da loja — a RLS só
// entrega as rotas do TaxiDog logado. Duas coisas:
//   • `versao` sobe a cada mudança — as telas recarregam;
//   • aviso dentro do app: "Nova rota atribuída", "Rota atualizada" e
//     "Pronto para entrega".
// Não duplica: guarda o último estado de cada rota e só avisa uma vez por
// (rota, versão). Mudança feita pelo próprio TaxiDog não vira aviso.

interface Aviso {
  chave: string
  titulo: string
  mensagem: string
  destino: string
  icone: keyof typeof Ionicons.glyphMap
}

interface RotasState {
  versao: number
  // O TaxiDog vai mexer nesta rota (ex.: pet não embarcou): o "Rota
  // atualizada" que chega logo depois não é novidade pra ele.
  marcarMudancaPropria: (idRota: string) => void
}

const RotasContext = createContext<RotasState>({ versao: 0, marcarMudancaPropria: () => {} })

type LinhaRota = { id_rota: string; numero: number; id_funcionario: string | null; status: string; versao: number; ultima_alteracao: string | null }
type LinhaCorrida = { id_corrida: string; status: string; id_funcionario: string | null }

export function RotasProvider({ children }: { children: ReactNode }) {
  const { session, contexto, modo, setModo } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [versao, setVersao] = useState(0)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const rotas = useRef(new Map<string, LinhaRota>())
  const corridas = useRef(new Map<string, LinhaCorrida>())
  const jaAvisados = useRef(new Set<string>())
  const mudancasProprias = useRef(new Map<string, number>())
  const opacidade = useRef(new Animated.Value(0)).current

  const userId = session?.user.id
  const idLojista = contexto?.idLojista
  const ativo = !!userId && !!contexto?.podeTaxidog

  const marcarMudancaPropria = useCallback((idRota: string) => {
    mudancasProprias.current.set(idRota, Date.now())
  }, [])

  const avisar = useCallback((a: Aviso) => {
    if (jaAvisados.current.has(a.chave)) return
    jaAvisados.current.add(a.chave)
    setAviso(a)
  }, [])

  useEffect(() => {
    if (!ativo || !userId || !idLojista) return
    let cancelado = false

    // Semente: o que já é dele ao abrir o app não gera aviso.
    supabase
      .from('taxidog_rota')
      .select('id_rota, numero, id_funcionario, status, versao, ultima_alteracao')
      .eq('id_funcionario', userId)
      .in('status', ['planejamento', 'aguardando_saida', 'em_andamento'])
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
      .channel(`taxidog-rotas-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_rota', filter: `id_lojista=eq.${idLojista}` }, payload => {
        const nova = payload.new as LinhaRota | null
        if (!nova?.id_rota) return
        const anterior = rotas.current.get(nova.id_rota)
        rotas.current.set(nova.id_rota, nova)
        setVersao(v => v + 1)
        if (nova.id_funcionario !== userId) return

        if (!anterior || anterior.id_funcionario !== userId) {
          if (nova.status === 'aguardando_saida' || nova.status === 'em_andamento') avisoNovaRota(nova)
          return
        }
        // Toda mudança de verdade traz o que mudou em ultima_alteracao (os
        // passos internos da criação da rota, não).
        const cancelou = nova.status === 'cancelada' && anterior.status !== 'cancelada'
        const mudou = cancelou || (nova.versao > anterior.versao && !!nova.ultima_alteracao)
        if (!mudou || nova.status === 'concluida') return
        const propria = mudancasProprias.current.get(nova.id_rota)
        if (propria && Date.now() - propria < 60_000) return
        avisar({
          chave: `${nova.id_rota}:v${nova.versao}:${nova.status}`,
          titulo: 'Rota atualizada',
          mensagem: cancelou ? `A loja cancelou a Rota #${nova.numero}.` : (nova.ultima_alteracao ?? 'As paradas mudaram.'),
          destino: `/taxidog/rota/${nova.id_rota}`,
          icone: 'refresh-circle',
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${idLojista}` }, payload => {
        const nova = payload.new as LinhaCorrida | null
        if (!nova?.id_corrida) return
        const anterior = corridas.current.get(nova.id_corrida)
        corridas.current.set(nova.id_corrida, nova)
        setVersao(v => v + 1)
        if (nova.id_funcionario !== userId || nova.status !== 'pronto_entrega' || anterior?.status === 'pronto_entrega') return
        const hoje = hojeBrasilISO()
        supabase
          .rpc('fn_listar_corridas', { p_data_ini: hoje, p_data_fim: hoje, p_id_corrida: nova.id_corrida })
          .then(({ data }) => {
            const pet = (data as { pet_nome?: string }[] | null)?.[0]?.pet_nome
            avisar({
              chave: `${nova.id_corrida}:pronta`,
              titulo: 'Pronto para entrega',
              mensagem: `${pet ?? 'Um pet da sua rota'} terminou o serviço e está pronto para entrega.`,
              destino: '/taxidog',
              icone: 'checkmark-done',
            })
          })
      })
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [ativo, userId, idLojista, avisar])

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
    <RotasContext.Provider value={{ versao, marcarMudancaPropria }}>
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
    </RotasContext.Provider>
  )
}

export function useRotasTempoReal() {
  return useContext(RotasContext)
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
