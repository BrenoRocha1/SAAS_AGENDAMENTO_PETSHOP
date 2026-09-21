'use client'

import { useState, useTransition } from 'react'
import { movimentarEstoqueAction } from '@/lib/actions'
import { rotuloUnidade } from '@/lib/produto'
import CampoQuantidade from './CampoQuantidade'
import { IconAlert, IconClose } from '@/components/icons'

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

// Compartilhado entre a tela de Produtos e a tela de Estoque. Em vez de
// pedir "quanto entrou/saiu" (confuso — a pessoa tem que fazer conta de
// cabeça), a modal já abre com o estoque atual preenchido: quem usa só
// corrige pro número certo, e aqui dentro é que se calcula a diferença
// pra registrar como entrada ou saída em fn_movimentar_estoque (o
// histórico continua guardando um movimento de verdade, não um valor
// absoluto solto).
export default function AjustarEstoqueModal({ produto, onClose, onSucesso }: Props) {
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const formData = new FormData(e.currentTarget)

    const novoValor = parseFloat(formData.get('quantidade') as string)
    if (isNaN(novoValor) || novoValor < 0) {
      setErro('Informe uma quantidade válida.')
      return
    }

    const diferenca = Math.round((novoValor - produto.estoque_atual) * 1000) / 1000
    if (diferenca === 0) {
      onClose()
      return
    }

    const fd = new FormData()
    fd.set('tipo', diferenca > 0 ? 'entrada' : 'saida')
    fd.set('quantidade', String(Math.abs(diferenca)))
    const motivo = formData.get('motivo') as string
    if (motivo) fd.set('motivo', motivo)

    startTransition(async () => {
      const result = await movimentarEstoqueAction(produto.id_produto, fd)
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
              <strong style={{ color: 'var(--gray-200)' }}>{produto.nome}</strong>
            </p>

            {erro && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
              </div>
            )}

            <div className="form-grid-2">
              <CampoQuantidade
                name="quantidade"
                label={`Estoque atual (${rotuloUnidade(produto.unidade_venda)})`}
                required
                unidadeVenda={produto.unidade_venda}
                valorInicial={produto.estoque_atual}
                autoFocus
              />
              <div className="form-group">
                <label htmlFor="motivo" className="form-label">Motivo (opcional)</label>
                <input id="motivo" name="motivo" type="text" className="form-input" placeholder="Ex: Compra de fornecedor" maxLength={200} />
              </div>
            </div>
            <p className="text-xs text-muted">Corrija pro valor que a loja tem agora — o sistema calcula sozinho se foi entrada ou saída.</p>
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
