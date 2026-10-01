import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import { recalcularRota } from '@/lib/rotas-calculo'

// Distância e tempo de uma rota do TaxiDog, pedido pelo APP MOBILE. No
// painel web isso é uma Server Action (recalcularRotaAction); o app não
// tem como chamá-la, e a chave do Google Maps é só do servidor.
//
// Quem chama se identifica com o token da própria sessão do Supabase
// (Authorization: Bearer …) — as consultas rodam com esse token, então a
// RLS e as funções do banco decidem o que ele pode ver, exatamente como
// no painel. Nada aqui usa a service_role.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let idRota: unknown
  try {
    idRota = ((await request.json()) as { id_rota?: unknown } | null)?.id_rota
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  }
  if (typeof idRota !== 'string' || !UUID_RE.test(idRota)) {
    return NextResponse.json({ error: 'Rota inválida.' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 })

  // Só calcula se a rota mudou desde o último cálculo, e as chamadas ao
  // Google são contadas no banco (migration 055) — repetir o pedido não
  // gasta cota.
  const falha = await recalcularRota(supabase, idRota, contexto.idLojista)
  return falha ? NextResponse.json({ error: falha }) : NextResponse.json({ success: true })
}
