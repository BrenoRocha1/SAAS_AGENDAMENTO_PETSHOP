'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatarReais } from '@/lib/taxidog'
import { ROTULO_FORMA_PAGAMENTO, type FormaPagamento } from '@/lib/pagamento'
import { PixDaLoja } from './PagamentoEtapa'
import { IconCheck, IconLink, IconWhatsapp } from '@/components/icons'
import './confirmacao-agendamento.css'

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
  // Forma de pagamento escolhida (migration 057) — Pix mostra a chave.
  pagamento?: { forma: FormaPagamento; pixChave?: string | null; pixNome?: string | null } | null
  // Saldo do plano usado neste pedido (migration 075) — `total` já vem sem ele.
  plano?: { aplicados: number; valorAbatido: number } | null
  // Algo não saiu como pedido (ex.: o plano não pôde ser usado).
  aviso?: string | null
}

// Endereço do site só existe no navegador (no servidor fica vazio).
const assinarNada = () => () => {}
const origemDoSite = () => window.location.origin

export default function ConfirmacaoAgendamento({ idAgendamento, loja, pet, itens, data, hora, total, pagamento, plano, aviso }: Props) {
  const usouPlano = !!plano && plano.aplicados > 0
  // Tudo coberto pelo plano: não há o que pagar neste agendamento.
  const nadaAPagar = usouPlano && total <= 0
  const origem = useSyncExternalStore(assinarNada, origemDoSite, () => '')
  const linkAcompanhar = idAgendamento ? `/acompanhar/${idAgendamento}` : null
  const quando = `${format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR })} às ${hora.slice(0, 5)}`
  const linhaLink = linkAcompanhar && origem ? [`Acompanhe o agendamento: ${origem}${linkAcompanhar}`] : []

  const resumo = [
    ...itens.map(i => `- ${i}`),
    `Pet: ${pet}`,
    `Data: ${quando}`,
    ...(usouPlano ? [`Plano: ${formatarReais(plano.valorAbatido)} cobertos pelo saldo do plano`] : []),
    `Total: ${formatarReais(total)}`,
    ...(pagamento && !nadaAPagar ? [`Pagamento: ${ROTULO_FORMA_PAGAMENTO[pagamento.forma]}`] : []),
  ]
  // Pra loja: o resumo de sempre + o link (fica no chat, o cliente acha depois).
  const mensagemLoja = [`Olá! Acabei de agendar em ${loja.nome}:`, ...resumo, ...linhaLink].join('\n')
  // Pra mandar pra si mesmo ou pra família.
  const mensagemCompartilhar = [`Agendamento em ${loja.nome}:`, ...resumo, ...linhaLink].join('\n')
  const telefoneLoja = (loja.telefone ?? '').replace(/\D/g, '')

  const quandoLongo = (() => {
    const texto = format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR })
    return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} às ${hora.slice(0, 5)}`
  })()

  // Topo de confirmação, o pedido num "recibo" (o que, para quem, quando,
  // quanto) e as ações em ordem de uso: avisar a loja, guardar/acompanhar.
  return (
    <div className="conf">
      <div className="conf-topo">
        <span className="conf-selo"><IconCheck /></span>
        <h2 className="conf-titulo">Serviço agendado!</h2>
        <p className="conf-sub">A loja {loja.nome} já recebeu o seu pedido.</p>
      </div>

      {aviso && (
        <div className="alert alert-warning" style={{ textAlign: 'left' }}>
          <span>{aviso}</span>
        </div>
      )}

      <div className="conf-recibo">
        <div className="conf-linha">
          <span>Pet</span>
          <strong>{pet}</strong>
        </div>
        <div className="conf-linha">
          <span>Quando</span>
          <strong>{quandoLongo}</strong>
        </div>
        <div className="conf-linha is-itens">
          <span>Pedido</span>
          <ul>
            {itens.map((i, n) => <li key={n}>{i}</li>)}
          </ul>
        </div>
        {usouPlano && (
          <div className="conf-linha">
            <span>Plano</span>
            <strong className="conf-plano">− {formatarReais(plano.valorAbatido)}</strong>
          </div>
        )}
        {pagamento && !nadaAPagar && (
          <div className="conf-linha">
            <span>Pagamento</span>
            <strong>{ROTULO_FORMA_PAGAMENTO[pagamento.forma]}</strong>
          </div>
        )}
        <div className="conf-linha is-total">
          <span>{nadaAPagar ? 'Coberto pelo plano' : 'Total'}</span>
          <strong>{formatarReais(total)}</strong>
        </div>
      </div>

      {pagamento && !nadaAPagar && pagamento.forma === 'pix' && (
        <PixDaLoja chave={pagamento.pixChave ?? null} nome={pagamento.pixNome ?? null} />
      )}

      <div className="conf-acoes">
        {telefoneLoja && (
          <a
            href={`https://wa.me/55${telefoneLoja}?text=${encodeURIComponent(mensagemLoja)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="conf-botao is-principal"
          >
            <IconWhatsapp /> Enviar no WhatsApp da loja
          </a>
        )}
        <div className="conf-dupla">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensagemCompartilhar)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`conf-botao ${telefoneLoja ? '' : 'is-principal'}`}
          >
            <IconWhatsapp /> Guardar no meu WhatsApp
          </a>
          {linkAcompanhar && (
            <Link href={linkAcompanhar} className="conf-botao">
              <IconLink /> Acompanhar
            </Link>
          )}
        </div>
        <p className="conf-nota">
          A mensagem vai com o link para acompanhar o agendamento — dá para mandar para você mesmo ou para quem vai levar o pet.
        </p>
        <Link href="/cliente/agendamentos" className="conf-link">Ver meus agendamentos</Link>
      </div>
    </div>
  )
}
