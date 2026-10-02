// Planos do ponto de vista do CLIENTE — espelha a parte de
// petshop-app/src/lib/planos.ts usada na conta dele: fn_meus_planos
// (migration 068) e o saldo do plano ao agendar (fn_meus_beneficios,
// migration 075).
import type { BeneficioPeriodo, Periodicidade, StatusCobrancaPlano } from '@/lib/planos'

export interface CobrancaDoCliente {
  id_cobranca: string
  numero: number
  valor: number
  vencimento: string
  forma_pagamento: string | null
  status: StatusCobrancaPlano
  pago_em: string | null
  periodo_inicio: string
  periodo_fim: string
}

export interface UtilizacaoDoCliente {
  servico: string
  data: string | null
  hora: string | null
  periodo: number
  estornada_em: string | null
  status_agendamento?: string | null
}

// fn_meus_planos — o que o cliente vê das assinaturas dele.
export interface AssinaturaDoCliente {
  id_assinatura: string
  plano: string
  descricao: string | null
  id_lojista: string
  loja: string
  loja_telefone: string | null
  id_pet: string | null
  pet: string | null
  valor: number
  periodicidade: Periodicidade
  intervalo_dias: number | null
  data_inicio: string
  forma_pagamento: string | null
  status: 'ativa' | 'cancelada'
  cancelada_em: string | null
  periodo_atual: { numero: number; inicio: string; fim: string; beneficios: BeneficioPeriodo[] } | null
  proxima_cobranca: string | null
  cobrancas: CobrancaDoCliente[]
  utilizacoes: UtilizacaoDoCliente[]
  formas_loja: unknown
}

// fn_meus_beneficios — plano do pet naquela loja, com o saldo do período
// que cobre a data. `id_periodo` null = sem período aberto para a data.
export interface BeneficiosDoPet {
  id_assinatura: string
  plano: string
  id_periodo: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  proxima_cobranca: string | null
  beneficios: { id_servico: string; servico: string; quantidade: number; usados: number }[]
}

export interface CoberturaServico {
  id_servico: string
  plano: string
  quantidade: number
  usados: number
}

export interface CoberturaPlano {
  // Serviços do pedido com saldo no plano.
  cobertos: CoberturaServico[]
  // Serviços que estão no plano, mas os usos do período acabaram.
  esgotados: CoberturaServico[]
  // Planos ativos sem período aberto para a data (ela cai depois do atual).
  semPeriodo: BeneficiosDoPet[]
}

export function coberturaDoPlano(planos: BeneficiosDoPet[] | null | undefined, idsServicos: string[]): CoberturaPlano {
  const cobertos: CoberturaServico[] = []
  const esgotados: CoberturaServico[] = []
  const lista = planos ?? []
  for (const id of idsServicos) {
    // Mesmo critério do banco (fn_usar_beneficio): o plano com mais saldo.
    const melhor = lista
      .filter(p => p.id_periodo)
      .flatMap(p => p.beneficios.filter(b => b.id_servico === id).map(b => ({
        id_servico: id, plano: p.plano, quantidade: Number(b.quantidade), usados: Number(b.usados),
      })))
      .sort((x, y) => (y.quantidade - y.usados) - (x.quantidade - x.usados))[0]
    if (!melhor) continue
    if (melhor.quantidade > melhor.usados) cobertos.push(melhor)
    else esgotados.push(melhor)
  }
  return { cobertos, esgotados, semPeriodo: lista.filter(p => !p.id_periodo) }
}
