'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  adicionaisDoAgendamentoAction,
  incluirAdicionaisAction,
  removerAdicionalAction,
  type AdicionaisDoAtendimento,
  type ResultadoInclusao,
} from '@/lib/actions-adicionais'
import { linkWhatsappCliente, rotuloOrigemAdicional, type AdicionalDoAgendamento } from '@/lib/adicionais'
import { formatarReais } from '@/lib/taxidog'
import { IconAlert, IconCheck, IconClose, IconPlus, IconWhatsapp } from '@/components/icons'
import './adicionais.css'

function quando(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Bloco "Serviços adicionais" do detalhe do agendamento (loja): o que já foi
// cobrado a mais neste atendimento — escolhido pelo cliente ao agendar ou
// incluído pela equipe — e o botão de incluir. Carrega sozinho pelo id, como
// os blocos de Plano e de Alterações; sem a migration 095 (ou sem nada a
// mostrar), não aparece.
export default function AdicionaisAgendamento({ idAgendamento, status }: { idAgendamento: string; status: string }) {
  const router = useRouter()
  const [info, setInfo] = useState<AdicionaisDoAtendimento | null>(null)
  const [versao, setVersao] = useState(0)
  const [incluindo, setIncluindo] = useState(false)
  const [resultado, setResultado] = useState<ResultadoInclusao | null>(null)
  const [removendo, setRemovendo] = useState<AdicionalDoAgendamento | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelado = false
    adicionaisDoAgendamentoAction(idAgendamento).then(r => { if (!cancelado) setInfo(r) })
    return () => { cancelado = true }
  }, [idAgendamento, status, versao])

  function recarregar() {
    setVersao(v => v + 1)
    router.refresh()
  }

  if (!info?.instalado) return null
  const ativos = info.itens.filter(i => i.status === 'ativo')
  const removidos = info.itens.filter(i => i.status === 'removido')
  const podeIncluir = info.podeAlterar && info.disponiveis.length > 0
  if (info.itens.length === 0 && !podeIncluir) return null

  function remover() {
    if (!removendo) return
    setErro(null)
    startTransition(async () => {
      const r = await removerAdicionalAction(removendo.id_agendamento_adicional, motivo, info!.pago)
      if (r.error) return setErro(r.error)
      setRemovendo(null)
      setMotivo('')
      recarregar()
    })
  }

  return (
    <div className="adic-bloco">
      <div className="adic-bloco-topo">
        <span className="adic-bloco-titulo"><IconPlus /> Serviços adicionais</span>
        {podeIncluir && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setErro(null); setIncluindo(true) }}>
            <IconPlus style={{ width: 13, height: 13 }} /> Adicionar serviço adicional
          </button>
        )}
      </div>

      {info.itens.length === 0 ? (
        <span className="text-sm text-muted">Nenhuma cobrança extra neste atendimento.</span>
      ) : (
        <ul className="adic-itens">
          {ativos.map(i => (
            <li key={i.id_agendamento_adicional} className="adic-item">
              <span className="adic-item-texto">
                <span className="adic-item-nome">{i.nome}</span>
                <span className="adic-item-sub">
                  {rotuloOrigemAdicional(i)} · {quando(i.created_at)}
                  {i.observacao && <><br />Motivo: {i.observacao}</>}
                </span>
              </span>
              <span className="adic-item-valor">{formatarReais(i.valor_total)}</span>
              {info.podeAlterar && (
                <button type="button" className="adic-remover" title="Remover cobrança" aria-label={`Remover ${i.nome}`} disabled={isPending}
                  onClick={() => { setErro(null); setMotivo(''); setRemovendo(i) }}>
                  <IconClose />
                </button>
              )}
            </li>
          ))}
          {removidos.map(i => (
            <li key={i.id_agendamento_adicional} className="adic-item is-removido">
              <span className="adic-item-texto">
                <span className="adic-item-nome">{i.nome}</span>
                <span className="adic-item-sub">
                  Removido{i.nome_removido_por ? ` por ${i.nome_removido_por}` : ' pela loja'}{i.removido_em ? ` · ${quando(i.removido_em)}` : ''}
                  {i.motivo_remocao && <><br />Motivo: {i.motivo_remocao}</>}
                </span>
              </span>
              <span className="adic-item-valor">{formatarReais(i.valor_total)}</span>
            </li>
          ))}
        </ul>
      )}

      {removendo && (
        <div className="adic-remocao">
          <span className="text-sm">
            Remover <strong>{removendo.nome}</strong>? O total do atendimento passa de {formatarReais(info.valor)} para{' '}
            <strong>{formatarReais(Math.max(0, info.valor - removendo.valor_total))}</strong>. A cobrança fica no histórico como removida.
            {info.pago && <> O atendimento está marcado como pago: ao remover, o pagamento volta para pendente.</>}
          </span>
          <input
            type="text"
            className="form-input"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
            maxLength={500}
            aria-label="Motivo da remoção"
          />
          <div className="adic-remocao-acoes">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRemovendo(null)} disabled={isPending}>Cancelar</button>
            <button type="button" className={`btn btn-danger btn-sm ${isPending ? 'btn-loading' : ''}`} onClick={remover} disabled={isPending}>
              {isPending ? 'Removendo...' : info.pago ? 'Remover e voltar para pendente' : 'Remover cobrança'}
            </button>
          </div>
        </div>
      )}

      {ativos.length > 0 && (
        <div className="adic-contas">
          <div><span>Valor sem os adicionais</span><span>{formatarReais(Math.max(0, info.valor - info.totalAdicionais))}</span></div>
          <div><span>Subtotal dos adicionais</span><span>{formatarReais(info.totalAdicionais)}</span></div>
          <div className="is-total"><span>Valor total atualizado</span><span>{formatarReais(info.valor)}</span></div>
        </div>
      )}

      {erro && !incluindo && <span className="text-xs" style={{ color: 'var(--status-cancelado-fg)' }}>{erro}</span>}

      {incluindo && (
        <JanelaIncluir
          info={info}
          idAgendamento={idAgendamento}
          onFechar={() => setIncluindo(false)}
          onIncluido={r => { setIncluindo(false); setResultado(r); recarregar() }}
        />
      )}
      {resultado && <JanelaAviso resultado={resultado} onFechar={() => setResultado(null)} />}
    </div>
  )
}

