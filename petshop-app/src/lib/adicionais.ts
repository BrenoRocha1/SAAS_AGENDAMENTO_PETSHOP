// Serviços adicionais (migration 095): cobranças extras que a loja cadastra
// ("Taxa por pelo embolado", "Hidratação adicional"...) e que entram num
// agendamento — escolhidas pelo cliente ao agendar online ou incluídas pela
// loja durante o atendimento. Aqui ficam os tipos e o que é só conta/texto;
// quem pode e as regras estão nas funções do banco.

export interface ServicoAdicional {
  id_adicional: string
  nome: string
  descricao: string | null
  preco: number
  status: 'Ativo' | 'Inativo'
  disponivel_online: boolean
  disponivel_atendimento: boolean
  // Serviços principais para os quais vale. Vazio = todos os da loja.
  servicos: string[]
}

export type OrigemAdicional = 'cliente_online' | 'funcionario' | 'lojista'

export interface AdicionalDoAgendamento {
  id_agendamento_adicional: string
  id_adicional: string | null
  nome: string
  descricao: string | null
  preco_unitario: number
  quantidade: number
  valor_total: number
  observacao: string | null
  origem: OrigemAdicional
  nome_usuario: string | null
  status: 'ativo' | 'removido'
  created_at: string
  removido_em: string | null
  nome_removido_por: string | null
  motivo_remocao: string | null
}

// O que o cliente escolheu ao agendar: um adicional para um serviço do
// pedido, com o preço que ele viu (conferido de novo no servidor).
export interface AdicionalEscolhido {
  id_servico: string
  id_adicional: string
  preco: number
}

export const COLUNAS_ADICIONAL =
  'id_adicional, nome, descricao, preco, status, disponivel_online, disponivel_atendimento, vinculos:servico_adicional_servico ( id_servico )'

export const COLUNAS_ADICIONAL_DO_AGENDAMENTO =
  'id_agendamento_adicional, id_adicional, nome, descricao, preco_unitario, quantidade, valor_total, observacao, origem, nome_usuario, status, created_at, removido_em, nome_removido_por, motivo_remocao'

type LinhaAdicional = Omit<ServicoAdicional, 'servicos' | 'preco'> & { preco: number | string; vinculos?: { id_servico: string }[] | null }

export function lerAdicionais(linhas: unknown): ServicoAdicional[] {
  return ((linhas ?? []) as LinhaAdicional[]).map(({ vinculos, ...a }) => ({
    ...a,
    preco: Number(a.preco),
    servicos: (vinculos ?? []).map(v => v.id_servico),
  }))
}

export function lerAdicionaisDoAgendamento(linhas: unknown): AdicionalDoAgendamento[] {
  return ((linhas ?? []) as AdicionalDoAgendamento[]).map(a => ({
    ...a,
    preco_unitario: Number(a.preco_unitario),
    valor_total: Number(a.valor_total),
  }))
}

// Sem serviço marcado, o adicional vale para todos.
export function adicionalValePara(adicional: Pick<ServicoAdicional, 'servicos'>, idServico: string): boolean {
  return adicional.servicos.length === 0 || adicional.servicos.includes(idServico)
}

// A tabela ou a função ainda não existe (migration 095 não rodou): as telas
// seguem como eram, sem a parte dos adicionais.
export function faltaMigrationAdicionais(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false
  if (erro.code === '42P01' || erro.code === 'PGRST205' || erro.code === 'PGRST202' || erro.code === 'PGRST200') return true
  const msg = erro.message ?? ''
  return /servico_adicional|agendamento_adicional|fn_[a-z_]*adiciona/i.test(msg) && /does not exist|Could not find|schema cache/i.test(msg)
}

export const MSG_MIGRATION_ADICIONAIS = 'Para usar os serviços adicionais, execute a migration 095_servicos_adicionais.sql.'

// As funções do banco escrevem o motivo depois de "Adicional:" — já pronto
// para mostrar.
export function mensagemErroAdicional(mensagem: string | undefined | null): string | null {
  const m = (mensagem ?? '').match(/Adicional: ([^\n]+)/)
  if (!m) return null
  const texto = m[1].trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1) + (/[.!?]$/.test(texto) ? '' : '.')
}

export function rotuloOrigemAdicional(item: Pick<AdicionalDoAgendamento, 'origem' | 'nome_usuario'>): string {
  if (item.origem === 'cliente_online') return 'Escolhido pelo cliente ao agendar'
  if (item.origem === 'funcionario') return `Incluído por ${item.nome_usuario ?? 'funcionário'}`
  return 'Incluído pela loja'
}

