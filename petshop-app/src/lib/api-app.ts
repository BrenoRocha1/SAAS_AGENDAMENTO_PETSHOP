import { NextResponse } from 'next/server'

// Peças comuns das rotas de API usadas pelo APP MOBILE (/api/app/…,
// /api/rotas/recalcular). Nenhuma delas olha cookie: quem chama se
// identifica só com o token da própria sessão (Authorization: Bearer …).
// Por isso o CORS pode ser aberto — outro site não tem como "pegar
// carona" na sessão de ninguém, porque não existe sessão implícita aqui.
// (O app instalado nem usa CORS; isto é para o app rodando no navegador,
// `npx expo start --web`.)
export const CORS_DO_APP = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

export function respostaDoApp(corpo: unknown, status = 200) {
  return NextResponse.json(corpo ?? {}, { status, headers: CORS_DO_APP })
}

export function preflightDoApp() {
  return new NextResponse(null, { status: 204, headers: CORS_DO_APP })
}

export function tokenDaRequisicao(request: Request): string | null {
  return request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null
}
