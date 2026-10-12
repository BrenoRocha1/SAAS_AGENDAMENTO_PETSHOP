'use client'

// Promoção do serviço (migration 096): os campos — usados na seção
// "Promoção" do cadastro do serviço e na janela que o botão de promoção da
// lista abre — e a prévia de como o cliente vê a oferta.

import { useState, useTransition } from 'react'
import { salvarPromocaoServicoAction } from '@/lib/actions-promocao'
import {
  ROTULO_STATUS_PROMOCAO,
  economia,
  percentualDesconto,
  periodoPromoServico,
  precoComDesconto,
  seloDesconto,
  statusPromocaoServico,
  temPromocao,
  validarPromocaoServico,
  type AgoraBrasil,
  type DadosPromocaoServico,
  type PromocaoServico,
  type StatusPromocao,
} from '@/lib/promocao'
import { agoraBrasilHHMM, hojeBrasilISO } from '@/lib/agenda'
import { formatarReais } from '@/lib/taxidog'
import BotaoConfirmar, { useEstadoBotao } from '@/components/ui/botao-confirmar'
import { IconAlert, IconClose } from '@/components/icons'
import './promocao.css'

// O que a seção guarda enquanto a loja mexe (tudo texto, como nos campos).
export interface FormPromocao {
  ativa: boolean
  preco: string
  inicio: string
  horaInicio: string
  fim: string
  horaFim: string
  exibirOnline: boolean
}

export const FORM_PROMOCAO_VAZIO: FormPromocao = {
  ativa: false, preco: '', inicio: '', horaInicio: '', fim: '', horaFim: '', exibirOnline: true,
}

export function agoraBrasilPromocao(): AgoraBrasil {
  return { data: hojeBrasilISO(), hora: agoraBrasilHHMM() }
}

// Promoção gravada → campos. A promoção antiga (só %) abre com o preço que
// aquele percentual dá hoje.
export function formDaPromocao(p: PromocaoServico | null | undefined, precoServico: number): FormPromocao {
  if (!p || !temPromocao(p)) return FORM_PROMOCAO_VAZIO
  const preco = p.promo_preco != null ? Number(p.promo_preco) : precoComDesconto(precoServico, Number(p.promo_percentual ?? 0))
  return {
    ativa: p.promo_ativa !== false,
    preco: preco.toFixed(2),
    inicio: p.promo_inicio ?? '',
    horaInicio: p.promo_hora_inicio?.slice(0, 5) ?? '',
    fim: p.promo_fim ?? '',
    horaFim: p.promo_hora_fim?.slice(0, 5) ?? '',
    exibirOnline: p.promo_exibir_online !== false,
  }
}

const numero = (texto: string) => (texto.trim() === '' ? NaN : Number(texto.replace(',', '.')))

// Campos → o que a action grava. Desligada e sem preço = sem promoção.
export function dadosDoFormPromocao(f: FormPromocao): DadosPromocaoServico | null {
  if (!f.ativa && f.preco.trim() === '') return null
  return {
    ativa: f.ativa,
    preco: numero(f.preco),
    inicio: f.inicio || null,
    horaInicio: f.inicio ? f.horaInicio || null : null,
    fim: f.fim || null,
    horaFim: f.fim ? f.horaFim || null : null,
    exibirOnline: f.exibirOnline,
  }
}

// O mesmo formato que vem do banco, para as contas de status e período.
function promocaoDoForm(f: FormPromocao): PromocaoServico | null {
  const d = dadosDoFormPromocao(f)
  if (!d || !Number.isFinite(d.preco)) return null
  return {
    promo_percentual: null, promo_preco: d.preco, promo_inicio: d.inicio, promo_hora_inicio: d.horaInicio,
    promo_fim: d.fim, promo_hora_fim: d.horaFim, promo_ativa: d.ativa, promo_exibir_online: d.exibirOnline,
  }
}

const CLASSE_STATUS: Record<StatusPromocao, string> = {
  sem: '', ativa: 'is-ativa', programada: 'is-programada', encerrada: 'is-parada', pausada: 'is-parada',
}

