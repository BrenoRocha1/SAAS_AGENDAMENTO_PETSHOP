'use client'

import { createPortal } from 'react-dom'
import type { TaxiDogPendente } from '@/lib/actions'
import { IconCar, IconClose } from '@/components/icons'

export type EscolhaBuscaTaxiDog = 'ignorar' | 'cliente_trouxe'

// Iniciar/finalizar com a busca do TaxiDog ainda não chegando à loja
// (atualizarStatusAgendamentoAction devolve taxidogPendente). Não trava:
// o cliente pode ter trazido o pet por conta própria — aí a busca sai
// (taxa retirada e TaxiDog avisado). No body (portal), por cima de tudo.
export function ConfirmarBuscaTaxiDog({ info, novoStatus, onEscolher, onFechar }: {
  info: TaxiDogPendente
  novoStatus: 'Em andamento' | 'Concluído'
  onEscolher: (escolha: EscolhaBuscaTaxiDog) => void
  onFechar: () => void
}) {
  const verbo = novoStatus === 'Em andamento' ? 'Iniciar' : 'Finalizar'
  const situacao =
    info.status === 'pet_embarcado' ? `${info.pet} está no TaxiDog, a caminho da loja, e a chegada ainda não foi marcada.`
    : info.status === 'a_caminho_cliente' ? `O TaxiDog está a caminho para buscar ${info.pet}.`
    : info.status === 'no_endereco' ? `O TaxiDog está no endereço do cliente para buscar ${info.pet}.`
    : `O TaxiDog ainda não buscou ${info.pet}.`

  return createPortal(
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title flex items-center gap-2">
            <IconCar style={{ width: 18, height: 18 }} /> A busca do TaxiDog não chegou
          </h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar">
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ margin: 0 }}>{situacao}</p>
          {info.emMovimento ? (
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              Se o pet já chegou, peça ao TaxiDog para marcar a entrega na loja. Dá para {verbo.toLowerCase()} mesmo assim.
            </p>
          ) : (
            <>
              <p className="text-sm" style={{ margin: 0 }}><strong>O cliente trouxe o pet?</strong></p>
              <button type="button" className="btn btn-primary" onClick={() => onEscolher('cliente_trouxe')}>
                Sim — {info.modalidade === 'buscar' ? 'cancelar a busca' : 'tirar a busca (fica só a entrega)'} e {verbo.toLowerCase()}
              </button>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                A taxa da busca sai do agendamento. Se a busca já estava numa rota, o TaxiDog recebe o aviso.
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Voltar</button>
          <button type="button" className="btn btn-secondary" onClick={() => onEscolher('ignorar')}>
            {verbo} mesmo assim
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
