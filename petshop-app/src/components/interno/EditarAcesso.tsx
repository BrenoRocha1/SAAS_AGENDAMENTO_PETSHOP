'use client'

import { useState, useTransition } from 'react'
import { definirAcessoAteAction } from '@/lib/actions-interno'

// O campo é sempre no horário de Brasília (UTC−3, sem horário de verão desde
// 2019), qualquer que seja o fuso do computador de quem abre o painel — e o
// servidor (UTC) mostra o mesmo valor que o navegador.
const FUSO_BRASILIA = '-03:00'
const fmtCampo = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})

// ISO → "AAAA-MM-DDTHH:mm" (o formato do <input datetime-local>).
function paraCampo(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtCampo.format(d).replace(' ', 'T')
}

// "AAAA-MM-DDTHH:mm" em Brasília → ISO.
function doCampo(valor: string): string {
  return new Date(`${valor}:00${FUSO_BRASILIA}`).toISOString()
}

export default function EditarAcesso({ idLojista, acessoAte }: { idLojista: string; acessoAte: string | null }) {
  const [valor, setValor] = useState(() => paraCampo(acessoAte))
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pendente, iniciar] = useTransition()

  function salvar(quando: string, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return
    setErro(null)
    setOk(false)
    iniciar(async () => {
      const r = await definirAcessoAteAction(idLojista, quando)
      if (r.error) { setErro(r.error); return }
      // "Bloquear agora" também atualiza o campo.
      setValor(paraCampo(quando))
      setOk(true)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label className="form-label" htmlFor="acesso-ate">Acesso vai até (horário de Brasília)</label>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <input id="acesso-ate" type="datetime-local" className="form-input" value={valor} onChange={e => { setValor(e.target.value); setOk(false) }} style={{ maxWidth: 240 }} />
        <button type="button" className="btn btn-primary btn-sm" disabled={pendente || !valor} onClick={() => salvar(doCampo(valor))}>
          {pendente ? 'Salvando…' : 'Salvar data'}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={pendente}
          onClick={() => salvar(new Date().toISOString(), 'Bloquear o acesso desta empresa agora?')}
        >
          Bloquear agora
        </button>
      </div>
      {erro && <span className="form-error">{erro}</span>}
      {ok && <span className="text-sm text-success">Salvo.</span>}
    </div>
  )
}
