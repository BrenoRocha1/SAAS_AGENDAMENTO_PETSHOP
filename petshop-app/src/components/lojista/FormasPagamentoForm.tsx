'use client'

import { useState, useTransition } from 'react'
import { salvarFormasPagamentoAction } from '@/lib/actions-pagamento'
import { ROTULO_FORMA_PAGAMENTO, type FormasLoja } from '@/lib/pagamento'
import { IconAlert, IconCheck } from '@/components/icons'

type Chave = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'

// Ordem da configuração (Pix primeiro, que tem campos).
const ORDEM: Chave[] = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito']

const DESCRICAO: Record<Chave, string> = {
  pix: 'O cliente vê a chave e o nome para conferir antes de pagar.',
  dinheiro: 'Pagamento em espécie na loja ou na entrega.',
  cartao_credito: 'Na maquininha da loja.',
  cartao_debito: 'Na maquininha da loja.',
}

export default function FormasPagamentoForm({ inicial }: { inicial: FormasLoja }) {
  const [ativo, setAtivo] = useState<Record<Chave, boolean>>({
    pix: inicial.pix,
    dinheiro: inicial.dinheiro,
    cartao_credito: inicial.cartao_credito,
    cartao_debito: inicial.cartao_debito,
  })
  const [pixChave, setPixChave] = useState(inicial.pix_chave ?? '')
  const [pixNome, setPixNome] = useState(inicial.pix_nome ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [isPending, startTransition] = useTransition()

  function alternar(chave: Chave) {
    setAtivo(prev => ({ ...prev, [chave]: !prev[chave] }))
    setSalvo(false)
    setErro(null)
  }

  function salvar() {
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      const r = await salvarFormasPagamentoAction({
        pix: ativo.pix,
        pix_chave: pixChave,
        pix_nome: pixNome,
        dinheiro: ativo.dinheiro,
        cartao_credito: ativo.cartao_credito,
        cartao_debito: ativo.cartao_debito,
      })
      if (r.error) {
        setErro(r.error)
        return
      }
      setSalvo(true)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 640 }}>
      {!inicial.configurado && (
        <div className="alert alert-info">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Sua loja ainda não configurou: por enquanto valem Dinheiro, Cartão de crédito e Cartão de débito.</span>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {ORDEM.map((chave, i) => (
          <div key={chave} className="pag-config-linha" style={{ borderTop: i === 0 ? 'none' : undefined }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{ROTULO_FORMA_PAGAMENTO[chave]}</div>
                <div className="text-sm text-muted">{DESCRICAO[chave]}</div>
              </div>
              <button
                type="button"
                className={`switch ${ativo[chave] ? 'switch-on' : ''}`}
                onClick={() => alternar(chave)}
                role="switch"
                aria-checked={ativo[chave]}
                aria-label={ROTULO_FORMA_PAGAMENTO[chave]}
                style={{ flexShrink: 0 }}
              >
                <span className="switch-thumb" />
              </button>
            </div>

            {chave === 'pix' && ativo.pix && (
              <div className="pag-config-pix">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="pix-chave">Chave Pix</label>
                  <input
                    id="pix-chave"
                    className="form-input"
                    value={pixChave}
                    onChange={e => { setPixChave(e.target.value); setSalvo(false) }}
                    placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                    maxLength={140}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="pix-nome">Nome de identificação</label>
                  <input
                    id="pix-nome"
                    className="form-input"
                    value={pixNome}
                    onChange={e => { setPixNome(e.target.value); setSalvo(false) }}
                    placeholder="Ex.: Pet Shop SAIP"
                    maxLength={100}
                  />
                  <span className="form-hint">O nome que aparece no Pix — o cliente confere se está pagando para a loja certa.</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}

      <div className="flex items-center gap-3" style={{ justifyContent: 'flex-end' }}>
        {salvo && (
          <span className="text-sm text-success flex items-center gap-1">
            <IconCheck style={{ width: 14, height: 14 }} /> Salvo
          </span>
        )}
        <button type="button" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending} onClick={salvar}>
          Salvar
        </button>
      </div>
    </div>
  )
}
