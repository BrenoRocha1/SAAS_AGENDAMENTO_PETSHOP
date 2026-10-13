import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { IconCheck } from '@/components/IconesDoSite'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Text } from '@/components/Texto'
import { chamarAcao } from '@/lib/acoes'
import { agoraBrasilHHMM, hojeBrasilISO } from '@/lib/agenda'
import { formatarMoeda } from '@/lib/format'
import { dataParaISO, horaValida, isoParaData, mascaraData, mascaraHora, numeroParaCampo, paraNumero } from '@/lib/mascaras'
import {
  ROTULO_STATUS_PROMOCAO,
  economia,
  percentualDesconto,
  periodoPromoServico,
  precoComDesconto,
  seloDesconto,
  statusPromocaoServico,
  temPromocao,
  validarPromocaoServico,
  type AgoraBrasil,
  type DadosPromocaoServico,
  type PromocaoServico,
  type StatusPromocao,
} from '@/lib/promocao'
import { colors } from '@/theme/theme'

// Promoção do serviço (migration 096) — a mesma seção "Promoção" do
// cadastro do serviço no site (PromocaoServico.tsx) e a janela que o botão
// de promoção da lista abre. Gravar passa pelas actions do site.

// O que a seção guarda enquanto a loja mexe. Datas como se digita
// ("12/10/2026") e horas "08:00".
export interface FormPromocao {
  ativa: boolean
  preco: string
  inicio: string
  horaInicio: string
  fim: string
  horaFim: string
  exibirOnline: boolean
}

export const FORM_PROMOCAO_VAZIO: FormPromocao = {
  ativa: false, preco: '', inicio: '', horaInicio: '', fim: '', horaFim: '', exibirOnline: true,
}

export function agoraBrasilPromocao(): AgoraBrasil {
  return { data: hojeBrasilISO(), hora: agoraBrasilHHMM() }
}

export function formDaPromocao(p: PromocaoServico | null | undefined, precoServico: number): FormPromocao {
  if (!p || !temPromocao(p)) return FORM_PROMOCAO_VAZIO
  const preco = p.promo_preco != null ? Number(p.promo_preco) : precoComDesconto(precoServico, Number(p.promo_percentual ?? 0))
  return {
    ativa: p.promo_ativa !== false,
    preco: numeroParaCampo(preco),
    inicio: isoParaData(p.promo_inicio),
    horaInicio: p.promo_hora_inicio?.slice(0, 5) ?? '',
    fim: isoParaData(p.promo_fim),
    horaFim: p.promo_hora_fim?.slice(0, 5) ?? '',
    exibirOnline: p.promo_exibir_online !== false,
  }
}

// Data ou hora digitada pela metade: a mensagem do que falta. null = tudo certo.
function problemaDeDigitacao(f: FormPromocao): string | null {
  if (f.inicio && !dataParaISO(f.inicio)) return 'Confira a data de início (dia/mês/ano).'
  if (f.fim && !dataParaISO(f.fim)) return 'Confira a data de encerramento (dia/mês/ano).'
  if (f.horaInicio && !horaValida(f.horaInicio)) return 'Confira a hora de início (ex.: 08:00).'
  if (f.horaFim && !horaValida(f.horaFim)) return 'Confira a hora de encerramento (ex.: 18:00).'
  return null
}

// Campos → o que a action grava. Desligada e sem preço = sem promoção.
export function dadosDoFormPromocao(f: FormPromocao): DadosPromocaoServico | null {
  if (!f.ativa && f.preco.trim() === '') return null
  const inicio = dataParaISO(f.inicio)
  const fim = dataParaISO(f.fim)
  return {
    ativa: f.ativa,
    preco: f.preco.trim() === '' ? NaN : paraNumero(f.preco),
    inicio,
    horaInicio: inicio && horaValida(f.horaInicio) ? f.horaInicio : null,
    fim,
    horaFim: fim && horaValida(f.horaFim) ? f.horaFim : null,
    exibirOnline: f.exibirOnline,
  }
}

