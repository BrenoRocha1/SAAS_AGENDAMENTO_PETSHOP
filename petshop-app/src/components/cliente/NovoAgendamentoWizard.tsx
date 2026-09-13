'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { criarAgendamentoAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { format, addDays, isBefore, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Lojista {
  id_lojista: string
  nome_loja: string
  cidade?: string
  estado?: string
  descricao?: string
}

interface Pet {
  id_pet: string
  nome: string
  raca: string
  sexo: string
}

interface Props {
  pets: Pet[]
  lojistas: Lojista[]
}

type Step = 1 | 2 | 3 | 4

export default function NovoAgendamentoWizard({ pets, lojistas }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>(1)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Seleções do wizard
  const [lojistaId, setLojistaId] = useState('')
  const [petId, setPetId] = useState('')
  const [servicos, setServicos] = useState<any[]>([])
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState('')
  const [slots, setSlots] = useState<any[]>([])
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')

  // Carregar serviços quando lojista selecionado
  useEffect(() => {
    if (!lojistaId) return
    supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao')
      .eq('id_lojista', lojistaId)
      .eq('status', 'Ativo')
      .then(({ data }) => setServicos(data ?? []))
  }, [lojistaId])

  // Carregar slots quando data e serviço selecionados
  useEffect(() => {
    if (!data || !servicoId || !lojistaId) return
    const servico = servicos.find(s => s.id_servico === servicoId)
    if (!servico) return
    setSlots([])
    setHora('')
    supabase
      .rpc('fn_horarios_disponiveis', {
        p_id_lojista: lojistaId,
        p_data: data,
        p_duracao: servico.duracao,
      })
      .then(({ data }) => setSlots(data ?? []))
  }, [data, servicoId, lojistaId])

  function handleSubmit() {
    setError(null)
    const formData = new FormData()
    formData.set('id_lojista', lojistaId)
    formData.set('id_pet', petId)
    formData.set('id_servico', servicoId)
    formData.set('dt_agendamento', data)
    formData.set('hr_agendamento', hora)
    formData.set('obs', obs)

    startTransition(async () => {
      const result = await criarAgendamentoAction(formData)
      if (result?.error) setError(result.error)
      else router.push('/cliente/agendamentos')
    })
  }

  const servicoSel = servicos.find(s => s.id_servico === servicoId)
  const lojistaSel = lojistas.find(l => l.id_lojista === lojistaId)
  const petSel = pets.find(p => p.id_pet === petId)

  // Datas disponíveis: próximos 30 dias
  const today = startOfDay(new Date())
  const datasDisponiveis = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(today, i + 1)
    return { value: format(d, 'yyyy-MM-dd'), label: format(d, "EEE, dd/MM", { locale: ptBR }) }
  })

  const steps = [
    { n: 1, label: 'Petshop' },
    { n: 2, label: 'Pet & Serviço' },
    { n: 3, label: 'Data & Hora' },
    { n: 4, label: 'Confirmar' },
  ]

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Stepper */}
      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center" style={{ flex: 1 }}>
            <div className={`step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
              <div className="step-circle">
                {step > s.n ? '✓' : s.n}
              </div>
              <span className="step-label">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`step-line ${step > s.n ? 'done' : ''}`} style={{ flex: 1 }} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <span>⚠️</span><span>{error}</span>
        </div>
      )}

      {/* STEP 1 — Escolher Petshop */}
      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Escolha o Petshop</h3>
          {lojistas.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏪</div>
              <div className="empty-state-title">Nenhum petshop disponível</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {lojistas.map(l => (
                <div
                  key={l.id_lojista}
                  onClick={() => setLojistaId(l.id_lojista)}
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${lojistaId === l.id_lojista ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                    background: lojistaId === l.id_lojista ? 'rgba(124,58,237,0.1)' : 'var(--gray-850)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div style={{ fontSize: '1.5rem' }}>🏪</div>
                    <div>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{l.nome_loja}</div>
                      {l.cidade && <div className="text-sm text-muted">📍 {l.cidade}{l.estado ? `, ${l.estado}` : ''}</div>}
                      {l.descricao && <div className="text-sm text-muted" style={{ marginTop: 2 }}>{l.descricao}</div>}
                    </div>
                    {lojistaId === l.id_lojista && (
                      <span style={{ marginLeft: 'auto', color: 'var(--primary-400)', fontSize: '1.25rem' }}>✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end" style={{ marginTop: 'var(--space-6)' }}>
            <button
              className="btn btn-primary"
              disabled={!lojistaId}
              onClick={() => setStep(2)}
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Pet e Serviço */}
      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Selecione o Pet e Serviço</h3>

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label form-label-required">Qual pet?</label>
            {pets.length === 0 ? (
              <div className="alert alert-warning">
                <span>⚠️</span>
                <span>Você não tem pets cadastrados. <a href="/cliente/pets/novo">Cadastre um pet</a> primeiro.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {pets.map(p => (
                  <div
                    key={p.id_pet}
                    onClick={() => setPetId(p.id_pet)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${petId === p.id_pet ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                      background: petId === p.id_pet ? 'rgba(124,58,237,0.1)' : 'var(--gray-850)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <span>{p.sexo === 'Macho' ? '🐶' : '🐩'}</span>
                    <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</span>
                    <span className="text-sm text-muted">— {p.raca}</span>
                    {petId === p.id_pet && <span style={{ marginLeft: 'auto', color: 'var(--primary-400)' }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Qual serviço?</label>
            {servicos.length === 0 ? (
              <p className="text-sm text-muted">Carregando serviços...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {servicos.map(s => (
                  <div
                    key={s.id_servico}
                    onClick={() => setServicoId(s.id_servico)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${servicoId === s.id_servico ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                      background: servicoId === s.id_servico ? 'rgba(124,58,237,0.1)' : 'var(--gray-850)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <span>✂️</span>
                    <div style={{ flex: 1 }}>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                      {s.descricao && <div className="text-sm text-muted">{s.descricao}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="font-semibold text-success">R$ {Number(s.preco).toFixed(2)}</div>
                      <div className="text-xs text-muted">{s.duracao} min</div>
                    </div>
                    {servicoId === s.id_servico && <span style={{ color: 'var(--primary-400)' }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between" style={{ marginTop: 'var(--space-6)' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Voltar</button>
            <button
              className="btn btn-primary"
              disabled={!petId || !servicoId}
              onClick={() => setStep(3)}
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Data e Hora */}
      {step === 3 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Escolha a Data e Horário</h3>

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label form-label-required">Data</label>
            <select
              className="form-select"
              value={data}
              onChange={e => setData(e.target.value)}
            >
              <option value="">Selecione uma data</option>
              {datasDisponiveis.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {data && (
            <div className="form-group">
              <label className="form-label form-label-required">Horário disponível</label>
              {slots.length === 0 ? (
                <div className="alert alert-info">
                  <span>ℹ️</span>
                  <span>Carregando horários disponíveis...</span>
                </div>
              ) : (
                <div className="slots-grid">
                  {slots.map((slot: any) => {
                    // slot.hr_slot vem do Postgres como "HH:MM:SS" (tipo TIME) —
                    // agendamentoSchema exige exatamente "HH:MM", então normaliza
                    // antes de guardar no estado (senão o agendamento nunca
                    // passa na validação e sempre dá "Formato HH:MM").
                    const horaCurta = slot.hr_slot.slice(0, 5)
                    return (
                      <button
                        key={slot.hr_slot}
                        type="button"
                        className={`slot ${!slot.disponivel ? 'slot-unavailable' : ''} ${hora === horaCurta ? 'slot-selected' : ''}`}
                        onClick={() => slot.disponivel && setHora(horaCurta)}
                        disabled={!slot.disponivel}
                      >
                        {horaCurta}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between" style={{ marginTop: 'var(--space-6)' }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Voltar</button>
            <button
              className="btn btn-primary"
              disabled={!data || !hora}
              onClick={() => setStep(4)}
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — Confirmação */}
      {step === 4 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Confirmar Agendamento</h3>

          <div
            style={{
              background: 'var(--gray-850)',
              border: '1px solid var(--gray-800)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            {[
              { label: '🏪 Petshop', value: lojistaSel?.nome_loja },
              { label: '🐕 Pet', value: `${petSel?.nome} — ${petSel?.raca}` },
              { label: '✂️ Serviço', value: servicoSel?.nome },
              { label: '📅 Data', value: format(new Date(data + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) },
              { label: '⏰ Horário', value: hora?.slice(0, 5) },
              { label: '⏱️ Duração', value: `${servicoSel?.duracao} minutos` },
              { label: '💰 Valor', value: `R$ ${Number(servicoSel?.preco).toFixed(2)}` },
            ].map(item => (
              <div key={item.label} className="flex justify-between">
                <span className="text-sm text-muted">{item.label}</span>
                <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{item.value}</span>
              </div>
            ))}
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label">Observações (opcional)</label>
            <textarea
              className="form-textarea"
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Ex: pet é nervoso com barulho"
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="flex justify-between">
            <button className="btn btn-secondary" onClick={() => setStep(3)}>← Voltar</button>
            <button
              className={`btn btn-primary btn-lg ${isPending ? 'btn-loading' : ''}`}
              disabled={isPending}
              onClick={handleSubmit}
            >
              {isPending ? 'Agendando...' : '✓ Confirmar Agendamento'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
