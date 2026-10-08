import { createHash, randomBytes } from 'node:crypto'

// Código de acesso do painel interno: 20 caracteres de um alfabeto sem
// letras parecidas (sem 0/O, 1/I/L), em 4 grupos — ~100 bits, impossível
// de adivinhar. Não é um arquivo 'use server'.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function gerarCodigoInterno(): string {
  const bytes = randomBytes(20)
  let c = ''
  for (let i = 0; i < 20; i++) c += ALFABETO[bytes[i] % ALFABETO.length]
  return c.match(/.{5}/g)!.join('-')
}

// Normaliza o que a pessoa digitou/colou e devolve o hash; '' se não tem
// cara de código (evita nem consultar o banco).
export function hashCodigoInterno(digitado: string): string {
  const limpo = digitado.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (limpo.length !== 20) return ''
  return createHash('sha256').update(limpo).digest('hex')
}
