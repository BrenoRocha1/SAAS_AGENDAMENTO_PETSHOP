import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Linking, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { SearchField } from '@/components/SearchField'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { agoraBrasil, agoraBrasilHHMM } from '@/lib/agenda'
import { linkWhatsApp } from '@/lib/format'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Loja {
  id_lojista: string
  nome_loja: string
  logo_url: string | null
  descricao: string | null
  cidade: string | null
  estado: string | null
  telefone: string | null
}

interface Horario { id_lojista: string; dia_semana: string; hr_inicio: string; hr_fim: string; ativo: boolean }

const NOME_DO_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

// Aberto/fechado agora, pelo horário de funcionamento de hoje.
function statusHoje(horarios: Horario[], idLojista: string): { rotulo: string; aberto: boolean } {
  const hoje = NOME_DO_DIA[agoraBrasil().getDay()]
  const agora = agoraBrasilHHMM()
  const h = horarios.find(x => x.id_lojista === idLojista && x.dia_semana === hoje && x.ativo)
  if (!h) return { rotulo: 'Fechado hoje', aberto: false }
  if (agora < h.hr_inicio.slice(0, 5)) return { rotulo: `Abre às ${h.hr_inicio.slice(0, 5)}`, aberto: false }
  if (agora < h.hr_fim.slice(0, 5)) return { rotulo: 'Aberto', aberto: true }
  return { rotulo: 'Fechado', aberto: false }
}

// Petshops que aceitam agendamento online (a mesma lista de
// /cliente/petshops no site), com os que o cliente já usa em cima.
export default function PetshopsScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const idCliente = user?.id
  const [lojas, setLojas] = useState<Loja[]>([])
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [minhas, setMinhas] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idCliente) return
    const [lj, hrs, vinc] = await Promise.all([
      supabase
        .from('lojista')
        .select('id_lojista, nome_loja, logo_url, descricao, cidade, estado, telefone')
        .eq('ativo', true)
        .eq('aceita_agendamento_online', true)
        .order('nome_loja'),
      supabase.from('horario').select('id_lojista, dia_semana, hr_inicio, hr_fim, ativo'),
      supabase.from('cliente_lojista').select('id_lojista').eq('id_cliente', idCliente),
    ])
    setErro(lj.error ? 'Não foi possível carregar os petshops.' : null)
    setLojas((lj.data ?? []) as Loja[])
    setHorarios((hrs.data ?? []) as Horario[])
    setMinhas(new Set(((vinc.data ?? []) as { id_lojista: string }[]).map(v => v.id_lojista)))
    setLoading(false)
  }, [idCliente])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return lojas
      .filter(l => !termo || l.nome_loja.toLowerCase().includes(termo) || (l.cidade ?? '').toLowerCase().includes(termo))
      .sort((a, b) => Number(minhas.has(b.id_lojista)) - Number(minhas.has(a.id_lojista)) || a.nome_loja.localeCompare(b.nome_loja, 'pt-BR'))
  }, [lojas, busca, minhas])

  return (
    <ScreenContainer
      refreshing={loading}
      onRefresh={carregar}
      topo={<BarraTopo rotuloMenu="Menu" onMenu={() => router.push('/cliente/menu' as never)} />}
    >
      <Text style={styles.h1}>Petshops</Text>
      <Text style={styles.sub}>Encontre o petshop ideal para o seu pet</Text>

      <View style={{ marginVertical: spacing.lg }}>
        <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar por nome ou cidade..." />
      </View>

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {!loading && visiveis.length === 0 && !erro ? (
        <EmptyState
          icon="storefront-outline"
          ilustracao={lojas.length === 0 ? 'loja' : undefined}
          title={lojas.length === 0 ? 'Nenhum petshop disponível' : 'Nenhum petshop encontrado'}
          subtitle={lojas.length === 0 ? 'Ainda não há petshops aceitando agendamento online.' : 'Tente outro nome ou cidade.'}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {visiveis.map(l => {
            const st = statusHoje(horarios, l.id_lojista)
            const whats = linkWhatsApp(l.telefone)
            return (
              <Card key={l.id_lojista} style={{ gap: spacing.md }}>
                <View style={styles.topo}>
                  <Avatar nome={l.nome_loja} fotoUrl={l.logo_url} size={48} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.nome} numberOfLines={2}>{l.nome_loja}</Text>
                    {(l.cidade || l.estado) && <Text style={styles.texto}>{[l.cidade, l.estado].filter(Boolean).join(', ')}</Text>}
                  </View>
                </View>
                <View style={styles.selos}>
                  <View style={[styles.selo, { backgroundColor: st.aberto ? colors.successBg : colors.surfaceMuted }]}>
                    <Text style={[styles.seloTexto, { color: st.aberto ? colors.successFg : colors.textDim }]}>{st.rotulo}</Text>
                  </View>
                  {minhas.has(l.id_lojista) && (
                    <View style={[styles.selo, { backgroundColor: colors.primary50 }]}>
                      <Text style={[styles.seloTexto, { color: colors.primary700 }]}>Você já agendou aqui</Text>
                    </View>
                  )}
                </View>
                {l.descricao ? <Text style={styles.texto} numberOfLines={3}>{l.descricao}</Text> : null}
                <View style={styles.acoes}>
                  <Botao
                    rotulo="Agendar"
                    icone="calendar-outline"
                    compacto
                    style={{ flex: 1 }}
                    onPress={() => router.push({ pathname: '/cliente/agendamentos/novo', params: { loja: l.id_lojista } } as never)}
                  />
                  {whats && <Botao rotulo="WhatsApp" icone="logo-whatsapp" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Linking.openURL(whats)} />}
                </View>
              </Card>
            )
          })}
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  h1: { ...typography.heading.xl, color: colors.text },
  sub: { ...typography.body.lg, color: colors.textMuted, marginTop: 2 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  texto: { ...typography.body.md, color: colors.textMuted },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  selo: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  acoes: { flexDirection: 'row', gap: spacing.md },
})
