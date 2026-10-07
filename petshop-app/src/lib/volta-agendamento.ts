import { cookies } from 'next/headers'

// Quem chega pelo link público de agendamento e precisa entrar ou criar a
// conta volta para o mesmo link no fim, com os serviços que já tinha
// escolhido. O caminho viaja como `redirectTo` nas telas de login e de
// cadastro; no login com Google a pessoa sai do site e volta (callback →
// completar cadastro), então ele fica guardado num cookie de vida curta.
// Não é um arquivo 'use server'.

export const COOKIE_VOLTA = 'saip-voltar-para'

// Só o link público de agendamento (/agendamento/<loja>?servicos=...) —
// nunca outro domínio nem uma rota qualquer do site.
const CAMINHO_VALIDO = /^\/agendamento\/[A-Za-z0-9_-]+(\?servicos=[A-Za-z0-9,-]*)?$/

export function voltaValida(caminho: string | null | undefined): string | null {
  return caminho && CAMINHO_VALIDO.test(caminho) ? caminho : null
}

// Guarda o caminho antes de mandar a pessoa para o Google. Sem caminho
// válido, apaga o que tinha ficado de uma tentativa anterior.
export async function guardarVolta(caminho: string | null | undefined) {
  const cookieStore = await cookies()
  const volta = voltaValida(caminho)
  if (!volta) {
    cookieStore.delete(COOKIE_VOLTA)
    return
  }
  cookieStore.set(COOKIE_VOLTA, volta, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 30,
    path: '/',
  })
}

// Lê e apaga: o caminho vale para uma volta só.
export async function usarVolta(): Promise<string | null> {
  const cookieStore = await cookies()
  const volta = voltaValida(cookieStore.get(COOKIE_VOLTA)?.value)
  if (cookieStore.has(COOKIE_VOLTA)) cookieStore.delete(COOKIE_VOLTA)
  return volta
}
