'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { editarAgendamentoAction } from '@/lib/actions'
import { formatarReais } from '@/lib/taxidog'
import type { PlanoDoPet } from '@/lib/planos'
import { IconAlert, IconCheck, IconClose, IconPencil, IconWhatsapp } from '@/components/icons'

// "Editar": trocar o serviço e/ou o pet (do mesmo cliente) — regras em
// fn_editar_agendamento (migration 070). A loja altera Pendente ou Aceito;
// o cliente, o próprio agendamento só enquanto Pendente. O modal é aberto
// pela tela (fora do detalhe) e vai pro body (portal), como o Remarcar.

export function BotaoEditar({ onClick, rotulo = 'Editar' }: { onClick: () => void; rotulo?: string }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onClick}>
      <IconPencil style={{ width: 14, height: 14 }} /> {rotulo}
    </button>
  )
}

export function EditarModal(props: { idAgendamento: string; modo: 'loja' | 'cliente'; onFechar: () => void }) {
  return createPortal(<EditarConteudo {...props} />, document.body)
}

interface Dados {
  idLojista: string
  idCliente: string | null
  idPet: string | null
  idServico: string
  dt: string
  hr: string
  valor: number
  // Serviços marcados juntos (mesmo pet, dia e pedido) ainda por fazer.
  noPedido: number
  servicos: { id_servico: string; nome: string; duracao: number }[]
  pets: { id_pet: string; nome: string; raca: string | null }[]
}

