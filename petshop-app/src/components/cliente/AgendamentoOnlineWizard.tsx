'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { criarAgendamentoOnlineAction, atualizarClassificacaoPetAction, logoutAction } from '@/lib/actions'
import { removerHorariosPassados } from '@/lib/agenda'
import { formatarCpf, formatarTelefone } from '@/lib/format'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import SeletorDeData from './SeletorDeData'
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconDog,
  IconPaw,
  IconScissors,
  IconWhatsapp,
} from '@/components/icons'

interface Lojista {
  id: string
  nome: string
  logoUrl: string | null
  descricao: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  telefone: string
  statusHoje: string
}
interface Horario {
  dia_semana: string
  hr_inicio: string
  hr_fim: string
  ativo: boolean
}
interface Janela {
  minValor: number
  minUnidade: 'horas' | 'dias'
  maxValor: number
  maxUnidade: 'horas' | 'dias'
}
interface Servico {
  id_servico: string
  nome: string
  descricao?: string | null
  preco: number
  duracao: number
}
interface Pet {
  id_pet: string
  nome: string
  raca: string
  especie: 'Cão' | 'Gato' | null
  porte: 'Pequeno' | 'Médio' | 'Grande' | null
  sexo: string
}
interface Cliente {
  nome: string
  telefone: string
  cpf: string
}
interface Props {
  lojista: Lojista
  horarios: Horario[]
  janela: Janela
  servicos: Servico[]
  pets: Pet[]
  cliente: Cliente
  autenticado: boolean
  contaInvalida: boolean
  carrinhoInicial: string[]
}

type Step = 1 | 2 | 3 | 4 | 5 | 6
type Slot = { hr_slot: string; disponivel: boolean }

const ETAPAS = ['Serviços', 'Pet', 'Seus dados', 'Horário', 'Confirmar']
const DIAS_ORDEM = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

