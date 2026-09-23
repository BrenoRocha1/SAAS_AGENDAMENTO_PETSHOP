import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { format, addDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { agoraBrasil, hojeBrasilISO } from '@/lib/agenda'
import { encerrada, normalizarCorrida, trechoAtual } from '@/lib/taxidog'
import { useAuth } from './AuthContext'
import { colors, radius, shadow, spacing, typography } from '@/theme/theme'

// ============================================================
// Corridas do TaxiDog em tempo real
// ============================================================
// Escuta (Supabase Realtime, igual ao som de novo agendamento do painel
// web) as mudanças nas corridas atribuídas a quem está logado. Duas coisas:
//   • `versao` sobe a cada mudança — as telas de corridas recarregam;
//   • aviso dentro do app quando chega uma corrida NOVA pra ele, ou quando
//     uma corrida dele fica "pronta para entrega".
// Não duplica: guarda o último status/TaxiDog de cada corrida e só avisa
// numa transição de verdade, uma vez por (corrida, tipo de aviso).

interface Aviso {
  chave: string
  idCorrida: string
  titulo: string
  mensagem: string
}

interface CorridasState {
  versao: number
}

const CorridasContext = createContext<CorridasState>({ versao: 0 })

type LinhaRealtime = { id_corrida: string; status: string; id_funcionario: string | null }

export function CorridasProvider({ children }: { children: ReactNode }) {
  const { session, contexto, modo, setModo } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [versao, setVersao] = useState(0)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const conhecidas = useRef(new Map<string, { status: string; id_funcionario: string | null }>())
  const jaAvisados = useRef(new Set<string>())
  const opacidade = useRef(new Animated.Value(0)).current

  const userId = session?.user.id
  const ativo = !!userId && !!contexto?.podeTaxidog

  const mostrarAviso = useCallback(async (idCorrida: string, tipo: 'nova' | 'pronta') => {
    const chave = `${idCorrida}:${tipo}`
    if (jaAvisados.current.has(chave)) return
    jaAvisados.current.add(chave)

    const hoje = hojeBrasilISO()
    const { data } = await supabase.rpc('fn_listar_corridas', { p_data_ini: hoje, p_data_fim: hoje, p_id_corrida: idCorrida })
    const linha = (data as Record<string, unknown>[] | null)?.[0]
    if (!linha) return
    const c = normalizarCorrida(linha)

    const quando = c.dt_agendamento === hoje ? `às ${c.hr_agendamento.slice(0, 5)}` : `em ${c.dt_agendamento.split('-').reverse().slice(0, 2).join('/')} às ${c.hr_agendamento.slice(0, 5)}`
    setAviso(tipo === 'nova'
      ? { chave, idCorrida, titulo: 'Nova corrida', mensagem: `${trechoAtual(c) === 'busca' ? 'Buscar' : 'Entregar'} ${c.pet_nome} ${quando}` }
      : { chave, idCorrida, titulo: 'Pronto para entrega', mensagem: `${c.pet_nome} está pronto para entrega.` })
  }, [])

  useEffect(() => {
    if (!ativo || !userId) return
    let cancelado = false

    // Semente: o que já é dele agora não gera aviso ao abrir o app.
    const hoje = agoraBrasil()
    supabase
      .rpc('fn_listar_corridas', { p_data_ini: format(addDays(hoje, -1), 'yyyy-MM-dd'), p_data_fim: format(addDays(hoje, 30), 'yyyy-MM-dd') })
      .then(({ data }) => {
        if (cancelado) return
        for (const row of (data ?? []) as LinhaRealtime[]) {
          if (!conhecidas.current.has(row.id_corrida)) {
            conhecidas.current.set(row.id_corrida, { status: row.status, id_funcionario: row.id_funcionario })
          }
        }
      })

    const canal = supabase
      .channel(`taxidog-corridas-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_funcionario=eq.${userId}` },
        payload => {
          const nova = payload.new as LinhaRealtime | null
          if (!nova?.id_corrida) return
          const anterior = conhecidas.current.get(nova.id_corrida)
          conhecidas.current.set(nova.id_corrida, { status: nova.status, id_funcionario: nova.id_funcionario })
          setVersao(v => v + 1)

          if (nova.id_funcionario !== userId || encerrada(nova.status)) return
          if (!anterior || anterior.id_funcionario !== userId) {
            mostrarAviso(nova.id_corrida, 'nova')
          } else if (anterior.status !== 'pronto_entrega' && nova.status === 'pronto_entrega') {
            mostrarAviso(nova.id_corrida, 'pronta')
          }
        }
      )
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [ativo, userId, mostrarAviso])

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
    const destino = `/taxidog/corrida/${aviso.idCorrida}`
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
    <CorridasContext.Provider value={{ versao }}>
      {children}
      {aviso && (
        <Animated.View pointerEvents="box-none" style={[styles.avisoWrap, { top: insets.top + spacing.sm, opacity: opacidade }]}>
          <Pressable onPress={abrirAviso} style={styles.aviso}>
            <View style={styles.avisoIcone}>
              <Ionicons name={aviso.titulo === 'Nova corrida' ? 'car' : 'checkmark-done'} size={18} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.avisoTitulo}>{aviso.titulo}</Text>
              <Text style={styles.avisoMensagem} numberOfLines={2}>{aviso.mensagem}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </Pressable>
        </Animated.View>
      )}
    </CorridasContext.Provider>
  )
}

export function useCorridasTempoReal() {
  return useContext(CorridasContext)
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
