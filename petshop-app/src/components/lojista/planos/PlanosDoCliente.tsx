'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelarAssinaturaAction, type ResumoCancelamento } from '@/lib/actions-planos'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import { dataBR, rotuloPeriodicidade, sufixoPeriodo, type Assinatura, type Plano } from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { IconPlus, IconRepeat } from '@/components/icons'
import { Secao, SecaoVazia } from '@/components/relatorio/Secao'
import AssinarPlanoModal from './AssinarPlanoModal'
import BeneficiosBarra from './BeneficiosBarra'
import CobrancaPagamento from './CobrancaPagamento'

// Seção "Planos e assinaturas" do cliente (tela do lojista).
export default function PlanosDoCliente({ assinaturas, planos, pets, hojeISO, formasAceitas }: {
  assinaturas: Assinatura[]
  planos: Plano[]
  pets: { id_pet: string; nome: string }[]
  hojeISO: string
  formasAceitas: FormaPagamento[]
}) {
  const router = useRouter()
  const [assinando, setAssinando] = useState(false)

  return (
    <Secao
      titulo="Planos e assinaturas"
      icone={<IconRepeat />}
      acao={pets.length > 0 && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAssinando(true)}>
          <IconPlus style={{ width: 14, height: 14 }} /> Assinar plano
        </button>
      )}
    >
      {assinaturas.length === 0 ? (
        <SecaoVazia>
          Nenhum plano. {pets.length > 0 ? 'Use "Assinar plano" para vincular um plano a um pet deste cliente.' : 'Cadastre um pet para poder assinar um plano.'}
        </SecaoVazia>
      ) : (
        <div className="planos-assinaturas">
          {assinaturas.map(a => (
            <AssinaturaDetalhe key={a.id_assinatura} a={a} hojeISO={hojeISO} formasAceitas={formasAceitas} />
          ))}
        </div>
      )}

      {assinando && (
        <AssinarPlanoModal
          planos={planos}
          pets={pets}
          hojeISO={hojeISO}
          formasAceitas={formasAceitas}
          onFechar={() => setAssinando(false)}
          onAssinado={() => { setAssinando(false); router.refresh() }}
        />
      )}
    </Secao>
  )
}