// O primeiro problema da promoção como está nos campos (ou null).
export function problemaDoFormPromocao(f: FormPromocao, precoServico: number): string | null {
  const dados = dadosDoFormPromocao(f)
  if (!dados) return null
  return problemaDeDigitacao(f) ?? validarPromocaoServico(dados, precoServico)
}

const COR_STATUS: Record<StatusPromocao, { fundo: string; borda: string; texto: string }> = {
  sem: { fundo: colors.surface, borda: colors.borderStrong, texto: colors.textMuted },
  ativa: { fundo: colors.successBg, borda: colors.success, texto: colors.successFg },
  programada: { fundo: colors.primary50, borda: colors.primary200, texto: colors.primary600 },
  pausada: { fundo: colors.border, borda: colors.borderStrong, texto: colors.textMuted },
  encerrada: { fundo: colors.border, borda: colors.borderStrong, texto: colors.textMuted },
}

export function SeloStatusPromocao({ status }: { status: StatusPromocao }) {
  if (status === 'sem') return null
  const cor = COR_STATUS[status]
  return (
    <View style={[styles.status, { backgroundColor: cor.fundo, borderColor: cor.borda }]}>
      <Text style={[styles.statusTexto, { color: cor.texto }]}>{ROTULO_STATUS_PROMOCAO[status]}</Text>
    </View>
  )
}

