'use client'

import { useState, useTransition } from 'react'
import { criarAvaliacaoAction, editarAvaliacaoAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconClose } from '@/components/icons'
import EstrelasInput from './EstrelasInput'

const LIMITE_COMENTARIO = 500

export interface AvaliacaoExistente {
  id_avaliacao: string
  nota: number
  comentario: string | null
}

interface Props {
  idAgendamento: string
  nomePet: string
  nomeServico: string
  nomeLoja: string
  // Presente = editar a avaliação que já existe; ausente = primeira vez.
  // Continua sendo UMA avaliação por atendimento: editar só atualiza a
  // mesma linha (fn_editar_avaliacao), nunca cria outra.
  avaliacao?: AvaliacaoExistente | null
  onClose: () => void
}

export default function AvaliacaoModal({ idAgendamento, nomePet, nomeServico, nomeLoja, avaliacao, onClose }: Props) {
  const editando = !!avaliacao
  const [nota, setNota] = useState(avaliacao?.nota ?? 0)
  const [comentario, setComentario] = useState(avaliacao?.comentario ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [isPending, startTransition] = useTransition()

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    // useTransition já trava o botão enquanto envia; esse retorno cobre o
    // Enter apertado duas vezes antes do primeiro render com isPending.
    if (isPending) return
    if (nota < 1) {
      setErro('Escolha uma nota de 1 a 5 estrelas.')
      return
    }
    setErro(null)
    const fd = new FormData()
    fd.set('nota', String(nota))
    fd.set('comentario', comentario)
    startTransition(async () => {
      const result = editando
        ? await editarAvaliacaoAction(avaliacao!.id_avaliacao, fd)
        : await criarAvaliacaoAction(idAgendamento, fd)
      if (result?.error) {
        setErro(result.error)
        return
      }
      setEnviado(true)
    })
  }

  return (
    <div className="modal-overlay" onClick={() => !isPending && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{enviado ? 'Avaliação enviada' : editando ? 'Editar avaliação' : 'Como foi seu atendimento?'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {enviado ? (
          <>
            <div className="modal-body" style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
              <span style={{
                width: 52, height: 52, borderRadius: 'var(--radius-full)', margin: '0 auto var(--space-4)',
                background: 'var(--status-concluido-bg)', color: 'var(--status-concluido-fg)',
                display: 'grid', placeItems: 'center',
              }}>
                <IconCheck style={{ width: 26, height: 26 }} />
              </span>
              <p style={{ color: 'var(--gray-100)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Obrigado pela sua avaliação!
              </p>
              <p className="text-sm text-muted">Seu feedback ajuda a nossa loja a melhorar.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : (
          <form onSubmit={enviar}>
            <div className="modal-body">
              <div className="dash-detail-row"><span>Loja</span><span>{nomeLoja}</span></div>
              <div className="dash-detail-row"><span>Pet</span><span>{nomePet}</span></div>
              <div className="dash-detail-row" style={{ marginBottom: 'var(--space-5)' }}><span>Serviço</span><span>{nomeServico}</span></div>

              <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
                <EstrelasInput valor={nota} onChange={n => { setNota(n); setErro(null) }} desabilitado={isPending} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="avaliacao-comentario" className="form-label">Conte como foi sua experiência (opcional)</label>
                <textarea
                  id="avaliacao-comentario"
                  className="form-textarea"
                  rows={4}
                  maxLength={LIMITE_COMENTARIO}
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  placeholder="Ex: atendimento excelente, meu cachorro voltou muito feliz."
                  disabled={isPending}
                />
                <div className={`avaliacao-contador ${comentario.length >= LIMITE_COMENTARIO ? 'is-limite' : ''}`}>
                  {comentario.length}/{LIMITE_COMENTARIO}
                </div>
              </div>

              {erro && (
                <div className="alert alert-error" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>{erro}</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending}>Cancelar</button>
              <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending}>
                {isPending ? 'Enviando...' : editando ? 'Salvar alterações' : 'Enviar avaliação'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
