'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { chegarParadaAction, concluirParadaAction, iniciarRotaAction } from '@/lib/actions-rotas'
import { formatarTelefone } from '@/lib/format'
import {
  CLASSE_STATUS_ROTA,
  ROTULO_STATUS_ROTA,
  avisarMudancaPropria,
  contarPets,
  enderecoParada,
  formatarDistancia,
  formatarDuracao,
  horarioParada,
  linhasLoja,
  proximaParada,
  tituloParada,
  type ItemParada,
  type Parada,
  type Rota,
} from '@/lib/taxidog-rotas'
import { IconAlert, IconCar, IconCheck, IconChevronLeft, IconPhone, IconRoute, IconStore } from '@/components/icons'

// "Minhas rotas" do TaxiDog (web). Mesmo fluxo do app: lista → rota →
// INICIAR ROTA → PRÓXIMA PARADA (Abrir no Google Maps → Cheguei →
// confirmar pets) → a próxima aparece sozinha.

interface Props {
  rotas: Rota[]
  hojeISO: string
  enderecoLoja: string
  idRotaAberta: string | null
  caminho: string
}

type Aba = 'hoje' | 'proximas' | 'historico'

// Versão da rota cujo aviso "Rota atualizada" o TaxiDog já fechou (só
// neste navegador — no servidor conta como não visto).
const assinarStorage = (cb: () => void) => {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
const chaveAviso = (idRota: string) => `taxidog-rota-aviso:${idRota}`
function lerAvisoVisto(idRota: string): number {
  try { return Number(localStorage.getItem(chaveAviso(idRota)) ?? 0) || 0 } catch { return 0 }
}

function rotuloDia(data: string, hojeISO: string): string {
  if (data === hojeISO) return 'Hoje'
  return format(parseISO(data), "EEE, dd/MM", { locale: ptBR })
}

function linkMaps(p: Parada, enderecoLoja: string): string {
  let destino: string
  if (p.local === 'loja') {
    destino = enderecoLoja.replaceAll(' · ', ', ')
  } else {
    const i = p.itens[0]
    destino = i ? `${i.logradouro}, ${i.numero} - ${i.bairro}, ${i.cidade} - ${i.uf}, ${i.cep}` : ''
  }
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destino)}`
}

// Rótulo do botão de confirmar conforme o que se faz na parada.
function rotuloConfirmar(p: Parada): string {
  const acoes = new Set(p.itens.filter(i => !i.feito).map(i => i.acao))
  const varios = p.itens.filter(i => !i.feito).length > 1
  if (acoes.size !== 1) return 'Confirmar'
  if (acoes.has('embarcar')) return varios ? 'Pets embarcados' : 'Pet embarcado'
  if (acoes.has('entregar')) return varios ? 'Pets entregues' : 'Pet entregue'
  if (acoes.has('deixar_loja')) return 'Entregar pets na loja'
  return varios ? 'Pegar pets' : 'Pegar pet'
}

function rotuloAcao(i: ItemParada): string {
  switch (i.acao) {
    case 'embarcar': return 'Buscar'
    case 'deixar_loja': return 'Deixar na loja'
    case 'pegar_loja': return 'Pegar na loja'
    default: return 'Entregar'
  }
}

export default function TaxiDogRotasMotorista({ rotas, hojeISO, enderecoLoja, idRotaAberta, caminho }: Props) {
  const router = useRouter()
  const emAndamento = rotas.find(r => r.status === 'em_andamento')
  const aberta = rotas.find(r => r.id_rota === idRotaAberta) ?? null

  const hoje = rotas
    .filter(r => r.status !== 'cancelada' && (r.data === hojeISO || (r.status === 'em_andamento' && r.data < hojeISO)))
    .sort((a, b) => Number(b.status === 'em_andamento') - Number(a.status === 'em_andamento') || a.numero - b.numero)
  const proximas = rotas.filter(r => r.data > hojeISO && r.status !== 'cancelada' && r.status !== 'concluida')
  const historico = rotas.filter(r => r.status === 'concluida' && r.data <= hojeISO).sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero)
  const [aba, setAba] = useState<Aba>(hoje.length === 0 && proximas.length > 0 ? 'proximas' : 'hoje')

  const abrir = (id: string | null) => router.push(id ? `${caminho}?rota=${id}` : caminho)

  if (aberta) return <TelaRota rota={aberta} hojeISO={hojeISO} enderecoLoja={enderecoLoja} onVoltar={() => abrir(null)} />

  const lista = aba === 'hoje' ? hoje : aba === 'proximas' ? proximas : historico

  return (
    <div className="tdm">
      {emAndamento && (
        <button type="button" className="tdm-andamento" onClick={() => abrir(emAndamento.id_rota)}>
          <IconRoute style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>
            <strong>Rota #{emAndamento.numero} em andamento</strong>
            <span className="text-sm" style={{ display: 'block' }}>
              Próxima: {proximaParada(emAndamento) ? tituloParada(proximaParada(emAndamento)!) : '—'}
            </span>
          </span>
          <span className="tdm-andamento-cta">Continuar</span>
        </button>
      )}

      <div className="tdm-abas" role="tablist">
        {([['hoje', `Hoje (${hoje.length})`], ['proximas', `Próximas (${proximas.length})`], ['historico', 'Histórico']] as const).map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'is-ativa' : ''} onClick={() => setAba(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="empty-state card">
          <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">
            {aba === 'hoje' ? 'Nenhuma rota para hoje' : aba === 'proximas' ? 'Nenhuma rota programada' : 'Nenhuma rota concluída ainda'}
          </div>
          <p>{aba === 'historico' ? 'As rotas que você terminar ficam aqui.' : 'Quando a loja montar uma rota para você, ela aparece aqui.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {lista.map(r => {
            const distancia = formatarDistancia(r.distancia_m)
            const duracao = formatarDuracao(r.duracao_s)
            return (
              <button key={r.id_rota} type="button" className="card tdr-card-rota" onClick={() => abrir(r.id_rota)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="tdr-numero">Rota #{r.numero} · {rotuloDia(r.data, hojeISO)}</span>
                  <span className={`badge ${CLASSE_STATUS_ROTA[r.status]}`}>{ROTULO_STATUS_ROTA[r.status]}</span>
                </div>
                <div className="text-sm text-muted">
                  {r.paradas.length} {r.paradas.length === 1 ? 'parada' : 'paradas'} · {contarPets(r)} {contarPets(r) === 1 ? 'pet' : 'pets'}
                  {distancia && r.calculo_versao === r.versao ? ` · ${distancia} · ~${duracao}` : ''}
                </div>
                <span className="text-sm text-accent">{r.status === 'em_andamento' ? 'Continuar rota →' : 'Ver rota →'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TelaRota({ rota: r, hojeISO, enderecoLoja, onVoltar }: { rota: Rota; hojeISO: string; enderecoLoja: string; onVoltar: () => void }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const avisoGuardado = useSyncExternalStore(assinarStorage, () => lerAvisoVisto(r.id_rota), () => 0)
  const [avisoFechado, setAvisoFechado] = useState(0)
  const avisoVisto = Math.max(avisoGuardado, avisoFechado)

  const proxima = proximaParada(r)
  const feitas = r.paradas.filter(p => p.status === 'concluida')
  const depois = r.paradas.filter(p => p.status !== 'concluida' && p.id_parada !== proxima?.id_parada)
  const distancia = formatarDistancia(r.distancia_m)
  const duracao = formatarDuracao(r.duracao_s)
  const mostrarAviso = !!r.ultima_alteracao && r.versao > 1 && avisoVisto < r.versao && (r.status === 'aguardando_saida' || r.status === 'em_andamento')

  function executar(acao: () => Promise<{ error?: string }>) {
    setErro(null)
    startTransition(async () => {
      const res = await acao()
      if (res.error) setErro(res.error)
      router.refresh()
    })
  }

  function marcarAvisoVisto() {
    setAvisoFechado(r.versao)
    try { localStorage.setItem(chaveAviso(r.id_rota), String(r.versao)) } catch { /* sem storage: some só nesta visita */ }
  }

  return (
    <div className="tdm">
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onVoltar}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Minhas rotas
      </button>

      <div className="flex items-center justify-between gap-2" style={{ flexWrap: 'wrap' }}>
        <h2 className="tdm-titulo">Rota #{r.numero}</h2>
        <span className={`badge ${CLASSE_STATUS_ROTA[r.status]}`}>{ROTULO_STATUS_ROTA[r.status]}</span>
      </div>

      {mostrarAviso && (
        <div className="alert alert-warning tdm-aviso">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}><strong>Rota atualizada</strong> — {r.ultima_alteracao}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={marcarAvisoVisto}>Ok</button>
        </div>
      )}
      {erro && (
        <div className="alert alert-error"><IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span></div>
      )}

      <div className="tdr-resumo-rota">
        <div><div className="text-xs text-muted">Dia</div><div className="font-semibold">{rotuloDia(r.data, hojeISO)}</div></div>
        <div><div className="text-xs text-muted">Paradas</div><div className="font-semibold">{r.paradas.length}</div></div>
        <div><div className="text-xs text-muted">Pets</div><div className="font-semibold">{contarPets(r)}</div></div>
        <div><div className="text-xs text-muted">Trajeto</div><div className="font-semibold">{distancia && r.calculo_versao === r.versao ? `${distancia} · ~${duracao}` : '—'}</div></div>
      </div>

      {r.status === 'cancelada' && <div className="alert alert-info"><span>A loja cancelou esta rota.</span></div>}
      {r.status === 'concluida' && (
        <div className="tdm-fim">
          <IconCheck style={{ width: 28, height: 28 }} />
          <strong>Rota concluída</strong>
          {r.iniciada_em && r.concluida_em && (
            <span className="text-sm text-muted">
              {format(new Date(r.iniciada_em), 'HH:mm')} → {format(new Date(r.concluida_em), 'HH:mm')}
            </span>
          )}
        </div>
      )}

      {(r.status === 'planejamento' || r.status === 'aguardando_saida') && (
        <>
          <ol className="tdr-paradas">
            {r.paradas.map((p, idx) => <LinhaParada key={p.id_parada} parada={p} numero={idx + 1} enderecoLoja={enderecoLoja} />)}
          </ol>
          <button
            type="button"
            className={`btn btn-primary tdm-botao ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending || r.paradas.length === 0}
            onClick={() => executar(() => iniciarRotaAction(r.id_rota))}
          >
            Iniciar rota
          </button>
          {r.data !== hojeISO && <p className="text-xs text-muted" style={{ margin: 0, textAlign: 'center' }}>Esta rota é de {rotuloDia(r.data, hojeISO)}.</p>}
        </>
      )}

      {r.status === 'em_andamento' && proxima && (
        <ProximaParada
          key={`${proxima.id_parada}:${proxima.status}:${r.versao}`}
          parada={proxima}
          numero={r.paradas.indexOf(proxima) + 1}
          total={r.paradas.length}
          enderecoLoja={enderecoLoja}
          ocupado={isPending}
          onChegar={() => executar(() => chegarParadaAction(proxima.id_parada))}
          onConfirmar={itens => {
            if (itens) avisarMudancaPropria(r.id_rota)
            executar(() => concluirParadaAction(proxima.id_parada, itens))
          }}
        />
      )}

      {r.status === 'em_andamento' && depois.length > 0 && (
        <section>
          <div className="tdr-grupo">Depois</div>
          <ol className="tdr-paradas">
            {depois.map(p => <LinhaParada key={p.id_parada} parada={p} numero={r.paradas.indexOf(p) + 1} enderecoLoja={enderecoLoja} />)}
          </ol>
        </section>
      )}

      {feitas.length > 0 && r.status !== 'aguardando_saida' && (
        <details className="tdm-feitas">
          <summary>Paradas feitas ({feitas.length})</summary>
          <ol className="tdr-paradas">
            {feitas.map(p => <LinhaParada key={p.id_parada} parada={p} numero={r.paradas.indexOf(p) + 1} enderecoLoja={enderecoLoja} />)}
          </ol>
        </details>
      )}
    </div>
  )
}

