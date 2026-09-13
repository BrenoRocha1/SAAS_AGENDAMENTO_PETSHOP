import { format } from 'date-fns'

// ============================================================
// "Agora", sempre no fuso do petshop (America/Sao_Paulo) — nunca no fuso
// de quem está rodando o código.
// ============================================================
// Por que isso existe: em Server Components/Actions, `new Date()` roda no
// fuso do SERVIDOR (Vercel/Node = UTC por padrão), não no fuso da loja.
// Como Brasil é UTC-3, a partir de ~21h de Brasília o calendário em UTC já
// virou o dia seguinte — isso fazia "hoje" no Kanban/Dashboard abrir no
// dia errado, os presets do Relatório de Vendas ficarem deslocados, e a
// validação "não pode agendar no passado" rejeitar até o PRÓPRIO dia de
// hoje. `agoraBrasil()` devolve um Date cujos campos já são o relógio de
// Brasília — date-fns (format/subDays/getHours etc.) continua funcionando
// normalmente em cima dele, só que batendo com o horário real da loja.
// ============================================================
export function agoraBrasil(): Date {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const valor = (tipo: string) => Number(partes.find(p => p.type === tipo)?.value ?? 0)

  return new Date(Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour') % 24, // alguns motores ICU retornam "24" pra meia-noite
    valor('minute'),
    valor('second')
  ))
}

/** Data de hoje ('yyyy-MM-dd') no fuso do petshop. */
export function hojeBrasilISO(): string {
  return format(agoraBrasil(), 'yyyy-MM-dd')
}

/** Hora atual ('HH:mm') no fuso do petshop. */
export function agoraBrasilHHMM(): string {
  return format(agoraBrasil(), 'HH:mm')
}

/**
 * Remove da lista os horários que já passaram — só faz diferença quando a
 * data selecionada é hoje (num dia futuro nenhum horário "já passou").
 * Chamada tanto no navegador (booking do cliente/lojista) quanto, no
 * futuro, em código de servidor — por isso usa o fuso fixo do petshop em
 * vez do fuso de quem está rodando, garantindo o mesmo resultado nos dois
 * lados.
 */
export function removerHorariosPassados<T extends { hr_slot: string }>(slots: T[], dataISO: string): T[] {
  if (dataISO !== hojeBrasilISO()) return slots
  const agora = agoraBrasilHHMM()
  return slots.filter(s => s.hr_slot.slice(0, 5) > agora)
}
