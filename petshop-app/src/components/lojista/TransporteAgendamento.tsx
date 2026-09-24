'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alterarTransporteAction } from '@/lib/actions-rotas'
import { cotarTaxiDogLojaAction } from '@/lib/actions-taxidog'
import { ROTULO_MODALIDADE, enderecoEmUmaLinha, formatarCep, formatarReais, type ModalidadeTaxiDog } from '@/lib/taxidog'
import { rotuloTransporte } from '@/lib/taxidog-rotas'
import type { TransporteVisita } from '@/lib/taxidog-visita'
import {
  ESTADO_TRANSPORTE_INICIAL,
  TaxiDogCampos,
  escolhaDoTransporte,
  transportePronto,
  type EstadoTransporte,
} from '@/components/cliente/TaxiDogEtapa'
import { IconAlert, IconCar } from '@/components/icons'

// Bloco "Transporte" do detalhe do agendamento (Kanban e Agenda): mostra
// o TaxiDog da visita e deixa a loja trocar — sem TaxiDog ↔ só busca ↔
// só entrega ↔ busca e entrega. A taxa e as rotas se ajustam no banco
// (fn_alterar_transporte_agendamento, migration 052).

const EM_MOVIMENTO = ['pet_embarcado', 'a_caminho_entrega', 'no_endereco_entrega']

export default function TransporteAgendamento({ idAgendamento, idCliente, statusAgendamento, transporte, podeAlterar }: {
  idAgendamento: string
  idCliente: string | null
  statusAgendamento: string
  transporte: TransporteVisita | null
  podeAlterar: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const aberto = transporte && transporte.status !== 'concluida' ? transporte : null
  // Pet já na loja: só a entrega ainda pode mudar.
  const petNaLoja = ['Em andamento', 'Concluído'].includes(statusAgendamento)
    || (!!transporte && ['entregue_loja', 'pronto_entrega'].includes(transporte.status))
    || (transporte?.status === 'concluida' && transporte.modalidade === 'buscar')
  const modalidades: readonly ModalidadeTaxiDog[] = petNaLoja ? ['entregar'] : ['buscar', 'entregar', 'buscar_entregar']
  const bloqueado = !!aberto && EM_MOVIMENTO.includes(aberto.status)

  const [estado, setEstado] = useState<EstadoTransporte>(() => inicial())

  function inicial(): EstadoTransporte {
    if (!aberto) return { ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar', modalidade: petNaLoja ? 'entregar' : 'buscar_entregar' }
    const modalidade = petNaLoja ? 'entregar' : aberto.modalidade
    return {
      ...ESTADO_TRANSPORTE_INICIAL,
      opcao: petNaLoja && aberto.modalidade === 'buscar' ? 'levar' : 'taxidog',
      modalidade,
      endereco: { ...aberto.endereco, cep: formatarCep(aberto.endereco.cep) },
    }
  }

  function abrirEdicao() {
    setEstado(inicial())
    setErro(null)
    setAviso(null)
    setEditando(true)
  }

  function salvar() {
    const escolha = estado.opcao === 'taxidog' ? escolhaDoTransporte(estado) : null
    if (estado.opcao === 'taxidog' && !escolha) return
    setErro(null)
    startTransition(async () => {
      const r = await alterarTransporteAction(idAgendamento, escolha ? { modalidade: escolha.modalidade, endereco: escolha.endereco } : null)
      if (r.error) {
        setErro(r.error)
        return
      }
      setAviso(r.mensagem ?? 'Transporte atualizado.')
      setEditando(false)
      router.refresh()
    })
  }

  const encerrado = statusAgendamento === 'Cancelado'

  return (
    <div className="transporte-bloco">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--gray-200)' }}>
          <IconCar style={{ width: 14, height: 14 }} /> Transporte
        </span>
        {podeAlterar && !encerrado && !editando && !bloqueado && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={abrirEdicao}>
            {transporte ? 'Alterar' : 'Adicionar TaxiDog'}
          </button>
        )}
      </div>

      {transporte ? (
        <div className="text-sm" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="flex justify-between gap-2">
            <span>TaxiDog · {ROTULO_MODALIDADE[transporte.modalidade]}</span>
            <span className="font-semibold text-success">{formatarReais(transporte.valor)}</span>
          </div>
          <span className="text-xs text-muted">{rotuloTransporte(transporte)} · {enderecoEmUmaLinha(transporte.endereco)}</span>
        </div>
      ) : (
        <span className="text-sm text-muted">Sem TaxiDog — o cliente leva e busca o pet.</span>
      )}

      {bloqueado && <span className="text-xs text-muted">O pet está com o TaxiDog agora — dá para alterar depois que ele chegar.</span>}
      {aviso && !editando && <span className="text-xs text-success">{aviso}</span>}

      {editando && (
        <div className="transporte-edicao">
          {erro && (
            <div className="alert alert-error"><IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span></div>
          )}
          {petNaLoja && <p className="text-xs text-muted" style={{ margin: 0 }}>O pet já está na loja — só a entrega pode ser pedida ou retirada.</p>}
          <TaxiDogCampos
            valor={estado}
            onChange={setEstado}
            cotar={cotarTaxiDogLojaAction}
            modoLoja
            idCliente={idCliente ?? undefined}
            modalidades={modalidades}
            rotuloLevar={petNaLoja ? 'Sem entrega — o cliente busca o pet' : 'Sem TaxiDog — o cliente leva e busca'}
          />
          {aberto?.naRota && <p className="text-xs text-muted" style={{ margin: 0 }}>Este pet já está numa rota — o TaxiDog recebe o aviso da mudança.</p>}
          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(false)} disabled={isPending}>Cancelar</button>
            <button
              type="button"
              className={`btn btn-primary btn-sm ${isPending ? 'btn-loading' : ''}`}
              disabled={isPending || !transportePronto(estado)}
              onClick={salvar}
            >
              Salvar transporte
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