function LinhaParada({ parada: p, numero, enderecoLoja }: { parada: Parada; numero: number; enderecoLoja: string }) {
  return (
    <li className={`tdr-parada is-${p.status}`}>
      <span className="tdr-parada-num">{p.status === 'concluida' ? '✓' : numero}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="font-semibold flex items-center gap-1" style={{ color: 'var(--gray-100)' }}>
          {p.local === 'loja' && <IconStore style={{ width: 13, height: 13 }} />}
          {tituloParada(p)}
        </div>
        {p.local === 'loja'
          ? linhasLoja(p).map(l => <div key={l} className="text-sm" style={{ color: 'var(--gray-300)' }}>{l}</div>)
          : <div className="text-xs text-muted tdr-truncar">{enderecoParada(p, enderecoLoja)}{horarioParada(p) ? ` · ${horarioParada(p)}` : ''}</div>}
      </div>
    </li>
  )
}

function ProximaParada({ parada: p, numero, total, enderecoLoja, ocupado, onChegar, onConfirmar }: {
  parada: Parada
  numero: number
  total: number
  enderecoLoja: string
  ocupado: boolean
  onChegar: () => void
  onConfirmar: (itensOk: string[] | null) => void
}) {
  const aFazer = p.itens.filter(i => !i.feito)
  // Buscar no cliente / pegar na loja podem falhar (cliente não estava,
  // pet não ficou pronto): esses dá pra desmarcar e o pet sai da rota.
  // Deixar na loja / entregar ao cliente são obrigatórios.
  const opcional = (i: ItemParada) => i.acao === 'embarcar' || i.acao === 'pegar_loja'
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(aFazer.filter(i => i.acao !== 'pegar_loja' || i.status_corrida === 'pronto_entrega').map(i => i.id_item)),
  )
  const temOpcional = aFazer.some(opcional)
  const desmarcados = aFazer.filter(i => opcional(i) && !marcados.has(i.id_item))
  const clientes = [...new Map(p.itens.filter(() => p.local === 'cliente').map(i => [i.cliente_telefone, i])).values()]

  function alternar(id: string) {
    setMarcados(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  return (
    <section className="tdm-proxima">
      <div className="tdm-proxima-topo">
        <span>Próxima parada</span>
        <span>{numero} de {total}</span>
      </div>
      <div className="tdm-proxima-titulo">
        {p.local === 'loja' && <IconStore style={{ width: 18, height: 18 }} />}
        {tituloParada(p)}
      </div>
      <div className="text-sm" style={{ color: 'var(--gray-300)' }}>{enderecoParada(p, enderecoLoja)}</div>
      {horarioParada(p) && <div className="text-sm text-muted">Horário combinado: {horarioParada(p)}</div>}
      {p.local === 'loja' && linhasLoja(p).map(l => <div key={l} className="font-semibold text-sm">{l}</div>)}

      {clientes.map(c => (
        <a key={c.cliente_telefone} href={`tel:${c.cliente_telefone.replace(/\D/g, '')}`} className="tdm-telefone">
          <IconPhone style={{ width: 14, height: 14 }} /> {c.cliente_nome} · {formatarTelefone(c.cliente_telefone)}
        </a>
      ))}

      {p.status === 'pendente' ? (
        <div className="tdm-botoes">
          <a href={linkMaps(p, enderecoLoja)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary tdm-botao">
            <IconRoute style={{ width: 16, height: 16 }} /> Abrir no Google Maps
          </a>
          <button type="button" className={`btn btn-primary tdm-botao ${ocupado ? 'btn-loading' : ''}`} disabled={ocupado} onClick={onChegar}>
            Cheguei
          </button>
        </div>
      ) : (
        <>
          <ul className="tdm-pets">
            {aFazer.map(i => {
              const naoPronto = i.acao === 'pegar_loja' && i.status_corrida !== 'pronto_entrega'
              const comportamento = (i.pet_comportamento ?? []).filter(Boolean)
              return (
                <li key={i.id_item} className={marcados.has(i.id_item) ? 'is-marcado' : ''}>
                  <label className="tdm-pet">
                    {opcional(i)
                      ? <input type="checkbox" checked={marcados.has(i.id_item)} disabled={naoPronto} onChange={() => alternar(i.id_item)} />
                      : <IconCheck style={{ width: 16, height: 16, color: 'var(--status-concluido-fg)', flexShrink: 0 }} />}
                    {i.pet_foto_url
                      // eslint-disable-next-line @next/next/no-img-element -- foto do Storage, tamanho fixo pequeno
                      ? <img src={i.pet_foto_url} alt="" className="tdm-pet-foto" />
                      : <span className="tdm-pet-foto" aria-hidden>🐾</span>}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{i.pet_nome}</strong>
                      <span className="text-xs text-muted" style={{ display: 'block' }}>
                        {rotuloAcao(i)}{i.pet_raca ? ` · ${i.pet_raca}` : ''}{p.local === 'loja' ? ` · ${i.cliente_nome}` : ''}
                      </span>
                      {naoPronto && <span className="text-xs" style={{ color: 'var(--status-aguardando-fg)', display: 'block' }}>Ainda não está pronto</span>}
                    </span>
                  </label>
                  {(comportamento.length > 0 || i.pet_obs || i.pet_obs_comportamento || i.obs_agendamento) && (
                    <div className="tdm-pet-obs">
                      {comportamento.map(t => <span key={t} className="badge badge-pendente" style={{ textTransform: 'none', letterSpacing: 0 }}>{t}</span>)}
                      {[i.obs_agendamento, i.pet_obs, i.pet_obs_comportamento].filter(Boolean).map((o, k) => <span key={k} className="text-xs text-muted">{o}</span>)}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {temOpcional && (
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              {desmarcados.length > 0
                ? `${desmarcados.map(i => i.pet_nome).join(', ')} vai sair desta rota e volta para a loja reorganizar.`
                : 'Desmarque o pet que não foi (cliente ausente ou pet não pronto).'}
            </p>
          )}
          <button
            type="button"
            className={`btn btn-primary tdm-botao ${ocupado ? 'btn-loading' : ''}`}
            disabled={ocupado}
            onClick={() => onConfirmar(desmarcados.length > 0 ? aFazer.filter(i => marcados.has(i.id_item) || !opcional(i)).map(i => i.id_item) : null)}
          >
            {rotuloConfirmar(p)}
          </button>
        </>
      )}
    </section>
  )
}
