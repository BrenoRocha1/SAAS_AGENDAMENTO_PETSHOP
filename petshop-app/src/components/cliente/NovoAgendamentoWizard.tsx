'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { criarAgendamentoAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { format, addDays, startOfDay } from 'date-fns'
import { removerHorariosPassados } from '@/lib/agenda'
import { ptBR } from 'date-fns/locale'
import {
  IconAlert, IconCalendar, IconCheck, IconClock, IconDog,
  IconMapPin, IconMoney, IconScissors, IconStore,
} from '@/components/icons'

interface Lojista {
  id_lojista: string
  nome_loja: string
  cidade?: string | null
  estado?: string | null
  descricao?: string | null
}

interface Pet {
  id_pet: string
  nome: string
  raca: string
  sexo: string
}

interface Servico {
  id_servico: string
  nome: string
  descricao: string | null
  preco: number
  duracao: number
}

interface Slot {
  hr_slot: string
  disponivel: boolean
}

interface Props {
  pets: Pet[]
  lojistas: Lojista[]
}

type Step = 1 | 2 | 3 | 4

const ETAPAS = ['Petshop', 'Pet & Serviço', 'Data & Hora', 'Confirmar']

function ProgressoEtapas({ passo }: { passo: Step }) {
  const percentual = (passo / ETAPAS.length) * 100
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <div className="flex justify-between" style={{ marginBottom: 'var(--space-2)' }}>
        <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{ETAPAS[passo - 1]}</span>
        <span className="text-xs text-muted">Passo {passo} de {ETAPAS.length}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--gray-700)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${percentual}%`,
            borderRadius: 999,
            background: 'var(--primary-500)',
            transition: 'width 0.35s ease',
          }}
        />
      </div>
    </div>
  )
}

export default function NovoAgendamentoWizard({ pets, lojistas }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>(1)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [lojistaId, setLojistaId] = useState('')
  const [petId, setPetId] = useState('')
  const [servicos, setServicos] = useState<Servico[]>([])
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')

  useEffect(() => {
    if (!lojistaId) return
    supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao')
      .eq('id_lojista', lojistaId)
      .eq('status', 'Ativo')
      .then(({ data }) => setServicos(data ?? []))
  }, [lojistaId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data || !servicoId || !lojistaId) return
    const servico = servicos.find(s => s.id_servico === servicoId)
    if (!servico) return
    const dataSelecionada = data
    supabase
      .rpc('fn_horarios_disponiveis', {
        p_id_lojista: lojistaId,
        p_data: data,
        p_duracao: servico.duracao,
      })
      .then(({ data: rows }) => {
        setSlots(removerHorariosPassados(rows ?? [], dataSelecionada))
        setHora('')
      })
  }, [data, servicoId, lojistaId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const today = startOfDay(new Date())
  const datasDisponiveis = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(today, i + 1)
    return { value: format(d, 'yyyy-MM-dd'), label: format(d, "EEE, dd/MM", { locale: ptBR }) }
  })

  return (
    <div style={{ maxWidth: 680 }}>
      <ProgressoEtapas passo={step} />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ETAPA 1 — Escolher Petshop */}
      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Escolha o Petshop</h3>
          {lojistas.length === 0 ? (
            <div className="empty-state">
              <IconStore style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
              <div className="empty-state-title">Nenhum petshop disponível ainda</div>
              <p>
                Você ainda não tem um petshop vinculado. Peça o link de agendamento do seu
                petshop e faça o primeiro agendamento por lá — depois disso, ele aparece aqui
                para agendamentos futuros mais rápidos.
              </p>
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
                    background: lojistaId === l.id_lojista ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
                        background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)',
                        color: 'var(--primary-400)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <IconStore style={{ width: 18, height: 18 }} />
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{l.nome_loja}</div>
                      {l.cidade && (
                        <div className="text-sm text-muted flex items-center gap-1">
                          <IconMapPin style={{ width: 12, height: 12 }} /> {l.cidade}{l.estado ? `, ${l.estado}` : ''}
                        </div>
                      )}
                      {l.descricao && <div className="text-sm text-muted" style={{ marginTop: 2 }}>{l.descricao}</div>}
                    </div>
                    {lojistaId === l.id_lojista && (
                      <span style={{ marginLeft: 'auto', color: 'var(--primary-400)' }}>
                        <IconCheck style={{ width: 18, height: 18 }} />
                      </span>
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
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 2 — Pet e Serviço */}
      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Selecione o Pet e Serviço</h3>

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label form-label-required">Qual pet?</label>
            {pets.length === 0 ? (
              <div className="alert alert-warning">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>Você não tem pets cadastrados. <Link href="/cliente/pets/novo">Cadastre um pet</Link> primeiro.</span>
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
                      background: petId === p.id_pet ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <IconDog style={{ width: 16, height: 16, color: 'var(--gray-400)' }} />
                    <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</span>
                    <span className="text-sm text-muted">— {p.raca}</span>
                    {petId === p.id_pet && <span style={{ marginLeft: 'auto', color: 'var(--primary-400)' }}><IconCheck style={{ width: 16, height: 16 }} /></span>}
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
                      background: servicoId === s.id_servico ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <IconScissors style={{ width: 16, height: 16, color: 'var(--gray-400)' }} />
                    <div style={{ flex: 1 }}>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                      {s.descricao && <div className="text-sm text-muted">{s.descricao}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="font-semibold text-success">R$ {Number(s.preco).toFixed(2)}</div>
                      <div className="text-xs text-muted">{s.duracao} min</div>
                    </div>
                    {servicoId === s.id_servico && <span style={{ color: 'var(--primary-400)' }}><IconCheck style={{ width: 16, height: 16 }} /></span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between" style={{ marginTop: 'var(--space-6)' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Voltar</button>
            <button
              className="btn btn-primary"
              disabled={!petId || !servicoId}
              onClick={() => setStep(3)}
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3 — Data e Hora */}
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
                  <IconClock style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>Carregando horários disponíveis...</span>
                </div>
              ) : (
                <div className="slots-grid">
                  {slots.map(slot => {
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
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Voltar</button>
            <button
              className="btn btn-primary"
              disabled={!data || !hora}
              onClick={() => setStep(4)}
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 4 — Confirmação */}
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
              { Icon: IconStore, label: 'Petshop', value: lojistaSel?.nome_loja },
              { Icon: IconDog, label: 'Pet', value: `${petSel?.nome} — ${petSel?.raca}` },
              { Icon: IconScissors, label: 'Serviço', value: servicoSel?.nome },
              { Icon: IconCalendar, label: 'Data', value: format(new Date(data + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) },
              { Icon: IconClock, label: 'Horário', value: hora?.slice(0, 5) },
              { Icon: IconClock, label: 'Duração', value: `${servicoSel?.duracao} minutos` },
              { Icon: IconMoney, label: 'Valor', value: `R$ ${Number(servicoSel?.preco).toFixed(2)}` },
            ].map(item => (
              <div key={item.label} className="flex justify-between">
                <span className="text-sm text-muted flex items-center gap-1">
                  <item.Icon style={{ width: 13, height: 13 }} /> {item.label}
                </span>
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
            <button className="btn btn-secondary" onClick={() => setStep(3)}>Voltar</button>
            <button
              className={`btn btn-primary btn-lg ${isPending ? 'btn-loading' : ''}`}
              disabled={isPending}
              onClick={handleSubmit}
            >
              {isPending ? 'Agendando...' : 'Confirmar Agendamento'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
