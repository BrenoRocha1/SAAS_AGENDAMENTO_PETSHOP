
export const TAMANHO_PAGINA = 25

// Tira o que quebraria o filtro .or() do PostgREST (vírgula, parênteses,
// aspas, curinga) antes de usar o texto digitado numa busca.
export function termoSeguro(v: string | undefined): string {
  return (v ?? '').replace(/[,()%*"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

export function numeroPagina(v: string | undefined): number {
  const n = parseInt(v ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

// Sempre no horário de Brasília: o servidor (Vercel) roda em UTC e mostraria
// o dia/hora errados perto da meia-noite.
const FUSO = 'America/Sao_Paulo'
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false })

export function dataBRFmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return fmtData.format(new Date(iso))
}

export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${fmtData.format(d)} às ${fmtHora.format(d)}`
}

export function telefoneBR(t: string | null | undefined): string {
  const d = (t ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t ?? '—'
}

// Data de hoje em Brasília ('AAAA-MM-DD'). toISOString() daria o dia de
// Greenwich: depois das 21h, "amanhã".
export function hojeBrasil(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date())
}

// Instante de N dias atrás (ISO) — começo das janelas "últimos 30 dias".
export function diasAtras(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString()
}

type DbInterno = NonNullable<ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>>

// Soma das vendas concluídas do PDV desde uma data. O PostgREST devolve no
// máximo 1.000 linhas por consulta: lê em páginas para o total não parar
// nas primeiras mil vendas.
export async function somarVendas(db: DbInterno, desde: string, idLojista?: string): Promise<{ total: number; quantidade: number }> {
  const PAGINA = 1000
  let total = 0
  let quantidade = 0
  for (let i = 0; i < 100; i++) {
    let q = db.from('venda').select('total').eq('status', 'concluida').gte('created_at', desde)
    if (idLojista) q = q.eq('id_lojista', idLojista)
    const { data, error } = await q.order('created_at').range(i * PAGINA, (i + 1) * PAGINA - 1)
    if (error || !data) break
    for (const v of data as { total: number | string }[]) total += Number(v.total)
    quantidade += data.length
    if (data.length < PAGINA) break
  }
  return { total, quantidade }
}

// Classe do selo de cada status de agendamento (as mesmas do resto do sistema).
export const BADGE_STATUS_AGENDAMENTO: Record<string, string> = {
  Pendente: 'badge-pendente',
  Confirmado: 'badge-aceito',
  'Em andamento': 'badge-em-andamento',
  Concluído: 'badge-concluido',
  Cancelado: 'badge-cancelado',
}

// Acha o login (Supabase Auth) pelo e-mail. A API não busca por e-mail:
// percorre a lista em páginas.
export async function acharLoginPorEmail(db: DbInterno, email: string): Promise<{ id: string; email: string } | null> {
  const alvo = email.trim().toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data) return null
    const achado = data.users.find(u => (u.email ?? '').toLowerCase() === alvo)
    if (achado) return { id: achado.id, email: achado.email ?? alvo }
    if (data.users.length < 1000) return null
  }
  return null
}

