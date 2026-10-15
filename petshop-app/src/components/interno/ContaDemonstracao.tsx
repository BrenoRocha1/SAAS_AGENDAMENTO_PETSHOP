'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { criarContaDemoAction, entrarComoAction } from '@/lib/actions-interno'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import type { ResultadoDemo } from '@/lib/demo-loja'
import BotaoAcao from '@/components/interno/BotaoAcao'
import BotaoConfirmar, { useEstadoBotao } from '@/components/ui/botao-confirmar'

export interface ContaDemo { id: string; nome: string; slug: string | null; ativo: boolean }

// A conta de demonstração (loja de exemplo para apresentar o SAIP): criar,
// abrir, entrar e atualizar os dados de exemplo. Fica na Visão geral e em
// Empresas.
export default function ContaDemonstracao({ demo }: { demo: ContaDemo | null }) {
  const router = useRouter()
  const botao = useEstadoBotao()
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<ResultadoDemo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function criarOuAtualizar() {
    const pergunta = demo
      ? 'Atualizar os dados de demonstração? Só cria o que estiver faltando (nada é apagado).'
      : 'Criar a conta de demonstração? É uma loja nova, sem dono, com serviços, produtos, equipe, clientes, pets, agenda e vendas de exemplo.'
    if (!window.confirm(pergunta)) return
    setErro(null)
    setResultado(null)
    startTransition(async () => {
      const r = await criarContaDemoAction()
      if (r.error) { setErro(r.error); botao.erro(); return }
      await botao.sucesso()
      setResultado(r.demo ?? null)
      router.refresh()
    })
  }

  return (
    <div className="card interno-demo">
      <div className="interno-demo-topo">
        <div>
          <h2 className="interno-demo-titulo">Conta de demonstração</h2>
          {demo ? (
            <p className="text-sm text-muted">
              <strong>{demo.nome}</strong> · endereço público <code style={{ whiteSpace: 'nowrap' }}>/{demo.slug ?? demo.id}</code>
              {!demo.ativo && <span className="badge badge-inativo" style={{ marginLeft: 8 }}>Desativada</span>}
            </p>
          ) : (
            <p className="text-sm text-muted">
              Uma loja de exemplo completa para apresentar o SAIP: perfil, serviços, produtos com foto, equipe, clientes, pets, agenda e vendas.
              Ela não tem dono — a equipe entra por “Entrar na conta”.
            </p>
          )}
        </div>
        <div className="interno-acoes">
          {demo ? (
            <>
              <Link href={`${ROTA_INTERNA}/empresas/${demo.id}`} className="btn btn-secondary btn-sm">Ver no painel</Link>
              <a href={`/${demo.slug ?? demo.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Página pública</a>
              <BotaoConfirmar
                type="button"
                onClick={criarOuAtualizar}
                estado={botao.estadoCom(isPending)}
                className="btn btn-secondary btn-sm"
                rotuloPendente="Atualizando…"
                rotuloSucesso="Atualizado"
              >
                Atualizar dados
              </BotaoConfirmar>
              <BotaoAcao
                acao={entrarComoAction.bind(null, demo.id)}
                className="btn btn-primary btn-sm"
                confirmar={`Entrar na conta ${demo.nome}? Para voltar, use “Voltar ao painel” na faixa do topo.`}
              >
                Entrar na conta
              </BotaoAcao>
            </>
          ) : (
            <BotaoConfirmar
              type="button"
              onClick={criarOuAtualizar}
              estado={botao.estadoCom(isPending)}
              rotuloPendente="Criando…"
              rotuloSucesso="Conta criada"
            >
              Criar conta de exemplo
            </BotaoConfirmar>
          )}
        </div>
      </div>

      {isPending && <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>Isso pode levar até um minuto — não feche a página.</p>}
      {erro && <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-3)' }}><span>{erro}</span></div>}
      {resultado && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <ul className="interno-demo-lista">{resultado.feito.map(f => <li key={f}>{f}</li>)}</ul>
          {resultado.avisos.length > 0 && (
            <div className="alert alert-warning" role="status" style={{ marginTop: 'var(--space-3)', display: 'block' }}>
              <strong>Alguns itens não entraram:</strong>
              <ul className="interno-demo-lista">{resultado.avisos.map(a => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
