'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alterarStatusPlanoAction, salvarPlanoAction } from '@/lib/actions-planos'
import { PERIODICIDADES, rotuloPeriodicidade, sufixoPeriodo, type Periodicidade, type Plano } from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { IconAlert, IconClose, IconPencil, IconPlus, IconRepeat } from '@/components/icons'

export interface ServicoOpcao { id_servico: string; nome: string; preco: number; ativo: boolean }

export default function PlanosLista({ planos, servicos }: { planos: Plano[]; servicos: ServicoOpcao[] }) {
  const router = useRouter()
  const [editando, setEditando] = useState<Plano | 'novo' | null>(null)
  const [alternando, setAlternando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function alternar(p: Plano) {
    setErro(null)
    setAlternando(p.id_plano)
    startTransition(async () => {
      const r = await alterarStatusPlanoAction(p.id_plano, !p.ativo)
      if (r.error) setErro(r.error)
      setAlternando(null)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Monte o plano com os serviços que você já cadastrou e quantas vezes cada um pode ser usado por período.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditando('novo')}>
          <IconPlus style={{ width: 16, height: 16 }} /> Novo plano
        </button>
      </div>

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}

      {planos.length === 0 ? (
        <div className="empty-state card">
          <IconRepeat style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum plano ainda</div>
          <p>Crie o primeiro: escolha os serviços, a quantidade, o valor e o período.</p>
        </div>
      ) : (
        <div className="planos-grade">
          {planos.map(p => (
            <div key={p.id_plano} className={`card plano-card ${p.ativo ? '' : 'is-inativo'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="plano-card-nome">{p.nome}</div>
                <button
                  type="button"
                  className={`switch ${p.ativo ? 'switch-on' : ''}`}
                  onClick={() => alternar(p)}
                  disabled={alternando === p.id_plano}
                  role="switch"
                  aria-checked={p.ativo}
                  title={p.ativo ? 'Desativar plano' : 'Ativar plano'}
                >
                  <span className="switch-thumb" />
                </button>
              </div>
              <div className="plano-card-valor">
                {formatarReais(p.valor)}<span>{sufixoPeriodo(p.periodicidade, p.intervalo_dias)}</span>
              </div>
              <div className="text-xs text-muted">{rotuloPeriodicidade(p.periodicidade, p.intervalo_dias)}{p.ativo ? '' : ' · desativado'}</div>
              {p.descricao && <p className="text-sm text-muted" style={{ margin: 0 }}>{p.descricao}</p>}
              <ul className="plano-card-servicos">
                {p.servicos.map(s => (
                  <li key={s.id_servico}><span>{s.servico}</span><strong>{s.quantidade}×</strong></li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {p.assinaturas_ativas} assinatura{p.assinaturas_ativas !== 1 ? 's' : ''} ativa{p.assinaturas_ativas !== 1 ? 's' : ''}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(p)}>
                  <IconPencil style={{ width: 14, height: 14 }} /> Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <PlanoForm
          key={editando === 'novo' ? 'novo' : editando.id_plano}
          plano={editando === 'novo' ? null : editando}
          servicos={servicos}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); router.refresh() }}
        />
      )}
    </>
  )
}

function PlanoForm({ plano, servicos, onFechar, onSalvo }: {
  plano: Plano | null
  servicos: ServicoOpcao[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(plano?.nome ?? '')
  const [descricao, setDescricao] = useState(plano?.descricao ?? '')
  const [valor, setValor] = useState(plano ? String(plano.valor) : '')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(plano?.periodicidade ?? 'mensal')
  const [intervalo, setIntervalo] = useState(plano?.intervalo_dias ? String(plano.intervalo_dias) : '30')
  // id_servico → quantidade (só os marcados).
  const [itens, setItens] = useState<Record<string, number>>(
    () => Object.fromEntries((plano?.servicos ?? []).map(s => [s.id_servico, s.quantidade])),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Serviço desativado só aparece se já estiver no plano.
  const opcoes = servicos.filter(s => s.ativo || itens[s.id_servico] != null)
  const valorAvulso = Object.entries(itens).reduce((soma, [id, q]) => soma + (servicos.find(s => s.id_servico === id)?.preco ?? 0) * q, 0)

  function alternarServico(id: string) {
    setItens(prev => {
      const novo = { ...prev }
      if (novo[id] != null) delete novo[id]
      else novo[id] = 1
      return novo
    })
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const valorNum = Number(valor.replace(',', '.'))
    startTransition(async () => {
      const r = await salvarPlanoAction({
        id_plano: plano?.id_plano ?? null,
        nome,
        descricao,
        valor: valorNum,
        periodicidade,
        intervalo_dias: periodicidade === 'personalizado' ? Number(intervalo) : null,
        servicos: Object.entries(itens).map(([id_servico, quantidade]) => ({ id_servico, quantidade })),
      })
      if (r.error) setErro(r.error)
      else onSalvo()
    })
  }

  return (
    <div className="modal-overlay" onClick={() => !isPending && onFechar()}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{plano ? 'Editar plano' : 'Novo plano'}</h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar" disabled={isPending}>
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

            <div className="form-group">
              <label htmlFor="plano-nome" className="form-label form-label-required">Nome do plano</label>
              <input id="plano-nome" className="form-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Banho Premium" maxLength={100} required />
            </div>

            <div className="form-group">
              <label className="form-label form-label-required">Serviços incluídos e quantidade por período</label>
              {opcoes.length === 0 ? (
                <p className="text-sm text-muted" style={{ margin: 0 }}>Cadastre serviços em Serviços antes de criar um plano.</p>
              ) : (
                <div className="plano-form-servicos">
                  {opcoes.map(s => {
                    const marcado = itens[s.id_servico] != null
                    return (
                      <div key={s.id_servico} className={`plano-form-servico ${marcado ? 'is-marcado' : ''}`}>
                        <label className="flex items-center gap-2" style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                          <input type="checkbox" checked={marcado} onChange={() => alternarServico(s.id_servico)} />
                          <span className="plano-form-servico-nome">{s.nome}</span>
                          <span className="text-xs text-muted">{formatarReais(s.preco)} avulso</span>
                        </label>
                        {marcado && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: 72 }}
                              min={1}
                              max={999}
                              step={1}
                              value={itens[s.id_servico]}
                              aria-label={`Usos de ${s.nome} por período`}
                              onChange={e => setItens(prev => ({ ...prev, [s.id_servico]: Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))) }))}
                            />
                            <span className="text-xs text-muted">usos</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="plano-valor" className="form-label form-label-required">Valor (R$)</label>
                <input id="plano-valor" type="number" className="form-input" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="149.90" required />
                {valorAvulso > 0 && (
                  <span className="text-xs text-muted">Avulso esses serviços dariam {formatarReais(valorAvulso)} por período.</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="plano-periodo" className="form-label form-label-required">Período de cobrança</label>
                <select id="plano-periodo" className="form-select" value={periodicidade} onChange={e => setPeriodicidade(e.target.value as Periodicidade)}>
                  {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {periodicidade === 'personalizado' && (
              <div className="form-group">
                <label htmlFor="plano-intervalo" className="form-label form-label-required">Cobrar a cada quantos dias</label>
                <input id="plano-intervalo" type="number" className="form-input" min="1" max="730" step="1" value={intervalo} onChange={e => setIntervalo(e.target.value)} required />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="plano-descricao" className="form-label">Descrição (opcional)</label>
              <textarea id="plano-descricao" className="form-textarea" rows={2} maxLength={500} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="O que o cliente ganha com o plano" />
            </div>

            {plano && plano.assinaturas_ativas > 0 && (
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Quem já assinou continua pagando o valor da assinatura. Os serviços novos valem a partir do próximo período de cada assinatura.
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isPending || Object.keys(itens).length === 0}>
              {isPending ? 'Salvando...' : 'Salvar plano'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