// O botão de promoção de cada serviço na lista (`.promo-chip` do site).
export function BotaoPromocao({ status, selo, onPress, nome }: { status: StatusPromocao; selo: number; onPress: () => void; nome: string }) {
  const cor = COR_STATUS[status]
  const rotulo = status === 'ativa' ? `-${selo}%` : status === 'sem' ? '% Promo' : status === 'programada' ? 'Programada' : status === 'pausada' ? 'Desativada' : 'Encerrada'
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Promoção de ${nome}: ${ROTULO_STATUS_PROMOCAO[status]}`}
      style={[styles.chip, { backgroundColor: cor.fundo, borderColor: cor.borda }, status === 'sem' && styles.chipTracejado]}
    >
      <Text style={[styles.chipTexto, { color: cor.texto }]}>{rotulo}</Text>
    </Pressable>
  )
}

// Como o cliente vê o serviço no agendamento.
export function PreviaPromocao({ nome, preco, precoPromocional }: { nome: string; preco: number; precoPromocional: number }) {
  return (
    <View style={styles.previa} accessibilityLabel="Como o cliente vê">
      <View style={styles.previaSelo}><Text style={styles.previaSeloTexto}>-{seloDesconto(preco, precoPromocional)}%</Text></View>
      <Text style={styles.previaNome}>{nome || 'Nome do serviço'}</Text>
      <Text style={styles.previaPreco}><Text style={styles.riscado}>{formatarMoeda(preco)}</Text>  {formatarMoeda(precoPromocional)}</Text>
      <Text style={styles.previaEconomia}>Você economiza {formatarMoeda(economia(preco, precoPromocional))}</Text>
    </View>
  )
}

// Os campos da promoção. `preco` é o preço normal do serviço (o que está no
// formulário, quando a seção fica dentro dele).
export function PromocaoServicoCampos({ nome, preco, valor, onChange, desativado }: {
  nome: string
  preco: number
  valor: FormPromocao
  onChange: (novo: FormPromocao) => void
  desativado?: boolean
}) {
  const mudar = (parte: Partial<FormPromocao>) => onChange({ ...valor, ...parte })
  const digitouPreco = valor.preco.trim() !== ''
  const precoPromo = digitouPreco ? paraNumero(valor.preco) : NaN
  const precoValido = Number.isFinite(precoPromo) && precoPromo > 0 && precoPromo < preco
  const problema = valor.ativa && digitouPreco ? problemaDoFormPromocao(valor, preco) : null
  const dados = dadosDoFormPromocao(valor)
  const promo: PromocaoServico | null = dados && precoValido
    ? {
        promo_percentual: null, promo_preco: dados.preco, promo_inicio: dados.inicio, promo_hora_inicio: dados.horaInicio,
        promo_fim: dados.fim, promo_hora_fim: dados.horaFim, promo_ativa: dados.ativa, promo_exibir_online: dados.exibirOnline,
      }
    : null
  const status = promo ? statusPromocaoServico(promo, agoraBrasilPromocao()) : 'sem'

  return (
    <View style={styles.secao}>
      <LinhaSwitch
        titulo="Promoção"
        detalhe={valor.ativa
          ? 'O cliente vê o preço normal riscado e paga o promocional.'
          : digitouPreco ? 'Desativada — a configuração fica guardada.' : 'Destaque este serviço com um preço promocional.'}
        valor={valor.ativa}
        onChange={v => mudar({ ativa: v })}
        desativado={desativado}
      />

      {valor.ativa && (
        <>
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Preço normal</Text>
            <View style={styles.somenteLeitura}><Text style={styles.somenteLeituraTexto}>{preco > 0 ? formatarMoeda(preco) : '—'}</Text></View>
          </View>
          <Campo rotulo="Preço promocional (R$)" obrigatorio value={valor.preco} onChangeText={t => mudar({ preco: t })} keyboardType="decimal-pad" placeholder="79,90" maxLength={10} editable={!desativado} />

          {problema ? (
            <Text style={[styles.conta, styles.contaErro]} accessibilityRole="alert">{problema}</Text>
          ) : precoValido ? (
            <Text style={styles.conta}>
              Desconto de <Text style={styles.contaForte}>{percentualDesconto(preco, precoPromo)}%</Text> · o cliente economiza <Text style={styles.contaForte}>{formatarMoeda(economia(preco, precoPromo))}</Text>
            </Text>
          ) : (
            <Text style={[styles.conta, styles.contaApagada]}>O desconto e a economia aparecem aqui quando você informar o preço promocional.</Text>
          )}

          <View style={styles.dataHora}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Início" opcional value={valor.inicio} onChangeText={t => mudar({ inicio: mascaraData(t), horaInicio: t ? valor.horaInicio : '' })} keyboardType="number-pad" placeholder="dd/mm/aaaa" maxLength={10} editable={!desativado} />
            </View>
            <View style={styles.hora}>
              <Campo rotulo="Hora" value={valor.horaInicio} onChangeText={t => mudar({ horaInicio: mascaraHora(t) })} keyboardType="number-pad" placeholder="00:00" maxLength={5} editable={!desativado && !!valor.inicio} accessibilityLabel="Hora de início" />
            </View>
          </View>
          <View style={styles.dataHora}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Encerramento" opcional value={valor.fim} onChangeText={t => mudar({ fim: mascaraData(t), horaFim: t ? valor.horaFim : '' })} keyboardType="number-pad" placeholder="dd/mm/aaaa" maxLength={10} editable={!desativado} />
            </View>
            <View style={styles.hora}>
              <Campo rotulo="Hora" value={valor.horaFim} onChangeText={t => mudar({ horaFim: mascaraHora(t) })} keyboardType="number-pad" placeholder="23:59" maxLength={5} editable={!desativado && !!valor.fim} accessibilityLabel="Hora de encerramento" />
            </View>
          </View>
          <Text style={styles.ajuda}>
            Sem datas, a promoção vale a partir de agora e até você desativar. Sem hora, vale o dia inteiro. Os preços por porte ou raça levam o mesmo desconto.
          </Text>

          <Pressable
            onPress={() => mudar({ exibirOnline: !valor.exibirOnline })}
            disabled={desativado}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: valor.exibirOnline }}
            style={styles.check}
          >
            <View style={[styles.caixa, valor.exibirOnline && styles.caixaMarcada]}>{valor.exibirOnline && <IconCheck size={12} color={colors.white} />}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.checkTitulo}>Oferecer no agendamento online</Text>
              <Text style={styles.checkDetalhe}>Desmarcada, a promoção não aparece para o cliente e vale só nos agendamentos feitos pela loja.</Text>
            </View>
          </Pressable>

          {precoValido && !problema && (
            <View style={styles.previaBloco}>
              <View style={styles.previaTopo}>
                <Text style={styles.previaTitulo}>{valor.exibirOnline ? 'Como o cliente vê' : 'Como fica no agendamento feito pela loja'}</Text>
                <SeloStatusPromocao status={status} />
              </View>
              <PreviaPromocao nome={nome} preco={preco} precoPromocional={precoPromo} />
              {promo && (promo.promo_inicio || promo.promo_fim) && <Text style={styles.ajuda}>{periodoPromoServico(promo)}</Text>}
            </View>
          )}
        </>
      )}
    </View>
  )
}

// Janela aberta pelo botão de promoção da lista de serviços.
export function FolhaPromocaoServico({ servico, onFechar, onSalvo }: {
  servico: ({ id_servico: string; nome: string; preco: number } & PromocaoServico) | null
  onFechar: () => void
  onSalvo: () => void
}) {
  // A janela é montada de novo a cada serviço (a `key` é o id): os campos
  // começam com a promoção dele.
  return (
    <Folha visivel={!!servico} titulo={servico ? `Promoção · ${servico.nome}` : 'Promoção'} onFechar={onFechar}>
      {servico && <ConteudoDaFolha key={servico.id_servico} servico={servico} onFechar={onFechar} onSalvo={onSalvo} />}
    </Folha>
  )
}

function ConteudoDaFolha({ servico, onFechar, onSalvo }: {
  servico: { id_servico: string; nome: string; preco: number } & PromocaoServico
  onFechar: () => void
  onSalvo: () => void
}) {
  const jaTinha = temPromocao(servico)
  const [form, setForm] = useState<FormPromocao>(() => {
    const inicial = formDaPromocao(servico, servico.preco)
    // Abrir a janela num serviço sem promoção é para criar uma.
    return jaTinha ? inicial : { ...inicial, ativa: true }
  })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const dados = dadosDoFormPromocao(form)

  async function gravar(d: DadosPromocaoServico | null) {
    if (d) {
      const problema = problemaDoFormPromocao(form, servico.preco)
      if (problema) return setErro(problema)
    }
    setErro(null)
    setSalvando(true)
    const r = await chamarAcao('salvarPromocaoServicoAction', servico.id_servico, d)
    setSalvando(false)
    if (r.error) return setErro(r.error)
    onSalvo()
  }

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <PromocaoServicoCampos nome={servico.nome} preco={servico.preco} valor={form} onChange={setForm} desativado={salvando} />
      <View style={styles.rodape}>
        <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : 'Salvar promoção'} desativado={salvando || (!dados && !jaTinha)} onPress={() => gravar(dados)} />
        <BotaoPequeno normal rotulo="Cancelar" desativado={salvando} onPress={onFechar} />
        {jaTinha && <BotaoPequeno normal variante="perigoClaro" rotulo="Remover promoção" desativado={salvando} onPress={() => gravar(null)} />}
      </View>
    </>
  )
}

// Medidas de `promocao.css` do site em 375 de largura.
const styles = StyleSheet.create({
  secao: { gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  somenteLeitura: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.border },
  somenteLeituraTexto: { fontSize: 15, lineHeight: 20, color: colors.textMuted },
  conta: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  contaForte: { fontWeight: '700', color: colors.successFg },
  contaErro: { fontWeight: '500', color: colors.dangerFg },
  contaApagada: { color: '#858d99' },
  dataHora: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  hora: { width: 104 },
  ajuda: { fontSize: 13, lineHeight: 19, color: '#858d99' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  caixa: { width: 18, height: 18, marginTop: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.textFaint, borderRadius: 4 },
  caixaMarcada: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  checkTitulo: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  checkDetalhe: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  status: { height: 22, paddingHorizontal: 8, borderRadius: 11, borderWidth: 1, justifyContent: 'center' },
  statusTexto: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  chip: { height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  chipTracejado: { borderStyle: 'dashed' },
  chipTexto: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  previaBloco: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  previaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  previaTitulo: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textMuted },
  previa: { alignItems: 'flex-start', gap: 2, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.successBg, borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.35)' },
  previaSelo: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, marginBottom: 4, backgroundColor: colors.success },
  previaSeloTexto: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: colors.white },
  previaNome: { fontSize: 15, lineHeight: 19.5, fontWeight: '700', color: colors.text },
  previaPreco: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  riscado: { fontSize: 13, fontWeight: '500', color: '#858d99', textDecorationLine: 'line-through' },
  previaEconomia: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.successFg },
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
