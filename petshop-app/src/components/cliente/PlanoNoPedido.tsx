'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { dataBR, type CoberturaPlano, type PlanoDoPet } from '@/lib/planos'

// Planos ativos do pet do cliente naquela loja, com o saldo do período que
// cobre a data (fn_meus_beneficios, migration 075). Sem data, vale hoje.
// null = ainda carregando; sem a migration, volta [] e a tela segue igual.
export function useMeusBeneficios(idLojista: string, idPet: string, data: string): PlanoDoPet[] | null {
  const supabase = useMemo(() => createClient(), [])
  const chave = `${idLojista}|${idPet}|${data}`
  const [carregado, setCarregado] = useState<{ chave: string; planos: PlanoDoPet[] } | null>(null)

  useEffect(() => {
    if (!idLojista || !idPet) return
    let cancelado = false
    const chaveDaBusca = `${idLojista}|${idPet}|${data}`
    supabase
      .rpc('fn_meus_beneficios', { p_id_lojista: idLojista, p_id_pet: idPet, p_data: data || null })
      .then(({ data: rows, error }) => {
        if (cancelado) return
        setCarregado({ chave: chaveDaBusca, planos: error || !Array.isArray(rows) ? [] : (rows as PlanoDoPet[]) })
      })
    return () => { cancelado = true }
  }, [idLojista, idPet, data, supabase])

  if (!idLojista || !idPet) return []
  return carregado?.chave === chave ? carregado.planos : null
}

interface Props {
  cobertura: CoberturaPlano
  // Nome de cada serviço do pedido (a cobertura só traz o id).
  nomes: Record<string, string>
  // Data escolhida (AAAA-MM-DD) — usada no aviso de "sem período".
  data: string
  usar: boolean
  onUsar: (v: boolean) => void
  disabled?: boolean
}

// Aviso do plano na confirmação do agendamento do cliente: o que o plano
// cobre, com a opção de usar o saldo (marcada por padrão).
export default function PlanoNoPedido({ cobertura, nomes, data, usar, onUsar, disabled }: Props) {
  const { cobertos, esgotados, semPeriodo } = cobertura
  if (cobertos.length === 0 && esgotados.length === 0 && semPeriodo.length === 0) return null

  return (
    <div className={`plano-aviso-agendamento ${cobertos.length > 0 ? '' : 'is-esgotado'}`}>
      {cobertos.length > 0 && (
        <>
          <span className="text-sm">
            <strong>{cobertos.length > 1 ? 'Estes serviços estão no seu plano' : 'Este serviço está no seu plano'}</strong>
          </span>
          {cobertos.map(c => {
            const restam = c.quantidade - c.usados
            return (
              <span key={c.id_servico} className="text-sm">
                {nomes[c.id_servico] ?? 'Serviço'} — {c.plano}: {restam} de {c.quantidade} {restam === 1 ? 'restante' : 'restantes'} neste período
              </span>
            )
          })}
          <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={usar}
              onChange={e => onUsar(e.target.checked)}
              disabled={disabled}
              style={{ accentColor: 'var(--primary-500)', width: 16, height: 16 }}
            />
            Usar o saldo do meu plano ({cobertos.length > 1 ? 'esses serviços não são cobrados' : 'o serviço não é cobrado'} neste agendamento)
          </label>
        </>
      )}
      {esgotados.map(e => (
        <span key={e.id_servico} className="text-sm">
          Os usos de {nomes[e.id_servico] ?? 'serviço'} no plano {e.plano} acabaram neste período ({e.usados} de {e.quantidade}) — será cobrado normalmente.
        </span>
      ))}
      {cobertos.length === 0 && esgotados.length === 0 && semPeriodo.map(p => (
        <span key={p.id_assinatura} className="text-sm">
          Seu plano {p.plano} ainda não tem período aberto para {dataBR(data)}
          {p.proxima_cobranca ? ` (o próximo começa em ${dataBR(p.proxima_cobranca)})` : ''}. Este agendamento será cobrado
          normalmente; quando o período abrir, a loja pode aplicar o plano.
        </span>
      ))}
    </div>
  )
}
