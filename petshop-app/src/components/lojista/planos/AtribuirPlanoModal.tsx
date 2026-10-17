'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { assinarPlanoAction, buscarClientesPlanoAction, petsDoClientePlanoAction } from '@/lib/actions-planos'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import { dataBR, previaAssinatura, sufixoPeriodo, type ClienteParaPlano, type PetParaPlano, type Plano } from '@/lib/planos'
import { formatarTelefone } from '@/lib/format'
import { formatarReais } from '@/lib/taxidog'
import { IconAlert, IconCheck, IconChevronLeft, IconClose, IconPaw, IconSearch } from '@/components/icons'
import Ilustracao from '@/components/Ilustracao'
import './planos-tela.css'

type Etapa = 'cliente' | 'pet' | 'revisao' | 'feito'
const ETAPAS: { id: Etapa; rotulo: string }[] = [
  { id: 'cliente', rotulo: 'Cliente' },
  { id: 'pet', rotulo: 'Pet' },
  { id: 'revisao', rotulo: 'Revisão' },
]

// Atribuir um plano direto da tela de Planos: cliente → pet → revisão.
// Quem cria a assinatura é a mesma action da ficha do pet
// (assinarPlanoAction → fn_assinar_plano), que confere tudo no banco.
export default function AtribuirPlanoModal({ plano, hojeISO, formasAceitas, onFechar, onConcluido }: {
  plano: Plano
  hojeISO: string
  formasAceitas: FormaPagamento[]
  onFechar: () => void
  onConcluido: () => void
}) {
  const [etapa, setEtapa] = useState<Etapa>('cliente')
  const [cliente, setCliente] = useState<ClienteParaPlano | null>(null)
  const [pet, setPet] = useState<PetParaPlano | null>(null)
  const [inicio, setInicio] = useState(hojeISO)
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()
  // Trava de clique duplo: a transição só começa depois do primeiro clique.
  const enviando = useRef(false)

  const fechar = () => { if (!salvando) onFechar() }

  function escolherCliente(c: ClienteParaPlano) {
    if (c.id_cliente !== cliente?.id_cliente) setPet(null)
    setCliente(c)
    setErro(null)
    setEtapa('pet')
  }

  function confirmar() {
    if (!cliente || !pet || enviando.current) return
    enviando.current = true
    setErro(null)
    startSalvar(async () => {
      const r = await assinarPlanoAction(plano.id_plano, pet.id_pet, inicio, forma || null)
      enviando.current = false
      if (r.error) {
        // Os dados escolhidos ficam: é só corrigir e confirmar de novo.
        setErro(r.error)
        return
      }
      setEtapa('feito')
      onConcluido()
    })
  }

  // Outro pet do mesmo cliente ou de outro: volta ao começo, sem o pet.
  function atribuirOutro() {
    setPet(null)
    setErro(null)
    setEtapa(cliente ? 'pet' : 'cliente')
  }

  const indice = ETAPAS.findIndex(e => e.id === etapa)

  return (
    <div className="modal-overlay" onClick={fechar}>
      <div className="modal pl-atribuir" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pl-atribuir-titulo">
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="modal-title" id="pl-atribuir-titulo">Atribuir plano</h3>
            <div className="pl-atribuir-plano">{plano.nome} · {formatarReais(plano.valor)}{sufixoPeriodo(plano.periodicidade, plano.intervalo_dias)}</div>
          </div>
          <button className="modal-close" onClick={fechar} aria-label="Fechar" disabled={salvando}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {etapa !== 'feito' && (
          <ol className="pl-passos" aria-label="Etapas">
            {ETAPAS.map((e, i) => (
              <li key={e.id} className={i < indice ? 'is-feito' : i === indice ? 'is-atual' : ''} aria-current={i === indice ? 'step' : undefined}>
                <span>{i < indice ? <IconCheck style={{ width: 12, height: 12 }} /> : i + 1}</span>{e.rotulo}
              </li>
            ))}
          </ol>
        )}

        <div className="modal-body">
          {erro && (
            <div className="alert alert-error" role="alert">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
            </div>
          )}

          {etapa === 'cliente' && <EtapaCliente selecionado={cliente} onEscolher={escolherCliente} />}

          {etapa === 'pet' && cliente && (
            <EtapaPet
              key={cliente.id_cliente}
              cliente={cliente}
              idPlano={plano.id_plano}
              selecionado={pet}
              onTrocarCliente={() => setEtapa('cliente')}
              onEscolher={p => { setPet(p); setErro(null); setEtapa('revisao') }}
            />
          )}

          {etapa === 'revisao' && cliente && pet && (
            <EtapaRevisao
              plano={plano}
              cliente={cliente}
              pet={pet}
              inicio={inicio}
              onInicio={setInicio}
              forma={forma}
              onForma={setForma}
              formasAceitas={formasAceitas}
              hojeISO={hojeISO}
              onAlterar={setEtapa}
            />
          )}

          {etapa === 'feito' && cliente && pet && (
            <div className="pl-feito">
              <Ilustracao nome="tudo-em-dia" altura={120} style={{ margin: 0 }} />
              <strong>Plano atribuído</strong>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                {pet.nome} ({cliente.nome}) agora tem o plano <strong>{plano.nome}</strong>, a partir de {dataBR(inicio)}.
                A cobrança fica pendente até você registrar o pagamento em Cobranças.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {etapa === 'cliente' && (
            <button type="button" className="btn btn-ghost" onClick={fechar}>Cancelar</button>
          )}
          {etapa === 'pet' && (
            <button type="button" className="btn btn-ghost" onClick={() => setEtapa('cliente')}>
              <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar
            </button>
          )}
          {etapa === 'revisao' && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setEtapa('pet')} disabled={salvando}>
                <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmar} disabled={salvando || !inicio}>
                {salvando ? 'Atribuindo…' : 'Confirmar e atribuir'}
              </button>
            </>
          )}
          {etapa === 'feito' && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onFechar}>Fechar</button>
              <Link href="/lojista/planos?aba=assinaturas" className="btn btn-secondary" onClick={onFechar}>Ver assinaturas</Link>
              <button type="button" className="btn btn-primary" onClick={atribuirOutro}>Atribuir a outro pet</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Etapa 1: cliente ──
function EtapaCliente({ selecionado, onEscolher }: { selecionado: ClienteParaPlano | null; onEscolher: (c: ClienteParaPlano) => void }) {
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<ClienteParaPlano[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [tentativa, setTentativa] = useState(0)

  // Busca enquanto digita (com uma pausa), descartando respostas antigas.
  useEffect(() => {
    let atual = true
    const t = setTimeout(async () => {
      const r = await buscarClientesPlanoAction(busca)
      if (!atual) return
      setErro(r.error ?? null)
      setClientes(r.clientes ?? null)
      setCarregando(false)
    }, busca ? 300 : 0)
    return () => { atual = false; clearTimeout(t) }
  }, [busca, tentativa])

  return (
    <>
      <div className="pl-busca">
        <IconSearch style={{ width: 16, height: 16 }} />
        <input
          className="form-input"
          autoFocus
          type="search"
          placeholder="Nome ou telefone do cliente"
          value={busca}
          onChange={e => { setBusca(e.target.value); setCarregando(true) }}
          aria-label="Buscar cliente"
        />
      </div>

      {erro ? (
        <div className="pl-estado">
          <span>{erro}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setCarregando(true); setTentativa(n => n + 1) }}>Tentar de novo</button>
        </div>
      ) : carregando && !clientes ? (
        <div className="pl-estado"><span>Buscando clientes…</span></div>
      ) : clientes && clientes.length === 0 ? (
        <div className="pl-estado">
          <span>{busca ? <>Nenhum cliente encontrado para “{busca}”.</> : 'A loja ainda não tem clientes.'}</span>
          <Link href="/lojista/clientes" className="btn btn-secondary btn-sm" target="_blank">Cadastrar cliente</Link>
        </div>
      ) : (
        <ul className={`pl-opcoes ${carregando ? 'is-carregando' : ''}`} aria-label="Clientes">
          {(clientes ?? []).map(c => (
            <li key={c.id_cliente}>
              <button type="button" className={`pl-opcao ${selecionado?.id_cliente === c.id_cliente ? 'is-escolhida' : ''}`} onClick={() => onEscolher(c)}>
                <span className="pl-avatar" aria-hidden="true">{iniciais(c.nome)}</span>
                <span className="pl-opcao-textos">
                  <span className="pl-opcao-titulo">{c.nome}</span>
                  {c.telefone && <span className="pl-opcao-sub">{formatarTelefone(c.telefone)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ── Etapa 2: pet ──
function EtapaPet({ cliente, idPlano, selecionado, onTrocarCliente, onEscolher }: {
  cliente: ClienteParaPlano
  idPlano: string
  selecionado: PetParaPlano | null
  onTrocarCliente: () => void
  onEscolher: (p: PetParaPlano) => void
}) {
  const [pets, setPets] = useState<PetParaPlano[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  // De novo (outra aba cadastrou um pet, ou deu erro): limpa e busca.
  function recarregar() {
    setPets(null)
    setErro(null)
    setTentativa(n => n + 1)
  }

  useEffect(() => {
    let atual = true
    petsDoClientePlanoAction(cliente.id_cliente).then(r => {
      if (!atual) return
      setErro(r.error ?? null)
      setPets(r.pets ?? [])
    })
    return () => { atual = false }
  }, [cliente.id_cliente, tentativa])

  return (
    <>
      <div className="pl-escolhido">
        <span className="pl-avatar" aria-hidden="true">{iniciais(cliente.nome)}</span>
        <span className="pl-opcao-textos">
          <span className="pl-opcao-titulo">{cliente.nome}</span>
          {cliente.telefone && <span className="pl-opcao-sub">{formatarTelefone(cliente.telefone)}</span>}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onTrocarCliente}>Trocar</button>
      </div>

      {erro ? (
        <div className="pl-estado">
          <span>{erro}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={recarregar}>Tentar de novo</button>
        </div>
      ) : pets === null ? (
        <div className="pl-estado"><span>Carregando os pets…</span></div>
      ) : pets.length === 0 ? (
        <div className="pl-estado">
          <span>{cliente.nome} ainda não tem pet cadastrado. O plano é sempre de um pet: cadastre o pet na ficha do cliente (abre em outra aba) e depois atualize aqui.</span>
          <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href={`/lojista/clientes/${cliente.id_cliente}`} className="btn btn-secondary btn-sm" target="_blank">Cadastrar pet</Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={recarregar}>Atualizar</button>
          </div>
        </div>
      ) : (
        <ul className="pl-opcoes" aria-label="Pets">
          {pets.map(p => {
            const jaTem = p.planos_ativos.includes(idPlano)
            return (
              <li key={p.id_pet}>
                <button
                  type="button"
                  className={`pl-opcao ${selecionado?.id_pet === p.id_pet ? 'is-escolhida' : ''}`}
                  onClick={() => onEscolher(p)}
                  disabled={jaTem}
                >
                  {p.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pl-avatar" src={p.foto_url} alt="" />
                  ) : (
                    <span className="pl-avatar" aria-hidden="true"><IconPaw style={{ width: 16, height: 16 }} /></span>
                  )}
                  <span className="pl-opcao-textos">
                    <span className="pl-opcao-titulo">{p.nome}</span>
                    <span className="pl-opcao-sub">
                      {jaTem ? 'Já tem este plano ativo' : [p.especie, p.raca].filter(Boolean).join(' · ') || 'Pet'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

// ── Etapa 3: revisão ──
function EtapaRevisao({ plano, cliente, pet, inicio, onInicio, forma, onForma, formasAceitas, hojeISO, onAlterar }: {
  plano: Plano
  cliente: ClienteParaPlano
  pet: PetParaPlano
  inicio: string
  onInicio: (v: string) => void
  forma: FormaPagamento | ''
  onForma: (v: FormaPagamento | '') => void
  formasAceitas: FormaPagamento[]
  hojeISO: string
  onAlterar: (e: Etapa) => void
}) {
  const previa = inicio ? previaAssinatura(inicio, plano.periodicidade, plano.intervalo_dias, hojeISO) : null

  return (
    <>
      <dl className="pl-resumo">
        <div><dt>Cliente</dt><dd>{cliente.nome}</dd><button type="button" className="pl-alterar" onClick={() => onAlterar('cliente')}>Alterar</button></div>
        <div><dt>Pet</dt><dd>{pet.nome}</dd><button type="button" className="pl-alterar" onClick={() => onAlterar('pet')}>Alterar</button></div>
        <div><dt>Plano</dt><dd>{plano.nome}</dd></div>
        <div><dt>Valor</dt><dd>{formatarReais(plano.valor)}{sufixoPeriodo(plano.periodicidade, plano.intervalo_dias)}</dd></div>
        <div>
          <dt>Inclui</dt>
          <dd>
            <ul className="pl-chips">
              {plano.servicos.map(s => <li key={s.id_servico}><strong>{s.quantidade}×</strong> {s.servico}</li>)}
            </ul>
            <span className="pl-opcao-sub">por período</span>
          </dd>
        </div>
      </dl>

      <div className="form-grid-2">
        <div className="form-group">
          <label htmlFor="pl-inicio" className="form-label form-label-required">Início</label>
          <input id="pl-inicio" type="date" className="form-input" value={inicio} onChange={e => onInicio(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="pl-forma" className="form-label">Forma de pagamento</label>
          <select id="pl-forma" className="form-select" value={forma} onChange={e => onForma(ehFormaPagamento(e.target.value) ? e.target.value : '')}>
            <option value="">Definir na cobrança</option>
            {formasAceitas.map(f => <option key={f} value={f}>{ROTULO_FORMA_PAGAMENTO[f]}</option>)}
          </select>
        </div>
      </div>

      {previa && (
        <div className="pl-previa">
          <div><span>1º período</span><strong>{dataBR(previa.primeiro.inicio)} a {dataBR(previa.primeiro.fim)}</strong></div>
          <div><span>Próxima renovação</span><strong>{dataBR(previa.proximaCobranca)}</strong></div>
          <p>
            {previa.cobrancasCriadas > 1 ? (
              <>Como o início é antes de hoje, já entram <strong>{previa.cobrancasCriadas} cobranças de {formatarReais(plano.valor)}</strong>, uma por período desde {dataBR(previa.primeiro.inicio)}.</>
            ) : (
              <>A 1ª cobrança, de <strong>{formatarReais(plano.valor)}</strong>, vence em <strong>{dataBR(previa.primeiro.inicio)}</strong>.</>
            )}{' '}
            Todas ficam pendentes até você registrar o pagamento. Depois, uma cobrança nova no início de cada período.
          </p>
        </div>
      )}
    </>
  )
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}
