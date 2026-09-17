'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { atribuirFuncionarioAction, criarAgendamentoLojistaAction, criarPetLojistaAction } from '@/lib/actions'
import { formatarTelefone } from '@/lib/format'
import { removerHorariosPassados } from '@/lib/agenda'
import { format } from 'date-fns'
import {
  IconClose,
  IconAlert,
  IconCheck,
  IconSearch,
  IconDog,
  IconPlus,
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
  funcionarios: { id_funcionario: string; nome: string }[]
  // Vem do perfil do cliente ("Novo agendamento") — cliente já sai
  // selecionado e travado, sem precisar buscar de novo quem já está na
  // tela de origem.
  clienteIdFixo?: string
  // Vem do perfil do funcionário ("Novo Agendamento") — só um valor
  // inicial pro select de profissional (esse campo já era opcional e
  // continua editável, diferente do cliente, que vem travado).
  funcionarioIdPadrao?: string
  // Só o responsável pela conta ou um administrador pode escolher o
  // profissional na criação — ver atribuirFuncionarioAction. Default
  // true porque quem usa este modal a partir do Dashboard já só pode
  // chegar lá sendo lojista ou admin (rota bloqueada pro resto no
  // middleware); só a Agenda precisa passar isso explicitamente.
  podeAtribuirProfissional?: boolean
  onClose: () => void
  onCreated: (item: NovoAgendamentoCriado, dataISO: string) => void
}

