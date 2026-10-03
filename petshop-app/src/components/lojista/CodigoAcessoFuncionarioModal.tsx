'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gerarCodigoAcessoFuncionarioAction } from '@/lib/actions'
import { IconAlert, IconClose } from '@/components/icons'

interface Props {
  idFuncionario: string
  nome: string
  onClose: () => void
}

// Abre já gerando o código deste funcionário. Ele vale 1 minuto e é de uso
// único: o funcionário digita em /login/funcionario e entra direto, sem
// e-mail nem senha. Enquanto a modal fica aberta, um código novo é gerado
// quando o atual vence.
export default function CodigoAcessoFuncionarioModal({ idFuncionario, nome, onClose }: Props) {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [expiraEm, setExpiraEm] = useState<number | null>(null)
  const [agora, setAgora] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iniciou = useRef(false)

  const gerarCodigo = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await gerarCodigoAcessoFuncionarioAction(idFuncionario)
    if (res.error) {
      setError(res.error)
      setCodigo(null)
      setExpiraEm(null)
    } else if (res.codigo && res.expiracao) {
      const fim = new Date(res.expiracao).getTime()
      const t = Date.now()
      setCodigo(res.codigo)
      setAgora(t)
      // Já vencido pelo relógio deste aparelho (relógio adiantado): não
      // renova sozinho, senão geraria um código novo a cada segundo.
      setExpiraEm(fim > t ? fim : null)
    }
    setLoading(false)
  }, [idFuncionario])

  // Gera ao abrir. O ref evita gerar duas vezes no modo de desenvolvimento
  // do React, que monta o efeito duas vezes.
  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    gerarCodigo()
  }, [gerarCodigo])

  // A contagem sai do horário de expiração, não de um contador que desconta
  // 1 por segundo (esse atrasa quando o navegador segura o timer da aba e
  // mostra código já vencido). Ao vencer, gera o próximo aqui no timer,
  // nunca dentro do updater do setState.
  useEffect(() => {
    if (!expiraEm) return
    const timer = setInterval(() => {
      const t = Date.now()
      setAgora(t)
      if (t >= expiraEm) {
        clearInterval(timer)
        setExpiraEm(null)
        gerarCodigo()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [expiraEm, gerarCodigo])

  const tempoRestante = expiraEm ? Math.max(0, Math.ceil((expiraEm - agora) / 1000)) : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Código de acesso rápido</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted">
            Código de <strong style={{ color: 'var(--gray-200)' }}>{nome}</strong>. Na tela de login, em
            &quot;Código de acesso rápido&quot;, basta digitar estes 6 números — não precisa de e-mail nem senha.
          </p>

          {error && (
            <div className="alert alert-error">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
            </div>
          )}

          <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
            {codigo ? (
              <>
                <div style={{ fontSize: '2.5rem', letterSpacing: '0.3em', fontWeight: 800, color: 'var(--primary-500)', fontVariantNumeric: 'tabular-nums' }}>
                  {codigo}
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 'var(--space-2)' }}>
                  {loading
                    ? 'Gerando um novo...'
                    : <>Vale por mais <strong style={{ color: tempoRestante <= 10 ? 'var(--danger-500)' : 'inherit' }}>{tempoRestante}s</strong> · uso único</>}
                </div>
              </>
            ) : loading ? (
              <div className="text-sm text-muted">Gerando código...</div>
            ) : (
              <button type="button" className="btn btn-primary" onClick={gerarCodigo}>
                Tentar de novo
              </button>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
