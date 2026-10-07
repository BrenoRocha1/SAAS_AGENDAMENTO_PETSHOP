'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buscarClientesPdvAction, registrarVendaPdvAction } from '@/lib/actions-pdv'
import {
  FORMAS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  formasAtivas,
  rotuloForma,
  type FormaPagamento,
  type FormasLoja,
} from '@/lib/pagamento'
import {
  descontoEmReais,
  lerValorDigitado,
  rotuloNumeroVenda,
  subtotalLinha,
  sugestoesRecebido,
  textoQuantidade,
  totalVenda,
  centavos,
  type ClientePdv,
  type DescontoPdv,
  type ItemCarrinho,
  type VendaRegistrada,
} from '@/lib/pdv'
import { formatarReais } from '@/lib/taxidog'
import { formatarTelefone, iniciais } from '@/lib/format'
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconCopy,
  IconCreditCard,
  IconMoney,
  IconPrinter,
  IconQrCode,
  IconSearch,
} from '@/components/icons'

// ============================================================
// Escolher o cliente da venda (opcional)
// ============================================================
export function ClienteModal({ onEscolher, onFechar }: {
  onEscolher: (c: ClientePdv) => void
  onFechar: () => void
}) {
  const [busca, setBusca] = useState('')
  // `termo` diz de qual busca é a lista — se difere do que está digitado, ainda carrega.
  const [resultado, setResultado] = useState<{ termo: string; lista: ClientePdv[]; erro: string | null }>({
    termo: '\u0000', lista: [], erro: null,
  })

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await buscarClientesPdvAction(busca)
      setResultado(r.error !== undefined
        ? { termo: busca, lista: [], erro: r.error }
        : { termo: busca, lista: r.clientes, erro: null })
    }, 250)
    return () => clearTimeout(t)
  }, [busca])

  const carregando = resultado.termo !== busca

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Escolher cliente">
        <div className="modal-header">
          <h3 className="modal-title">Cliente da venda</h3>
          <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <div className="modal-body">
          <div className="pdv-busca">
            <IconSearch />
            <input
              id="pdv-busca-cliente"
              type="text"
              placeholder="Buscar por nome ou telefone"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              autoFocus
              style={{ paddingRight: '1rem' }}
            />
          </div>

          <div className="pdv-clientes-lista">
            {resultado.erro ? (
              <div className="pdv-lista-msg">{resultado.erro}</div>
            ) : carregando && resultado.lista.length === 0 ? (
              <div className="pdv-lista-msg">Buscando…</div>
            ) : resultado.lista.length === 0 ? (
              <div className="pdv-lista-msg">Nenhum cliente encontrado.</div>
            ) : (
              resultado.lista.map(c => (
                <button key={c.id_cliente} type="button" className="pdv-cliente-opcao" onClick={() => onEscolher(c)}>
                  <span className="pdv-cliente-avatar">{iniciais(c.nome)}</span>
                  <span>
                    <strong>{c.nome}</strong>
                    <small>{formatarTelefone(c.telefone)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="pdv-nota">Opcional — a venda também pode ser feita sem cliente.</p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Checkout: forma de pagamento → confirmação → venda concluída
// ============================================================
const ICONE_FORMA: Record<FormaPagamento, typeof IconMoney> = {
  pix: IconQrCode,
  dinheiro: IconMoney,
  cartao_credito: IconCreditCard,
  cartao_debito: IconCreditCard,
}

interface ComprovanteVenda {
  venda: VendaRegistrada
  itens: ItemCarrinho[]
  subtotal: number
  desconto: number
  forma: FormaPagamento
  recebido: number | null
  cliente: ClientePdv | null
  quando: Date
}

interface CheckoutProps {
  itens: ItemCarrinho[]
  desconto: DescontoPdv
  cliente: ClientePdv | null
  formas: FormasLoja
  nomeLoja: string
  // Chamado uma vez, assim que o banco confirma a venda (a tela limpa o carrinho e baixa o estoque local).
  onRegistrada: (itens: ItemCarrinho[]) => void
  // "Nova venda" / fechar depois de concluída.
  onEncerrar: () => void
  onFechar: () => void
}

export function CheckoutModal({ itens, desconto, cliente, formas, nomeLoja, onRegistrada, onEncerrar, onFechar }: CheckoutProps) {
  const ativas = formasAtivas(formas)
  const [forma, setForma] = useState<FormaPagamento | null>(ativas[0] ?? null)
  const [recebidoTexto, setRecebidoTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [comprovante, setComprovante] = useState<ComprovanteVenda | null>(null)
  const [copiado, setCopiado] = useState(false)
  const enviandoRef = useRef(false)

  const subtotal = centavos(itens.reduce((s, i) => s + subtotalLinha(i), 0))
  const descontoReais = descontoEmReais(subtotal, desconto)
  const total = totalVenda(subtotal, descontoReais)

  const recebido = lerValorDigitado(recebidoTexto)
  // Campo vazio = valor exato (sem troco).
  const recebidoEfetivo = recebidoTexto.trim() === '' ? total : recebido
  const troco = centavos(recebidoEfetivo - total)
  const faltando = forma === 'dinheiro' && recebidoEfetivo < total

  async function confirmar() {
    if (!forma || enviandoRef.current || faltando) return
    enviandoRef.current = true
    setEnviando(true)
    setErro(null)
    const snapshot = itens
    const r = await registrarVendaPdvAction({
      itens: snapshot.map(i => ({ id_produto: i.produto.id_produto, quantidade: i.quantidade })),
      desconto: descontoReais,
      forma,
      valorRecebido: forma === 'dinheiro' ? recebidoEfetivo : null,
      idCliente: cliente?.id_cliente ?? null,
    })
    if (r.error !== undefined) {
      setErro(r.error)
      setEnviando(false)
      enviandoRef.current = false
      return
    }
    setComprovante({
      venda: r.venda,
      itens: snapshot,
      subtotal,
      desconto: descontoReais,
      forma,
      recebido: forma === 'dinheiro' ? recebidoEfetivo : null,
      cliente,
      quando: new Date(),
    })
    setEnviando(false)
    onRegistrada(snapshot)
  }

  async function copiarPix() {
    if (!formas.pix_chave) return
    try {
      await navigator.clipboard.writeText(formas.pix_chave)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch { /* área de transferência indisponível */ }
  }

  // Esc fecha (antes de concluir) ou encerra (depois de concluída); durante o envio não faz nada.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enviandoRef.current) {
        if (comprovante) onEncerrar(); else onFechar()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [comprovante, onEncerrar, onFechar])

  // ---------- Venda concluída ----------
  if (comprovante) {
    const c = comprovante
    return (
      <>
        <div className="modal-overlay">
          <div className="modal pdv-modal" role="dialog" aria-label="Venda concluída">
            <div className="modal-body">
              <div className="pdv-sucesso">
                <div className="pdv-sucesso-icone"><IconCheck /></div>
                <h3>Venda {rotuloNumeroVenda(c.venda.numero)} concluída</h3>
                <div className="pdv-sucesso-valor">{formatarReais(c.venda.total)}</div>
                <p>{rotuloForma(c.forma)}{c.cliente ? ` · ${c.cliente.nome}` : ''}</p>
                {c.forma === 'dinheiro' && c.venda.troco > 0 && (
                  <div className="pdv-troco is-ok">
                    <span>Troco a devolver</span>
                    <strong>{formatarReais(c.venda.troco)}</strong>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'stretch' }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, gap: 8 }} onClick={() => window.print()}>
                <IconPrinter style={{ width: 16, height: 16 }} /> Imprimir recibo
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onEncerrar} autoFocus>
                Nova venda
              </button>
            </div>
          </div>
        </div>
        {typeof document !== 'undefined' && createPortal(<Recibo c={c} nomeLoja={nomeLoja} />, document.body)}
      </>
    )
  }

  // ---------- Pagamento ----------
  return (
    <div className="modal-overlay" onClick={() => !enviando && onFechar()}>
      <div className="modal pdv-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Finalizar venda">
        <div className="modal-header">
          <h3 className="modal-title">Finalizar venda</h3>
          <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar" disabled={enviando}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div className="modal-body">
          <div className="pdv-modal-total">
            <small>Total a pagar</small>
            <strong>{formatarReais(total)}</strong>
            <span>
              {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
              {descontoReais > 0 && ` · desconto de ${formatarReais(descontoReais)}`}
              {cliente && ` · ${cliente.nome}`}
            </span>
          </div>

          {erro && (
            <div className="alert alert-error">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
            </div>
          )}

          {ativas.length === 0 ? (
            <div className="alert alert-error">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>Nenhuma forma de pagamento ativa. Ative em Configurações → Formas de pagamento.</span>
            </div>
          ) : (
            <div className="pdv-formas" role="radiogroup" aria-label="Forma de pagamento">
              {FORMAS_PAGAMENTO.filter(f => ativas.includes(f)).map(f => {
                const Icone = ICONE_FORMA[f]
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={forma === f}
                    className={`pdv-forma ${forma === f ? 'is-ativa' : ''}`}
                    onClick={() => setForma(f)}
                    disabled={enviando}
                  >
                    <Icone /> {ROTULO_FORMA_PAGAMENTO[f]}
                  </button>
                )
              })}
            </div>
          )}

          {forma === 'dinheiro' && (
            <div className="pdv-dinheiro">
              <div className="form-group">
                <label htmlFor="pdv-recebido" className="form-label">Valor recebido</label>
                <div className="pdv-moeda">
                  <span>R$</span>
                  <input
                    id="pdv-recebido"
                    inputMode="decimal"
                    placeholder={total.toFixed(2).replace('.', ',')}
                    value={recebidoTexto}
                    onChange={e => setRecebidoTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
                    disabled={enviando}
                    autoFocus
                  />
                </div>
              </div>
              <div className="pdv-sugestoes">
                {sugestoesRecebido(total).map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    className="pdv-chip"
                    onClick={() => setRecebidoTexto(v.toFixed(2).replace('.', ','))}
                    disabled={enviando}
                  >
                    {i === 0 ? 'Valor exato' : formatarReais(v)}
                  </button>
                ))}
              </div>
              <div className={`pdv-troco ${faltando ? 'is-falta' : troco > 0 ? 'is-ok' : ''}`}>
                <span>{faltando ? 'Faltam' : 'Troco'}</span>
                <strong>{formatarReais(Math.abs(troco))}</strong>
              </div>
            </div>
          )}

          {forma === 'pix' && (
            <>
              {formas.pix_chave && (
                <div className="pdv-pix">
                  <div style={{ minWidth: 0 }}>
                    <small>Chave Pix{formas.pix_nome ? ` · ${formas.pix_nome}` : ''}</small>
                    <strong>{formas.pix_chave}</strong>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={copiarPix} style={{ gap: 6, flexShrink: 0 }}>
                    {copiado ? <IconCheck style={{ width: 14, height: 14 }} /> : <IconCopy style={{ width: 14, height: 14 }} />}
                    {copiado ? 'Copiada' : 'Copiar'}
                  </button>
                </div>
              )}
              <p className="pdv-nota">Confirme que o Pix caiu na conta antes de concluir.</p>
            </>
          )}

          {(forma === 'cartao_credito' || forma === 'cartao_debito') && (
            <p className="pdv-nota">Passe o cartão na maquininha e conclua quando aprovar.</p>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onFechar} disabled={enviando}>Voltar</button>
          <button
            type="button"
            className={`btn btn-primary ${enviando ? 'btn-loading' : ''}`}
            onClick={confirmar}
            disabled={enviando || !forma || faltando || ativas.length === 0}
            style={{ minWidth: 190 }}
          >
            {enviando ? 'Registrando…' : `Concluir · ${formatarReais(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Recibo — só aparece ao imprimir (ver @media print em pdv.css)
// ============================================================
function Recibo({ c, nomeLoja }: { c: ComprovanteVenda; nomeLoja: string }) {
  const data = c.quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
  return (
    <div className="pdv-recibo" aria-hidden="true">
      <h2>{nomeLoja}</h2>
      <div className="centro">Venda {rotuloNumeroVenda(c.venda.numero)} · {data}</div>
      {c.cliente && <div className="centro">Cliente: {c.cliente.nome}</div>}
      <hr />
      {c.itens.map(i => (
        <div key={i.produto.id_produto}>
          <div>{i.produto.nome}</div>
          <div className="linha">
            <span>{textoQuantidade(i.quantidade, i.produto.unidade_venda)} × {formatarReais(i.produto.preco_venda)}</span>
            <span>{formatarReais(subtotalLinha(i))}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="linha"><span>Subtotal</span><span>{formatarReais(c.subtotal)}</span></div>
      {c.desconto > 0 && <div className="linha"><span>Desconto</span><span>-{formatarReais(c.desconto)}</span></div>}
      <div className="linha forte"><span>TOTAL</span><span>{formatarReais(c.venda.total)}</span></div>
      <hr />
      <div className="linha"><span>Pagamento</span><span>{rotuloForma(c.forma)}</span></div>
      {c.recebido !== null && (
        <>
          <div className="linha"><span>Recebido</span><span>{formatarReais(c.recebido)}</span></div>
          <div className="linha"><span>Troco</span><span>{formatarReais(c.venda.troco)}</span></div>
        </>
      )}
      <hr />
      <div className="centro">Obrigado pela preferência!</div>
      <div className="centro">Comprovante não fiscal</div>
    </div>
  )
}
