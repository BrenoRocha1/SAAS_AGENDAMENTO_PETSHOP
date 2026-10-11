'use client'

import { useState, useTransition } from 'react'
import {
  alternarStatusServicoAdicionalAction,
  excluirServicoAdicionalAction,
  salvarServicoAdicionalAction,
} from '@/lib/actions-adicionais'
import type { ServicoAdicional } from '@/lib/adicionais'
import { formatarReais } from '@/lib/taxidog'
import { IconAlert, IconCalendar, IconClose, IconPencil, IconPlus, IconScissors, IconTrash } from '@/components/icons'
import './novo-agendamento.css'
import './equipe-membro.css'
import './adicionais.css'

interface Props {
  adicionais: ServicoAdicional[]
  // Serviços principais da loja (os não excluídos), para dizer a quais o
  // adicional se aplica.
  servicos: { id_servico: string; nome: string }[]
  // Excluir é do responsável pela loja ou de um administrador.
  podeExcluir: boolean
}

interface Rascunho {
  id: string | null
  nome: string
  descricao: string
  preco: string
  paraTodos: boolean
  servicos: string[]
  online: boolean
  atendimento: boolean
}

const NOVO: Rascunho = { id: null, nome: '', descricao: '', preco: '', paraTodos: true, servicos: [], online: true, atendimento: true }

