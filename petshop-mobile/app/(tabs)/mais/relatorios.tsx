import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { StatCard } from '@/components/StatCard'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Segmentos } from '@/components/Opcao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataBR } from '@/lib/agenda'
import { faltaMigration } from '@/lib/erros'
import { formatarMoeda } from '@/lib/format'
import { ehFormaPlano, rotuloForma } from '@/lib/pagamento'
import { PRESETS, calcularPeriodo, calcularPeriodoAnterior, variacaoPercentual, type PeriodoPreset } from '@/lib/relatorios'
import { colors, spacing, typography } from '@/theme/theme'

// As mesmas funções do relatório de vendas do painel web (migrations 016,
// 057 e 058) — só leitura, e só pra dono ou administrador.
interface Resumo {
  faturamento: number
  vendas: number
  pendente: number
  atendimentos_total: number
  valor_atendimentos_total: number
  cancelados: number
}
interface PorServico { id_servico: string; nome_servico: string; qtd_vendas: number; faturamento: number }
interface PorProfissional { id_funcionario: string | null; nome_funcionario: string; qtd_atendimentos: number; faturamento: number }
interface PorPagamento { forma: string; pedidos: number; total: number; recebido: number; pendente: number }

interface Dados {
  resumo: Resumo
  anterior: Resumo | null
  servicos: PorServico[]
  profissionais: PorProfissional[]
  pagamentos: PorPagamento[] | null
}

// NUMERIC e BIGINT chegam como texto do PostgREST.
function numeros<T extends object>(linha: T, campos: (keyof T)[]): T {
  const copia = { ...linha }
  for (const c of campos) (copia as Record<keyof T, unknown>)[c] = Number(linha[c] ?? 0)
  return copia
}

const CAMPOS_RESUMO: (keyof Resumo)[] = ['faturamento', 'vendas', 'pendente', 'atendimentos_total', 'valor_atendimentos_total', 'cancelados']