function horaMais(hhmm: string, minutos: number) {
  const [h, m] = hhmm.split(':').map(Number)
  const t = h * 60 + m + minutos
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

function EditarConteudo({ idAgendamento, modo, onFechar }: { idAgendamento: string; modo: 'loja' | 'cliente'; onFechar: () => void }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [dados, setDados] = useState<Dados | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [idServico, setIdServico] = useState('')
  const [idPet, setIdPet] = useState('')
  const [preco, setPreco] = useState<{ chave: string; valor: number | null } | null>(null)
  const [planos, setPlanos] = useState<{ chave: string; lista: PlanoDoPet[] } | null>(null)
  const [usarBeneficio, setUsarBeneficio] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ anterior: number; novo: number; avisos: string[]; whatsapp: string | null } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Agendamento, serviços da loja e pets do cliente.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: ag } = await supabase
        .from('agendamento')
        .select('id_lojista, id_cliente, id_pet, id_servico, dt_agendamento, hr_agendamento, valor, created_at')
        .eq('id_agendamento', idAgendamento)
        .maybeSingle()
      if (!ag) { if (!cancelado) setErroCarga('Agendamento não encontrado.'); return }
      const [{ data: servicos }, { data: pets }, { count }] = await Promise.all([
        supabase.from('servico').select('id_servico, nome, duracao').eq('id_lojista', ag.id_lojista).eq('status', 'Ativo').order('nome'),
        ag.id_cliente
          ? supabase.from('pet').select('id_pet, nome, raca').eq('id_cliente', ag.id_cliente).eq('ativo', true).order('nome')
          : Promise.resolve({ data: [] }),
        supabase.from('agendamento').select('id_agendamento', { count: 'exact', head: true })
          .eq('id_lojista', ag.id_lojista).eq('id_pet', ag.id_pet).eq('dt_agendamento', ag.dt_agendamento)
          .eq('created_at', ag.created_at).in('status', ['Pendente', 'Confirmado']),
      ])
      if (cancelado) return
      const lista = (servicos ?? []) as Dados['servicos']
      // O serviço atual pode ter sido desativado: continua na lista.
      if (!lista.some(s => s.id_servico === ag.id_servico)) {
        const { data: atual } = await supabase.from('servico').select('id_servico, nome, duracao').eq('id_servico', ag.id_servico).maybeSingle()
        if (atual) lista.unshift(atual as Dados['servicos'][number])
      }
      setDados({
        idLojista: ag.id_lojista, idCliente: ag.id_cliente, idPet: ag.id_pet, idServico: ag.id_servico,
        dt: ag.dt_agendamento, hr: ag.hr_agendamento.slice(0, 5), valor: Number(ag.valor),
        noPedido: count ?? 1, servicos: lista, pets: (pets ?? []) as Dados['pets'],
      })
      setIdServico(ag.id_servico)
      setIdPet(ag.id_pet ?? '')
    })()
    return () => { cancelado = true }
  }, [idAgendamento, supabase])

  // Preço do serviço escolhido para o pet escolhido.
  const chavePreco = `${idServico}|${idPet}`
  useEffect(() => {
    if (!idServico || !idPet) return
    let cancelado = false
    supabase.rpc('fn_calcular_preco_servico', { p_id_servico: idServico, p_id_pet: idPet }).then(({ data, error }) => {
      if (!cancelado) setPreco({ chave: `${idServico}|${idPet}`, valor: error ? null : Number(data) })
    })
    return () => { cancelado = true }
  }, [idServico, idPet, supabase])

  // Plano do pet (só a loja usa benefício).
  const chavePlano = `${idPet}|${dados?.dt ?? ''}`
  useEffect(() => {
    if (modo !== 'loja' || !idPet || !dados) return
    let cancelado = false
    supabase.rpc('fn_beneficios_do_pet', { p_id_pet: idPet, p_data: dados.dt }).then(({ data, error }) => {
      if (!cancelado) setPlanos({ chave: `${idPet}|${dados.dt}`, lista: error ? [] : ((data ?? []) as PlanoDoPet[]) })
    })
    return () => { cancelado = true }
  }, [idPet, dados, modo, supabase])

  if (!dados) {
    return (
      <Casca onFechar={onFechar} ocupado={false}>
        <div className="modal-body">
          {erroCarga
            ? <div className="alert alert-error"><IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erroCarga}</span></div>
            : <p className="text-sm text-muted" style={{ margin: 0 }}>Carregando...</p>}
        </div>
      </Casca>
    )
  }

  const servico = dados.servicos.find(s => s.id_servico === idServico) ?? null
  const servicoAtual = dados.servicos.find(s => s.id_servico === dados.idServico) ?? null
  const petAtual = dados.pets.find(p => p.id_pet === dados.idPet) ?? null
  const petNovo = dados.pets.find(p => p.id_pet === idPet) ?? null
  const mudaServico = idServico !== dados.idServico
  const mudaPet = !!idPet && idPet !== dados.idPet
  const precoNovo = preco?.chave === chavePreco ? preco.valor : undefined
  const beneficio = modo === 'loja' && planos?.chave === chavePlano
    ? planos.lista.flatMap(p => p.beneficios.map(b => ({ ...b, plano: p.plano }))).find(b => b.id_servico === idServico && Number(b.usados) < b.quantidade) ?? null
    : null
  const vaiUsarBeneficio = !!beneficio && usarBeneficio

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await editarAgendamentoAction(idAgendamento, {
        idServico: mudaServico ? idServico : null,
        idPet: mudaPet ? idPet : null,
        usarBeneficio: vaiUsarBeneficio,
      })
      if (r.error) { setErro(r.error); return }
      setResultado({ anterior: r.valorAnterior ?? 0, novo: r.valorNovo ?? 0, avisos: r.avisos ?? [], whatsapp: r.whatsapp ?? null })
      router.refresh()
    })
  }

  if (resultado) {
    return (
      <Casca onFechar={onFechar} ocupado={false}>
        <div className="modal-body">
          <div className="alert alert-success">
            <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>
              Agendamento alterado. Valor: {formatarReais(resultado.anterior)} → <strong>{formatarReais(resultado.novo)}</strong>.
              {modo === 'cliente' && ' A loja vê a mudança no seu pedido.'}
            </span>
          </div>
          {resultado.avisos.map((a, i) => (
            <div key={i} className="alert alert-info" style={{ marginTop: 'var(--space-2)' }}>
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{a}</span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          {resultado.whatsapp && (
            <a href={resultado.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <IconWhatsapp style={{ width: 15, height: 15 }} /> Avisar o cliente no WhatsApp
            </a>
          )}
          <button type="button" className="btn btn-primary" onClick={onFechar}>Fechar</button>
        </div>
      </Casca>
    )
  }

  return (
    <Casca onFechar={onFechar} ocupado={isPending}>
      <div className="modal-body">
        {erro && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-3)' }}>
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
          </div>
        )}
        <p className="text-sm text-muted" style={{ marginTop: 0 }}>
          {dados.dt.split('-').reverse().join('/')} às {dados.hr} · {servicoAtual?.nome ?? 'Serviço'} · {petAtual?.nome ?? 'Pet'} · {formatarReais(dados.valor)}
        </p>

        <div className="form-group">
          <label htmlFor="editar-servico" className="form-label">Serviço</label>
          <select id="editar-servico" className="form-select" value={idServico} onChange={e => setIdServico(e.target.value)} disabled={isPending}>
            {dados.servicos.map(s => (
              <option key={s.id_servico} value={s.id_servico}>{s.nome} · {s.duracao} min</option>
            ))}
          </select>
          {mudaServico && servico && servicoAtual && servico.duracao !== servicoAtual.duracao && (
            <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>
              {servico.duracao} min — vai das {dados.hr} às {horaMais(dados.hr, servico.duracao)}.
            </p>
          )}
        </div>

        {dados.pets.length > 0 && (
          <div className="form-group">
            <label htmlFor="editar-pet" className="form-label">Pet</label>
            <select id="editar-pet" className="form-select" value={idPet} onChange={e => setIdPet(e.target.value)} disabled={isPending}>
              {dados.pets.map(p => (
                <option key={p.id_pet} value={p.id_pet}>{p.nome}{p.raca ? ` · ${p.raca}` : ''}</option>
              ))}
            </select>
            {mudaPet && dados.noPedido > 1 && (
              <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>
                Os {dados.noPedido} serviços marcados juntos passam para {petNovo?.nome ?? 'o novo pet'}.
              </p>
            )}
          </div>
        )}

        {(mudaServico || mudaPet) && (
          <p className="text-sm" style={{ margin: 0 }}>
            Preço do serviço{petNovo ? ` para ${petNovo.nome}` : ''}:{' '}
            <strong>{precoNovo === undefined ? '...' : precoNovo === null ? '—' : formatarReais(precoNovo)}</strong>
            <span className="text-xs text-muted"> (TaxiDog e produtos continuam no agendamento)</span>
          </p>
        )}

        {(mudaServico || mudaPet) && beneficio && (
          <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer', marginTop: 'var(--space-3)' }}>
            <input type="checkbox" checked={usarBeneficio} onChange={e => setUsarBeneficio(e.target.checked)} style={{ accentColor: 'var(--primary-500)', width: 16, height: 16 }} />
            Usar o plano {beneficio.plano} ({beneficio.quantidade - Number(beneficio.usados)} de {beneficio.quantidade} restantes) — o serviço não é cobrado
          </label>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={isPending}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={salvar} disabled={isPending || (!mudaServico && !mudaPet)}>
          {isPending ? 'Salvando...' : 'Salvar alteração'}
        </button>
      </div>
    </Casca>
  )
}

function Casca({ children, onFechar, ocupado }: { children: React.ReactNode; onFechar: () => void; ocupado: boolean }) {
  return (
    <div className="modal-overlay" onClick={() => !ocupado && onFechar()}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Alterar agendamento</h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar" disabled={ocupado}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
