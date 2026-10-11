import { useCallback, useState, type ComponentType } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { IconCalendar, IconDog, IconMoney, type IconeProps } from '@/components/IconesDoSite'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { Card } from '@/components/Card'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusAgendamentoMinimo } from '@/components/StatusAgendamentoMinimo'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataBR, hojeBrasilISO, saudacao } from '@/lib/agenda'
import { formatarMoeda } from '@/lib/format'
import type { AssinaturaDoCliente } from '@/lib/planos-cliente'
import type { StatusAgendamento } from '@/lib/statusAgendamento'
import { FONTE_TITULO } from '@/theme/fontes'
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
        <IndicadorCliente icone={IconDog} valor={totais.pets} rotulo="Pets cadastrados" />
        <IndicadorCliente icone={IconCalendar} valor={totais.agendamentos} rotulo="Agendamentos" />
      </View>
      <View style={[styles.statsRow, { marginBottom: spacing.xl }]}>
        <IndicadorCliente icone={IconMoney} valor={formatarMoeda(totais.investido)} rotulo="Total investido" />
      </View>

      {planos.length > 0 && (
        <View style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="Meus planos" actionLabel="Ver detalhes" onAction={() => router.push('/cliente/menu/planos' as never)} />
          <View style={{ gap: spacing.md }}>
            {planos.map(a => {
              const abertas = a.cobrancas.filter(c => c.status === 'pendente')
              const vencida = abertas.some(c => c.vencimento < hoje)
              const temPeriodo = !!a.periodo_atual && a.periodo_atual.beneficios.length > 0
              const total = temPeriodo ? a.periodo_atual!.beneficios.reduce((soma, b) => soma + b.quantidade, 0) : 0
              const restam = temPeriodo ? Math.max(0, total - a.periodo_atual!.beneficios.reduce((soma, b) => soma + Number(b.usados), 0)) : 0
              return (
                <Card key={a.id_assinatura} style={{ gap: 4, backgroundColor: colors.primary50, borderColor: colors.primary200 }}>
                  <Text style={styles.titulo}>{a.plano} · {a.pet ?? 'Pet'}</Text>
                  <Text style={styles.texto}>
                    {temPeriodo && (
                      <Text style={styles.destaque}>{restam} de {total} </Text>
                    )}
                    {temPeriodo
                      ? `serviço${total === 1 ? '' : 's'} ${restam === 1 ? 'restante' : 'restantes'} neste período`
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
                <StatusAgendamentoMinimo status={ag.status} />
              </Card>
            )
          })}
        </View>
      )}
    </ScreenContainer>
  )
}

// Indicador no mesmo formato do relatório de vendas do lojista (web):
// rótulo e ícone numa linha, número grande embaixo — só aqui no Início
// do cliente, por isso não fica em @/components (StatCard é a versão
// genérica, usada também pelo lojista).
function IndicadorCliente({ rotulo, valor, icone: Icone }: { rotulo: string; valor: string | number; icone: ComponentType<IconeProps> }) {
  return (
    <View style={styles.indicador}>
      <View style={styles.indicadorTopo}>
        <Text style={styles.indicadorRotulo}>{rotulo}</Text>
        <Icone size={16} color={colors.primary600} />
      </View>
      <Text style={styles.indicadorValor}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // 20 até o botão, como no site (`.dash-app-cabecalho`).
  header: { marginBottom: 20 },
  saudacao: { ...typography.heading.xl, color: colors.text },
  sub: { ...typography.body.lg, color: colors.textMuted, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  indicador: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, gap: 6,
  },
  indicadorTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  indicadorRotulo: { ...typography.body.sm, color: colors.textMuted, flexShrink: 1 },
  // peso 600 (semibold), igual ao "font-semibold" do cartão no site — o
  // heading.lg padrão do app é 700 (bold), ficava mais grosso que o site.
  indicadorValor: { ...typography.heading.lg, fontFamily: FONTE_TITULO, fontWeight: '600', color: colors.text },
  titulo: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  texto: { ...typography.body.md, color: colors.textMuted },
  destaque: { ...typography.body.md, fontWeight: '700', color: colors.primary600 },
  selo: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: 4 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dataCol: { width: 52 },
  dataDia: { ...typography.heading.sm, color: colors.text },
  divisor: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
})