export default function NovoAgendamentoModal({ lojistaId, defaultDate, clientes, servicos, funcionarios, clienteIdFixo, funcionarioIdPadrao, podeAtribuirProfissional = true, onClose, onCreated }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()
  const [isPendingPet, startPetTransition] = useTransition()

  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteId, setClienteId] = useState(clienteIdFixo ?? '')
  const [petId, setPetId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState(defaultDate)
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')
  // Opcional — não bloqueia o agendamento. Se escolhido, é atribuído logo
  // depois de criar (reaproveita atribuirFuncionarioAction, a mesma usada
  // na Agenda/Kanban); se não escolhido, o agendamento nasce sem
  // profissional, igual já acontecia antes desta opção existir.
  const [funcionarioId, setFuncionarioId] = useState(funcionarioIdPadrao ?? '')

  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoadedKey, setSlotsLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Pets cadastrados aqui mesmo, no meio do fluxo (cliente novo, sem
  // nenhum pet ainda) — somados aos pets que já vieram do servidor.
  const [petsExtras, setPetsExtras] = useState<Record<string, { id_pet: string; nome: string; raca: string }[]>>({})
  const [showNovoPet, setShowNovoPet] = useState(false)
  const [petErro, setPetErro] = useState<string | null>(null)
  const [petNome, setPetNome] = useState('')
  const [petRaca, setPetRaca] = useState('')
  const [petSexo, setPetSexo] = useState<'Macho' | 'Fêmea'>('Macho')
  const [petDtNasc, setPetDtNasc] = useState('')

  const clienteSel = clientes.find(c => c.id_cliente === clienteId)
  const petsDoCliente = [...(clienteSel?.pets ?? []), ...(petsExtras[clienteId] ?? [])]
  const servicoSel = servicos.find(s => s.id_servico === servicoId)
  const petSel = petsDoCliente.find(p => p.id_pet === petId)

  function handleCriarPet() {
    if (!clienteId || !petNome.trim() || !petRaca.trim() || !petDtNasc) return
    setPetErro(null)
    const formData = new FormData()
    formData.set('id_cliente', clienteId)
    formData.set('nome', petNome.trim())
    formData.set('raca', petRaca.trim())
    formData.set('sexo', petSexo)
    formData.set('dt_nasc', petDtNasc)

    startPetTransition(async () => {
      const result = await criarPetLojistaAction(formData)
      if (result?.error) {
        setPetErro(result.error)
        return
      }
      const novoPet = { id_pet: result!.id_pet!, nome: petNome.trim(), raca: petRaca.trim() }
      setPetsExtras(prev => ({ ...prev, [clienteId]: [...(prev[clienteId] ?? []), novoPet] }))
      setPetId(novoPet.id_pet)
      setShowNovoPet(false)
      setPetNome('')
      setPetRaca('')
      setPetSexo('Macho')
      setPetDtNasc('')
    })
  }

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
        setSlots(removerHorariosPassados((rows as Slot[]) ?? [], data))
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
      // Profissional é opcional e não faz parte da criação em si — se foi
      // escolhido, atribui logo em seguida. Best-effort: mesmo se essa
      // atribuição falhar, o agendamento já foi criado com sucesso (dá
      // pra atribuir depois pela Agenda/Kanban), então não trava a tela
      // de sucesso por causa disso.
      if (funcionarioId && result?.id_agendamento) {
        const resultAtribuicao = await atribuirFuncionarioAction(result.id_agendamento, funcionarioId)
        if (resultAtribuicao?.error) {
          console.error('[NovoAgendamentoModal] falha ao atribuir profissional:', resultAtribuicao.error)
        }
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
                      Você ainda não tem nenhum cliente cadastrado. Cadastre um em{' '}
                      <strong>Clientes → Novo Cliente</strong> antes de criar o agendamento.
                    </span>
                  </div>
                ) : clienteIdFixo && clienteSel ? (
                  // Veio do perfil do cliente — já travado, sem opção de trocar
                  // (a intenção de "agendar pra este cliente" já está clara).
                  <div className="picker-item is-selected" style={{ cursor: 'default' }}>
                    <div className="picker-item-main">
                      <div className="picker-item-title">{clienteSel.nome}</div>
                      <div className="picker-item-sub">{formatarTelefone(clienteSel.telefone)}</div>
                    </div>
                    <IconCheck className="picker-check" />
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
                            <div className="picker-item-sub">
                              {formatarTelefone(c.telefone)}
                              {c.pets.length > 0 && ` · ${c.pets.length} pet${c.pets.length > 1 ? 's' : ''}`}
                            </div>
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
                  {petsDoCliente.length === 0 && !showNovoPet && (
                    <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-2)' }}>
                      Este cliente ainda não tem pet cadastrado.
                    </p>
                  )}
                  {petsDoCliente.length > 0 && (
                    <div className="picker-list" style={{ maxHeight: 140, marginBottom: 'var(--space-2)' }}>
                      {petsDoCliente.map(p => (
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

                  {!showNovoPet ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowNovoPet(true)}
                      disabled={isPending}
                    >
                      <IconPlus style={{ width: 13, height: 13 }} /> Cadastrar novo pet
                    </button>
                  ) : (
                    <div
                      style={{
                        padding: 'var(--space-4)',
                        border: '1px solid var(--gray-700)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          marginBottom: 'var(--space-4)',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          color: 'var(--gray-200)',
                        }}
                      >
                        <IconDog style={{ width: 15, height: 15, color: 'var(--gray-400)' }} />
                        Novo pet de {clienteSel?.nome.split(' ')[0]}
                      </div>

                      {petErro && (
                        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
                          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                          <span>{petErro}</span>
                        </div>
                      )}

                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label form-label-required">Nome do pet</label>
                          <input
                            type="text"
                            className="form-input"
                            value={petNome}
                            onChange={e => setPetNome(e.target.value)}
                            placeholder="Rex"
                            disabled={isPendingPet}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label form-label-required">Raça</label>
                          <input
                            type="text"
                            className="form-input"
                            value={petRaca}
                            onChange={e => setPetRaca(e.target.value)}
                            placeholder="SRD, Poodle..."
                            disabled={isPendingPet}
                          />
                        </div>
                      </div>
                      <div className="form-grid-2" style={{ marginBottom: 'var(--space-4)' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label form-label-required">Sexo</label>
                          <select
                            className="form-select"
                            value={petSexo}
                            onChange={e => setPetSexo(e.target.value as 'Macho' | 'Fêmea')}
                            disabled={isPendingPet}
                          >
                            <option value="Macho">Macho</option>
                            <option value="Fêmea">Fêmea</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label form-label-required">Data de nascimento</label>
                          <input
                            type="date"
                            className="form-input"
                            value={petDtNasc}
                            max={format(new Date(), 'yyyy-MM-dd')}
                            onChange={e => setPetDtNasc(e.target.value)}
                            disabled={isPendingPet}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setShowNovoPet(false); setPetErro(null) }}
                          disabled={isPendingPet}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className={`btn btn-primary btn-sm ${isPendingPet ? 'btn-loading' : ''}`}
                          onClick={handleCriarPet}
                          disabled={isPendingPet || !petNome.trim() || !petRaca.trim() || !petDtNasc}
                        >
                          {isPendingPet ? 'Cadastrando...' : 'Salvar pet'}
                        </button>
                      </div>
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

              {/* Profissional — opcional, dá pra deixar sem e atribuir depois.
                  Só aparece pra quem pode atribuir (responsável pela conta ou
                  administrador) — um funcionário comum não escolhe. */}
              {servicoId && funcionarios.length > 0 && podeAtribuirProfissional && (
                <div className="form-group">
                  <label className="form-label">Profissional (opcional)</label>
                  <select
                    className="form-select"
                    value={funcionarioId}
                    onChange={e => setFuncionarioId(e.target.value)}
                    disabled={isPending}
                  >
                    <option value="">Sem profissional definido</option>
                    {funcionarios.map(f => (
                      <option key={f.id_funcionario} value={f.id_funcionario}>{f.nome}</option>
                    ))}
                  </select>
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
                        {slots.map(s => {
                          // hr_slot vem do Postgres como "HH:MM:SS" (tipo TIME) —
                          // o schema de validação exige exatamente "HH:MM", então
                          // já normaliza aqui, antes de guardar no estado.
                          const horaCurta = s.hr_slot.slice(0, 5)
                          return (
                            <button
                              key={s.hr_slot}
                              type="button"
                              className={`slot ${!s.disponivel ? 'slot-unavailable' : ''} ${hora === horaCurta ? 'slot-selected' : ''}`}
                              onClick={() => s.disponivel && setHora(horaCurta)}
                              disabled={!s.disponivel || isPending}
                            >
                              {horaCurta}
                            </button>
                          )
                        })}
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
