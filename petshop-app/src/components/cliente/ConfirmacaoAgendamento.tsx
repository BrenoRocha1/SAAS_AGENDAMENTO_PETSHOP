'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatarReais } from '@/lib/taxidog'
import { IconCheck, IconLink, IconWhatsapp } from '@/components/icons'

// Tela "Serviço agendado!" dos dois fluxos do cliente (link público e
// conta do cliente): WhatsApp com o resumo e o link pra acompanhar o
// agendamento (/acompanhar/<id>, migration 056).

interface Props {
  idAgendamento: string | null
  loja: { nome: string; telefone?: string | null }
  pet: string
  // Linhas do resumo: serviços, produtos, TaxiDog.
  itens: string[]
  data: string
  hora: string
  total: number
}

// Endereço do site só existe no navegador (no servidor fica vazio).
const assinarNada = () => () => {}
const origemDoSite = () => window.location.origin

export default function ConfirmacaoAgendamento({ idAgendamento, loja, pet, itens, data, hora, total }: Props) {
  const origem = useSyncExternalStore(assinarNada, origemDoSite, () => '')
  const linkAcompanhar = idAgendamento ? `/acompanhar/${idAgendamento}` : null
  const quando = `${format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR })} às ${hora.slice(0, 5)}`
  const linhaLink = linkAcompanhar && origem ? [`Acompanhe o agendamento: ${origem}${linkAcompanhar}`] : []

  const resumo = [
    ...itens.map(i => `- ${i}`),
    `Pet: ${pet}`,
    `Data: ${quando}`,
    `Total: ${formatarReais(total)}`,
  ]
  // Pra loja: o resumo de sempre + o link (fica no chat, o cliente acha depois).
  const mensagemLoja = [`Olá! Acabei de agendar em ${loja.nome}:`, ...resumo, ...linhaLink].join('\n')
  // Pra mandar pra si mesmo ou pra família.
  const mensagemCompartilhar = [`Agendamento em ${loja.nome}:`, ...resumo, ...linhaLink].join('\n')
  const telefoneLoja = (loja.telefone ?? '').replace(/\D/g, '')

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <span style={{
        display: 'inline-flex', width: 64, height: 64, borderRadius: 'var(--radius-full)',
        background: 'rgba(16,185,129,0.15)', color: 'var(--success-400)',
        alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-5)',
      }}>
        <IconCheck style={{ width: 30, height: 30 }} />
      </span>
      <h2 style={{ fontSize: '1.3rem', marginBottom: 'var(--space-2)' }}>Serviço agendado!</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-6)' }}>
        {pet} · {quando} · {loja.nome}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {telefoneLoja && (
          <a
            href={`https://wa.me/55${telefoneLoja}?text=${encodeURIComponent(mensagemLoja)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <IconWhatsapp style={{ width: 16, height: 16 }} /> Enviar no WhatsApp da loja
          </a>
        )}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagemCompartilhar)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn ${telefoneLoja ? 'btn-secondary' : 'btn-primary btn-lg'}`}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <IconWhatsapp style={{ width: 16, height: 16 }} /> Guardar no meu WhatsApp
        </a>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          A mensagem vai com o link para acompanhar o agendamento — dá para mandar para você mesmo ou para quem vai levar o pet.
        </p>

        {linkAcompanhar && (
          <Link href={linkAcompanhar} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            <IconLink style={{ width: 15, height: 15 }} /> Acompanhar agendamento
          </Link>
        )}
        <Link href="/cliente/agendamentos" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
          Ver meus agendamentos
        </Link>
      </div>
    </div>
  )
}
