import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Segmentos } from '@/components/Opcao'
import { supabase } from '@/lib/supabase'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import { faltaMigration } from '@/lib/erros'
import { formatarMoeda, linkWhatsApp } from '@/lib/format'
import { normalizarFormasLoja, rotuloForma } from '@/lib/pagamento'
import { ROTULO_STATUS_COBRANCA, statusCobrancaExibido, sufixoPeriodo } from '@/lib/planos'
import type { AssinaturaDoCliente } from '@/lib/planos-cliente'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Planos dos pets do cliente (fn_meus_planos, migration 068): o que cada
// um cobre, quanto já usou no período, as cobranças e os usos. O cliente
// só consulta — quem vincula, cobra e cancela é a loja.
export default function PlanosClienteScreen() {
  const [planos, setPlanos] = useState<AssinaturaDoCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const hoje = hojeBrasilISO()

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_meus_planos')
    if (error) setErro(faltaMigration(error) ? 'Os planos ainda não foram ativados no sistema.' : 'Não foi possível carregar os seus planos.')
    else {
      setErro(null)
      setPlanos(((data ?? []) as AssinaturaDoCliente[]).map(a => ({ ...a, valor: Number(a.valor) })))
    }
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Meus planos" />
      {erro && <Aviso tipo="alerta" texto={erro} />}
      {!loading && !erro && planos.length === 0 ? (
        <EmptyState icon="ribbon-outline" ilustracao="planos" title="Você ainda não tem plano" subtitle="Os planos são contratados na loja. Quando um pet seu tiver plano, ele aparece aqui." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {planos.map(a => <PlanoCard key={a.id_assinatura} a={a} hoje={hoje} />)}
        </View>
      )}
    </ScreenContainer>
  )
}