// Janela por cima do detalhe do agendamento (que já é uma janela): vai
// direto no <body>, e o clique de fora não fecha o detalhe de trás.
function Janela({ titulo, onFechar, ocupado, largura, children }: {
  titulo: string
  onFechar: () => void
  ocupado?: boolean
  largura?: number
  children: React.ReactNode
}) {
  return createPortal(
    <div className="modal-overlay" onClick={e => { e.stopPropagation(); if (!ocupado) onFechar() }}>
      <div className="modal adic-janela" style={largura ? { maxWidth: largura } : undefined} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{titulo}</h3>
          <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar" disabled={ocupado}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function JanelaIncluir({ info, idAgendamento, onFechar, onIncluido }: {
  info: AdicionaisDoAtendimento
  idAgendamento: string
  onFechar: () => void
  onIncluido: (r: ResultadoInclusao) => void
}) {
  const [escolhidos, setEscolhidos] = useState<string[]>(info.disponiveis.length === 1 ? [info.disponiveis[0].id_adicional] : [])
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const acrescimo = info.disponiveis.filter(a => escolhidos.includes(a.id_adicional)).reduce((s, a) => s + a.preco, 0)

  function alternar(id: string) {
    setEscolhidos(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function confirmar() {
    setErro(null)
    startTransition(async () => {
      const r = await incluirAdicionaisAction(idAgendamento, escolhidos, observacao, info.pago)
      // Nada entrou: o erro fica aqui. Se parte entrou, segue para o resumo
      // (que mostra o que entrou e o que deu errado).
      if (!r.incluidos?.length) return setErro(r.error ?? 'Não foi possível incluir o serviço adicional.')
      onIncluido(r)
    })
  }

  return (
    <Janela titulo="Adicionar serviço adicional" onFechar={onFechar} ocupado={isPending}>
      <div className="modal-body">
        {erro && (
          <div className="alert alert-error">
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
          </div>
        )}
        {info.pago && (
          <div className="alert alert-warning">
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>Este atendimento está marcado como pago. Ao incluir a cobrança, o pagamento volta para <strong>pendente</strong>, para você receber a diferença.</span>
          </div>
        )}

        <div className="adic-opcoes" role="group" aria-label="Serviços adicionais disponíveis">
          {info.disponiveis.map(a => {
            const marcado = escolhidos.includes(a.id_adicional)
            return (
              <button key={a.id_adicional} type="button" className={`adic-opcao ${marcado ? 'is-ativa' : ''}`} role="checkbox" aria-checked={marcado} onClick={() => alternar(a.id_adicional)} disabled={isPending}>
                <span className="adic-caixa" aria-hidden="true"><IconCheck /></span>
                <span className="adic-opcao-texto">
                  <span className="adic-opcao-nome">{a.nome}</span>
                  {a.descricao && <span className="adic-opcao-desc">{a.descricao}</span>}
                </span>
                <span className="adic-opcao-preco">+ {formatarReais(a.preco)}</span>
              </button>
            )
          })}
        </div>

        <div className="form-group" style={{ margin: 'var(--space-4) 0 0' }}>
          <label htmlFor="adic-observacao" className="form-label">Motivo ou observação <span className="text-muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
          <textarea
            id="adic-observacao"
            className="form-textarea"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            placeholder="Ex: o pelo está com nós que exigem tempo adicional de desembolo."
            rows={2}
            maxLength={500}
            disabled={isPending}
          />
        </div>

        <div className="adic-total">
          <span>
            Total do atendimento
            <small>{formatarReais(info.valor)} + {formatarReais(acrescimo)} de adicional</small>
          </span>
          <strong>{formatarReais(info.valor + acrescimo)}</strong>
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onFechar} disabled={isPending}>Cancelar</button>
        <button type="button" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} onClick={confirmar} disabled={isPending || escolhidos.length === 0}>
          {isPending ? 'Incluindo...' : info.pago ? 'Incluir e voltar para pendente' : 'Confirmar inclusão'}
        </button>
      </div>
    </Janela>
  )
}

