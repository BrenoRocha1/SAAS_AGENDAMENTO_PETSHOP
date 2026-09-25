'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FormaPagamento } from '@/lib/pagamento'
import { dataBR, type Plano, type PlanoDoPet as PlanoAtivo } from '@/lib/planos'
import { IconPlus, IconRepeat } from '@/components/icons'
import AssinarPlanoModal from './AssinarPlanoModal'
import BeneficiosBarra from './BeneficiosBarra'

// Tela do pet: plano ativo, próxima cobrança e benefícios do período.
export default function PlanoDoPet({ ativos, idPet, nomePet, planos, hojeISO, formasAceitas, podeAssinar }: {
  ativos: PlanoAtivo[]
  idPet: string
  nomePet: string
  planos: Plano[]
  hojeISO: string
  formasAceitas: FormaPagamento[]
  podeAssinar: boolean
}) {
  const router = useRouter()
  const [assinando, setAssinando] = useState(false)
  if (ativos.length === 0 && !podeAssinar) return null

  return (
    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h3 className="relatorio-secao-titulo" style={{ margin: 0 }}>
          <IconRepeat style={{ width: 15, height: 15 }} /> Plano
        </h3>
        {podeAssinar && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAssinando(true)}>
            <IconPlus style={{ width: 14, height: 14 }} /> Assinar plano
          </button>
        )}
      </div>
      {ativos.length === 0 ? (
        <p className="text-sm text-muted" style={{ margin: 0 }}>{nomePet} não tem plano ativo.</p>
      ) : (
        <div className="planos-assinaturas">
          {ativos.map(p => (
            <div key={p.id_assinatura} className="plano-assinatura">
              <div className="font-semibold">Plano ativo: {p.plano}</div>
              <div className="text-xs text-muted">
                {p.periodo_inicio ? <>Período atual: {dataBR(p.periodo_inicio)} a {dataBR(p.periodo_fim)}</> : 'O plano ainda não começou'}
                {p.proxima_cobranca && <> · <strong>próxima cobrança {dataBR(p.proxima_cobranca)}</strong></>}
              </div>
              <BeneficiosBarra beneficios={p.beneficios} />
            </div>
          ))}
        </div>
      )}
      {assinando && (
        <AssinarPlanoModal
          planos={planos}
          pets={[{ id_pet: idPet, nome: nomePet }]}
          petFixo={idPet}
          hojeISO={hojeISO}
          formasAceitas={formasAceitas}
          onFechar={() => setAssinando(false)}
          onAssinado={() => { setAssinando(false); router.refresh() }}
        />
      )}
    </div>
  )
}
