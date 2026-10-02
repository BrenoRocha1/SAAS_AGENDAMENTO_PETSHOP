'use client'

import { useState, useTransition } from 'react'
import { movimentarEstoqueAction } from '@/lib/actions'
import { rotuloEstoqueApp, rotuloUnidade, unidadeFracionavel } from '@/lib/produto'
import { Folha, Segmentos } from '@/components/app/PecasApp'
import { IconAlert } from '@/components/icons'

interface ProdutoResumo {
  id_produto: string
  nome: string
  unidade_venda: string
  estoque_atual: number
  estoque_minimo: number
  status: string
}

interface Props {
  produto: ProdutoResumo
  // Veio da outra aba do painel: não repete a subida.
  semSubir?: boolean
  // Ativando/desativando o produto (a loja confirma antes, fora daqui).
  ocupado?: boolean
  onFechar: () => void
  onAbrirDados: () => void
  onMovimentado: (novoEstoque: number) => void
  onPedirStatus: () => void
}

// Celular: a aba "Estoque" do painel do produto, como no app — dar
// entrada ou saída e ativar/desativar. (No computador o estoque se
// corrige pelo AjustarEstoqueModal.)
export default function ProdutoEstoqueFolha({ produto, semSubir, ocupado, onFechar, onAbrirDados, onMovimentado, onPedirStatus }: Props) {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fracionavel = unidadeFracionavel(produto.unidade_venda)
  const ativo = produto.status === 'Ativo'

  function registrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const dados = new FormData(e.currentTarget)
    const quantidade = parseFloat(String(dados.get('quantidade') ?? '').replace(',', '.'))
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setErro('Informe uma quantidade maior que zero.')
      return
    }
    setErro(null)
    const fd = new FormData()
    fd.set('tipo', tipo)
    fd.set('quantidade', String(quantidade))
    const motivo = String(dados.get('motivo') ?? '').trim()
    if (motivo) fd.set('motivo', motivo)
    startTransition(async () => {
      const r = await movimentarEstoqueAction(produto.id_produto, fd)
      if (r?.error) {
        setErro(r.error)
        return
      }
      onMovimentado(r.novoEstoque as number)
    })
  }

  return (
    <Folha titulo={produto.nome} onFechar={onFechar} ocupado={isPending || ocupado} semSubir={semSubir}>
      <Segmentos
        valor="estoque"
        onChange={v => { if (v === 'dados') onAbrirDados() }}
        opcoes={[{ valor: 'estoque', rotulo: 'Estoque' }, { valor: 'dados', rotulo: 'Dados do produto' }]}
      />
      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}
      <span className="sub-app">
        Em estoque: {rotuloEstoqueApp(produto.estoque_atual, produto.unidade_venda)}
        {produto.estoque_minimo > 0 ? ` · mínimo ${rotuloEstoqueApp(produto.estoque_minimo, produto.unidade_venda)}` : ''}
      </span>
      <Segmentos
        valor={tipo}
        onChange={setTipo}
        opcoes={[{ valor: 'entrada', rotulo: 'Entrada (chegou)' }, { valor: 'saida', rotulo: 'Saída (baixa)' }]}
      />
      <form onSubmit={registrar} className="tela-app-pilha">
        <div className="form-group">
          <label htmlFor="estoque-quantidade" className="form-label">Quantidade ({rotuloUnidade(produto.unidade_venda).toLowerCase()})</label>
          <input
            id="estoque-quantidade"
            name="quantidade"
            type="text"
            inputMode={fracionavel ? 'decimal' : 'numeric'}
            className="form-input"
            placeholder={fracionavel ? 'Ex.: 2,5' : 'Ex.: 3'}
            maxLength={10}
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label htmlFor="estoque-motivo" className="form-label">Motivo (opcional)</label>
          <input id="estoque-motivo" name="motivo" type="text" className="form-input" placeholder="Ex.: compra do fornecedor" maxLength={200} />
        </div>
        <button type="submit" className="botao-app" disabled={isPending || ocupado}>
          {isPending ? 'Salvando...' : tipo === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}
        </button>
        <button type="button" className={`botao-app ${ativo ? 'is-perigo' : 'is-secundario'}`} onClick={onPedirStatus} disabled={isPending || ocupado}>
          {ativo ? 'Desativar produto' : 'Reativar produto'}
        </button>
      </form>
    </Folha>
  )
}