function AssinaturaDetalhe({ a, hojeISO, formasAceitas }: { a: Assinatura; hojeISO: string; formasAceitas: FormaPagamento[] }) {
  const router = useRouter()
  const ativa = a.status === 'ativa'
  // Plano cancelado com cobrança em aberto já abre as cobranças (a loja resolve ali).
  const [aberta, setAberta] = useState<'cobrancas' | 'usos' | 'historico' | null>(
    a.cobrancas_vencidas > 0 || (!ativa && a.cobrancas_em_aberto > 0) ? 'cobrancas' : null
  )
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  // O que fazer com o que ficou em aberto (migration 069).
  const [destinoCobrancas, setDestinoCobrancas] = useState<'manter' | 'cancelar' | null>(null)
  const [devolverAgendamentos, setDevolverAgendamentos] = useState(true)
  const [resumo, setResumo] = useState<ResumoCancelamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function cancelar() {
    setErro(null)
    startTransition(async () => {
      const r = await cancelarAssinaturaAction(a.id_assinatura, motivo, {
        cancelarCobrancas: destinoCobrancas === 'cancelar',
        devolverAgendamentos: futuros.length > 0 && devolverAgendamentos,
      })
      if (r.error) setErro(r.error)
      else { setCancelando(false); setResumo(r.resumo ?? null); router.refresh() }
    })
  }

  const usos = a.utilizacoes ?? []
  const cobrancas = a.cobrancas ?? []
  const abertas = cobrancas.filter(c => c.status === 'pendente')
  const totalAberto = abertas.reduce((s, c) => s + Number(c.valor), 0)
  // Agendamentos ainda por fazer que usam o plano.
  const futuros = usos.filter(u => !u.estornada_em && (u.status_agendamento === 'Pendente' || u.status_agendamento === 'Confirmado'))
  const podeConfirmar = abertas.length === 0 || destinoCobrancas !== null
  const historico = a.historico ?? []

  return (
    <div className={`plano-assinatura ${ativa ? '' : 'is-cancelada'}`}>
      <div className="flex items-center justify-between gap-2" style={{ flexWrap: 'wrap' }}>
        <div>
          <div className="font-semibold">{a.plano} · {a.pet ?? 'Pet removido'}</div>
          <div className="text-xs text-muted">
            {formatarReais(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)} · {rotuloPeriodicidade(a.periodicidade, a.intervalo_dias)}
            {' · '}desde {dataBR(a.data_inicio)}
            {a.forma_pagamento && ehFormaPagamento(a.forma_pagamento) && <> · {ROTULO_FORMA_PAGAMENTO[a.forma_pagamento]}</>}
          </div>
        </div>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          {ativa ? <span className="badge badge-concluido">Ativa</span> : <span className="badge badge-inativo">Cancelada</span>}
          {a.cobrancas_vencidas > 0 && <span className="badge badge-cancelado">{a.cobrancas_vencidas} vencida{a.cobrancas_vencidas > 1 ? 's' : ''}</span>}
        </div>
      </div>

      {ativa && a.periodo_atual && (
        <>
          <div className="text-xs text-muted">
            Período {a.periodo_atual.numero}: {dataBR(a.periodo_atual.inicio)} a {dataBR(a.periodo_atual.fim)}
            {a.proxima_cobranca && <> · <strong>próxima cobrança {dataBR(a.proxima_cobranca)}</strong></>}
          </div>
          <BeneficiosBarra beneficios={a.periodo_atual.beneficios} />
        </>
      )}
      {ativa && !a.periodo_atual && <div className="text-xs text-muted">Começa em {dataBR(a.data_inicio)}.</div>}
      {!ativa && (
        <div className="text-xs text-muted">
          Cancelada em {dataBR(a.cancelada_em)}{a.motivo_cancelamento ? ` — ${a.motivo_cancelamento}` : ''}. O histórico continua abaixo.
        </div>
      )}

      <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
        {([['cobrancas', `Cobranças (${cobrancas.length})`], ['usos', `Utilizações (${usos.filter(u => !u.estornada_em).length})`], ['historico', 'Histórico']] as const).map(([v, l]) => (
          <button key={v} type="button" className={`btn btn-sm ${aberta === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAberta(aberta === v ? null : v)}>
            {l}
          </button>
        ))}
        {ativa && !cancelando && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--danger-400)' }} onClick={() => setCancelando(true)}>
            Cancelar assinatura
          </button>
        )}
      </div>

      {cancelando && (
        <div className="plano-cancelar">
          <p className="text-sm" style={{ margin: 0 }}>
            Cancelar a assinatura? Não serão gerados novos períodos nem cobranças. O que já foi registrado continua no histórico.
          </p>

          {abertas.length > 0 && (
            <div className="plano-cancelar-bloco">
              <div className="text-sm font-semibold">
                {abertas.length === 1 ? '1 cobrança em aberto' : `${abertas.length} cobranças em aberto`} · {formatarReais(totalAberto)}
              </div>
              <ul className="text-xs text-muted" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
                {abertas.map(c => (
                  <li key={c.id_cobranca}>
                    {formatarReais(c.valor)} · {c.vencimento < hojeISO ? 'venceu' : 'vence'} {dataBR(c.vencimento)} (período {c.numero}: {dataBR(c.periodo_inicio)} a {dataBR(c.periodo_fim)})
                  </li>
                ))}
              </ul>
              <label className="plano-cancelar-opcao">
                <input type="radio" name={`cob-${a.id_assinatura}`} checked={destinoCobrancas === 'manter'} onChange={() => setDestinoCobrancas('manter')} />
                <span><strong>Manter em aberto</strong> — o cliente ainda vai pagar (ex.: já usou os serviços do período)</span>
              </label>
              <label className="plano-cancelar-opcao">
                <input type="radio" name={`cob-${a.id_assinatura}`} checked={destinoCobrancas === 'cancelar'} onChange={() => setDestinoCobrancas('cancelar')} />
                <span><strong>Cancelar junto</strong> — o cliente não deve mais nada deste plano</span>
              </label>
            </div>
          )}

          {futuros.length > 0 && (
            <div className="plano-cancelar-bloco">
              <label className="plano-cancelar-opcao">
                <input type="checkbox" checked={devolverAgendamentos} onChange={e => setDevolverAgendamentos(e.target.checked)} />
                <span>
                  <strong>Voltar ao preço normal</strong>{' '}
                  {futuros.length === 1 ? 'o agendamento marcado que usa o plano:' : `os ${futuros.length} agendamentos marcados que usam o plano:`}
                </span>
              </label>
              <ul className="text-xs text-muted" style={{ margin: 0, paddingLeft: 'var(--space-6)' }}>
                {futuros.map((u, i) => (
                  <li key={i}>{u.servico}{u.data ? ` · ${dataBR(u.data)}` : ''}{u.hora ? ` às ${u.hora.slice(0, 5)}` : ''}</li>
                ))}
              </ul>
              {!devolverAgendamentos && (
                <span className="text-xs text-muted">Desmarcado: esses atendimentos continuam cobertos pelo plano.</span>
              )}
            </div>
          )}

          <input className="form-input" placeholder="Motivo (opcional)" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} />
          {erro && <span className="text-xs" style={{ color: 'var(--status-cancelado-fg)' }}>{erro}</span>}
          {!podeConfirmar && <span className="text-xs text-muted">Escolha o que fazer com as cobranças em aberto.</span>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-danger btn-sm" onClick={cancelar} disabled={isPending || !podeConfirmar}>{isPending ? 'Cancelando...' : 'Sim, cancelar'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelando(false)} disabled={isPending}>Voltar</button>
          </div>
        </div>
      )}

      {resumo && (resumo.cobrancas_canceladas > 0 || resumo.agendamentos_devolvidos > 0) && (
        <div className="text-xs" style={{ color: 'var(--success-400)' }}>
          {resumo.cobrancas_canceladas > 0 && <>Cobranças canceladas: {resumo.cobrancas_canceladas} ({formatarReais(Number(resumo.valor_cancelado))}). </>}
          {resumo.agendamentos_devolvidos > 0 && <>Agendamentos de volta ao preço normal: {resumo.agendamentos_devolvidos}.</>}
        </div>
      )}

      {!ativa && a.cobrancas_em_aberto > 0 && (
        <div className="text-xs" style={{ color: 'var(--warning-400)' }}>
          Plano cancelado com {a.cobrancas_em_aberto === 1 ? '1 cobrança em aberto' : `${a.cobrancas_em_aberto} cobranças em aberto`}: registre o pagamento ou mude para Cancelado em Cobranças.
        </div>
      )}

      {aberta === 'cobrancas' && (
        cobrancas.length === 0 ? <p className="text-sm text-muted" style={{ margin: 0 }}>Sem cobranças ainda.</p> : (
          <ul className="plano-lista-detalhe">
            {cobrancas.map(c => (
              <li key={c.id_cobranca}>
                <div>
                  <div className="text-sm font-semibold">{formatarReais(c.valor)} · vence {dataBR(c.vencimento)}</div>
                  <div className="text-xs text-muted">
                    Período {c.numero} ({dataBR(c.periodo_inicio)} a {dataBR(c.periodo_fim)}){c.pago_em ? ` · pago em ${dataBR(c.pago_em)}` : ''}
                  </div>
                </div>
                <CobrancaPagamento
                  idCobranca={c.id_cobranca}
                  forma={c.forma_pagamento}
                  status={c.status}
                  vencimento={c.vencimento}
                  hojeISO={hojeISO}
                  formasAceitas={formasAceitas}
                />
              </li>
            ))}
          </ul>
        )
      )}

      {aberta === 'usos' && (
        usos.length === 0 ? <p className="text-sm text-muted" style={{ margin: 0 }}>Nenhum benefício usado ainda.</p> : (
          <ul className="plano-lista-detalhe">
            {usos.map((u, i) => (
              <li key={i} className={u.estornada_em ? 'is-estornada' : ''}>
                <div>
                  <div className="text-sm font-semibold">{u.servico}{u.data ? ` · ${dataBR(u.data)}` : ''}{u.hora ? ` às ${u.hora.slice(0, 5)}` : ''}</div>
                  <div className="text-xs text-muted">
                    Período {u.periodo}{u.funcionario ? ` · ${u.funcionario}` : ''}
                    {u.estornada_em ? ` · devolvido em ${dataBR(u.estornada_em)}${u.motivo_estorno ? ` (${u.motivo_estorno})` : ''}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {aberta === 'historico' && (
        <ul className="plano-historico">
          {historico.map((h, i) => (
            <li key={i}>
              <span className="text-xs text-muted">{new Date(h.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span>{h.descricao}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
