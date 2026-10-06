import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { Card } from '@/components/Card'
import { StatCard } from '@/components/StatCard'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataBR, hojeBrasilISO, saudacao } from '@/lib/agenda'
import { formatarMoeda } from '@/lib/format'
import type { AssinaturaDoCliente } from '@/lib/planos-cliente'
import type { StatusAgendamento } from '@/lib/statusAgendamento'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Proximo {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: StatusAgendamento
  pet: { nome: string } | null
  servico: { nome: string } | null
  lojista: { nome_loja: string } | null
}

// Início do cliente — o mesmo resumo do painel web (/cliente/dashboard):
// pets, agendamentos, quanto já investiu, os planos e o que vem pela frente.
export default function InicioClienteScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const idCliente = user?.id
  const [nome, setNome] = useState('')
  const [proximos, setProximos] = useState<Proximo[]>([])
  const [totais, setTotais] = useState({ pets: 0, agendamentos: 0, investido: 0 })
  const [planos, setPlanos] = useState<AssinaturaDoCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const hoje = hojeBrasilISO()

  const carregar = useCallback(async () => {
    if (!idCliente) return
    const [cliente, ags, pets, totalAgs, concluidos, planosRes] = await Promise.all([
      supabase.from('cliente').select('nome').eq('id_cliente', idCliente).maybeSingle(),
      supabase
        .from('agendamento')
        .select(`
          id_agendamento, dt_agendamento, hr_agendamento, status,
          pet:id_pet ( nome ),
          servico:id_servico ( nome ),
          lojista:id_lojista ( nome_loja )
        `)
        .eq('id_cliente', idCliente)
        .gte('dt_agendamento', hojeBrasilISO())
        // Só o que ainda vai acontecer: finalizado ou cancelado não é "próximo".
        .in('status', ['Pendente', 'Confirmado', 'Em andamento'])
        .order('dt_agendamento')
        .order('hr_agendamento')
        .limit(5),
      supabase.from('pet').select('id_pet', { count: 'exact', head: true }).eq('id_cliente', idCliente).eq('ativo', true),
      supabase.from('agendamento').select('id_agendamento', { count: 'exact', head: true }).eq('id_cliente', idCliente),
      supabase.from('agendamento').select('valor').eq('id_cliente', idCliente).eq('status', 'Concluído'),
      // Planos dos pets (migration 068) — sem ela, o cartão não aparece.
      supabase.rpc('fn_meus_planos'),
    ])
    setErro(ags.error ? 'Não foi possível carregar os seus agendamentos.' : null)
    setNome(((cliente.data as { nome: string } | null)?.nome ?? '').split(' ')[0])
    setProximos((ags.data ?? []) as unknown as Proximo[])
    setTotais({
      pets: pets.count ?? 0,
      agendamentos: totalAgs.count ?? 0,
      investido: ((concluidos.data ?? []) as { valor: number }[]).reduce((soma, a) => soma + Number(a.valor ?? 0), 0),
    })
    setPlanos(planosRes.error ? [] : ((planosRes.data ?? []) as AssinaturaDoCliente[]).filter(a => a.status === 'ativa'))
    setLoading(false)
  }, [idCliente])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  return (
    <ScreenContainer
      refreshing={loading}
      onRefresh={carregar}
      topo={<BarraTopo rotuloMenu="Menu" onMenu={() => router.push('/cliente/menu' as never)} />}
    >
      <View style={styles.header}>
        <Text style={styles.saudacao}>{saudacao()}{nome ? `, ${nome}` : ''}!</Text>
        <Text style={styles.sub}>Aqui está um resumo da sua conta</Text>
      </View>

      <Botao rotulo="Novo agendamento" icone="add" onPress={() => router.push('/cliente/agendamentos/novo' as never)} style={{ marginBottom: spacing.lg }} />

      <View style={styles.statsRow}>
        <StatCard icon="paw-outline" value={totais.pets} label="Pets cadastrados" />
        <StatCard icon="calendar-outline" value={totais.agendamentos} label="Agendamentos" tint={colors.info} />
      </View>
      <View style={[styles.statsRow, { marginBottom: spacing.xl }]}>
        <StatCard icon="cash-outline" value={formatarMoeda(totais.investido)} label="Total investido" tint={colors.success} />
      </View>

      {planos.length > 0 && (
        <View style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="Meus planos" actionLabel="Ver detalhes" onAction={() => router.push('/cliente/menu/planos' as never)} />
          <View style={{ gap: spacing.md }}>
            {planos.map(a => {
              const abertas = a.cobrancas.filter(c => c.status === 'pendente')
              const vencida = abertas.some(c => c.vencimento < hoje)
              return (
                <Card key={a.id_assinatura} style={{ gap: 4 }}>
                  <Text style={styles.titulo}>{a.plano} · {a.pet ?? 'Pet'}</Text>
                  <Text style={styles.texto}>
                    {a.periodo_atual && a.periodo_atual.beneficios.length > 0
                      ? a.periodo_atual.beneficios.map(b => {
                          const restam = Math.max(0, b.quantidade - Number(b.usados))
                          return `${b.servico}: ${restam} de ${b.quantidade} ${b.quantidade === 1 ? 'restante' : 'restantes'}`
                        }).join(' · ')
                      : `Começa em ${dataBR(a.data_inicio)}`}
                    {a.proxima_cobranca ? ` · renova em ${dataBR(a.proxima_cobranca)}` : ''}
                  </Text>
                  {abertas.length > 0 && (
                    <View style={[styles.selo, { backgroundColor: vencida ? colors.dangerBg : colors.warningBg }]}>
                      <Text style={[styles.seloTexto, { color: vencida ? colors.dangerFg : colors.warningFg }]}>
                        {vencida ? 'Cobrança vencida' : 'Cobrança em aberto'}
                      </Text>
                    </View>
                  )}
                </Card>
              )
            })}
          </View>
        </View>
      )}

      <SectionHeader title="Próximos agendamentos" actionLabel="Ver todos" onAction={() => router.push('/cliente/agendamentos' as never)} />
      {erro ? (
        <Aviso tipo="erro" texto={erro} />
      ) : proximos.length === 0 && !loading ? (
        <EmptyState icon="calendar-outline" ilustracao="agendar" title="Nenhum agendamento próximo" subtitle="Que tal agendar um serviço para o seu pet?" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {proximos.map(ag => {
            const [, mes, dia] = ag.dt_agendamento.split('-')
            return (
              <Card key={ag.id_agendamento} style={styles.item} onPress={() => router.push('/cliente/agendamentos' as never)}>
                <View style={styles.dataCol}>
                  <Text style={styles.dataDia}>{dia}/{mes}</Text>
                  <Text style={styles.texto}>{ag.hr_agendamento.slice(0, 5)}</Text>
                </View>
                <View style={styles.divisor} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.titulo} numberOfLines={1}>{ag.servico?.nome ?? 'Serviço'}</Text>
                  <Text style={styles.texto} numberOfLines={1}>{ag.pet?.nome ?? 'Pet'} · {ag.lojista?.nome_loja ?? ''}</Text>
                </View>
                <StatusBadge status={ag.status} />
              </Card>
            )
          })}
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  saudacao: { ...typography.heading.xl, color: colors.text },
  sub: { ...typography.body.lg, color: colors.textMuted, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  titulo: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  texto: { ...typography.body.md, color: colors.textMuted },
  selo: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: 4 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dataCol: { width: 52 },
  dataDia: { ...typography.heading.sm, color: colors.text },
  divisor: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
})
