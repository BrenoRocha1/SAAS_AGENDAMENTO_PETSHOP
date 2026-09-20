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

  return new Date(
    Date.UTC(
      valor('year'),
      valor('month') - 1,
      valor('day'),
      valor('hour') % 24,
      valor('minute'),
      valor('second')
    )
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
