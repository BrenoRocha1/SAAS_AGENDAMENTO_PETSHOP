'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { IconAlert, IconCalendar, IconClose, IconDog, IconSearch, IconUser } from '@/components/icons'
import { formatarTelefone } from '@/lib/format'
import {
  formatarTelefoneWhatsApp, mensagemDoWhatsApp,
  type AgendamentoResumido, type ClienteParaConversa, type ContatoDaConversa, type Conversa,
} from '@/lib/whatsapp/tipos'
import { AvatarContato, nomeDaConversa } from './ListaConversas'
import { dataCurta } from './formatos'

interface Props {
  conversa: Conversa
  podeAgendar: boolean
  podeVerClientes: boolean
  onFechar: () => void
  onMudou: (idConversa: string, mudanca: Partial<Conversa>) => void
}

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Agendamento({ a }: { a: AgendamentoResumido | null | undefined }) {
  if (!a) return <span className="wa-det-vazio">—</span>
  return <span>{a.servico}{a.pet ? ` · ${a.pet}` : ''} — {dataCurta(a.data)} às {a.hora.slice(0, 5)}</span>
}

// Painel do contato: quem é o cliente, os pets dele e os agendamentos nesta
// loja, com atalhos para as telas que já existem (cliente, pet, novo
// agendamento). Contato sem cadastro pode ser ligado a um cliente da loja.
export default function DetalhesContato({ conversa, podeAgendar, podeVerClientes, onFechar, onMudou }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const id = conversa.id_conversa
  const [contato, setContato] = useState<ContatoDaConversa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [vinculando, setVinculando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Recarrega quando muda o cliente ou o pet ligado à conversa.
  useEffect(() => {
    let cancelado = false
    supabase.rpc('fn_whatsapp_contato', { p_id_conversa: id }).then(({ data, error }) => {
      if (cancelado) return
      if (error) return setErro(mensagemDoWhatsApp(error, 'Não foi possível carregar os dados do contato.'))
      setErro(null)
      setContato(data as ContatoDaConversa)
    })
    return () => { cancelado = true }
  }, [supabase, id, conversa.id_cliente, conversa.id_pet])

  async function vincular(idCliente: string | null, idPet: string | null, extra: Partial<Conversa> = {}) {
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.rpc('fn_whatsapp_vincular', { p_id_conversa: id, p_id_cliente: idCliente, p_id_pet: idPet })
    setSalvando(false)
    if (error) return setErro(mensagemDoWhatsApp(error, 'Não foi possível salvar.'))
    setVinculando(false)
    onMudou(id, { id_cliente: idCliente, id_pet: idPet, ...extra })
  }

  const cliente = contato?.cliente ?? null
  const linkAgendar = (idPet?: string | null) =>
    `/lojista/agendamentos?novoAgendamentoTutor=${conversa.id_cliente}${idPet ? `&novoAgendamentoPet=${idPet}` : ''}`

  return (
    <aside className="wa-detalhes" aria-label="Informações do contato">
      <header className="wa-detalhes-topo">
        <h3>Informações</h3>
        <button type="button" className="wa-botao-icone" onClick={onFechar} aria-label="Fechar informações">
          <IconClose style={{ width: 18, height: 18 }} />
        </button>
      </header>

      <div className="wa-detalhes-corpo">
        {erro && (
          <div className="alert alert-error">
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>{erro}</span>
          </div>
        )}

        <div className="wa-det-perfil">
          <AvatarContato nome={nomeDaConversa(conversa)} fotoUrl={conversa.foto_url} tamanho={64} />
          <strong>{nomeDaConversa(conversa)}</strong>
          <span>{formatarTelefoneWhatsApp(conversa.telefone)}</span>
          <span className="wa-det-numero">Conversa #{conversa.numero}</span>
        </div>

        {contato === null ? (
          // Sem os dados (carregando, ou o erro acima): não afirma nada sobre o cadastro.
          !erro && <p className="wa-det-vazio">Carregando...</p>
        ) : !cliente ? (
          <section className="wa-det-secao">
            <h4>Cliente</h4>
            <p className="wa-det-texto">Este número não está no cadastro de clientes da loja.</p>
            {vinculando ? (
              <BuscaCliente salvando={salvando} onEscolher={c => vincular(c.id_cliente, null, { nome: c.nome, foto_url: c.foto_url, pets: c.pets })} onCancelar={() => setVinculando(false)} />
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVinculando(true)}>
                <IconUser style={{ width: 14, height: 14 }} /> Vincular a um cliente
              </button>
            )}
          </section>
        ) : (
          <>
            <section className="wa-det-secao">
              <h4>Cliente</h4>
              <dl className="wa-det-dados">
                <div><dt>Telefone do cadastro</dt><dd>{formatarTelefone(cliente.telefone)}</dd></div>
                <div><dt>Situação</dt><dd>{cliente.ativo ? 'Ativo' : 'Inativo'}</dd></div>
                <div><dt>Pets</dt><dd>{contato?.pets.length ?? 0}</dd></div>
                <div><dt>Próximo agendamento</dt><dd><Agendamento a={contato?.proximo} /></dd></div>
                <div><dt>Último atendimento</dt><dd><Agendamento a={contato?.ultimo} /></dd></div>
                <div>
                  <dt>Total gasto</dt>
                  <dd>{moeda(Number(contato?.total_gasto ?? 0))}{contato?.atendimentos ? ` em ${contato.atendimentos} atendimento${contato.atendimentos === 1 ? '' : 's'}` : ''}</dd>
                </div>
              </dl>
              <div className="wa-det-acoes">
                {podeAgendar && (
                  <Link href={linkAgendar(conversa.id_pet)} className="btn btn-primary btn-sm">
                    <IconCalendar style={{ width: 14, height: 14 }} /> Novo agendamento
                  </Link>
                )}
                {podeVerClientes && (
                  <Link href={`/lojista/clientes/${cliente.id_cliente}`} className="btn btn-secondary btn-sm">
                    <IconUser style={{ width: 14, height: 14 }} /> Ver cliente
                  </Link>
                )}
              </div>
            </section>

            <section className="wa-det-secao">
              <h4>Pets</h4>
              {contato && contato.pets.length === 0 ? (
                <p className="wa-det-texto">Nenhum pet cadastrado.</p>
              ) : (
                <ul className="wa-det-pets">
                  {contato?.pets.map(pet => {
                    const daConversa = conversa.id_pet === pet.id_pet
                    return (
                      <li key={pet.id_pet} className={daConversa ? 'is-da-conversa' : ''}>
                        <span className="wa-det-pet-foto">
                          {pet.foto_url
                            // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                            ? <img src={pet.foto_url} alt="" />
                            : <IconDog style={{ width: 18, height: 18 }} />}
                        </span>
                        <span className="wa-det-pet-dados">
                          <strong>{pet.nome}</strong>
                          <span>{pet.raca}</span>
                          <span>
                            {pet.proximo
                              ? `Próximo: ${pet.proximo.servico} — ${dataCurta(pet.proximo.data)}`
                              : 'Sem agendamento marcado'}
                          </span>
                          <span className="wa-det-pet-acoes">
                            {podeVerClientes && <Link href={`/lojista/pets/${pet.id_pet}`}>Ver pet</Link>}
                            {podeAgendar && <Link href={linkAgendar(pet.id_pet)}>Agendar</Link>}
                            {/* O pet de que a conversa trata: aparece na lista e já sai escolhido ao agendar. */}
                            <button
                              type="button"
                              disabled={salvando}
                              onClick={() => vincular(cliente.id_cliente, daConversa ? null : pet.id_pet, {
                                pets: daConversa ? contato.pets.map(p => p.nome).join(', ') : `${pet.nome} • ${pet.raca}`,
                              })}
                            >
                              {daConversa ? 'Tirar da conversa' : 'É sobre este pet'}
                            </button>
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <button type="button" className="wa-det-desvincular" disabled={salvando} onClick={() => vincular(null, null, { nome: null, foto_url: null, pets: null })}>
              Este contato não é este cliente
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

// Busca de cliente da loja (nome, telefone ou pet) para ligar à conversa.
export function BuscaCliente({ salvando, onEscolher, onCancelar }: {
  salvando: boolean
  onEscolher: (cliente: ClienteParaConversa) => void
  onCancelar?: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [busca, setBusca] = useState('')
  const [resultado, setResultado] = useState<ClienteParaConversa[] | null>(null)

  // Espera a pessoa parar de digitar antes de consultar.
  useEffect(() => {
    let cancelado = false
    const relogio = setTimeout(() => {
      supabase.rpc('fn_whatsapp_buscar_clientes', { p_busca: busca.trim() || null }).then(({ data }) => {
        if (!cancelado) setResultado((data ?? []) as ClienteParaConversa[])
      })
    }, busca.trim() === '' ? 0 : 300)
    return () => { cancelado = true; clearTimeout(relogio) }
  }, [supabase, busca])

  return (
    <div className="wa-busca-cliente">
      <label className="wa-busca">
        <IconSearch style={{ width: 17, height: 17 }} />
        <input
          type="search"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Nome, telefone ou pet..."
          aria-label="Buscar cliente por nome, telefone ou pet"
          autoFocus
        />
      </label>
      <div className="wa-busca-cliente-lista">
        {resultado === null ? (
          <p className="wa-det-vazio">Buscando...</p>
        ) : resultado.length === 0 ? (
          <p className="wa-det-vazio">Nenhum cliente encontrado.</p>
        ) : resultado.map(c => (
          <button key={c.id_cliente} type="button" onClick={() => onEscolher(c)} disabled={salvando}>
            <AvatarContato nome={c.nome} fotoUrl={c.foto_url} tamanho={36} />
            <span>
              <strong>{c.nome}</strong>
              <small>{formatarTelefone(c.telefone)}{c.pets ? ` · ${c.pets}` : ''}</small>
            </span>
          </button>
        ))}
      </div>
      {onCancelar && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar} disabled={salvando}>Cancelar</button>}
    </div>
  )
}
