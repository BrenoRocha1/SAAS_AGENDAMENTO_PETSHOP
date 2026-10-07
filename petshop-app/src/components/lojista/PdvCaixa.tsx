'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@/app/lojista/pdv/pdv.css'
import { CheckoutModal, ClienteModal } from '@/components/lojista/PdvCheckout'
import type { FormasLoja } from '@/lib/pagamento'
import {
  arredondarQuantidade,
  descontoEmReais,
  lerValorDigitado,
  passoQuantidade,
  subtotalCarrinho,
  subtotalLinha,
  totalVenda,
  type ClientePdv,
  type ItemCarrinho,
  type ProdutoPdv,
  type TipoDesconto,
} from '@/lib/pdv'
import { rotuloEstoqueApp, statusEstoque } from '@/lib/produto'
import { formatarReais } from '@/lib/taxidog'
import {
  IconCart,
  IconChevronLeft,
  IconClose,
  IconMinus,
  IconPackage,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUser,
} from '@/components/icons'

interface Categoria {
  id_categoria: string
  nome: string
}

interface Props {
  produtos: ProdutoPdv[]
  categorias: Categoria[]
  formas: FormasLoja
  nomeLoja: string
}

const SEM_CATEGORIA = '__sem_categoria__'

// Sem acento e em minúscula — "racao" acha "Ração".
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const textoNumero = (n: number) => String(arredondarQuantidade(n)).replace('.', ',')

// Campo de quantidade da linha. Digita-se à vontade e só vale ao sair do
// campo/Enter; `key={valor}` no uso recria o campo quando a quantidade muda
// por outro caminho (botões +/−).
function CampoQtd({ valor, unidade, onConfirmar }: {
  valor: number
  unidade: string
  onConfirmar: (q: number) => void
}) {
  const [texto, setTexto] = useState(textoNumero(valor))
  const fracionavel = passoQuantidade(unidade) < 1

  function confirmar() {
    let q = lerValorDigitado(texto)
    if (!fracionavel) q = Math.round(q)
    if (q === valor) { setTexto(textoNumero(valor)); return }
    onConfirmar(q)
  }

  return (
    <input
      inputMode={fracionavel ? 'decimal' : 'numeric'}
      value={texto}
      onChange={e => setTexto(e.target.value)}
      onBlur={confirmar}
      onFocus={e => e.currentTarget.select()}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      aria-label="Quantidade"
    />
  )
}

