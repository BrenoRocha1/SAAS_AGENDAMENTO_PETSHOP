'use client'

// As partes do detalhe do agendamento da loja, iguais no Dashboard, na
// Agenda e no Gestor: quem → o quê e quando → adicionais → total → o resto
// (pagamento, transporte, plano…) → ações → histórico. Cada tela monta as
// suas com estas peças; o desenho fica num lugar só (detalhe-agendamento.css).

import type { ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { classeBadgeStatus, PROXIMA_ETAPA, podeAvancarEtapa, rotuloStatus } from '@/lib/status-agendamento'
import { formatarReais } from '@/lib/taxidog'
import BotaoCancelarAgendamento from '@/components/lojista/BotaoCancelarAgendamento'
import { BotaoRemarcar } from '@/components/lojista/RemarcarAgendamento'
import { BotaoEditar } from '@/components/EditarAgendamento'
import { IconCheck } from '@/components/icons'
import './detalhe-agendamento.css'

type Status = 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'

// "Quinta, 15/10 · 16:30"
export function quandoDetalhe(dataISO: string, hora: string): string {
  const dia = format(parseISO(`${dataISO}T12:00:00`), 'EEE, dd/MM', { locale: ptBR }).replace('.', '')
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${hora.slice(0, 5)}`
}

// O pet em destaque (foto ou a inicial), quem é o tutor embaixo e o status.
export function TopoDetalhe({ pet, foto, sub, status }: { pet: string; foto?: string | null; sub?: string | null; status: string }) {
  return (
    <div className="det-topo">
      <span className="det-avatar" aria-hidden="true">
        {foto
          // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage
          ? <img src={foto} alt="" />
          : (pet.trim().charAt(0).toUpperCase() || '?')}
      </span>
      <div className="det-quem">
        <strong>{pet}</strong>
        {sub && <span>{sub}</span>}
      </div>
      <span className={`badge ${classeBadgeStatus(status as Status)}`}>{rotuloStatus(status as Status)}</span>
    </div>
  )
}

// Quadro com as informações curtas, duas por linha.
export function GradeDetalhe({ itens }: { itens: ({ rotulo: string; valor: ReactNode } | null | false)[] }) {
  const visiveis = itens.filter((i): i is { rotulo: string; valor: ReactNode } => !!i)
  return (
    <div className="det-grade">
      {visiveis.map(i => (
        <div key={i.rotulo}>
          <span>{i.rotulo}</span>
          <strong>{i.valor}</strong>
        </div>
      ))}
    </div>
  )
}

// O total do atendimento e, com adicionais, de onde ele vem.
export function TotalDetalhe({ total, resumo, nota }: {
  total: number
  resumo?: { valor: number; totalAdicionais: number } | null
  nota?: string | null
}) {
  const valor = resumo?.valor ?? total
  return (
    <div className="det-total">
      <div className="det-total-linha">
        <span>Total</span>
        <strong>{formatarReais(valor)}</strong>
      </div>
      {resumo && resumo.totalAdicionais > 0 && (
        <span className="det-total-conta">
          {formatarReais(Math.max(0, valor - resumo.totalAdicionais))} do atendimento + {formatarReais(resumo.totalAdicionais)} de adicionais
        </span>
      )}
      {nota && <span className="det-total-conta">{nota}</span>}
    </div>
  )
}

// Bloco com título (observação, produtos).
export function SecaoDetalhe({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="det-secao">
      <span className="det-secao-titulo">{titulo}</span>
      {children}
    </div>
  )
}

// Avançar a etapa (botão largo), remarcar e editar lado a lado, cancelar
// discreto. Só para agendamento em aberto.
export function AcoesDetalhe({ status, dataAgendamento, hojeISO, isPending, onAvancar, onRemarcar, onEditar, onCancelar, chave }: {
  status: string
  dataAgendamento: string
  hojeISO: string
  isPending: boolean
  onAvancar: (proximo: 'Confirmado' | 'Em andamento' | 'Concluído') => void
  onRemarcar: () => void
  onEditar: () => void
  onCancelar: () => void
  chave: string
}) {
  if (status !== 'Pendente' && status !== 'Confirmado' && status !== 'Em andamento') return null
  const proxima = PROXIMA_ETAPA[status]
  return (
    <div className="det-acoes">
      {podeAvancarEtapa(status, dataAgendamento, hojeISO) && proxima ? (
        <button className="btn btn-success det-acao-principal" disabled={isPending} onClick={() => onAvancar(proxima.status as 'Confirmado' | 'Em andamento' | 'Concluído')}>
          <IconCheck style={{ width: 16, height: 16 }} /> {proxima.acao}
        </button>
      ) : (
        <span className="det-aviso">Iniciar e finalizar a partir do dia do agendamento.</span>
      )}
      {status !== 'Em andamento' && (
        <div className="det-acoes-linha">
          <BotaoRemarcar onClick={onRemarcar} />
          <BotaoEditar onClick={onEditar} />
        </div>
      )}
      <div className="det-cancelar">
        <BotaoCancelarAgendamento key={chave} disabled={isPending} onConfirmar={onCancelar} />
      </div>
    </div>
  )
}
