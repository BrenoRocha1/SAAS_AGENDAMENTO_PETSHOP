'use client'

import { useState, useEffect } from 'react'
import { gerarCodigoLoginFuncionarioAction } from '@/lib/actions'
import { IconAlert } from '@/components/icons'

export default function GeradorCodigoLogin() {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [expiraEm, setExpiraEm] = useState<number | null>(null)
  const [agora, setAgora] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gerarCodigo = async () => {
    setLoading(true)
    setError(null)
    const res = await gerarCodigoLoginFuncionarioAction()
    if (res.error) {
      setError(res.error)
      // Volta pro botão — sem isso o código vencido ficava na tela sem
      // como tentar de novo.
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
  }

  // A contagem sai do horário de expiração, não de um contador que desconta
  // 1 por segundo (esse atrasa quando o navegador segura o timer da aba, e
  // o código na tela já tinha vencido no servidor). Ao vencer, gera o
  // próximo — aqui no timer, nunca dentro do updater do setState (lá
  // disparava o aviso "Cannot update a component while rendering" e, em
  // dev, rodava duas vezes).
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
  }, [expiraEm])

  const tempoRestante = expiraEm ? Math.max(0, Math.ceil((expiraEm - agora) / 1000)) : 0

  return (
    <div className="card" style={{ marginBottom: 'var(--space-6)', background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <IconAlert style={{ width: 18, height: 18, color: 'var(--primary-500)' }} />
        Código Rápido de Login
      </h3>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
        Use este código para permitir que seus funcionários entrem rapidamente pelo terminal da loja.
      </p>
      
      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {codigo ? (
          <>
            <div style={{ fontSize: '2rem', letterSpacing: '0.25em', fontWeight: 800, color: 'var(--primary-500)' }}>
              {codigo}
            </div>
            <div className="text-sm text-muted">
              Atualiza em <strong style={{ color: tempoRestante <= 10 ? 'var(--danger-500)' : 'inherit' }}>{tempoRestante}s</strong>
            </div>
          </>
        ) : (
          <button className="btn btn-primary" onClick={gerarCodigo} disabled={loading}>
            {loading ? 'Gerando...' : 'Gerar Código de Acesso'}
          </button>
        )}
      </div>
    </div>
  )
}