// Depois de incluir: o resumo com os dados reais do atendimento e a
// mensagem pronta, que a loja pode editar. O envio é pelo WhatsApp da
// própria pessoa (abre a conversa com o texto) — o SAIP não envia sozinho
// nem registra envio, porque não tem como confirmar que a mensagem saiu.
function JanelaAviso({ resultado, onFechar }: { resultado: ResultadoInclusao; onFechar: () => void }) {
  const aviso = resultado.aviso
  const [mensagem, setMensagem] = useState(aviso?.mensagem ?? '')
  const [copiado, setCopiado] = useState(false)
  const link = aviso ? linkWhatsappCliente(aviso.telefoneCliente, mensagem) : null
  const novos = resultado.incluidos ?? []
  const varios = novos.length > 1

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <Janela titulo="Valor do atendimento atualizado" onFechar={onFechar} largura={500}>
      <div className="modal-body">
        {resultado.error && (
          <div className="alert alert-error">
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>Nem tudo entrou: {resultado.error}</span>
          </div>
        )}
        <p className="text-sm" style={{ color: 'var(--gray-300)', marginBottom: 'var(--space-3)' }}>
          {varios ? 'Os serviços adicionais foram incluídos' : 'O serviço adicional foi incluído'} e o valor total do atendimento foi alterado.
          {resultado.pagamentoReaberto && <> O pagamento voltou para pendente.</>}
          {' '}Deseja avisar o cliente pelo WhatsApp?
        </p>

        <div className="adic-resumo">
          {aviso?.nomePet && <div><span>Pet</span><span>{aviso.nomePet}</span></div>}
          {aviso && <div><span>Serviço principal</span><span>{aviso.nomeServico} — {formatarReais(aviso.valorServico)}</span></div>}
          {novos.map((n, i) => (
            <div key={i}><span>Serviço adicional</span><span>{n.nome} — {formatarReais(n.preco)}</span></div>
          ))}
          <div><span>Valor anterior</span><span>{formatarReais(resultado.valorAnterior ?? 0)}</span></div>
          <div className="is-total"><span>Valor atualizado</span><span>{formatarReais(resultado.valorNovo ?? 0)}</span></div>
        </div>

        {aviso && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="adic-mensagem" className="form-label">Mensagem para {aviso.nomeCliente?.split(' ')[0] ?? 'o cliente'}</label>
            <textarea
              id="adic-mensagem"
              className="form-textarea adic-mensagem"
              value={mensagem}
              onChange={e => { setMensagem(e.target.value); setCopiado(false) }}
              rows={9}
            />
            {link ? (
              <p className="adic-nota">
                O WhatsApp abre na conversa com o cliente, com este texto pronto para você conferir e enviar.
                O SAIP não envia a mensagem sozinho nem registra se ela foi enviada.
              </p>
            ) : (
              <p className="adic-nota" style={{ color: 'var(--status-cancelado-fg)' }}>
                Este cliente não tem telefone cadastrado, então não dá para abrir a conversa por aqui. Copie a mensagem e envie pelo canal que preferir.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onFechar}>Agora não</button>
        {aviso && !link && (
          <button type="button" className="btn btn-primary" onClick={copiar} disabled={!mensagem.trim()}>
            {copiado ? 'Mensagem copiada' : 'Copiar mensagem'}
          </button>
        )}
        {link && (
          <a href={mensagem.trim() ? link : undefined} target="_blank" rel="noopener noreferrer" className="btn btn-primary adic-whatsapp" aria-disabled={!mensagem.trim()} onClick={onFechar}>
            <IconWhatsapp style={{ width: 16, height: 16 }} /> Enviar mensagem pelo WhatsApp
          </a>
        )}
      </div>
    </Janela>
  )
}
