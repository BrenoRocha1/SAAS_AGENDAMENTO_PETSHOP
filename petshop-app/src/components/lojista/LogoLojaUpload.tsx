'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { atualizarLogoLojistaAction, removerLogoLojistaAction } from '@/lib/actions'
import { otimizarImagemParaUpload } from '@/lib/imagem'
import { IconAlert, IconCheck, IconClose, IconImage, IconPencil, IconPlus, IconTrash } from '@/components/icons'

interface Props {
  logoUrlInicial: string | null
}

const TAMANHO_MAXIMO = 5 * 1024 * 1024 // 5 MB — mesmo limite validado no servidor (migration 021)
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

export default function LogoLojaUpload({ logoUrlInicial }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = useState(logoUrlInicial)

  // Imagem escolhida e já otimizada no navegador, aguardando confirmação
  // (o upload em si só acontece quando o usuário clica em "Salvar imagem"
  // — selecionar o arquivo não sobe nada sozinho).
  const [pendente, setPendente] = useState<{ blob: Blob; extensao: string; preview: string } | null>(null)
  const [processando, setProcessando] = useState(false)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)

  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isPendingRemover, startRemoverTransition] = useTransition()

  // Libera a URL de preview da memória quando troca de imagem pendente
  // ou quando o componente desmonta — createObjectURL não se limpa sozinho.
  useEffect(() => {
    return () => { if (pendente) URL.revokeObjectURL(pendente.preview) }
  }, [pendente])

  async function handleSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo depois de cancelar
    if (!arquivo) return

    setErro(null)
    setSucesso(null)

    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      setErro('Formato inválido. Envie um arquivo JPG, PNG ou WEBP.')
      return
    }

    setProcessando(true)
    try {
      const otimizada = await otimizarImagemParaUpload(arquivo)
      if (otimizada.blob.size > TAMANHO_MAXIMO) {
        setErro('Imagem muito grande mesmo após otimização. Tente uma imagem menor.')
        return
      }
      if (pendente) URL.revokeObjectURL(pendente.preview)
      setPendente({ blob: otimizada.blob, extensao: otimizada.extensao, preview: URL.createObjectURL(otimizada.blob) })
    } catch {
      setErro('Não foi possível processar essa imagem. Tente outro arquivo.')
    } finally {
      setProcessando(false)
    }
  }

  function cancelarSelecao() {
    if (pendente) URL.revokeObjectURL(pendente.preview)
    setPendente(null)
    setErro(null)
  }

  function handleSalvar() {
    if (!pendente) return
    setErro(null)
    const formData = new FormData()
    formData.set('logo', pendente.blob, `logo.${pendente.extensao}`)

    startTransition(async () => {
      const result = await atualizarLogoLojistaAction(formData)
      if (result?.error) {
        setErro(result.error)
        return
      }
      URL.revokeObjectURL(pendente.preview)
      setPendente(null)
      setLogoUrl(result?.url ?? null)
      setSucesso('Imagem da loja atualizada com sucesso!')
      setTimeout(() => setSucesso(null), 3000)
    })
  }

  function handleRemover() {
    setErro(null)
    startRemoverTransition(async () => {
      const result = await removerLogoLojistaAction()
      setConfirmandoRemocao(false)
      if (result?.error) {
        setErro(result.error)
        return
      }
      setLogoUrl(null)
      setSucesso('Imagem removida.')
      setTimeout(() => setSucesso(null), 3000)
    })
  }

  const isPendingQualquer = isPending || isPendingRemover || processando

  return (
    <div className="card" style={{ maxWidth: 700 }}>
      <h4 style={{ marginBottom: 'var(--space-4)', color: 'var(--gray-300)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Identidade Visual
      </h4>

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}
      {sucesso && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{sucesso}</span>
        </div>
      )}

      <div className="flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--gray-800)',
            background: 'var(--gray-850)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {pendente ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview local (blob:), não é um asset servido pelo Next
            <img src={pendente.preview} alt="Prévia da nova imagem" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
            <img src={logoUrl} alt="Imagem da loja" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <IconImage style={{ width: 28, height: 28, color: 'var(--gray-600)' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          {!logoUrl && !pendente && (
            <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
              Adicione uma imagem para representar sua loja.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleSelecionarArquivo}
            style={{ display: 'none' }}
            disabled={isPendingQualquer}
          />

          {pendente ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-primary btn-sm ${isPending ? 'btn-loading' : ''}`}
                onClick={handleSalvar}
                disabled={isPendingQualquer}
              >
                {isPending ? 'Enviando...' : 'Salvar imagem'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelarSelecao} disabled={isPendingQualquer}>
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => inputRef.current?.click()}
                disabled={isPendingQualquer}
              >
                {logoUrl
                  ? <><IconPencil style={{ width: 14, height: 14 }} /> Alterar imagem</>
                  : <><IconPlus style={{ width: 14, height: 14 }} /> Adicionar imagem</>}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmandoRemocao(true)}
                  disabled={isPendingQualquer}
                >
                  <IconTrash style={{ width: 14, height: 14 }} /> Remover imagem
                </button>
              )}
            </div>
          )}

          {processando && <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Processando imagem...</p>}
          <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
            JPG, PNG ou WEBP · até 5 MB
          </p>
        </div>
      </div>

      {confirmandoRemocao && (
        <div className="modal-overlay" onClick={() => !isPendingRemover && setConfirmandoRemocao(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Remover imagem</h3>
              <button className="modal-close" onClick={() => setConfirmandoRemocao(false)} aria-label="Fechar" disabled={isPendingRemover}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-full)', flexShrink: 0,
                  background: 'rgba(239,68,68,0.1)', color: 'var(--danger-400)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <IconAlert style={{ width: 18, height: 18 }} />
                </span>
                <p style={{ color: 'var(--gray-200)' }}>
                  Tem certeza que deseja remover a imagem da loja?
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmandoRemocao(false)} disabled={isPendingRemover}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn btn-danger ${isPendingRemover ? 'btn-loading' : ''}`}
                onClick={handleRemover}
                disabled={isPendingRemover}
              >
                {isPendingRemover ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
