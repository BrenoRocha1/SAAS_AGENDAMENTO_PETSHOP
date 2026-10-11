import { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { Folha, depoisDeFechar } from '@/components/Folha'
import { IconCheck, IconClose, IconPlus, IconWhatsapp } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { chamarAcao } from '@/lib/acoes'
import {
  carregarAdicionaisDoAtendimento,
  linkWhatsappCliente,
  rotuloOrigemAdicional,
  type AdicionaisDoAtendimento,
  type AdicionalDoAgendamento,
  type ResultadoInclusao,
} from '@/lib/adicionais'
import { formatarMoeda } from '@/lib/format'
import { colors } from '@/theme/theme'

function quando(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface Props {
  idAgendamento: string
  idLojista: string
  status: string
  // Tem a permissão da agenda e o site está configurado (gravar passa por ele).
  podeAlterar: boolean
  // Depois de incluir ou remover, a tela relê o agendamento (o valor mudou).
  onMudou: () => void
}

const ABERTOS = ['Pendente', 'Confirmado', 'Em andamento']

// Bloco "Serviços adicionais" do detalhe do agendamento — o mesmo do site
// (AdicionaisAgendamento): o que já foi cobrado a mais neste atendimento, o
// botão de incluir e, depois de incluir, o resumo com a mensagem pronta
// para o cliente. Sem a migration 095 (ou sem nada a mostrar), não aparece.
export function AdicionaisAgendamento({ idAgendamento, idLojista, status, podeAlterar, onMudou }: Props) {
  const alteravel = podeAlterar && ABERTOS.includes(status)
  const [info, setInfo] = useState<AdicionaisDoAtendimento | null>(null)
  const [versao, setVersao] = useState(0)

  const [incluindo, setIncluindo] = useState(false)
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [resultado, setResultado] = useState<ResultadoInclusao & { error?: string } | null>(null)
  const [mensagem, setMensagem] = useState('')

  const [removendo, setRemovendo] = useState<AdicionalDoAgendamento | null>(null)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    setInfo(await carregarAdicionaisDoAtendimento(idAgendamento, idLojista, alteravel))
  }, [idAgendamento, idLojista, alteravel])

  useEffect(() => { carregar() }, [carregar, versao])

  if (!info) return null
  const ativos = info.itens.filter(i => i.status === 'ativo')
  const removidos = info.itens.filter(i => i.status === 'removido')
  const podeIncluir = alteravel && info.disponiveis.length > 0
  if (info.itens.length === 0 && !podeIncluir) return null

  const acrescimo = info.disponiveis.filter(a => escolhidos.includes(a.id_adicional)).reduce((s, a) => s + a.preco, 0)

  function mudou() {
    setVersao(v => v + 1)
    onMudou()
  }

  function abrirInclusao() {
    setErro(null)
    setObservacao('')
    setEscolhidos(info!.disponiveis.length === 1 ? [info!.disponiveis[0].id_adicional] : [])
    setIncluindo(true)
  }

  async function confirmarInclusao() {
    setErro(null)
    setOcupado(true)
    const r = await chamarAcao<ResultadoInclusao>('incluirAdicionaisAction', idAgendamento, escolhidos, observacao.trim() || null, info!.pago)
    setOcupado(false)
    // Nada entrou: o erro fica na janela. Se parte entrou, segue para o
    // resumo, que mostra o que entrou e o que deu errado.
    if (!r.incluidos?.length) return setErro(r.error ?? 'Não foi possível incluir o serviço adicional.')
    setIncluindo(false)
    mudou()
    depoisDeFechar(() => {
      setMensagem(r.aviso?.mensagem ?? '')
      setResultado(r)
    })
  }

  async function confirmarRemocao() {
    if (!removendo) return
    setErro(null)
    setOcupado(true)
    const r = await chamarAcao('removerAdicionalAction', removendo.id_agendamento_adicional, motivo.trim() || null, info!.pago)
    setOcupado(false)
    if (r.error) return setErro(r.error)
    setRemovendo(null)
    mudou()
  }

  const aviso = resultado?.aviso
  const link = aviso ? linkWhatsappCliente(aviso.telefoneCliente, mensagem) : null
  const novos = resultado?.incluidos ?? []

  return (
    <View style={styles.bloco}>
      <View style={styles.topo}>
        <View style={styles.tituloLinha}>
          <IconPlus size={14} color={colors.primary400} />
          <Text style={styles.titulo}>Serviços adicionais</Text>
        </View>
        {podeIncluir && <BotaoPequeno icone={IconPlus} rotulo="Adicionar" onPress={abrirInclusao} />}
      </View>

      {info.itens.length === 0 ? (
        <Text style={styles.apoio}>Nenhuma cobrança extra neste atendimento.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {ativos.map(i => (
            <View key={i.id_agendamento_adicional} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemNome}>{i.nome}</Text>
                <Text style={styles.apoio}>{rotuloOrigemAdicional(i)} · {quando(i.created_at)}</Text>
                {i.observacao ? <Text style={styles.apoio}>Motivo: {i.observacao}</Text> : null}
              </View>
              <Text style={styles.itemValor}>{formatarMoeda(i.valor_total)}</Text>
              {alteravel && (
                <Pressable onPress={() => { setErro(null); setMotivo(''); setRemovendo(i) }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remover ${i.nome}`} style={styles.remover}>
                  <IconClose size={14} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          ))}
          {removidos.map(i => (
            <View key={i.id_agendamento_adicional} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemNome, styles.riscado]}>{i.nome}</Text>
                <Text style={styles.apoio}>
                  Removido{i.nome_removido_por ? ` por ${i.nome_removido_por}` : ' pela loja'}{i.removido_em ? ` · ${quando(i.removido_em)}` : ''}
                </Text>
                {i.motivo_remocao ? <Text style={styles.apoio}>Motivo: {i.motivo_remocao}</Text> : null}
              </View>
              <Text style={[styles.itemValor, styles.riscado]}>{formatarMoeda(i.valor_total)}</Text>
            </View>
          ))}
        </View>
      )}

      {ativos.length > 0 && (
        <View style={styles.contas}>
          <LinhaConta rotulo="Valor sem os adicionais" valor={formatarMoeda(Math.max(0, info.valor - info.totalAdicionais))} />
          <LinhaConta rotulo="Subtotal dos adicionais" valor={formatarMoeda(info.totalAdicionais)} />
          <View style={styles.contasTraco} />
          <LinhaConta rotulo="Valor total atualizado" valor={formatarMoeda(info.valor)} forte />
        </View>
      )}

      {/* Adicionar serviço adicional */}
      <Folha visivel={incluindo} titulo="Adicionar serviço adicional" onFechar={() => setIncluindo(false)} ocupado={ocupado}>
        {erro && <Aviso tipo="erro" texto={erro} />}
        {info.pago && <Aviso tipo="alerta" texto="Este atendimento está marcado como pago. Ao incluir a cobrança, o pagamento volta para pendente, para você receber a diferença." />}
        <View style={{ gap: 8 }}>
          {info.disponiveis.map(a => {
            const marcado = escolhidos.includes(a.id_adicional)
            return (
              <Pressable
                key={a.id_adicional}
                onPress={() => setEscolhidos(e => (e.includes(a.id_adicional) ? e.filter(x => x !== a.id_adicional) : [...e, a.id_adicional]))}
                disabled={ocupado}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marcado }}
                style={[styles.opcao, marcado && styles.opcaoAtiva]}
              >
                <View style={[styles.caixa, marcado && styles.caixaAtiva]}>{marcado && <IconCheck size={12} color={colors.white} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcaoNome}>{a.nome}</Text>
                  {a.descricao ? <Text style={styles.opcaoDesc}>{a.descricao}</Text> : null}
                </View>
                <Text style={styles.opcaoPreco}>+ {formatarMoeda(a.preco)}</Text>
              </Pressable>
            )
          })}
        </View>
        <Campo rotulo="Motivo ou observação" opcional value={observacao} onChangeText={setObservacao} placeholder="Ex: o pelo está com nós que exigem tempo adicional de desembolo." maxLength={500} multiline />
        <View style={styles.total}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalRotulo}>Total do atendimento</Text>
            <Text style={styles.apoio}>{formatarMoeda(info.valor)} + {formatarMoeda(acrescimo)} de adicional</Text>
          </View>
          <Text style={styles.totalValor}>{formatarMoeda(info.valor + acrescimo)}</Text>
        </View>
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo={ocupado ? 'Incluindo...' : info.pago ? 'Incluir e voltar para pendente' : 'Confirmar inclusão'} desativado={ocupado || escolhidos.length === 0} onPress={confirmarInclusao} />
          <BotaoPequeno normal rotulo="Cancelar" desativado={ocupado} onPress={() => setIncluindo(false)} />
        </View>
      </Folha>

      {/* Valor do atendimento atualizado — avisar o cliente */}
      <Folha visivel={!!resultado} titulo="Valor do atendimento atualizado" onFechar={() => setResultado(null)}>
        {resultado?.error && <Aviso tipo="erro" texto={`Nem tudo entrou: ${resultado.error}`} />}
        <Text style={styles.texto}>
          {novos.length > 1 ? 'Os serviços adicionais foram incluídos' : 'O serviço adicional foi incluído'} e o valor total do atendimento foi alterado.
          {resultado?.pagamentoReaberto ? ' O pagamento voltou para pendente.' : ''} Deseja avisar o cliente pelo WhatsApp?
        </Text>
        <View style={styles.resumo}>
          {aviso?.nomePet ? <LinhaResumo rotulo="Pet" valor={aviso.nomePet} /> : null}
          {aviso ? <LinhaResumo rotulo="Serviço principal" valor={`${aviso.nomeServico} — ${formatarMoeda(aviso.valorServico)}`} /> : null}
          {novos.map((n, i) => <LinhaResumo key={i} rotulo="Serviço adicional" valor={`${n.nome} — ${formatarMoeda(n.preco)}`} />)}
          <LinhaResumo rotulo="Valor anterior" valor={formatarMoeda(resultado?.valorAnterior ?? 0)} />
          <LinhaResumo rotulo="Valor atualizado" valor={formatarMoeda(resultado?.valorNovo ?? 0)} destaque />
        </View>
        {aviso && (
          <>
            <Campo rotulo={`Mensagem para ${aviso.nomeCliente?.split(' ')[0] ?? 'o cliente'}`} value={mensagem} onChangeText={setMensagem} multiline />
            <Text style={[styles.apoio, !link && { color: colors.dangerFg }]}>
              {link
                ? 'O WhatsApp abre na conversa com o cliente, com este texto pronto para você conferir e enviar. O SAIP não envia a mensagem sozinho nem registra se ela foi enviada.'
                : 'Este cliente não tem telefone cadastrado, então não dá para abrir a conversa por aqui.'}
            </Text>
          </>
        )}
        <View style={styles.rodape}>
          {link && (
            <BotaoPequeno
              normal
              variante="sucesso"
              icone={IconWhatsapp}
              rotulo="Enviar mensagem pelo WhatsApp"
              desativado={!mensagem.trim()}
              onPress={() => { Linking.openURL(link); setResultado(null) }}
            />
          )}
          <BotaoPequeno normal rotulo="Agora não" onPress={() => setResultado(null)} />
        </View>
      </Folha>

      {/* Remover cobrança */}
      <Folha visivel={!!removendo} titulo="Remover cobrança" onFechar={() => setRemovendo(null)} ocupado={ocupado}>
        {erro && <Aviso tipo="erro" texto={erro} />}
        {removendo && (
          <Text style={styles.texto}>
            Remover <Text style={styles.forte}>{removendo.nome}</Text>? O total do atendimento passa de {formatarMoeda(info.valor)} para{' '}
            <Text style={styles.forte}>{formatarMoeda(Math.max(0, info.valor - removendo.valor_total))}</Text>. A cobrança fica no histórico como removida.
            {info.pago ? ' O atendimento está marcado como pago: ao remover, o pagamento volta para pendente.' : ''}
          </Text>
        )}
        <Campo rotulo="Motivo" opcional value={motivo} onChangeText={setMotivo} maxLength={500} />
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="perigo" rotulo={ocupado ? 'Removendo...' : info.pago ? 'Remover e voltar para pendente' : 'Remover cobrança'} desativado={ocupado} onPress={confirmarRemocao} />
          <BotaoPequeno normal rotulo="Cancelar" desativado={ocupado} onPress={() => setRemovendo(null)} />
        </View>
      </Folha>
    </View>
  )
}

function LinhaConta({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <View style={styles.entre}>
      <Text style={[styles.conta, forte && styles.contaForte]}>{rotulo}</Text>
      <Text style={[styles.conta, forte && styles.contaForte]}>{valor}</Text>
    </View>
  )
}

function LinhaResumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <View style={[styles.resumoLinha, destaque && styles.resumoDestaque]}>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
      <Text style={[styles.resumoValor, destaque && styles.resumoValorDestaque]}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // `.adic-bloco` do site em 375 de largura.
  bloco: { gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#1f2937' },
  apoio: { fontSize: 12, lineHeight: 16.8, color: '#858d99' },
  texto: { fontSize: 14, lineHeight: 20, color: colors.textDim },
  forte: { fontWeight: '700', color: colors.text },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemNome: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  itemValor: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  riscado: { fontWeight: '500', textDecorationLine: 'line-through', color: '#858d99' },
  remover: { width: 26, height: 26, marginTop: -3, alignItems: 'center', justifyContent: 'center' },
  contas: { gap: 2, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.bg },
  contasTraco: { height: 1, marginTop: 2, marginBottom: 2, backgroundColor: colors.border },
  entre: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  conta: { fontSize: 13, lineHeight: 19.5, color: colors.textMuted },
  contaForte: { fontWeight: '700', color: colors.text },
  // `.adic-opcao`
  opcao: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11.2, paddingHorizontal: 13.6, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 8 },
  opcaoAtiva: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.08)' },
  caixa: { width: 18, height: 18, marginTop: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.textFaint, borderRadius: 5 },
  caixaAtiva: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  opcaoNome: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.text },
  opcaoDesc: { fontSize: 13, lineHeight: 18.2, color: '#858d99' },
  opcaoPreco: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.primary300 },
  // `.adic-total`
  total: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11.2, paddingHorizontal: 13.6, borderRadius: 8, backgroundColor: colors.bg },
  totalRotulo: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  totalValor: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: colors.text },
  // `.adic-resumo`
  resumo: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, paddingHorizontal: 12.8, borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  resumoDestaque: { backgroundColor: 'rgba(79,70,229,0.08)' },
  resumoRotulo: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  resumoValor: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'right', color: colors.text },
  resumoValorDestaque: { fontWeight: '800', color: colors.primary300 },
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
