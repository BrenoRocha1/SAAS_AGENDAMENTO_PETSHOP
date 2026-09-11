'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { criarAgendamentoLojistaAction } from '@/lib/actions'
import { format } from 'date-fns'
import {
  IconClose,
  IconAlert,
  IconCheck,
  IconSearch,
  IconDog,
  IconScissors,
} from '@/components/icons'
import type { ClienteComPets, ServicoAtivo } from './DashboardClient'

interface Slot {
  hr_slot: string
  disponivel: boolean
}

interface NovoAgendamentoCriado {
  id_agendamento: string
  hr_agendamento: string
  nome_cliente: string
  nome_pet: string
  nome_servico: string
  duracao: number
  status: 'Confirmado'
  valor: number
}

interface Props {
  lojistaId: string
  defaultDate: string
  clientes: ClienteComPets[]
  servicos: ServicoAtivo[]
  onClose: () => void
  onCreated: (item: NovoAgendamentoCriado, dataISO: string) => void
}

export default function NovoAgendamentoModal({ lojistaId, defaultDate, clientes, servicos, onClose, onCreated }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()

  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [petId, setPetId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState(defaultDate)
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')

  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoadedKey, setSlotsLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const clienteSel = clientes.find(c => c.id_cliente === clienteId)
  const servicoSel = servicos.find(s => s.id_servico === servicoId)
  const petSel = clienteSel?.pets.find(p => p.id_pet === petId)

  const clientesFiltrados = buscaCliente.trim()
    ? clientes.filter(c => c.nome.toLowerCase().includes(buscaCliente.trim().toLowerCase()))
    : clientes

  // Ao trocar de cliente, o pet selecionado é limpo (ajuste de estado durante
  // a renderização — evita o efeito "espelhar prop em state" desnecessário)
  const [clienteIdAnterior, setClienteIdAnterior] = useState(clienteId)
  if (clienteId !== clienteIdAnterior) {
    setClienteIdAnterior(clienteId)
    setPetId('')
  }

  // horário escolhido é limpo sempre que a data ou o serviço mudam
  // (ajuste de estado durante a renderização)
  const [slotsKeyAnterior, setSlotsKeyAnterior] = useState(`${data}|${servicoId}`)
  const slotsKeyAtual = `${data}|${servicoId}`
  if (slotsKeyAtual !== slotsKeyAnterior) {
    setSlotsKeyAnterior(slotsKeyAtual)
    setHora('')
  }

  const loadingSlots = !!(data && servicoSel) && slotsLoadedKey !== slotsKeyAtual

  // Carregar horários disponíveis quando data + serviço estão definidos
  useEffect(() => {
    if (!data || !servicoSel) return
    let cancelado = false
    const key = `${data}|${servicoId}`

    supabase
      .rpc('fn_horarios_disponiveis', {
        p_id_lojista: lojistaId,
        p_data: data,
        p_duracao: servicoSel.duracao,
      })
      .then(({ data: rows }) => {
        if (cancelado) return
        setSlots((rows as Slot[]) ?? [])
        setSlotsLoadedKey(key)
      })

    return () => { cancelado = true }
  }, [data, servicoId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit() {
    if (!clienteId || !petId || !servicoId || !data || !hora) return
    setError(null)
    const formData = new FormData()
    formData.set('id_cliente', clienteId)
    formData.set('id_pet', petId)
    formData.set('id_servico', servicoId)
    formData.set('dt_agendamento', data)
    formData.set('hr_agendamento', hora)
    formData.set('obs', obs)

    startTransition(async () => {
      const result = await criarAgendamentoLojistaAction(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSuccess(true)
      onCreated(
        {
          id_agendamento: result?.id_agendamento ?? crypto.randomUUID(),
          hr_agendamento: hora,
          nome_cliente: clienteSel!.nome,
          nome_pet: petSel!.nome,
          nome_servico: servicoSel!.nome,
          duracao: servicoSel!.duracao,
          status: 'Confirmado',
          valor: Number(servicoSel!.preco),
        },
        data
      )
      setTimeout(onClose, 1200)
    })
  }

  const podeSubmeter = !!(clienteId && petId && servicoId && data && hora) && !isPending && !success

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Novo agendamento</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-error">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="alert alert-success">
              <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>Agendamento criado e confirmado com sucesso.</span>
            </div>
          ) : (
            <>
              {/* Cliente */}
              <div className="form-group">
                <label className="form-label form-label-required">Cliente</label>
                {clientes.length === 0 ? (
                  <div className="alert alert-warning">
                    <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                    <span>
                      Você ainda não tem clientes com histórico neste petshop. Um cliente precisa
                      criar sua conta e agendar pelo menos uma vez antes de aparecer aqui.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="dash-search" style={{ maxWidth: 'none', marginBottom: 'var(--space-2)' }}>
                      <IconSearch />
                      <input
                        placeholder="Buscar cliente pelo nome..."
                        value={buscaCliente}
                        onChange={e => setBuscaCliente(e.target.value)}
                        disabled={isPending}
                      />
                    </div>
                    <div className="picker-list">
                      {clientesFiltrados.map(c => (
                        <button
                          type="button"
                          key={c.id_cliente}
                          className={`picker-item ${clienteId === c.id_cliente ? 'is-selected' : ''}`}
                          onClick={() => setClienteId(c.id_cliente)}
                          disabled={isPending}
                        >
                          <div className="picker-item-main">
                            <div className="picker-item-title">{c.nome}</div>
                            <div className="picker-item-sub">{c.telefone} · {c.pets.length} pet(s)</div>
                          </div>
                          {clienteId === c.id_cliente && <IconCheck className="picker-check" />}
                        </button>
                      ))}
                      {clientesFiltrados.length === 0 && (
                        <p className="text-sm text-muted">Nenhum cliente encontrado para &quot;{buscaCliente}&quot;.</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Pet */}
              {clienteSel && (
                <div className="form-group">
                  <label className="form-label form-label-required">Pet</label>
                  {clienteSel.pets.length === 0 ? (
                    <p className="text-sm text-muted">Este cliente não tem pets cadastrados.</p>
                  ) : (
                    <div className="picker-list" style={{ maxHeight: 140 }}>
                      {clienteSel.pets.map(p => (
                        <button
                          type="button"
                          key={p.id_pet}
                          className={`picker-item ${petId === p.id_pet ? 'is-selected' : ''}`}
                          onClick={() => setPetId(p.id_pet)}
                          disabled={isPending}
                        >
                          <IconDog style={{ width: 18, height: 18, color: 'var(--gray-400)', flexShrink: 0 }} />
                          <div className="picker-item-main">
                            <div className="picker-item-title">{p.nome}</div>
                            <div className="picker-item-sub">{p.raca}</div>
                          </div>
                          {petId === p.id_pet && <IconCheck className="picker-check" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Serviço */}
              {petId && (
                <div className="form-group">
                  <label className="form-label form-label-required">Serviço</label>
                  {servicos.length === 0 ? (
                    <p className="text-sm text-muted">
                      Nenhum serviço ativo cadastrado. Cadastre um em Serviços antes de agendar.
                    </p>
                  ) : (
                    <div className="picker-list" style={{ maxHeight: 160 }}>
                      {servicos.map(s => (
                        <button
                          type="button"
                          key={s.id_servico}
                          className={`picker-item ${servicoId === s.id_servico ? 'is-selected' : ''}`}
                          onClick={() => setServicoId(s.id_servico)}
                          disabled={isPending}
                        >
                          <IconScissors style={{ width: 16, height: 16, color: 'var(--gray-400)', flexShrink: 0 }} />
                          <div className="picker-item-main">
                            <div className="picker-item-title">{s.nome}</div>
                            <div className="picker-item-sub">{s.duracao} min</div>
                          </div>
                          <div className="font-semibold text-success" style={{ flexShrink: 0 }}>
                            R$ {Number(s.preco).toFixed(2)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Data e horário */}
              {servicoId && (
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label form-label-required">Data</label>
                    <input
                      type="date"
                      className="form-input"
                      value={data}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      onChange={e => setData(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">Horário</label>
                    {loadingSlots ? (
                      <p className="text-sm text-muted">Carregando horários...</p>
                    ) : slots.length === 0 ? (
                      <p className="text-sm text-muted">Sem horário de funcionamento cadastrado para este dia.</p>
                    ) : (
                      <div className="slots-grid">
                        {slots.map(s => (
                          <button
                            key={s.hr_slot}
                            type="button"
                            className={`slot ${!s.disponivel ? 'slot-unavailable' : ''} ${hora === s.hr_slot ? 'slot-selected' : ''}`}
                            onClick={() => s.disponivel && setHora(s.hr_slot)}
                            disabled={!s.disponivel || isPending}
                          >
                            {s.hr_slot.slice(0, 5)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Observações */}
              {hora && (
                <div className="form-group">
                  <label className="form-label">Observações (opcional)</label>
                  <textarea
                    className="form-textarea"
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                    placeholder="Ex: pet é nervoso com barulho"
                    rows={2}
                    maxLength={500}
                    disabled={isPending}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={isPending}>
              Cancelar
            </button>
            <button
              className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
              onClick={handleSubmit}
              disabled={!podeSubmeter}
            >
              {isPending ? 'Agendando...' : 'Confirmar agendamento'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
