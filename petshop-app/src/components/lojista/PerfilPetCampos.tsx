'use client'

import { useState } from 'react'
import { COMPORTAMENTOS_SUGERIDOS } from '@/lib/taxidog'
import { IconCheck, IconChevronRight, IconPlus } from '@/components/icons'

// Perfil opcional do pet (migration 042): pelagem, características e
// comportamento. Fica recolhido por padrão — o cadastro básico continua
// só com o essencial, e nada aqui é obrigatório pra agendar.

export interface PerfilPet {
  pelagem: string
  comprimento_pelo: string
  caracteristicas: string
  comportamento: string[]
  obs_comportamento: string
}

export const PERFIL_PET_VAZIO: PerfilPet = {
  pelagem: '',
  comprimento_pelo: '',
  caracteristicas: '',
  comportamento: [],
  obs_comportamento: '',
}

export function perfilPetParaAction(p: PerfilPet) {
  return {
    pelagem: p.pelagem || null,
    comprimento_pelo: p.comprimento_pelo || null,
    caracteristicas: p.caracteristicas.trim() || null,
    comportamento: p.comportamento,
    obs_comportamento: p.obs_comportamento.trim() || null,
  }
}

export function perfilPetPreenchido(p: PerfilPet): boolean {
  return !!(p.pelagem || p.comprimento_pelo || p.caracteristicas.trim() || p.comportamento.length || p.obs_comportamento.trim())
}

interface Props {
  valor: PerfilPet
  onChange: (p: PerfilPet) => void
  disabled?: boolean
}

export default function PerfilPetCampos({ valor, onChange, disabled }: Props) {
  const [aberto, setAberto] = useState(perfilPetPreenchido(valor))
  const [novoTag, setNovoTag] = useState('')

  const sugestoes = [...COMPORTAMENTOS_SUGERIDOS, ...valor.comportamento.filter(t => !COMPORTAMENTOS_SUGERIDOS.includes(t))]

  function alternarTag(tag: string) {
    const tem = valor.comportamento.includes(tag)
    onChange({ ...valor, comportamento: tem ? valor.comportamento.filter(t => t !== tag) : [...valor.comportamento, tag] })
  }

  function adicionarTag() {
    const tag = novoTag.trim().slice(0, 40)
    if (!tag || valor.comportamento.includes(tag)) return
    onChange({ ...valor, comportamento: [...valor.comportamento, tag] })
    setNovoTag('')
  }

  return (
    <div style={{ borderTop: '1px solid var(--gray-800)', paddingTop: 'var(--space-3)' }}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="flex items-center gap-2"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--gray-200)' }}
      >
        <IconChevronRight style={{ width: 14, height: 14, transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        <span className="font-semibold">Mais informações</span>
        <span className="text-xs text-muted">opcional · pelagem e comportamento</span>
      </button>

      {aberto && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de pelagem</label>
              <select className="form-select" value={valor.pelagem} disabled={disabled} onChange={e => onChange({ ...valor, pelagem: e.target.value })}>
                <option value="">Não informado</option>
                <option value="Lisa">Lisa</option>
                <option value="Ondulada">Ondulada</option>
                <option value="Crespa">Crespa</option>
                <option value="Dupla">Dupla (subpelo)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Comprimento do pelo</label>
              <select className="form-select" value={valor.comprimento_pelo} disabled={disabled} onChange={e => onChange({ ...valor, comprimento_pelo: e.target.value })}>
                <option value="">Não informado</option>
                <option value="Curto">Curto</option>
                <option value="Médio">Médio</option>
                <option value="Longo">Longo</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Características</label>
            <input
              className="form-input"
              placeholder="Ex: pelo costuma embolar atrás das orelhas"
              value={valor.caracteristicas}
              maxLength={300}
              disabled={disabled}
              onChange={e => onChange({ ...valor, caracteristicas: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Comportamento</label>
            <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>
              Uso interno da loja — aparece pra equipe e pro TaxiDog, nunca pro cliente.
            </p>
            <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
              {sugestoes.map(tag => {
                const ativo = valor.comportamento.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={disabled}
                    onClick={() => alternarTag(tag)}
                    className={`btn btn-sm ${ativo ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ borderRadius: 'var(--radius-full)' }}
                  >
                    {ativo && <IconCheck style={{ width: 12, height: 12 }} />} {tag}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2" style={{ maxWidth: 360 }}>
              <input
                className="form-input"
                placeholder="Outro comportamento..."
                value={novoTag}
                maxLength={40}
                disabled={disabled}
                onChange={e => setNovoTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarTag() } }}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={adicionarTag} disabled={disabled || !novoTag.trim()}>
                <IconPlus style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Observações de comportamento</label>
            <textarea
              className="form-textarea"
              rows={2}
              maxLength={500}
              placeholder="Ex: fica mais calmo com o tutor por perto no começo"
              value={valor.obs_comportamento}
              disabled={disabled}
              onChange={e => onChange({ ...valor, obs_comportamento: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