function PlanoCard({ a, hoje }: { a: AssinaturaDoCliente; hoje: string }) {
  const [aba, setAba] = useState<'cobrancas' | 'usos'>('cobrancas')
  const ativa = a.status === 'ativa'
  const abertas = a.cobrancas.filter(c => c.status === 'pendente')
  const vencidas = abertas.filter(c => c.vencimento < hoje)
  const formas = normalizarFormasLoja(a.formas_loja)
  const usosValidos = a.utilizacoes.filter(u => !u.estornada_em)
  const whats = linkWhatsApp(a.loja_telefone)

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.linha}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.titulo, !ativa && styles.apagado]}>{a.plano}</Text>
          <Text style={styles.texto}>{a.pet ?? 'Pet removido'} · {a.loja}</Text>
        </View>
        <View style={[styles.selo, { backgroundColor: ativa ? colors.successBg : colors.surfaceMuted }]}>
          <Text style={[styles.seloTexto, { color: ativa ? colors.successFg : colors.textDim }]}>{ativa ? 'Ativo' : 'Cancelado'}</Text>
        </View>
      </View>

      <Text style={styles.textoPequeno}>
        {formatarMoeda(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)} · desde {dataBR(a.data_inicio)}
        {a.forma_pagamento ? ` · ${rotuloForma(a.forma_pagamento)}` : ''}
      </Text>
      {a.descricao ? <Text style={styles.texto}>{a.descricao}</Text> : null}

      {ativa && a.periodo_atual && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.rotulo}>Neste período ({dataBR(a.periodo_atual.inicio)} a {dataBR(a.periodo_atual.fim)})</Text>
          {a.periodo_atual.beneficios.map(b => {
            const usados = Number(b.usados)
            const proporcao = b.quantidade > 0 ? Math.min(1, usados / b.quantidade) : 0
            return (
              <View key={b.servico} style={{ gap: 4 }}>
                <View style={styles.linha}>
                  <Text style={[styles.texto, { flex: 1 }]}>{b.servico}</Text>
                  <Text style={styles.textoPequeno}>{usados} de {b.quantidade} usados</Text>
                </View>
                <View style={styles.barraFundo}>
                  <View style={[styles.barra, { width: `${proporcao * 100}%` }]} />
                </View>
              </View>
            )
          })}
          <Text style={styles.textoPequeno}>
            Para usar, agende o serviço pelo app: o saldo do plano já entra no agendamento, sem cobrar o serviço.
            {a.proxima_cobranca ? ` Renova em ${dataBR(a.proxima_cobranca)}.` : ''}
          </Text>
        </View>
      )}
      {ativa && !a.periodo_atual && <Text style={styles.texto}>Começa em {dataBR(a.data_inicio)}.</Text>}
      {!ativa && a.cancelada_em && <Text style={styles.texto}>Cancelado em {dataBR(a.cancelada_em.slice(0, 10))}.</Text>}

      {abertas.length > 0 && (
        <Aviso
          tipo={vencidas.length > 0 ? 'erro' : 'alerta'}
          texto={`${abertas.map(c => `Cobrança de ${formatarMoeda(Number(c.valor))} ${c.vencimento < hoje ? 'vencida em' : 'vence em'} ${dataBR(c.vencimento)}`).join('. ')}. Pague na loja${formas.pix && formas.pix_chave ? ' ou pelo Pix abaixo' : ''}. A loja confirma o pagamento.`}
        />
      )}
      {abertas.length > 0 && formas.pix && formas.pix_chave && (
        <View style={styles.pix}>
          <Text style={styles.textoPequeno}>Chave Pix da loja{formas.pix_nome ? ` (${formas.pix_nome})` : ''}</Text>
          <Text style={styles.titulo} selectable>{formas.pix_chave}</Text>
        </View>
      )}

      <Segmentos
        valor={aba}
        onChange={setAba}
        opcoes={[{ valor: 'cobrancas', rotulo: `Cobranças (${a.cobrancas.length})` }, { valor: 'usos', rotulo: `Usos (${usosValidos.length})` }]}
      />

      {aba === 'cobrancas' && (
        a.cobrancas.length === 0 ? <Text style={styles.texto}>Sem cobranças ainda.</Text> : a.cobrancas.map(c => {
          const st = statusCobrancaExibido(c.status, c.vencimento, hoje)
          return (
            <View key={c.id_cobranca} style={styles.linha}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.texto}>{formatarMoeda(Number(c.valor))} · vence {dataBR(c.vencimento)}</Text>
                <Text style={styles.textoPequeno}>
                  Período {c.numero}{c.pago_em ? ` · pago em ${dataBR(c.pago_em.slice(0, 10))}` : ''}
                </Text>
              </View>
              <Text style={[styles.textoPequeno, st === 'vencido' && { color: colors.dangerFg }, st === 'pago' && { color: colors.successFg }]}>
                {ROTULO_STATUS_COBRANCA[st]}
              </Text>
            </View>
          )
        })
      )}

      {aba === 'usos' && (
        a.utilizacoes.length === 0 ? <Text style={styles.texto}>Nenhum serviço do plano usado ainda.</Text> : a.utilizacoes.map((u, i) => (
          <View key={i} style={{ gap: 2 }}>
            <Text style={[styles.texto, u.estornada_em ? styles.riscado : null]}>
              {u.servico}{u.data ? ` · ${dataBR(u.data)}` : ''}{u.hora ? ` às ${u.hora.slice(0, 5)}` : ''}
            </Text>
            <Text style={styles.textoPequeno}>
              Período {u.periodo}{u.estornada_em ? ` · devolvido ao plano em ${dataBR(u.estornada_em.slice(0, 10))}` : ''}
            </Text>
          </View>
        ))
      )}

      {whats && <Botao rotulo="Falar com a loja" icone="logo-whatsapp" variante="secundario" compacto onPress={() => Linking.openURL(whats)} />}
    </Card>
  )
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titulo: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  apagado: { color: colors.textMuted },
  rotulo: { ...typography.label.md, color: colors.textDim },
  texto: { ...typography.body.md, color: colors.textDim },
  textoPequeno: { ...typography.body.sm, color: colors.textMuted },
  riscado: { textDecorationLine: 'line-through', color: colors.textMuted },
  selo: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  barraFundo: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  barra: { height: 6, borderRadius: 3, backgroundColor: colors.primary500 },
  pix: { gap: 2, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md },
})
