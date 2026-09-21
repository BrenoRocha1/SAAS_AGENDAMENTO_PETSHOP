'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cancelarAgendamentoAction } from '@/lib/actions'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import { rotuloEstoque } from '@/lib/produto'
import { IconAlert, IconPackage, IconPencil, IconScissors, IconStar, IconTrash } from '@/components/icons'
import AvaliacaoModal, { type AvaliacaoExistente } from './AvaliacaoModal'
import { Estrelas } from './Estrelas'

export interface AgendamentoCliente {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  valor: number
  obs: string | null
  pet: { nome: string; raca: string } | null
  servico: { nome: string; duracao: number } | null
  lojista: { nome_loja: string; telefone: string } | null
}

// Produto comprado junto de um agendamento (migration 039) — preço já é
// o cobrado no momento da compra, não o preço atual do catálogo.
export interface ProdutoComprado {
  nome: string
  unidade_venda: string
  quantidade: number
  preco_unitario: number
}

interface Props {
  agendamentos: AgendamentoCliente[]
  // Avaliações que o próprio cliente já deixou, indexadas pelo agendamento
  // (no máximo uma por atendimento — UNIQUE no banco).
  avaliacoes: Record<string, AvaliacaoExistente>
  // Produtos comprados junto, indexados pelo agendamento — vazio na
  // maioria dos casos (produto é opcional no agendamento online).
  produtosComprados: Record<string, ProdutoComprado[]>
}

export default function AgendamentosClienteList({ agendamentos, avaliacoes, produtosComprados }: Props) {
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [avaliando, setAvaliando] = useState<AgendamentoCliente | null>(null)

  function handleCancel(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await cancelarAgendamentoAction(id, motivo || undefined)
      if (result?.error) setError(result.error)
      else {
        setCancelId(null)
        setMotivo('')
      }
    })
  }

  if (!agendamentos.length) {
    return (
      <div className="empty-state card">
        <IconScissors style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Nenhum agendamento encontrado</div>
        <p>Você ainda não realizou nenhum agendamento</p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16 }} /><span>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {agendamentos.map(ag => {
          const podeCanc = ['Pendente', 'Confirmado'].includes(ag.status)
          const isCanceling = cancelId === ag.id_agendamento

          return (
            <div key={ag.id_agendamento} className="card animate-slide-up">
              <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--primary-soft-bg)',
                      border: '1px solid var(--primary-soft-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary-400)',
                      flexShrink: 0,
                    }}
                  >
                    <IconScissors style={{ width: 20, height: 20 }} />
                  </div>
                  <div>
                    <h4 style={{ marginBottom: 2 }}>{ag.servico?.nome}</h4>
                    <span className="text-sm text-muted">{ag.lojista?.nome_loja}</span>
                  </div>
                </div>
                <span className={`badge ${classeBadgeStatus(ag.status)}`}>
                  {rotuloStatus(ag.status)}
                </span>
              </div>

              <div className="form-grid-2" style={{ marginBottom: 'var(--space-4)' }}>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Pet</div>
                  <div className="font-semibold">{ag.pet?.nome} — {ag.pet?.raca}</div>
                </div>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Data e Horário</div>
                  <div className="font-semibold">
                    {format(new Date(ag.dt_agendamento + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })} às {ag.hr_agendamento?.slice(0, 5)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Duração</div>
                  <div className="font-semibold">{ag.servico?.duracao} min</div>
                </div>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Valor</div>
                  <div className="font-semibold text-success">R$ {Number(ag.valor).toFixed(2)}</div>
                </div>
              </div>

              {produtosComprados[ag.id_agendamento]?.length > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Produtos comprados</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {produtosComprados[ag.id_agendamento].map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1" style={{ color: 'var(--gray-300)' }}>
                          <IconPackage style={{ width: 12, height: 12, color: 'var(--gray-500)' }} /> {p.nome} — {rotuloEstoque(p.quantidade, p.unidade_venda)}
                        </span>
                        <span className="font-semibold text-success">R$ {(p.preco_unitario * p.quantidade).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ag.obs && (
                <div
                  style={{
                    background: 'var(--gray-850)',
                    border: '1px solid var(--gray-800)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: '0.875rem',
                    color: 'var(--gray-400)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  {ag.obs}
                </div>
              )}

              {/* Avaliação — só existe pra atendimento Finalizado ('Concluído').
                  A mesma regra é conferida no banco (fn_criar_avaliacao);
                  aqui é só pra não oferecer o botão onde não cabe. */}
              {ag.status === 'Concluído' && (() => {
                const avaliacao = avaliacoes[ag.id_agendamento]
                if (!avaliacao) {
                  return (
                    <button className="btn btn-primary btn-sm" onClick={() => setAvaliando(ag)}>
                      <IconStar style={{ width: 14, height: 14 }} /> Avaliar atendimento
                    </button>
                  )
                }
                return (
                  <div style={{ borderTop: '1px solid var(--gray-800)', paddingTop: 'var(--space-3)' }}>
                    <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Sua avaliação</span>
                        <Estrelas nota={avaliacao.nota} />
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setAvaliando(ag)}>
                        <IconPencil style={{ width: 13, height: 13 }} /> Editar
                      </button>
                    </div>
                    {avaliacao.comentario && (
                      <p className="text-sm" style={{ color: 'var(--gray-300)', marginTop: 'var(--space-2)', wordBreak: 'break-word' }}>
                        &ldquo;{avaliacao.comentario}&rdquo;
                      </p>
                    )}
                  </div>
                )
              })()}

              {podeCanc && !isCanceling && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => { setCancelId(ag.id_agendamento); setMotivo('') }}
                >
                  <IconTrash style={{ width: 14, height: 14 }} /> Cancelar Agendamento
                </button>
              )}

              {isCanceling && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label">Motivo do cancelamento (opcional)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      placeholder="Ex: compromisso de última hora"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleCancel(ag.id_agendamento)}
                      disabled={isPending}
                    >
                      {isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setCancelId(null); setMotivo('') }}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {avaliando && (
        <AvaliacaoModal
          idAgendamento={avaliando.id_agendamento}
          nomePet={avaliando.pet?.nome ?? 'Pet'}
          nomeServico={avaliando.servico?.nome ?? 'Serviço'}
          nomeLoja={avaliando.lojista?.nome_loja ?? ''}
          avaliacao={avaliacoes[avaliando.id_agendamento] ?? null}
          onClose={() => setAvaliando(null)}
        />
      )}
    </>
  )
}