function ProgressoEtapas({ passo }: { passo: number }) {
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

export default function AgendamentoOnlineWizard({
  lojista, horarios, janela, servicos, pets: petsIniciais, cliente, autenticado, contaInvalida, carrinhoInicial,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [step, setStep] = useState<Step>(1)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Mostrado no lugar do passo 2 quando quem clicou em "Ver Carrinho"
  // ainda não tem login de cliente — a página é pública até aqui.
  const [mostrarGateAcesso, setMostrarGateAcesso] = useState(false)
  const [mostrarDetalheLoja, setMostrarDetalheLoja] = useState(false)
  const [servicoDetalhe, setServicoDetalhe] = useState<Servico | null>(null)

  const [carrinho, setCarrinho] = useState<string[]>(carrinhoInicial)
  const [pets, setPets] = useState<Pet[]>(petsIniciais)
  const [petId, setPetId] = useState('')
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [obs, setObs] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [precos, setPrecos] = useState<Record<string, number>>({})

  // Classificação pendente (espécie/porte) do pet escolhido, quando falta
  const [especieForm, setEspecieForm] = useState<'Cão' | 'Gato' | ''>('')
  const [porteForm, setPorteForm] = useState<'Pequeno' | 'Médio' | 'Grande' | ''>('')
  const [salvandoClassificacao, setSalvandoClassificacao] = useState(false)

  const [resultado, setResultado] = useState<{ ids: string[] } | null>(null)

  const petSel = pets.find(p => p.id_pet === petId) ?? null
  const servicosCarrinho = servicos.filter(s => carrinho.includes(s.id_servico))
  const duracaoTotal = servicosCarrinho.reduce((acc, s) => acc + s.duracao, 0)
  const valorTotal = servicosCarrinho.reduce((acc, s) => acc + Number(precos[s.id_servico] ?? s.preco), 0)
  const precisaClassificar = !!petSel && (!petSel.especie || !petSel.porte)

  // Preço real (considerando variação por porte/raça) assim que há pet + carrinho
  useEffect(() => {
    if (!petId || carrinho.length === 0) return
    let cancelado = false
    Promise.all(
      carrinho.map(async id_servico => {
        const { data } = await supabase.rpc('fn_calcular_preco_servico', { p_id_servico: id_servico, p_id_pet: petId })
        // NUMERIC do Postgres pode voltar como string via PostgREST — nunca usar direto num cálculo.
        return [id_servico, data == null ? null : Number(data)] as const
      })
    ).then(pares => {
      if (cancelado) return
      setPrecos(prev => ({ ...prev, ...Object.fromEntries(pares.filter((par): par is [string, number] => par[1] != null)) }))
    })
    return () => { cancelado = true }
  }, [petId, carrinho]) // eslint-disable-line react-hooks/exhaustive-deps

  // Horários disponíveis — o cliente não escolhe mais o profissional (a
  // loja atribui depois), então sempre chama a RPC sem esse filtro
  // (p_id_funcionario usa o próprio DEFAULT NULL dela).
  useEffect(() => {
    if (!data || duracaoTotal === 0) return
    const dataSelecionada = data
    supabase
      .rpc('fn_horarios_disponiveis_funcionario', {
        p_id_lojista: lojista.id,
        p_data: data,
        p_duracao: duracaoTotal,
      })
      .then(({ data: rows }) => {
        setSlots(removerHorariosPassados((rows ?? []) as Slot[], dataSelecionada))
        setHoraInicio('')
      })
  }, [data, duracaoTotal, lojista.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function alternarServico(id: string) {
    setCarrinho(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleContinuarServicos() {
    if (!autenticado) {
      setMostrarGateAcesso(true)
      return
    }
    setStep(2)
  }

  const voltarParaCa = `/agendamento/${lojista.id}${carrinho.length ? `?servicos=${carrinho.join(',')}` : ''}`
  const loginHref = `/login?redirectTo=${encodeURIComponent(voltarParaCa)}`

  function handleSairEEntrarComOutraConta() {
    startTransition(() => logoutAction(voltarParaCa))
  }

  function selecionarPet(p: Pet) {
    setPetId(p.id_pet)
    setEspecieForm(p.especie ?? '')
    setPorteForm(p.porte ?? '')
  }

  function salvarClassificacao() {
    if (!petSel || !especieForm || !porteForm) return
    setErro(null)
    setSalvandoClassificacao(true)
    const fd = new FormData()
    fd.set('especie', especieForm)
    fd.set('porte', porteForm)
    startTransition(async () => {
      const result = await atualizarClassificacaoPetAction(petSel.id_pet, fd)
      setSalvandoClassificacao(false)
      if (result?.error) { setErro(result.error); return }
      setPets(prev => prev.map(p => p.id_pet === petSel.id_pet ? { ...p, especie: especieForm, porte: porteForm } : p))
    })
  }

  function handleAgendar() {
    setErro(null)
    const fd = new FormData()
    fd.set('id_lojista', lojista.id)
    fd.set('id_pet', petId)
    fd.set('servicos', JSON.stringify(carrinho))
    fd.set('dt_agendamento', data)
    fd.set('hr_agendamento', horaInicio)
    fd.set('obs', obs)

    startTransition(async () => {
      const result = await criarAgendamentoOnlineAction(fd)
      if (result?.error) { setErro(result.error); return }
      setResultado({ ids: result?.ids_agendamento ?? [] })
      setStep(6)
    })
  }

  // Só pra desenhar o calendário (desabilitar dias fora da janela) — a
  // checagem que vale de verdade é sempre a do servidor (RPC), que usa o
  // horário de Brasília certo. Aqui é aproximado o bastante pra UI.
  // "agora" via useState(() => ...) — lazy initializer, não chamada
  // direta de Date.now() no corpo do componente (regra de pureza).
  const [agora] = useState(() => Date.now())
  const diasAbertos = useMemo(() => new Set(horarios.filter(h => h.ativo).map(h => h.dia_semana)), [horarios])
  const minInstante = useMemo(() => new Date(agora + (janela.minUnidade === 'dias' ? janela.minValor * 24 : janela.minValor) * 3600_000), [agora, janela])
  const maxInstante = useMemo(() => new Date(agora + (janela.maxUnidade === 'dias' ? janela.maxValor * 24 : janela.maxValor) * 3600_000), [agora, janela])

  const mensagemWhatsapp = [
    `Olá! Acabei de agendar em ${lojista.nome}:`,
    ...servicosCarrinho.map(s => `- ${s.nome}`),
    `Pet: ${petSel?.nome ?? ''}`,
    `Data: ${data ? format(new Date(data + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR }) : ''} às ${horaInicio}`,
    `Total: R$ ${valorTotal.toFixed(2)}`,
  ].join('\n')

  const enderecoCompleto = [lojista.endereco, lojista.cidade && lojista.estado ? `${lojista.cidade}, ${lojista.estado}` : lojista.cidade].filter(Boolean).join(' — ')

  return (
    <div>
      {step > 1 && step < 6 && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setStep(prev => (prev - 1) as Step)}
          style={{ marginBottom: 'var(--space-4)' }}
        >
          <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar
        </button>
      )}

      {step === 1 && (
        <button
          type="button"
          className="agenonline-header"
          onClick={() => setMostrarDetalheLoja(true)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}
        >
          {lojista.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública do Storage
            <img src={lojista.logoUrl} alt={lojista.nome} className="agenonline-logo" />
          ) : (
            <div className="agenonline-logo-fallback"><IconPaw style={{ width: 24, height: 24 }} /></div>
          )}
          <div style={{ flex: 1 }}>
            <div className="agenonline-loja-nome">{lojista.nome}</div>
            {lojista.cidade && <div className="agenonline-loja-local">{lojista.cidade}{lojista.estado ? `, ${lojista.estado}` : ''}</div>}
            <div className="agenonline-loja-status">{lojista.statusHoje}</div>
          </div>
          <IconChevronRight style={{ width: 16, height: 16, color: 'var(--gray-500)', flexShrink: 0 }} />
        </button>
      )}

      {step < 6 && <ProgressoEtapas passo={step} />}

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      {/* STEP 1 — Escolha o(s) Serviço(s) */}
      {step === 1 && (
        <>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-4)' }}>Escolha o Serviço</h2>
          {servicos.length === 0 ? (
            <div className="empty-state card">
              <IconScissors style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-3)' }} />
              <p className="text-sm text-muted">Esta loja ainda não cadastrou serviços.</p>
            </div>
          ) : (
            <div className="agenonline-service-grid">
              {servicos.map(s => {
                const selecionado = carrinho.includes(s.id_servico)
                return (
                  <button
                    key={s.id_servico}
                    type="button"
                    className={`agenonline-service-card ${selecionado ? 'selected' : ''}`}
                    onClick={() => setServicoDetalhe(s)}
                  >
                    {selecionado && <span className="agenonline-service-check"><IconCheck style={{ width: 13, height: 13 }} /></span>}
                    <IconScissors style={{ width: 20, height: 20, color: 'var(--gray-500)' }} />
                    <div className="agenonline-service-nome">{s.nome}</div>
                    <div className="agenonline-service-preco">A partir de R$ {Number(s.preco).toFixed(2)}</div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="agenonline-cart-bar">
            <button
              type="button"
              className="btn btn-primary"
              disabled={carrinho.length === 0}
              onClick={handleContinuarServicos}
            >
              Ver Carrinho ({carrinho.length})
            </button>
          </div>
        </>
      )}

      {/* Gate de acesso — modal que só aparece ao tentar continuar sem estar logado como cliente */}
      {mostrarGateAcesso && (
        <div className="modal-overlay" onClick={() => setMostrarGateAcesso(false)}>
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ justifyContent: 'flex-end' }}>
              <button className="modal-close" onClick={() => setMostrarGateAcesso(false)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              {contaInvalida ? (
                <>
                  <IconAlert style={{ width: 28, height: 28, color: 'var(--warning-400)', margin: '0 auto var(--space-4)' }} />
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>Essa conta não é uma conta de cliente</h3>
                  <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>
                    Para agendar em {lojista.nome}, saia e entre com uma conta de cliente.
                  </p>
                  <button
                    type="button"
                    className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
                    disabled={isPending}
                    onClick={handleSairEEntrarComOutraConta}
                    style={{ width: '100%' }}
                  >
                    {isPending ? 'Saindo...' : 'Sair e entrar com outra conta'}
                  </button>
                </>
              ) : (
                <>
                  <IconPaw style={{ width: 28, height: 28, color: 'var(--primary-400)', margin: '0 auto var(--space-4)' }} />
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>Falta pouco!</h3>
                  <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>
                    Entre com sua conta de cliente para continuar o agendamento em {lojista.nome}. Seus serviços escolhidos continuam salvos.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <Link href={loginHref} className="btn btn-primary">Entrar</Link>
                    <Link href={`/cadastro?redirectTo=${encodeURIComponent(voltarParaCa)}`} className="btn btn-secondary">Criar conta de cliente</Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — Pet */}
      {step === 2 && (
        <div className="card">
          <h2 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-4)' }}>Preencha os detalhes do seu Pet</h2>

          {pets.length === 0 ? (
            <div className="alert alert-warning">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>Você ainda não tem pets cadastrados. <Link href="/cliente/pets/novo">Cadastre um pet</Link> e volte a esse link para agendar.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
              {pets.map(p => (
                <div
                  key={p.id_pet}
                  onClick={() => selecionarPet(p)}
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
                  <IconDog style={{ width: 16, height: 16, color: 'var(--gray-500)' }} />
                  <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</span>
                  <span className="text-sm text-muted">— {p.raca}</span>
                  {petId === p.id_pet && <IconCheck style={{ width: 15, height: 15, color: 'var(--primary-400)', marginLeft: 'auto' }} />}
                </div>
              ))}
            </div>
          )}

          {petSel && precisaClassificar && (
            <div style={{ marginBottom: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--gray-800)' }}>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Falta completar a espécie e o porte de {petSel.nome} — usamos isso pra calcular o preço certo do serviço.
              </p>

              <div className="form-group">
                <label className="form-label">Espécie</label>
                <div className="flex gap-2">
                  {(['Cão', 'Gato'] as const).map(e => (
                    <button key={e} type="button" className={`btn btn-sm ${especieForm === e ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEspecieForm(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Porte</label>
                <div className="flex gap-2">
                  {(['Pequeno', 'Médio', 'Grande'] as const).map(p => (
                    <button key={p} type="button" className={`btn btn-sm ${porteForm === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPorteForm(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className={`btn btn-secondary btn-sm ${salvandoClassificacao ? 'btn-loading' : ''}`}
                disabled={!especieForm || !porteForm || salvandoClassificacao}
                onClick={salvarClassificacao}
              >
                {salvandoClassificacao ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          )}

          {petSel && !precisaClassificar && (
            <div className="flex justify-between" style={{ marginBottom: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--gray-800)' }}>
              <span className="text-sm text-muted">Valor Total</span>
              <span className="font-semibold text-success">R$ {valorTotal.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!petId || precisaClassificar}
              onClick={() => setStep(3)}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Tutor (revisão) */}
      {step === 3 && (
        <div className="card">
          <h2 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-5)' }}>Preencha seus dados</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
            <div className="agenonline-resumo-row"><span className="text-muted">Nome</span><span>{cliente.nome}</span></div>
            <div className="agenonline-resumo-row"><span className="text-muted">Telefone</span><span>{formatarTelefone(cliente.telefone)}</span></div>
            <div className="agenonline-resumo-row"><span className="text-muted">CPF</span><span>{formatarCpf(cliente.cpf)}</span></div>
          </div>
          <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-5)' }}>
            Esses dados vêm da sua conta. Pra alterar, acesse seu perfil de cliente.
          </p>
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
              Continuar para Horários →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — Dia e hora */}
      {step === 4 && (
        <div className="card">
          <h2 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-3)' }}>Selecione o dia</h2>
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <SeletorDeData
              diasAbertos={diasAbertos}
              minInstante={minInstante}
              maxInstante={maxInstante}
              dataSelecionada={data}
              onSelecionar={setData}
            />
          </div>

          {data && (
            <>
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Horários disponíveis para {format(new Date(data + 'T12:00:00'), "EEEE dd/MM", { locale: ptBR })}
              </p>
              {slots === null ? (
                <p className="text-sm text-muted">Carregando horários...</p>
              ) : slots.length === 0 ? (
                <div className="alert alert-info"><span>Nenhum horário disponível nesse dia.</span></div>
              ) : (
                <div className="slots-grid">
                  {slots.map(slot => {
                    const horaCurta = slot.hr_slot.slice(0, 5)
                    return (
                      <button
                        key={slot.hr_slot}
                        type="button"
                        className={`slot ${!slot.disponivel ? 'slot-unavailable' : ''} ${horaInicio === horaCurta ? 'slot-selected' : ''}`}
                        onClick={() => slot.disponivel && setHoraInicio(horaCurta)}
                        disabled={!slot.disponivel}
                      >
                        {horaCurta}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end" style={{ marginTop: 'var(--space-6)' }}>
            <button type="button" className="btn btn-primary" disabled={!data || !horaInicio} onClick={() => setStep(5)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* STEP 5 — Resumo */}
      {step === 5 && (
        <div className="card">
          <h2 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-2)' }}>Resumo do serviço</h2>
          <button type="button" className="text-accent text-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 'var(--space-5)' }} onClick={() => setStep(1)}>
            Escolher mais serviços
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 'var(--space-5)' }}>
            {servicosCarrinho.map(s => (
              <div key={s.id_servico} className="agenonline-resumo-row">
                <span>{s.nome}</span>
                <span className="font-semibold text-success">R$ {Number(precos[s.id_servico] ?? s.preco).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 'var(--space-5)' }}>
            <div className="agenonline-resumo-row"><span className="text-muted">Pet</span><span>{petSel?.nome} — {petSel?.raca}</span></div>
            <div className="agenonline-resumo-row"><span className="text-muted">Tutor</span><span>{cliente.nome}</span></div>
            <div className="agenonline-resumo-row">
              <span className="text-muted">Data e hora</span>
              <span>{format(new Date(data + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })} às {horaInicio}</span>
            </div>
            <div className="agenonline-resumo-row"><span className="text-muted">Duração total</span><span>{duracaoTotal} minutos</span></div>
            <div className="agenonline-resumo-row"><span className="font-semibold">Valor Total</span><span className="font-semibold text-success">R$ {valorTotal.toFixed(2)}</span></div>
          </div>

          <div className="form-group">
            <label className="form-label">Observações (opcional)</label>
            <textarea className="form-textarea" value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={500} placeholder="Ex: pet é nervoso com barulho" />
          </div>

          <div className="flex justify-end">
            <button type="button" className={`btn btn-primary btn-lg ${isPending ? 'btn-loading' : ''}`} disabled={isPending} onClick={handleAgendar}>
              {isPending ? 'Agendando...' : 'Agendar'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 6 — Confirmação */}
      {step === 6 && resultado && (
        <div className="card" style={{ textAlign: 'center' }}>
          <span style={{
            display: 'inline-flex', width: 64, height: 64, borderRadius: 'var(--radius-full)',
            background: 'rgba(16,185,129,0.15)', color: 'var(--success-400)',
            alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-5)',
          }}>
            <IconCheck style={{ width: 30, height: 30 }} />
          </span>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 'var(--space-6)' }}>Serviço agendado!</h2>

          <a
            href={`https://wa.me/55${lojista.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(mensagemWhatsapp)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 'var(--space-3)' }}
          >
            <IconWhatsapp style={{ width: 16, height: 16 }} /> Enviar no Whatsapp
          </a>
          <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-5)' }}>
            Clique para enviar seu agendamento para o WhatsApp da loja
          </p>

          <Link href="/cliente/agendamentos" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            Ver meus agendamentos
          </Link>
        </div>
      )}

      {/* MODAL — Detalhes do serviço */}
      {servicoDetalhe && (
        <div className="modal-overlay" onClick={() => setServicoDetalhe(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{servicoDetalhe.nome}</h3>
              <button className="modal-close" onClick={() => setServicoDetalhe(null)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              {servicoDetalhe.descricao && (
                <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>{servicoDetalhe.descricao}</p>
              )}
              <div className="flex justify-between" style={{ marginBottom: 'var(--space-2)' }}>
                <span className="text-sm text-muted">Duração</span>
                <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{servicoDetalhe.duracao} minutos</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted">Preço</span>
                <span className="font-semibold text-success">A partir de R$ {Number(servicoDetalhe.preco).toFixed(2)}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setServicoDetalhe(null)}>Fechar</button>
              <button
                type="button"
                className={`btn ${carrinho.includes(servicoDetalhe.id_servico) ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => { alternarServico(servicoDetalhe.id_servico); setServicoDetalhe(null) }}
              >
                {carrinho.includes(servicoDetalhe.id_servico) ? 'Remover do carrinho' : 'Adicionar ao carrinho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL — Detalhes da loja */}
      {mostrarDetalheLoja && (
        <div className="modal-overlay" onClick={() => setMostrarDetalheLoja(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{lojista.nome}</h3>
              <button className="modal-close" onClick={() => setMostrarDetalheLoja(false)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              {lojista.descricao && (
                <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>{lojista.descricao}</p>
              )}

              {enderecoCompleto && (
                <div style={{ marginBottom: 'var(--space-5)' }}>
                  <div className="font-semibold text-sm" style={{ color: 'var(--gray-100)', marginBottom: 4 }}>Endereço</div>
                  <div className="text-sm text-muted">{enderecoCompleto}{lojista.cep ? ` — CEP ${lojista.cep}` : ''}</div>
                </div>
              )}

              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 'var(--space-2)' }}>
                  <IconClock style={{ width: 15, height: 15, color: 'var(--gray-500)' }} />
                  <span className="font-semibold text-sm" style={{ color: 'var(--gray-100)' }}>Horário de funcionamento</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {DIAS_ORDEM.map(dia => {
                    const h = horarios.find(h => h.dia_semana === dia && h.ativo)
                    return (
                      <div key={dia} className="flex justify-between text-sm" style={{ padding: '2px 0' }}>
                        <span className="text-muted">{dia}</span>
                        <span style={{ color: h ? 'var(--gray-100)' : 'var(--gray-500)' }}>
                          {h ? `${h.hr_inicio.slice(0, 5)} — ${h.hr_fim.slice(0, 5)}` : 'Fechado'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <p className="text-xs text-muted">
                Avaliações de clientes ainda não estão disponíveis nesta loja.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setMostrarDetalheLoja(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
