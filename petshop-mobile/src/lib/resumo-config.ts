// CÓPIA de petshop-app/src/lib/resumo-config.ts — se mudar lá, muda aqui.
//
// Resumos de uma linha da tela de Configurações ("Seg a Sáb · 08:00–18:00",
// "Pix, Dinheiro e Crédito"…): em vez de uma descrição genérica, cada item
// mostra como está configurado agora. O app tem uma cópia deste arquivo
// (petshop-mobile/src/lib/resumo-config.ts) — se mudar aqui, muda lá.

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const CURTO: Record<string, string> = {
  Segunda: 'Seg', Terça: 'Ter', Quarta: 'Qua', Quinta: 'Qui', Sexta: 'Sex', Sábado: 'Sáb', Domingo: 'Dom',
}

// "A", "A e B", "A, B e C".
export function listaHumana(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ''
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

export interface HorarioResumo { dia_semana: string; hr_inicio: string; hr_fim: string; ativo: boolean }

export function resumoHorarios(horarios: HorarioResumo[]): string {
  const abertos = horarios.filter(h => h.ativo && DIAS.includes(h.dia_semana))
  if (abertos.length === 0) return 'Nenhum dia de atendimento definido'
  const indices = [...new Set(abertos.map(h => DIAS.indexOf(h.dia_semana)))].sort((a, b) => a - b)
  const seguidos = indices.every((d, i) => i === 0 || d === indices[i - 1] + 1)
  const dias = indices.length === 7 ? 'Todos os dias'
    : seguidos && indices.length >= 3 ? `${CURTO[DIAS[indices[0]]]} a ${CURTO[DIAS[indices[indices.length - 1]]]}`
    : listaHumana(indices.map(i => CURTO[DIAS[i]]))
  const faixas = [...new Set(abertos.map(h => `${h.hr_inicio.slice(0, 5)}–${h.hr_fim.slice(0, 5)}`))]
  return faixas.length === 1 ? `${dias} · ${faixas[0]}` : `${dias} · horários variados`
}

const FORMA_CURTA: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao_credito: 'Crédito', cartao_debito: 'Débito' }

export function resumoFormas(formas: string[]): string {
  return formas.length === 0 ? 'Nenhuma forma de pagamento ativa' : listaHumana(formas.map(f => FORMA_CURTA[f] ?? f))
}

export function resumoAvaliacoes(media: number | null, total: number): string {
  if (!total) return 'Nenhuma avaliação ainda'
  return `${(media ?? 0).toFixed(1).replace('.', ',')} ★ · ${total} ${total === 1 ? 'avaliação' : 'avaliações'}`
}

export function resumoEquipe(pessoas: number): string {
  if (pessoas === 0) return 'Só você — convide a sua equipe'
  return `${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'} na equipe`
}