export default function RelatoriosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const [preset, setPreset] = useState<PeriodoPreset>('30dias')
  const [dados, setDados] = useState<{ preset: PeriodoPreset; valor: Dados } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const periodo = calcularPeriodo(preset)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    setLoading(true)
    setErro(null)
    const p = calcularPeriodo(preset)
    const ant = calcularPeriodoAnterior(p)
    const args = { p_id_lojista: idLojista, p_data_ini: p.ini, p_data_fim: p.fim }
    const [resumo, anterior, servicos, profissionais, pagamentos] = await Promise.all([
      supabase.rpc('fn_relatorio_vendas_resumo', args),
      supabase.rpc('fn_relatorio_vendas_resumo', { p_id_lojista: idLojista, p_data_ini: ant.ini, p_data_fim: ant.fim }),
      supabase.rpc('fn_relatorio_vendas_por_servico', args),
      supabase.rpc('fn_relatorio_vendas_por_profissional', args),
      supabase.rpc('fn_relatorio_vendas_por_pagamento', args),
    ])
    setLoading(false)
    if (resumo.error || !resumo.data) {
      setErro(faltaMigration(resumo.error) ? 'Os relatórios ainda não foram ativados no sistema da loja.' : 'Não foi possível carregar os relatórios agora.')
      return
    }
    setDados({
      preset,
      valor: {
        resumo: numeros(resumo.data as Resumo, CAMPOS_RESUMO),
        anterior: anterior.error || !anterior.data ? null : numeros(anterior.data as Resumo, CAMPOS_RESUMO),
        servicos: ((servicos.data ?? []) as PorServico[]).map(l => numeros(l, ['qtd_vendas', 'faturamento'])),
        profissionais: ((profissionais.data ?? []) as PorProfissional[]).map(l => numeros(l, ['qtd_atendimentos', 'faturamento'])),
        // Sem a migration 057 a função não existe: a seção some.
        pagamentos: pagamentos.error ? null : ((pagamentos.data ?? []) as PorPagamento[]).map(l => numeros(l, ['pedidos', 'total', 'recebido', 'pendente'])),
      },
    })
  }, [idLojista, pode, preset])

  useEffect(() => { carregar() }, [carregar])

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Relatórios" />
        <SemPermissao area="ver os relatórios" />
      </ScreenContainer>
    )
  }

  const d = dados?.preset === preset ? dados.valor : null
  const variacao = d?.anterior ? variacaoPercentual(d.resumo.faturamento, d.anterior.faturamento) : null
  const ticket = d && d.resumo.vendas > 0 ? d.resumo.faturamento / d.resumo.vendas : 0
  const maiorServico = Math.max(1, ...(d?.servicos ?? []).map(s => s.faturamento))

  return (
    <ScreenContainer refreshing={loading && !!d} onRefresh={carregar}>
      <DetailHeader title="Relatórios" />

      <Segmentos opcoes={PRESETS} valor={preset} onChange={setPreset} />
      <Text style={styles.periodo}>
        {periodo.ini === periodo.fim ? dataBR(periodo.ini) : `${dataBR(periodo.ini)} a ${dataBR(periodo.fim)}`}
      </Text>

      {erro ? (
        <Aviso tipo="erro" texto={erro} style={{ marginTop: spacing.md }} />
      ) : !d ? (
        <Text style={styles.carregando}>Carregando…</Text>
      ) : (
        <>
          <Card style={styles.destaque}>
            <Text style={styles.destaqueRotulo}>Faturamento (atendimentos finalizados)</Text>
            <Text style={styles.destaqueValor}>{formatarMoeda(d.resumo.faturamento)}</Text>
            <Text style={[styles.destaqueVar, variacao != null && { color: variacao >= 0 ? colors.successFg : colors.dangerFg }]}>
              {variacao == null
                ? 'Sem base de comparação no período anterior'
                : `${variacao >= 0 ? '+' : ''}${variacao.toFixed(1).replace('.', ',')}% em relação ao período anterior`}
            </Text>
          </Card>

          <View style={styles.statsRow}>
            <StatCard icon="checkmark-done-outline" value={d.resumo.vendas} label="Atendimentos finalizados" tint={colors.success} />
            <StatCard icon="pricetag-outline" value={formatarMoeda(ticket)} label="Ticket médio" />
          </View>
          <View style={styles.statsRow}>
            <StatCard icon="time-outline" value={formatarMoeda(d.resumo.pendente)} label="A receber (em aberto)" tint={colors.accent600} />
            <StatCard icon="close-circle-outline" value={d.resumo.cancelados} label="Cancelados" tint={colors.danger} />
          </View>

          <Text style={styles.secao}>Por serviço</Text>
          {d.servicos.length === 0 ? (
            <EmptyState icon="cut-outline" title="Nenhuma venda no período" />
          ) : (
            <Card style={styles.lista}>
              {d.servicos.map(s => (
                <View key={s.id_servico} style={{ gap: 4 }}>
                  <View style={styles.linha}>
                    <Text style={styles.linhaNome} numberOfLines={1}>{s.nome_servico}</Text>
                    <Text style={styles.linhaValor}>{formatarMoeda(s.faturamento)}</Text>
                  </View>
                  <View style={styles.barraFundo}>
                    <View style={[styles.barra, { width: `${Math.max(2, (s.faturamento / maiorServico) * 100)}%` }]} />
                  </View>
                  <Text style={styles.linhaSub}>{s.qtd_vendas} {s.qtd_vendas === 1 ? 'atendimento' : 'atendimentos'}</Text>
                </View>
              ))}
            </Card>
          )}

          {d.profissionais.length > 0 && (
            <>
              <Text style={styles.secao}>Por profissional</Text>
              <Card style={styles.lista}>
                {d.profissionais.map((p, i) => (
                  <View key={p.id_funcionario ?? `sem-${i}`} style={styles.linha}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaNome} numberOfLines={1}>{p.nome_funcionario}</Text>
                      <Text style={styles.linhaSub}>{p.qtd_atendimentos} {p.qtd_atendimentos === 1 ? 'atendimento' : 'atendimentos'}</Text>
                    </View>
                    <Text style={styles.linhaValor}>{formatarMoeda(p.faturamento)}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          {d.pagamentos && d.pagamentos.length > 0 && (
            <>
              <Text style={styles.secao}>Por forma de pagamento</Text>
              <Card style={styles.lista}>
                {d.pagamentos.map(p => (
                  <View key={p.forma} style={styles.linha}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaNome} numberOfLines={1}>{rotuloForma(p.forma)}</Text>
                      <Text style={styles.linhaSub}>
                        {ehFormaPlano(p.forma)
                          ? 'Pelo plano, sem cobrança no agendamento'
                          : `Recebido ${formatarMoeda(p.recebido)} · a receber ${formatarMoeda(p.pendente)}`}
                      </Text>
                    </View>
                    <Text style={styles.linhaValor}>{formatarMoeda(p.total)}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          <Aviso
            tipo="info"
            style={{ marginTop: spacing.xl }}
            texto="Período personalizado, gráfico por dia, clientes, planos, produtos e exportação ficam no painel web."
          />
        </>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  periodo: { ...typography.body.md, color: colors.textMuted, marginTop: spacing.sm },
  carregando: { ...typography.body.md, color: colors.textMuted, marginTop: spacing.xl, textAlign: 'center' },
  destaque: { marginTop: spacing.lg, gap: 4 },
  destaqueRotulo: { ...typography.body.md, color: colors.textMuted },
  destaqueValor: { ...typography.heading.xl, color: colors.text },
  destaqueVar: { ...typography.body.sm, color: colors.textMuted },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  lista: { gap: spacing.lg },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linhaNome: { ...typography.body.lg, fontWeight: '600', color: colors.text, flex: 1 },
  linhaValor: { ...typography.label.md, color: colors.text },
  linhaSub: { ...typography.body.sm, color: colors.textMuted },
  barraFundo: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  barra: { height: 6, borderRadius: 3, backgroundColor: colors.primary500 },
})
