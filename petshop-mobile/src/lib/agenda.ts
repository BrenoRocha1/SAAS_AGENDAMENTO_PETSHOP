// Espelha petshop-app/src/lib/agenda.ts — "agora" sempre no fuso da loja
// (America/Sao_Paulo), nunca no fuso do dispositivo. Mesma técnica do
// web: lê os campos de data/hora já formatados nesse fuso via
// Intl.DateTimeFormat, em vez de confiar no relógio local do aparelho.
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

  // Montado no fuso LOCAL do aparelho (não em UTC): date-fns e getHours()
  // leem os campos locais. Com Date.UTC, num celular em Brasília a hora
  // saía 3 h atrasada e, entre 0h e 3h, "hoje" virava ontem — mesma
  // correção que o painel web já tem.
  return new Date(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour') % 24, // alguns motores ICU retornam "24" pra meia-noite
    valor('minute'),
    valor('second')
  )
}

/** Data de hoje ('yyyy-MM-dd') no fuso do petshop. */
export function hojeBrasilISO(): string {
  return format(agoraBrasil(), 'yyyy-MM-dd')
}

/** Hora atual ('HH:mm') no fuso do petshop. */
export function agoraBrasilHHMM(): string {
  return format(agoraBrasil(), 'HH:mm')
}

/** "Sexta-feira, 20 de setembro" — cabeçalho da tela Início. */
export function dataExtensaBrasil(): string {
  const texto = format(agoraBrasil(), "EEEE, d 'de' MMMM", { locale: ptBR })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Saudação de acordo com o horário do petshop — "Bom dia" / "Boa tarde" / "Boa noite". */
export function saudacao(): string {
  const hora = agoraBrasil().getHours()
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Soma (ou subtrai) dias numa data 'yyyy-MM-dd', sem passar por fuso. */
export function somarDiasISO(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return d.toISOString().slice(0, 10)
}

/** '2026-10-01' -> '01/10/2026'. */
export function dataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DIAS_LONGOS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function partesDaData(dataISO: string) {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  return { ano, mes, dia, semana }
}

/** 'seg' — dia da semana curto de uma data 'yyyy-MM-dd'. */
export function diaSemanaCurto(dataISO: string): string {
  return DIAS_CURTOS[partesDaData(dataISO).semana]
}

/** "Quinta-feira, 1 de outubro" — de uma data 'yyyy-MM-dd' qualquer. */
export function dataExtensaISO(dataISO: string): string {
  const { dia, mes, semana } = partesDaData(dataISO)
  return `${DIAS_LONGOS[semana]}, ${dia} de ${MESES[mes - 1]}`
}

/**
 * Tira os horários que já passaram — só muda algo quando a data é hoje.
 * Mesma regra do painel web (removerHorariosPassados).
 */
export function removerHorariosPassados<T extends { hr_slot: string }>(slots: T[], dataISO: string): T[] {
  if (dataISO !== hojeBrasilISO()) return slots
  const agora = agoraBrasilHHMM()
  return slots.filter(s => s.hr_slot.slice(0, 5) > agora)
}
