'use client'

import { useState, useTransition } from 'react'
import { movimentarEstoqueAction } from '@/lib/actions'
import { rotuloEstoque } from '@/lib/produto'
import CampoQuantidade from './CampoQuantidade'
import { IconAlert, IconClose, IconMinus, IconPlus } from '@/components/icons'

interface ProdutoResumo {
  id_produto: string
  nome: string
  unidade_venda: string
  estoque_atual: number
}

interface Props {
  produto: ProdutoResumo
  onClose: () => void
  onSucesso: (novoEstoque: number) => void
}

// Compartilhado entre a tela de Produtos e a tela de Estoque — as duas
// precisam do mesmo "+ / - estoque" rápido, só mudam onde o botão que
// abre isso fica.
export default function AjustarEstoqueModal({ produto, onClose, onSucesso }: Props) {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const formData = new FormData(e.currentTarget)
    formData.set('tipo', tipo)

    startTransition(async () => {
      const result = await movimentarEstoqueAction(produto.id_produto, formData)
      if (result?.error) {
        setErro(result.error)
        return
      }
      onSucesso(result.novoEstoque as number)
    })
  }

  return (
    <div className="modal-overlay" onClick={() => !isPending && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Ajustar estoque</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-sm text-muted">
              <strong style={{ color: 'var(--gray-200)' }}>{produto.nome}</strong> — estoque atual: {rotuloEstoque(produto.estoque_atual, produto.unidade_venda)}
            </p>

            {erro && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Tipo de movimentação</label>
              <div className="flex gap-2">
                <button type="button" className={`btn btn-sm ${tipo === 'entrada' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('entrada')}>
                  <IconPlus style={{ width: 14, height: 14 }} /> Adicionar
                </button>
                <button type="button" className={`btn btn-sm ${tipo === 'saida' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('saida')}>
                  <IconMinus style={{ width: 14, height: 14 }} /> Remover
                </button>
              </div>
            </div>

            <div className="form-grid-2">
              <CampoQuantidade name="quantidade" label="Quantidade" required unidadeVenda={produto.unidade_venda} autoFocus />
              <div className="form-group">
                <label htmlFor="motivo" className="form-label">Motivo (opcional)</label>
                <input id="motivo" name="motivo" type="text" className="form-input" placeholder="Ex: Compra de fornecedor" maxLength={200} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending}>
              Cancelar
            </button>
            <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending}>
              {isPending ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
