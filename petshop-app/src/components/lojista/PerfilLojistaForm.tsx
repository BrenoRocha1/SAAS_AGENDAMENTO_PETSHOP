'use client'

import { useRef, useState, useTransition } from 'react'
import { atualizarPerfilLojistaAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconSave } from '@/components/icons'

function formatarCep(cep: string): string {
  const d = cep.replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

interface Lojista {
  id_lojista: string
  nome_loja: string
  email: string
  telefone: string
  descricao?: string | null
  endereco?: string | null
  // Migration 045 — sem ela as colunas não existem e vêm undefined.
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
}

interface Props {
  lojista: Lojista | null
}

export default function PerfilLojistaForm({ lojista }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Endereço controlado: o CEP preenche rua, bairro, cidade e UF (ViaCEP),
  // o que evita rua digitada errado — o mapa do TaxiDog depende disso.
  const [endereco, setEndereco] = useState({
    cep: formatarCep(lojista?.cep ?? ''),
    rua: lojista?.endereco ?? '',
    numero: lojista?.numero ?? '',
    complemento: lojista?.complemento ?? '',
    bairro: lojista?.bairro ?? '',
    cidade: lojista?.cidade ?? '',
    estado: lojista?.estado ?? '',
  })
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState<string | null>(null)
  const numeroRef = useRef<HTMLInputElement>(null)

  function mudar(campo: keyof typeof endereco, valor: string) {
    setEndereco(prev => ({ ...prev, [campo]: valor }))
  }

  async function handleCep(texto: string) {
    const digitos = texto.replace(/\D/g, '').slice(0, 8)
    mudar('cep', formatarCep(digitos))
    setErroCep(null)
    if (digitos.length !== 8) return

    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const json = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (json.erro) {
        setErroCep('CEP não encontrado. Preencha o endereço manualmente.')
        return
      }
      setEndereco(prev => ({
        ...prev,
        rua: json.logradouro || prev.rua,
        bairro: json.bairro || prev.bairro,
        cidade: json.localidade || prev.cidade,
        estado: json.uf || prev.estado,
      }))
      numeroRef.current?.focus()
    } catch {
      setErroCep('Não foi possível buscar o CEP. Preencha o endereço manualmente.')
    } finally {
      setBuscandoCep(false)
    }
  }

  // Loja antiga (antes da migration 045) costuma ter o número colado na rua.
  const numeroNaRua = !endereco.numero.trim() && /\d/.test(endereco.rua)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (endereco.rua.trim() && !endereco.numero.trim()) {
      setError('Informe o número da loja no campo Número (use S/N se não tiver).')
      return
    }
    const form = e.currentTarget
    startTransition(async () => {
      const result = await atualizarPerfilLojistaAction(new FormData(form))
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    })
  }

  if (!lojista) {
    return (
      <div className="empty-state card">
        <IconAlert style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Perfil não encontrado</div>
        <p>Erro ao carregar dados da loja.</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 700 }}>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-5)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Perfil atualizado com sucesso!</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Identificação */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h4 style={{ marginBottom: 'var(--space-4)', color: 'var(--gray-300)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Identificação
          </h4>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="nome_loja" className="form-label form-label-required">Nome da Loja</label>
              <input
                id="nome_loja"
                name="nome_loja"
                type="text"
                className="form-input"
                defaultValue={lojista.nome_loja}
                maxLength={150}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="telefone" className="form-label form-label-required">Telefone</label>
              <input
                id="telefone"
                name="telefone"
                type="tel"
                className="form-input"
                defaultValue={lojista.telefone}
                placeholder="(11) 99999-9999"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="descricao" className="form-label">Descrição</label>
            <textarea
              id="descricao"
              name="descricao"
              className="form-input"
              style={{ minHeight: 90, resize: 'vertical' }}
              defaultValue={lojista.descricao ?? ''}
              maxLength={500}
              placeholder="Fale sobre seu petshop, especialidades, diferenciais..."
            />
            <span className="form-hint">Máximo 500 caracteres</span>
          </div>
        </div>

        {/* Endereço */}
        <div style={{ borderTop: '1px solid var(--gray-800)', paddingTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
          <h4 style={{ marginBottom: 'var(--space-4)', color: 'var(--gray-300)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Endereço
          </h4>
          <div className="form-group" style={{ maxWidth: 220 }}>
            <label htmlFor="cep" className="form-label">CEP</label>
            <input
              id="cep"
              name="cep"
              type="text"
              inputMode="numeric"
              className="form-input"
              value={endereco.cep}
              onChange={e => handleCep(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
            />
            {buscandoCep && <span className="form-hint">Buscando CEP...</span>}
            {erroCep && <span className="form-error">{erroCep}</span>}
            {!buscandoCep && !erroCep && <span className="form-hint">Preenche a rua, o bairro e a cidade</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label htmlFor="endereco" className="form-label">Rua</label>
              <input
                id="endereco"
                name="endereco"
                type="text"
                className="form-input"
                value={endereco.rua}
                onChange={e => mudar('rua', e.target.value)}
                placeholder="Rua das Flores"
                maxLength={200}
              />
            </div>
            <div className="form-group">
              <label htmlFor="numero" className="form-label">Número</label>
              <input
                id="numero"
                name="numero"
                ref={numeroRef}
                type="text"
                className="form-input"
                value={endereco.numero}
                onChange={e => mudar('numero', e.target.value)}
                placeholder="123"
                maxLength={20}
              />
            </div>
          </div>
          {numeroNaRua && (
            <p className="form-hint" style={{ marginTop: 'calc(-1 * var(--space-2))', marginBottom: 'var(--space-4)' }}>
              Parece que o número está junto da rua — tire ele de lá e coloque no campo Número.
            </p>
          )}
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="complemento" className="form-label">Complemento <span className="text-muted">(opcional)</span></label>
              <input
                id="complemento"
                name="complemento"
                type="text"
                className="form-input"
                value={endereco.complemento}
                onChange={e => mudar('complemento', e.target.value)}
                placeholder="Loja 2, sala 3..."
                maxLength={80}
              />
            </div>
            <div className="form-group">
              <label htmlFor="bairro" className="form-label">Bairro</label>
              <input
                id="bairro"
                name="bairro"
                type="text"
                className="form-input"
                value={endereco.bairro}
                onChange={e => mudar('bairro', e.target.value)}
                maxLength={80}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label htmlFor="cidade" className="form-label">Cidade</label>
              <input
                id="cidade"
                name="cidade"
                type="text"
                className="form-input"
                value={endereco.cidade}
                onChange={e => mudar('cidade', e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="form-group">
              <label htmlFor="estado" className="form-label">UF</label>
              <input
                id="estado"
                name="estado"
                type="text"
                className="form-input"
                value={endereco.estado}
                onChange={e => mudar('estado', e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="SP"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            id="btn-salvar-perfil"
            className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending}
          >
            {isPending ? 'Salvando...' : (<><IconSave style={{ width: 15, height: 15 }} /> Salvar alterações</>)}
          </button>
        </div>
      </form>
    </div>
  )
}