export function SeloStatusPromocao({ status }: { status: StatusPromocao }) {
  if (status === 'sem') return null
  return <span className={`promo-status ${CLASSE_STATUS[status]}`}>{ROTULO_STATUS_PROMOCAO[status]}</span>
}

// Como o cliente vê o serviço no agendamento online.
export function PreviaPromocao({ nome, preco, precoPromocional }: { nome: string; preco: number; precoPromocional: number }) {
  return (
    <div className="promo-previa" aria-label="Como o cliente vê">
      <span className="promo-previa-selo">-{seloDesconto(preco, precoPromocional)}%</span>
      <strong className="promo-previa-nome">{nome || 'Nome do serviço'}</strong>
      <span className="promo-previa-preco"><s>{formatarReais(preco)}</s> {formatarReais(precoPromocional)}</span>
      <span className="promo-previa-economia">Você economiza {formatarReais(economia(preco, precoPromocional))}</span>
    </div>
  )
}

// Os campos da promoção. `preco` é o preço normal do serviço (o que está no
// formulário, quando a seção fica dentro dele).
export function PromocaoServicoCampos({ nome, preco, valor, onChange, desativado, prefixo = 'promo' }: {
  nome: string
  preco: number
  valor: FormPromocao
  onChange: (novo: FormPromocao) => void
  desativado?: boolean
  prefixo?: string
}) {
  const mudar = (parte: Partial<FormPromocao>) => onChange({ ...valor, ...parte })
  const dados = dadosDoFormPromocao(valor)
  const precoPromo = numero(valor.preco)
  const digitouPreco = valor.preco.trim() !== ''
  const problema = valor.ativa && digitouPreco && dados ? validarPromocaoServico(dados, preco) : null
  const precoValido = Number.isFinite(precoPromo) && precoPromo > 0 && precoPromo < preco
  const promo = promocaoDoForm(valor)
  const status = promo && precoValido ? statusPromocaoServico(promo, agoraBrasilPromocao()) : 'sem'

  return (
    <div className="promo-secao">
      <div className="linha-switch-app">
        <div>
          <strong>Promoção</strong>
          <span>
            {valor.ativa
              ? 'O cliente vê o preço normal riscado e paga o promocional.'
              : digitouPreco ? 'Desativada — a configuração fica guardada.' : 'Destaque este serviço com um preço promocional.'}
          </span>
        </div>
        <button
          type="button"
          className={`switch ${valor.ativa ? 'switch-on' : ''}`}
          role="switch"
          aria-checked={valor.ativa}
          aria-label="Promoção"
          disabled={desativado}
          onClick={() => mudar({ ativa: !valor.ativa })}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      {valor.ativa && (
        <>
          <div className="promo-grade">
            <div className="form-group">
              <span className="form-label">Preço normal</span>
              <div className="form-input promo-somente-leitura">{preco > 0 ? formatarReais(preco) : '—'}</div>
            </div>
            <div className="form-group">
              <label className="form-label form-label-required" htmlFor={`${prefixo}-preco`}>Preço promocional (R$)</label>
              <input
                id={`${prefixo}-preco`}
                className="form-input"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="79.90"
                value={valor.preco}
                onChange={e => mudar({ preco: e.target.value })}
                disabled={desativado}
              />
            </div>
          </div>

          {problema ? (
            <p className="promo-conta is-erro" role="alert">{problema}</p>
          ) : precoValido ? (
            <p className="promo-conta">
              Desconto de <strong>{percentualDesconto(preco, precoPromo)}%</strong> · o cliente economiza <strong>{formatarReais(economia(preco, precoPromo))}</strong>
            </p>
          ) : (
            <p className="promo-conta is-apagada">O desconto e a economia aparecem aqui quando você informar o preço promocional.</p>
          )}

          <div className="promo-grade">
            <div className="form-group">
              <label className="form-label" htmlFor={`${prefixo}-inicio`}>Início <span className="promo-opcional">(opcional)</span></label>
              <div className="promo-data-hora">
                <input id={`${prefixo}-inicio`} className="form-input" type="date" value={valor.inicio} onChange={e => mudar({ inicio: e.target.value, horaInicio: e.target.value ? valor.horaInicio : '' })} disabled={desativado} />
                <input className="form-input" type="time" aria-label="Hora de início" value={valor.horaInicio} onChange={e => mudar({ horaInicio: e.target.value })} disabled={desativado || !valor.inicio} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${prefixo}-fim`}>Encerramento <span className="promo-opcional">(opcional)</span></label>
              <div className="promo-data-hora">
                <input id={`${prefixo}-fim`} className="form-input" type="date" value={valor.fim} min={valor.inicio || undefined} onChange={e => mudar({ fim: e.target.value, horaFim: e.target.value ? valor.horaFim : '' })} disabled={desativado} />
                <input className="form-input" type="time" aria-label="Hora de encerramento" value={valor.horaFim} onChange={e => mudar({ horaFim: e.target.value })} disabled={desativado || !valor.fim} />
              </div>
            </div>
          </div>
          <p className="form-hint">
            Sem datas, a promoção vale a partir de agora e até você desativar. Sem hora, vale o dia inteiro. Os preços por porte ou raça levam o mesmo desconto.
          </p>

          <label className="promo-check">
            <input type="checkbox" checked={valor.exibirOnline} onChange={e => mudar({ exibirOnline: e.target.checked })} disabled={desativado} />
            <span>
              <strong>Oferecer no agendamento online</strong>
              <small>Desmarcada, a promoção não aparece para o cliente e vale só nos agendamentos feitos pela loja.</small>
            </span>
          </label>

          {precoValido && !problema && (
            <div className="promo-previa-bloco">
              <div className="promo-previa-topo">
                <span>{valor.exibirOnline ? 'Como o cliente vê' : 'Como fica no agendamento feito pela loja'}</span>
                <SeloStatusPromocao status={status} />
              </div>
              <PreviaPromocao nome={nome} preco={preco} precoPromocional={precoPromo} />
              {promo && (promo.promo_inicio || promo.promo_fim) && <span className="form-hint">{periodoPromoServico(promo)}</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Janela aberta pelo botão de promoção da lista de serviços.
export default function PromocaoServicoModal({ id, nome, preco, atual, onFechar, onSalvo }: {
  id: string
  nome: string
  preco: number
  atual: PromocaoServico
  onFechar: () => void
  // Recarrega o serviço: o percentual é o banco que calcula.
  onSalvo: () => void | Promise<void>
}) {
  const jaTinha = temPromocao(atual)
  const [form, setForm] = useState<FormPromocao>(() => {
    const inicial = formDaPromocao(atual, preco)
    // Abrir a janela num serviço sem promoção é para criar uma.
    return jaTinha ? inicial : { ...inicial, ativa: true }
  })
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const botao = useEstadoBotao()
  const dados = dadosDoFormPromocao(form)
  const problema = dados ? validarPromocaoServico(dados, preco) : null
  const podeSalvar = dados ? !problema : jaTinha

  function gravar(d: DadosPromocaoServico | null) {
    setErro(null)
    startTransition(async () => {
      const r = await salvarPromocaoServicoAction(id, d)
      if (r.error) { setErro(r.error); botao.erro(); return }
      await botao.sucesso()
      await onSalvo()
    })
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Promoção · {nome}</h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar"><IconClose style={{ width: 15, height: 15 }} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (podeSalvar) gravar(dados) }}>
          <div className="modal-body">
            {erro && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
              </div>
            )}
            <PromocaoServicoCampos nome={nome} preco={preco} valor={form} onChange={setForm} desativado={isPending} prefixo="promo-janela" />
          </div>
          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            {jaTinha ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => gravar(null)} disabled={isPending}>Remover promoção</button>
            ) : <span />}
            <BotaoConfirmar estado={botao.estadoCom(isPending)} disabled={!podeSalvar} rotuloPendente="Salvando…" rotuloSucesso="Promoção salva">Salvar promoção</BotaoConfirmar>
          </div>
        </form>
      </div>
    </div>
  )
}
