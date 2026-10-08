import type { createClient } from '@/lib/supabase/server'

// Resolve "em nome de qual loja este usuário está agindo" — igual pro
// lojista (é ele mesmo) e pro funcionário (é o lojista que o contratou,
// migration 006/028: mesma ideia do helper SQL auth_lojista_id(), só que
// do lado do app pra montar queries/params antes de chamar o banco).
// Usado tanto em Server Components (páginas) quanto em Server Actions —
// os dois recebem o mesmo tipo de client de @/lib/supabase/server.
export interface ContextoLojista {
  idLojista: string
  role: 'lojista' | 'funcionario'
  podeGerenciarAgenda: boolean
  podeGerenciarServicos: boolean
  // Separada de podeGerenciarServicos desde a migration 040 — Produtos
  // (catálogo + estoque) virou uma área com peso próprio.
  podeGerenciarProdutos: boolean
  // Só visualizar Clientes e Pets (sem criar/editar/excluir).
  podeGerenciarClientesPets: boolean
  // "Administrador" — mesmo acesso do lojista em tudo, exceto conceder
  // acesso_total pra outra pessoa (migration 029: só o lojista de
  // verdade pode, garantido também por trigger no banco).
  acessoTotal: boolean
  // Função TaxiDog (migration 042) — não é permissão: dá acesso só às
  // corridas atribuídas a ele, nada mais.
  podeTaxidog: boolean
  // Atender o WhatsApp da loja (migration 088). Dono e administrador
  // sempre podem.
  podeAtenderWhatsapp: boolean
}

export async function obterContextoLojista(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string | undefined
): Promise<ContextoLojista | null> {
  if (role === 'lojista') {
    return {
      idLojista: userId,
      role: 'lojista',
      podeGerenciarAgenda: true,
      podeGerenciarServicos: true,
      podeGerenciarProdutos: true,
      podeGerenciarClientesPets: true,
      acessoTotal: true,
      podeTaxidog: false,
      podeAtenderWhatsapp: true,
    }
  }

  if (role === 'funcionario') {
    // Uma consulta só, já com pode_taxidog (migration 042); se a coluna
    // ainda não existir, cai na consulta sem ela.
    const colunas = 'id_lojista, pode_gerenciar_agenda, pode_gerenciar_servicos, pode_gerenciar_produtos, pode_gerenciar_clientes_pets, acesso_total'
    const comTaxidog = await supabase
      .from('funcionario')
      .select(`${colunas}, pode_taxidog`)
      .eq('id_funcionario', userId)
      .eq('ativo', true)
      .maybeSingle()
    let data: (Omit<NonNullable<typeof comTaxidog.data>, 'pode_taxidog'> & { pode_taxidog?: boolean }) | null = comTaxidog.data
    if (comTaxidog.error) {
      const semTaxidog = await supabase.from('funcionario').select(colunas).eq('id_funcionario', userId).eq('ativo', true).maybeSingle()
      data = semTaxidog.data
    }

    if (!data) return null

    // pode_atender_whatsapp (migration 088) numa consulta à parte: enquanto
    // a coluna não existir, ela falha sozinha e o resto segue igual.
    let podeAtenderWhatsapp = data.acesso_total
    if (!podeAtenderWhatsapp) {
      const whatsapp = await supabase.from('funcionario').select('pode_atender_whatsapp').eq('id_funcionario', userId).maybeSingle()
      podeAtenderWhatsapp = !!(whatsapp.data as { pode_atender_whatsapp?: boolean } | null)?.pode_atender_whatsapp
    }

    return {
      idLojista: data.id_lojista,
      role: 'funcionario',
      podeGerenciarAgenda: data.pode_gerenciar_agenda || data.acesso_total,
      podeGerenciarServicos: data.pode_gerenciar_servicos || data.acesso_total,
      podeGerenciarProdutos: data.pode_gerenciar_produtos || data.acesso_total,
      podeGerenciarClientesPets: data.pode_gerenciar_clientes_pets || data.acesso_total,
      acessoTotal: data.acesso_total,
      podeTaxidog: !!data.pode_taxidog,
      podeAtenderWhatsapp,
    }
  }

  return null
}

// Um administrador (funcionário com acesso_total) tem paridade com o
// lojista em todas as telas — menos criar OUTRO administrador, que só o
// dono da conta pode. `ehResponsavelPelaConta` é essa distinção: usa
// pra decidir se a opção "Acesso total" aparece/é aceita num formulário.
export function ehResponsavelPelaConta(contexto: ContextoLojista) {
  return contexto.role === 'lojista'
}
