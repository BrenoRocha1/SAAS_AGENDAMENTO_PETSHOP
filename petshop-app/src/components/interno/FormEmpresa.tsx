'use client'

import { useState, useTransition } from 'react'
import { editarEmpresaAction } from '@/lib/actions-interno'

export default function FormEmpresa({
  id, nome_loja, telefone, cidade, estado,
}: { id: string; nome_loja: string; telefone: string; cidade: string; estado: string }) {
  const [dados, setDados] = useState({ nome_loja, telefone, cidade, estado })
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pendente, iniciar] = useTransition()

  const mudar = (campo: keyof typeof dados) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDados(d => ({ ...d, [campo]: e.target.value }))

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setOk(false)
    iniciar(async () => {
      const r = await editarEmpresaAction(id, dados)
      if (r.error) setErro(r.error)
      else setOk(true)
    })
  }

  return (
    <form onSubmit={enviar} className="card" style={{ padding: 'var(--space-5)' }}>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label" htmlFor="emp-nome">Nome da loja</label>
          <input id="emp-nome" className="form-input" value={dados.nome_loja} onChange={mudar('nome_loja')} required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="emp-tel">Telefone</label>
          <input id="emp-tel" className="form-input" value={dados.telefone} onChange={mudar('telefone')} required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="emp-cidade">Cidade</label>
          <input id="emp-cidade" className="form-input" value={dados.cidade} onChange={mudar('cidade')} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="emp-uf">UF</label>
          <input id="emp-uf" className="form-input" maxLength={2} value={dados.estado} onChange={mudar('estado')} />
        </div>
      </div>
      {erro && <div className="alert alert-error" role="alert"><span>{erro}</span></div>}
      {ok && <div className="alert alert-success" role="status"><span>Dados salvos.</span></div>}
      <button type="submit" className="btn btn-primary" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar dados'}</button>
    </form>
  )
}
