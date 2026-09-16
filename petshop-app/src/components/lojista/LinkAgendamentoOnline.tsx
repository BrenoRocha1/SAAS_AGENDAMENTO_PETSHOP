'use client'

import { useEffect, useState, useTransition } from 'react'
import { atualizarSlugLojistaAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconCopy, IconLink } from '@/components/icons'

interface Props {
  idLojista: string
  slugAtual: string | null
}

export default function LinkAgendamentoOnline({ idLojista, slugAtual }: Props) {
  const [copiado, setCopiado] = useState(false)
  // window.location.origin só existe no navegador — evita hardcodar
  // domínio (funciona igual em dev, preview e produção). Fica vazio no
  // primeiro render do servidor e preenche assim que monta no cliente.
  const [origem, setOrigem] = useState('')
  const [slugSalvo, setSlugSalvo] = useState(slugAtual)
  const [slug, setSlug] = useState(slugAtual ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window só existe pós-montagem; não é "espelhar prop", é sincronizar com um sistema externo (mesmo padrão de LojistaSidebar.tsx)
    setOrigem(window.location.origin)
  }, [])

  const link = `${origem}/agendamento/${slugSalvo ?? idLojista}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // clipboard indisponível (http sem TLS, permissão negada etc.) — sem alarde, o link já está selecionável no input
    }
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(false)
    const fd = new FormData()
    fd.set('slug', slug)
    startTransition(async () => {
      const result = await atualizarSlugLojistaAction(fd)
      if (result?.error) { setErro(result.error); return }
      setSlug(result?.slug ?? slug)
      setSlugSalvo(result?.slug ?? slug)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    })
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconLink style={{ width: 17, height: 17 }} /></span>
        <div>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Link de agendamento</div>
          <div className="text-sm text-muted">Compartilhe com seus clientes (WhatsApp, Instagram, etc.) para eles agendarem direto.</div>
        </div>
      </div>

      <label className="form-label">Link da sua loja</label>
      <button
        type="button"
        onClick={copiar}
        title={copiado ? 'Copiado!' : 'Copiar link'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          width: '100%',
          border: '1px solid var(--gray-700)',
          borderRadius: 'var(--radius-full)',
          background: 'var(--gray-850)',
          padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
          cursor: 'pointer',
          marginBottom: 'var(--space-5)',
        }}
      >
        <span className="text-sm" style={{ color: 'var(--info-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {link}
        </span>
        <span className="dash-icon-btn" style={{ flexShrink: 0, cursor: 'pointer' }}>
          {copiado ? <IconCheck style={{ color: 'var(--success-400)' }} /> : <IconCopy />}
        </span>
      </button>

      <form onSubmit={salvar} style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--gray-800)' }}>
        <label className="form-label" htmlFor="slug-loja">
          {slugSalvo ? 'Trocar o nome do link' : 'Personalizar o nome do link'}
        </label>
        <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-3)' }}>
          Só letras minúsculas, números e hífen. Precisa ser único — se já estiver em uso, tente outro nome.
        </p>

        {erro && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-3)' }}>
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>{erro}</span>
          </div>
        )}
        {sucesso && (
          <div className="alert alert-success" style={{ marginBottom: 'var(--space-3)' }}>
            <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>Link atualizado com sucesso!</span>
          </div>
        )}

        <div className="flex gap-2">
          <div className="form-input" style={{ display: 'flex', alignItems: 'center', gap: 0, padding: 0, overflow: 'hidden', flex: 1 }}>
            <span className="text-sm text-muted" style={{ padding: '0 0 0 var(--space-3)', whiteSpace: 'nowrap' }}>/agendamento/</span>
            <input
              id="slug-loja"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase())}
              placeholder="petshopbacanadopedro"
              maxLength={60}
              style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, padding: 'var(--space-3) var(--space-3) var(--space-3) 2px', minWidth: 0 }}
            />
          </div>
          <button
            type="submit"
            className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending || !slug || slug === slugSalvo}
            style={{ flexShrink: 0 }}
          >
            {isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