export default function PdvCaixa({ produtos: inicial, categorias, formas, nomeLoja }: Props) {
  const [produtos, setProdutos] = useState<ProdutoPdv[]>(inicial)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<string>('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [cliente, setCliente] = useState<ClientePdv | null>(null)
  const [descontoTipo, setDescontoTipo] = useState<TipoDesconto>('valor')
  const [descontoTexto, setDescontoTexto] = useState('')
  const [descontoAberto, setDescontoAberto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [clienteAberto, setClienteAberto] = useState(false)
  const [checkoutAberto, setCheckoutAberto] = useState(false)
  const [carrinhoMobile, setCarrinhoMobile] = useState(false)

  const buscaRef = useRef<HTMLInputElement>(null)
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const avisar = useCallback((msg: string) => {
    setAviso(msg)
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(null), 3200)
  }, [])

  // ---------- Cálculos ----------
  const subtotal = subtotalCarrinho(carrinho)
  const desconto = { tipo: descontoTipo, valor: lerValorDigitado(descontoTexto) }
  const descontoReais = descontoEmReais(subtotal, desconto)
  const total = totalVenda(subtotal, descontoReais)
  const qtdLinhas = carrinho.length

  const noCarrinho = useMemo(() => {
    const m = new Map<string, number>()
    carrinho.forEach(i => m.set(i.produto.id_produto, i.quantidade))
    return m
  }, [carrinho])

  // ---------- Carrinho ----------
  function adicionar(p: ProdutoPdv) {
    const atual = noCarrinho.get(p.id_produto) ?? 0
    const nova = arredondarQuantidade(atual + 1)
    if (nova > p.estoque_atual) {
      avisar(`Só há ${rotuloEstoqueApp(p.estoque_atual, p.unidade_venda)} de “${p.nome}”.`)
      return
    }
    setCarrinho(c => {
      const existe = c.some(i => i.produto.id_produto === p.id_produto)
      return existe
        ? c.map(i => i.produto.id_produto === p.id_produto ? { ...i, quantidade: nova } : i)
        : [{ produto: p, quantidade: nova }, ...c]
    })
  }

  function definirQuantidade(id: string, q: number) {
    const item = carrinho.find(i => i.produto.id_produto === id)
    if (!item) return
    const quantidade = arredondarQuantidade(q)
    if (!(quantidade > 0)) {
      setCarrinho(c => c.filter(i => i.produto.id_produto !== id))
      return
    }
    const max = item.produto.estoque_atual
    if (quantidade > max) {
      avisar(`Só há ${rotuloEstoqueApp(max, item.produto.unidade_venda)} de “${item.produto.nome}”.`)
      setCarrinho(c => c.map(i => i.produto.id_produto === id ? { ...i, quantidade: max } : i))
      return
    }
    setCarrinho(c => c.map(i => i.produto.id_produto === id ? { ...i, quantidade } : i))
  }

  function remover(id: string) {
    setCarrinho(c => c.filter(i => i.produto.id_produto !== id))
  }

  function limparVenda() {
    setCarrinho([])
    setCliente(null)
    setDescontoTexto('')
    setDescontoTipo('valor')
    setDescontoAberto(false)
    setAviso(null)
  }

  // ---------- Lista de produtos ----------
  const categoriasUsadas = useMemo(() => {
    const usadas = new Set(produtos.map(p => p.id_categoria ?? SEM_CATEGORIA))
    return categorias.filter(c => usadas.has(c.id_categoria))
  }, [produtos, categorias])
  const haSemCategoria = produtos.some(p => p.id_categoria === null)

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim())
    return produtos.filter(p => {
      if (categoria === SEM_CATEGORIA && p.id_categoria !== null) return false
      if (categoria && categoria !== SEM_CATEGORIA && p.id_categoria !== categoria) return false
      return !termo || normalizar(p.nome).includes(termo)
    })
  }, [produtos, busca, categoria])

  // ---------- Atalhos: "/" busca, F2 finaliza ----------
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null
      const digitando = !!alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)
      if (e.key === '/' && !digitando && !checkoutAberto && !clienteAberto) {
        e.preventDefault()
        buscaRef.current?.focus()
      }
      if (e.key === 'F2' && !checkoutAberto && !clienteAberto && carrinho.length > 0) {
        e.preventDefault()
        setCheckoutAberto(true)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [checkoutAberto, clienteAberto, carrinho.length])

  function aoTeclarBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && filtrados.length > 0) {
      e.preventDefault()
      const p = filtrados[0]
      if (p.estoque_atual > 0) {
        adicionar(p)
        setBusca('')
      } else {
        avisar(`“${p.nome}” está sem estoque.`)
      }
    }
    if (e.key === 'Escape') setBusca('')
  }

  // ---------- Depois da venda ----------
  function aoRegistrar(vendidos: ItemCarrinho[]) {
    const baixa = new Map(vendidos.map(i => [i.produto.id_produto, i.quantidade]))
    setProdutos(ps => ps.map(p => {
      const q = baixa.get(p.id_produto)
      return q ? { ...p, estoque_atual: arredondarQuantidade(p.estoque_atual - q) } : p
    }))
    limparVenda()
  }

  function encerrarCheckout() {
    setCheckoutAberto(false)
    setCarrinhoMobile(false)
    setTimeout(() => buscaRef.current?.focus(), 50)
  }

  const sufixoUnidade = (u: string) => (u === 'unidade' ? '' : ` / ${u}`)

  return (
    <>
      <div className="pdv">
        {/* ============ Produtos ============ */}
        <div className="pdv-main">
          <div className="pdv-busca">
            <IconSearch />
            <input
              ref={buscaRef}
              id="pdv-busca"
              type="text"
              placeholder="Buscar produto…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={aoTeclarBusca}
              autoComplete="off"
              aria-label="Buscar produto"
              autoFocus
            />
            <kbd aria-hidden="true">/</kbd>
          </div>

          {(categoriasUsadas.length > 0 || haSemCategoria) && (
            <div className="pdv-categorias" role="tablist" aria-label="Categorias">
              <button type="button" className={`pdv-chip ${categoria === '' ? 'is-ativo' : ''}`} onClick={() => setCategoria('')}>
                Todos
              </button>
              {categoriasUsadas.map(c => (
                <button
                  key={c.id_categoria}
                  type="button"
                  className={`pdv-chip ${categoria === c.id_categoria ? 'is-ativo' : ''}`}
                  onClick={() => setCategoria(c.id_categoria)}
                >
                  {c.nome}
                </button>
              ))}
              {haSemCategoria && (
                <button type="button" className={`pdv-chip ${categoria === SEM_CATEGORIA ? 'is-ativo' : ''}`} onClick={() => setCategoria(SEM_CATEGORIA)}>
                  Sem categoria
                </button>
              )}
            </div>
          )}

          <div className="pdv-grade">
            {filtrados.length === 0 ? (
              <div className="pdv-vazio">
                <IconPackage />
                {produtos.length === 0 ? (
                  <>
                    <strong>Nenhum produto ativo</strong>
                    Cadastre produtos em Produtos para vendê-los no caixa.
                  </>
                ) : (
                  <>
                    <strong>Nada encontrado</strong>
                    Tente outro nome ou categoria.
                  </>
                )}
              </div>
            ) : (
              filtrados.map(p => {
                const status = statusEstoque(p.estoque_atual, p.estoque_minimo)
                const qtd = noCarrinho.get(p.id_produto)
                return (
                  <button
                    key={p.id_produto}
                    type="button"
                    className="pdv-produto"
                    onClick={() => adicionar(p)}
                    disabled={status === 'zerado'}
                    aria-label={`Adicionar ${p.nome}, ${formatarReais(p.preco_venda)}`}
                  >
                    {qtd !== undefined && <span className="pdv-produto-qtd">{textoNumero(qtd)}</span>}
                    <span className="pdv-produto-foto">
                      {p.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                        <img src={p.foto_url} alt="" loading="lazy" />
                      ) : (
                        <IconPackage />
                      )}
                    </span>
                    <span className="pdv-produto-info">
                      <span className="pdv-produto-nome">{p.nome}</span>
                      <span className={`pdv-produto-estoque ${status === 'zerado' ? 'is-zerado' : status === 'baixo' ? 'is-baixo' : ''}`}>
                        {status === 'zerado' ? 'Sem estoque' : status === 'baixo' ? `Restam ${rotuloEstoqueApp(p.estoque_atual, p.unidade_venda)}` : rotuloEstoqueApp(p.estoque_atual, p.unidade_venda)}
                      </span>
                      <span className="pdv-produto-preco">
                        {formatarReais(p.preco_venda)}<small>{sufixoUnidade(p.unidade_venda)}</small>
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ============ Carrinho ============ */}
        <aside className={`pdv-carrinho ${carrinhoMobile ? 'is-aberto' : ''}`} aria-label="Venda atual">
          <div className="pdv-carrinho-topo">
            <div className="pdv-carrinho-titulo">
              <button type="button" className="modal-close pdv-fechar-mobile" onClick={() => setCarrinhoMobile(false)} aria-label="Voltar aos produtos">
                <IconChevronLeft style={{ width: 15, height: 15 }} />
              </button>
              Venda atual
              {qtdLinhas > 0 && <span>{qtdLinhas}</span>}
            </div>
            <button type="button" className="pdv-texto-btn" onClick={limparVenda} disabled={qtdLinhas === 0 && !cliente}>
              Limpar
            </button>
          </div>

          {cliente ? (
            <div className="pdv-cliente is-definido">
              <IconUser />
              <span className="pdv-cliente-nome">{cliente.nome}</span>
              <button type="button" className="pdv-cliente-x" onClick={() => setCliente(null)} aria-label="Remover cliente">
                <IconClose />
              </button>
            </div>
          ) : (
            <button type="button" className="pdv-cliente" onClick={() => setClienteAberto(true)}>
              <IconUser /> Adicionar cliente (opcional)
            </button>
          )}

          <div className="pdv-itens">
            {carrinho.length === 0 ? (
              <div className="pdv-carrinho-vazio">
                <IconCart />
                <strong>Carrinho vazio</strong>
                Toque em um produto para começar a venda.
              </div>
            ) : (
              <ul style={{ listStyle: 'none' }}>
                {carrinho.map(item => {
                  const p = item.produto
                  const passo = passoQuantidade(p.unidade_venda)
                  return (
                    <li key={p.id_produto} className="pdv-item">
                      <span className="pdv-item-nome">{p.nome}</span>
                      <span className="pdv-item-total">{formatarReais(subtotalLinha(item))}</span>
                      <span className="pdv-item-unit">{formatarReais(p.preco_venda)}{sufixoUnidade(p.unidade_venda)}</span>
                      <span className="pdv-item-controles">
                        <span className="pdv-qtd">
                          <button type="button" onClick={() => definirQuantidade(p.id_produto, item.quantidade - passo)} aria-label="Diminuir quantidade">
                            <IconMinus />
                          </button>
                          <CampoQtd
                            key={item.quantidade}
                            valor={item.quantidade}
                            unidade={p.unidade_venda}
                            onConfirmar={q => definirQuantidade(p.id_produto, q)}
                          />
                          <button
                            type="button"
                            onClick={() => definirQuantidade(p.id_produto, item.quantidade + passo)}
                            aria-label="Aumentar quantidade"
                            disabled={item.quantidade >= p.estoque_atual}
                          >
                            <IconPlus />
                          </button>
                        </span>
                        <button type="button" className="pdv-remover" onClick={() => remover(p.id_produto)} aria-label={`Remover ${p.nome}`}>
                          <IconTrash />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {aviso && <div className="pdv-aviso" role="status">{aviso}</div>}

          <div className="pdv-rodape">
            <div className="pdv-linha">
              <span>Subtotal</span>
              <strong>{formatarReais(subtotal)}</strong>
            </div>

            {descontoAberto ? (
              <div className="pdv-linha">
                <span>Desconto</span>
                <span className="pdv-desconto-editor">
                  <span className="pdv-seg" role="group" aria-label="Tipo de desconto">
                    <button type="button" className={descontoTipo === 'valor' ? 'is-ativo' : ''} onClick={() => setDescontoTipo('valor')}>R$</button>
                    <button type="button" className={descontoTipo === 'percentual' ? 'is-ativo' : ''} onClick={() => setDescontoTipo('percentual')}>%</button>
                  </span>
                  <input
                    id="pdv-desconto"
                    inputMode="decimal"
                    placeholder="0"
                    value={descontoTexto}
                    onChange={e => setDescontoTexto(e.target.value)}
                    aria-label="Valor do desconto"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="pdv-cliente-x"
                    onClick={() => { setDescontoAberto(false); setDescontoTexto('') }}
                    aria-label="Remover desconto"
                  >
                    <IconClose />
                  </button>
                </span>
              </div>
            ) : descontoReais > 0 ? (
              <div className="pdv-linha is-desconto">
                <span>Desconto</span>
                <strong>− {formatarReais(descontoReais)}</strong>
              </div>
            ) : (
              <div className="pdv-linha">
                <button type="button" className="pdv-link-btn" onClick={() => setDescontoAberto(true)} disabled={qtdLinhas === 0} style={qtdLinhas === 0 ? { opacity: 0.4, cursor: 'default' } : undefined}>
                  + Adicionar desconto
                </button>
              </div>
            )}
            {descontoAberto && descontoReais > 0 && (
              <div className="pdv-linha is-desconto">
                <span />
                <strong>− {formatarReais(descontoReais)}</strong>
              </div>
            )}

            <div className="pdv-total">
              <span>Total</span>
              <strong>{formatarReais(total)}</strong>
            </div>

            <button
              type="button"
              id="btn-pdv-finalizar"
              className="btn btn-primary btn-lg btn-full pdv-finalizar"
              onClick={() => setCheckoutAberto(true)}
              disabled={carrinho.length === 0}
            >
              Finalizar venda <kbd aria-hidden="true">F2</kbd>
            </button>
          </div>
        </aside>
      </div>

      {/* Barra do carrinho (só no celular) */}
      {carrinho.length > 0 && !carrinhoMobile && (
        <button type="button" className="pdv-barra-mobile" onClick={() => setCarrinhoMobile(true)}>
          <span><IconCart /> {qtdLinhas} {qtdLinhas === 1 ? 'item' : 'itens'}</span>
          <strong>{formatarReais(total)}</strong>
        </button>
      )}

      {clienteAberto && (
        <ClienteModal
          onEscolher={c => { setCliente(c); setClienteAberto(false) }}
          onFechar={() => setClienteAberto(false)}
        />
      )}

      {checkoutAberto && (
        <CheckoutModal
          itens={carrinho}
          desconto={desconto}
          cliente={cliente}
          formas={formas}
          nomeLoja={nomeLoja}
          onRegistrada={aoRegistrar}
          onEncerrar={encerrarCheckout}
          onFechar={() => setCheckoutAberto(false)}
        />
      )}
    </>
  )
}