function reais(valor: number): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export interface AvisoAdicional {
  nomeCliente: string | null
  telefoneCliente: string | null
  nomePet: string | null
  nomeServico: string
  // O que o atendimento custava antes desta inclusão e quanto custa agora.
  valorAnterior: number
  valorNovo: number
  // Serviço, produtos e TaxiDog, separados do que é adicional.
  valorServico: number
  valorProdutos: number
  valorTaxiDog: number
  // Todos os adicionais ativos depois da inclusão (os novos e os de antes).
  adicionais: { nome: string; valor: number; novo: boolean }[]
  observacao: string | null
}

// Texto que a loja manda ao cliente avisando da cobrança — com os nomes e
// os valores do atendimento. A loja pode editar antes de enviar.
export function mensagemAvisoAdicional(a: AvisoAdicional): string {
  const novos = a.adicionais.filter(x => x.novo)
  const primeiroNome = (a.nomeCliente ?? '').trim().split(/\s+/)[0]
  const pet = a.nomePet ? `do ${a.nomePet}` : 'do seu pet'
  const lista = novos.length === 1
    ? `o serviço adicional "${novos[0].nome}", no valor de ${reais(novos[0].valor)}`
    : `os serviços adicionais ${novos.map(n => `"${n.nome}" (${reais(n.valor)})`).join(' e ')}`

  const linhas = [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Durante o atendimento ${pet}, identificamos a necessidade de incluir ${lista}.`,
  ]
  if (a.observacao) linhas.push('', `Motivo: ${a.observacao}`)
  linhas.push('', 'O valor do atendimento foi atualizado:', '')
  linhas.push(`${a.nomeServico}: ${reais(a.valorServico)}`)
  if (a.valorProdutos > 0) linhas.push(`Produtos: ${reais(a.valorProdutos)}`)
  if (a.valorTaxiDog > 0) linhas.push(`TaxiDog: ${reais(a.valorTaxiDog)}`)
  for (const x of a.adicionais) linhas.push(`${x.nome}: ${reais(x.valor)}`)
  linhas.push(`Total atualizado: ${reais(a.valorNovo)}`)
  linhas.push('', 'Se tiver alguma dúvida, estamos à disposição!')
  return linhas.join('\n')
}

// Abre a conversa com o cliente no WhatsApp com o texto pronto — quem envia
// é a pessoa, lá. Sem telefone válido, não há link.
export function linkWhatsappCliente(telefone: string | null | undefined, texto: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return null
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(texto)}`
}

// ── Escolha do cliente ao agendar ──
// Para cada serviço do pedido, os adicionais que valem para ele.
export function gruposDeAdicionais<S extends { id_servico: string; nome: string }>(
  adicionais: ServicoAdicional[],
  servicos: S[],
): { servico: S; opcoes: ServicoAdicional[] }[] {
  return servicos
    .map(servico => ({ servico, opcoes: adicionais.filter(a => adicionalValePara(a, servico.id_servico)) }))
    .filter(g => g.opcoes.length > 0)
}

export interface ItemAdicionalEscolhido extends AdicionalEscolhido {
  nome: string
  nomeServico: string
}

// O que está marcado (por serviço) e ainda existe na lista atual — se a
// loja tirou um adicional do ar ou o serviço saiu do pedido, a marca cai.
export function itensAdicionaisEscolhidos(
  grupos: { servico: { id_servico: string; nome: string }; opcoes: ServicoAdicional[] }[],
  marcados: Record<string, string[]>,
): ItemAdicionalEscolhido[] {
  return grupos.flatMap(g =>
    g.opcoes
      .filter(a => (marcados[g.servico.id_servico] ?? []).includes(a.id_adicional))
      .map(a => ({ id_servico: g.servico.id_servico, id_adicional: a.id_adicional, preco: a.preco, nome: a.nome, nomeServico: g.servico.nome })),
  )
}

export function alternarAdicionalMarcado(marcados: Record<string, string[]>, idServico: string, idAdicional: string): Record<string, string[]> {
  const atuais = marcados[idServico] ?? []
  return { ...marcados, [idServico]: atuais.includes(idAdicional) ? atuais.filter(x => x !== idAdicional) : [...atuais, idAdicional] }
}