// "Serviços adicionais" da tela de Serviços: as cobranças extras que a loja
// cadastra (taxa por pelo embolado, hidratação adicional...). Fica abaixo
// dos serviços principais, com cadastro próprio — mesma tela, sem página
// nova. Quem escreve é o banco (migration 095).
export default function ServicosAdicionais({ adicionais: inicial, servicos, podeExcluir }: Props) {
  const [adicionais, setAdicionais] = useState(inicial)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [alternandoId, setAlternandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<ServicoAdicional | null>(null)
  const [isPending, startTransition] = useTransition()

  const nomeDoServico = new Map(servicos.map(s => [s.id_servico, s.nome]))

  function valePara(a: ServicoAdicional): string {
    const nomes = a.servicos.map(id => nomeDoServico.get(id)).filter(Boolean) as string[]
    if (a.servicos.length === 0) return 'Todos os serviços'
    return nomes.length > 0 ? nomes.join(', ') : 'Serviços que não existem mais'
  }

  function abrirNovo() {
    setErro(null)
    setRascunho(NOVO)
  }

  function abrirEditar(a: ServicoAdicional) {
    setErro(null)
    setRascunho({
      id: a.id_adicional,
      nome: a.nome,
      descricao: a.descricao ?? '',
      preco: String(a.preco).replace('.', ','),
      paraTodos: a.servicos.length === 0,
      servicos: a.servicos.filter(id => nomeDoServico.has(id)),
      online: a.disponivel_online,
      atendimento: a.disponivel_atendimento,
    })
  }

  function mudar(parte: Partial<Rascunho>) {
    setRascunho(r => (r ? { ...r, ...parte } : r))
  }

  function alternarServico(id: string) {
    setRascunho(r => (r ? { ...r, servicos: r.servicos.includes(id) ? r.servicos.filter(x => x !== id) : [...r.servicos, id] } : r))
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!rascunho) return
    setErro(null)
    const preco = Number(rascunho.preco.replace(/\./g, '').replace(',', '.'))
    if (!rascunho.paraTodos && rascunho.servicos.length === 0) {
      setErro('Marque pelo menos um serviço, ou escolha "Todos os serviços".')
      return
    }
    startTransition(async () => {
      const r = await salvarServicoAdicionalAction(rascunho.id, {
        nome: rascunho.nome,
        descricao: rascunho.descricao,
        preco,
        disponivelOnline: rascunho.online,
        disponivelAtendimento: rascunho.atendimento,
        servicos: rascunho.paraTodos ? [] : rascunho.servicos,
      })
      if (r.error) return setErro(r.error)
      if (r.adicionais) setAdicionais(r.adicionais)
      setRascunho(null)
    })
  }

  function alternarStatus(a: ServicoAdicional) {
    setErroLista(null)
    const ativo = a.status !== 'Ativo'
    setAlternandoId(a.id_adicional)
    startTransition(async () => {
      const r = await alternarStatusServicoAdicionalAction(a.id_adicional, ativo)
      setAlternandoId(null)
      if (r.error) return setErroLista(r.error)
      setAdicionais(prev => prev.map(x => (x.id_adicional === a.id_adicional ? { ...x, status: ativo ? 'Ativo' : 'Inativo' } : x)))
    })
  }

  function confirmarExclusao() {
    if (!excluindo) return
    const alvo = excluindo
    setErroLista(null)
    startTransition(async () => {
      const r = await excluirServicoAdicionalAction(alvo.id_adicional)
      setExcluindo(null)
      if (r.error) return setErroLista(r.error)
      setAdicionais(prev => prev.filter(x => x.id_adicional !== alvo.id_adicional))
    })
  }

  const chave = (a: ServicoAdicional, rotulo: boolean) => (
    <button
      type="button"
      className={`switch ${a.status === 'Ativo' ? 'switch-on' : ''}`}
      onClick={e => { e.stopPropagation(); alternarStatus(a) }}
      disabled={alternandoId === a.id_adicional}
      role="switch"
      aria-checked={a.status === 'Ativo'}
      aria-label={rotulo ? `${a.nome} ativo` : undefined}
      title={a.status === 'Ativo' ? 'Desativar adicional' : 'Ativar adicional'}
    >
      <span className="switch-thumb" />
    </button>
  )

  const onde = (a: ServicoAdicional) => (
    <span className="adic-onde">
      {a.disponivel_online && <span className="adic-selo"><IconCalendar /> Agendamento online</span>}
      {a.disponivel_atendimento && <span className="adic-selo"><IconScissors /> Atendimento</span>}
    </span>
  )

  return (
    <section className="adic-secao" aria-labelledby="adic-titulo">
      <div className="adic-cabecalho">
        <div>
          <h2 id="adic-titulo" className="adic-titulo">Serviços adicionais</h2>
          <p className="adic-sub">
            Cobranças extras para quando o pet precisa de atenção especial, como pelo embolado ou dificuldade de manejo.
            O cliente pode escolher ao agendar e a equipe pode incluir durante o atendimento.
          </p>
        </div>
        <button type="button" className="btn btn-secondary adic-novo" onClick={abrirNovo} id="btn-novo-adicional">
          <IconPlus style={{ width: 16, height: 16 }} /> Novo adicional
        </button>
      </div>

      {erroLista && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erroLista}</span>
        </div>
      )}

      {adicionais.length === 0 ? (
        <div className="adic-vazio">
          <strong>Nenhum serviço adicional cadastrado</strong>
          <span>Cadastre taxas e extras que podem entrar num atendimento, cada um com o seu preço.</span>
        </div>
      ) : (
        <>
          {/* Celular (até 768px): a mesma lista do app. */}
          <div className="so-celular">
            <div className="dash-app-lista">
              {adicionais.map(a => (
                <div
                  key={a.id_adicional}
                  className="dash-app-linha"
                  role="button"
                  tabIndex={0}
                  onClick={() => abrirEditar(a)}
                  onKeyDown={e => { if (e.key === 'Enter') abrirEditar(a) }}
                >
                  <span className="dash-app-linha-info">
                    <span className={`dash-app-linha-pet ${a.status === 'Ativo' ? '' : 'is-apagado'}`}>{a.nome}</span>
                    <span className="dash-app-linha-sub is-media">
                      {formatarReais(a.preco)} · {valePara(a)}{a.status === 'Ativo' ? '' : ' · Inativo'}
                    </span>
                  </span>
                  {chave(a, true)}
                </div>
              ))}
            </div>
          </div>

          <div className="so-desktop">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Adicional</th>
                    <th>Preço</th>
                    <th>Vale para</th>
                    <th>Onde aparece</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {adicionais.map(a => (
                    <tr key={a.id_adicional}>
                      <td>
                        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{a.nome}</div>
                        {a.descricao && <div className="text-sm text-muted">{a.descricao}</div>}
                      </td>
                      <td className="text-success font-semibold" style={{ whiteSpace: 'nowrap' }}>+ {formatarReais(a.preco)}</td>
                      <td className="text-sm">{valePara(a)}</td>
                      <td>{onde(a)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {chave(a, false)}
                          {alternandoId === a.id_adicional && <span className="text-xs text-muted">Salvando...</span>}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirEditar(a)}>
                            <IconPencil style={{ width: 14, height: 14 }} /> Editar
                          </button>
                          {podeExcluir && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setErroLista(null); setExcluindo(a) }} title="Excluir adicional">
                              <IconTrash style={{ width: 14, height: 14 }} /> Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {rascunho && (
        <div className="modal-overlay" onClick={() => !isPending && setRascunho(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{rascunho.id ? 'Editar serviço adicional' : 'Novo serviço adicional'}</h3>
              <button type="button" className="modal-close" onClick={() => setRascunho(null)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>

            <form onSubmit={salvar}>
              <div className="modal-body">
                {erro && (
                  <div className="alert alert-error">
                    <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
                  </div>
                )}

                <div className="form-grid-2 adic-campos">
                  <div className="form-group">
                    <label htmlFor="adic-nome" className="form-label form-label-required">Nome</label>
                    <input
                      id="adic-nome"
                      type="text"
                      className="form-input"
                      value={rascunho.nome}
                      onChange={e => mudar({ nome: e.target.value })}
                      placeholder="Ex: Taxa por pelo embolado"
                      maxLength={100}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="adic-preco" className="form-label form-label-required">Preço (R$)</label>
                    <input
                      id="adic-preco"
                      type="text"
                      inputMode="decimal"
                      className="form-input"
                      value={rascunho.preco}
                      onChange={e => mudar({ preco: e.target.value.replace(/[^\d.,]/g, '') })}
                      placeholder="30,00"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="adic-descricao" className="form-label">Descrição</label>
                  <textarea
                    id="adic-descricao"
                    className="form-textarea"
                    value={rascunho.descricao}
                    onChange={e => mudar({ descricao: e.target.value })}
                    placeholder="Quando se aplica. O cliente vê este texto ao agendar."
                    rows={2}
                    maxLength={500}
                  />
                </div>

                <div className="form-group">
                  <span className="form-label">Vale para quais serviços?</span>
                  <div className="na-seg is-cheio" role="radiogroup" aria-label="Vale para quais serviços">
                    <button type="button" role="radio" aria-checked={rascunho.paraTodos} className={rascunho.paraTodos ? 'is-ativo' : ''} onClick={() => mudar({ paraTodos: true })}>
                      Todos os serviços
                    </button>
                    <button type="button" role="radio" aria-checked={!rascunho.paraTodos} className={rascunho.paraTodos ? '' : 'is-ativo'} onClick={() => mudar({ paraTodos: false })} disabled={servicos.length === 0}>
                      Só alguns
                    </button>
                  </div>
                  {!rascunho.paraTodos && (
                    <div className="adic-servicos">
                      {servicos.map(s => {
                        const marcado = rascunho.servicos.includes(s.id_servico)
                        return (
                          <button key={s.id_servico} type="button" className={`adic-chip ${marcado ? 'is-ativo' : ''}`} aria-pressed={marcado} onClick={() => alternarServico(s.id_servico)}>
                            {s.nome}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <span className="form-label">Onde pode ser usado</span>
                  <div className="eq-grupo">
                    <LinhaChave
                      icone={<IconCalendar />}
                      titulo="Agendamento online"
                      texto="O cliente pode escolher ao agendar."
                      ligado={rascunho.online}
                      onChange={v => mudar({ online: v })}
                    />
                    <LinhaChave
                      icone={<IconScissors />}
                      titulo="Durante o atendimento"
                      texto="A equipe pode incluir no detalhe do agendamento."
                      ligado={rascunho.atendimento}
                      onChange={v => mudar({ atendimento: v })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                {rascunho.id && podeExcluir && (
                  <span className="so-celular">
                    <button
                      type="button"
                      className="btn btn-full tela-app-perigo"
                      onClick={() => {
                        const alvo = adicionais.find(a => a.id_adicional === rascunho.id) ?? null
                        setRascunho(null)
                        setExcluindo(alvo)
                      }}
                    >
                      <IconTrash style={{ width: 15, height: 15 }} /> Excluir adicional
                    </button>
                  </span>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setRascunho(null)} disabled={isPending}>
                  Cancelar
                </button>
                <button type="submit" id="btn-salvar-adicional" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar adicional'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {excluindo && (
        <div className="modal-overlay" onClick={() => !isPending && setExcluindo(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Excluir serviço adicional</h3>
              <button type="button" className="modal-close" onClick={() => setExcluindo(null)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-full)', flexShrink: 0,
                  background: 'rgba(239,68,68,0.1)', color: 'var(--danger-400)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <IconAlert style={{ width: 18, height: 18 }} />
                </span>
                <p style={{ color: 'var(--gray-200)' }}>
                  Tem certeza que deseja excluir <strong style={{ color: 'var(--gray-100)' }}>&quot;{excluindo.nome}&quot;</strong>?
                  Ele sai da lista e não pode mais ser escolhido nem incluído. Nos atendimentos em que já foi cobrado,
                  continua aparecendo com o valor da época.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setExcluindo(null)} disabled={isPending}>Cancelar</button>
              <button type="button" className={`btn btn-danger ${isPending ? 'btn-loading' : ''}`} onClick={confirmarExclusao} disabled={isPending}>
                {isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function LinhaChave({ icone, titulo, texto, ligado, onChange }: {
  icone: React.ReactNode
  titulo: string
  texto: string
  ligado: boolean
  onChange: (ligado: boolean) => void
}) {
  return (
    <div className="eq-linha" onClick={() => onChange(!ligado)}>
      <span className="eq-icone">{icone}</span>
      <span className="eq-texto">
        <strong>{titulo}</strong>
        <small>{texto}</small>
      </span>
      <button
        type="button"
        className={`switch ${ligado ? 'switch-on' : ''}`}
        role="switch"
        aria-checked={ligado}
        aria-label={titulo}
        onClick={e => { e.stopPropagation(); onChange(!ligado) }}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}
