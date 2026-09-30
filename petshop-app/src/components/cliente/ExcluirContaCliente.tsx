'use client'

import { useState, useTransition } from 'react'
import { excluirMinhaContaAction } from '@/lib/actions'
import { IconAlert, IconTrash } from '@/components/icons'

// LGPD — "Excluir minha conta" (migration 072). Duas etapas: abrir e
// digitar EXCLUIR. Explica o que some e o que fica com as lojas.
export default function ExcluirContaCliente() {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const confirmado = texto.trim().toUpperCase() === 'EXCLUIR'

  function excluir() {
    setErro(null)
    startTransition(async () => {
      // Deu certo: a ação redireciona para o login.
      const r = await excluirMinhaContaAction(texto)
      if (r?.error) setErro(r.error)
    })
  }

  return (
    <div className="card excluir-conta" style={{ maxWidth: 640, marginTop: 'var(--space-8)' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--danger-400)' }}>Excluir minha conta</h3>
      <p className="text-sm text-muted" style={{ margin: 'var(--space-2) 0 0' }}>
        Apaga seus dados pessoais de vez (direito previsto na LGPD). Não dá para desfazer.
      </p>

      {!aberto ? (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-3)', color: 'var(--danger-400)' }} onClick={() => setAberto(true)}>
          <IconTrash style={{ width: 14, height: 14 }} /> Quero excluir minha conta
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <div className="text-sm" style={{ color: 'var(--gray-300)' }}>
            <strong>O que acontece:</strong>
            <ul style={{ margin: 'var(--space-1) 0 0', paddingLeft: 'var(--space-5)' }}>
              <li>Seu cadastro (nome, CPF, e-mail e telefone), seus pets e fotos e suas avaliações são apagados.</li>
              <li>Agendamentos que ainda estavam marcados são cancelados, e planos ativos param de cobrar.</li>
              <li>As lojas mantêm só o registro dos atendimentos e pagamentos já feitos, sem seu nome, endereço ou observações (exigência fiscal).</li>
              <li>Você sai do sistema e não consegue mais entrar com esta conta.</li>
            </ul>
          </div>

          {erro && (
            <div className="alert alert-error">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="excluir-confirmacao" className="form-label">Digite EXCLUIR para confirmar</label>
            <input
              id="excluir-confirmacao"
              className="form-input"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-danger btn-sm" onClick={excluir} disabled={!confirmado || isPending}>
              {isPending ? 'Excluindo...' : 'Excluir minha conta'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAberto(false); setTexto(''); setErro(null) }} disabled={isPending}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
