// Dias fechados da loja — feriados e folgas (migration 066).

export interface BloqueioLoja {
  id_bloqueio: string
  dt_inicio: string
  dt_fim: string
  // "HH:MM" — null nos dois = dia inteiro.
  hr_inicio: string | null
  hr_fim: string | null
  motivo: string
}

// Linha como vem de fn_bloqueios_loja (TIME chega "HH:MM:SS").
export function normalizarBloqueios(rows: unknown): BloqueioLoja[] {
  if (!Array.isArray(rows)) return []
  return (rows as BloqueioLoja[]).map(b => ({
    ...b,
    hr_inicio: b.hr_inicio ? b.hr_inicio.slice(0, 5) : null,
    hr_fim: b.hr_fim ? b.hr_fim.slice(0, 5) : null,
  }))
}

export function bloqueiosDoDia(bloqueios: BloqueioLoja[], iso: string): BloqueioLoja[] {
  return bloqueios.filter(b => b.dt_inicio <= iso && iso <= b.dt_fim)
}

// O dia inteiro fechado (o primeiro bloqueio de dia inteiro que cobre o dia).
export function fechadoODiaTodo(bloqueios: BloqueioLoja[], iso: string): BloqueioLoja | null {
  return bloqueiosDoDia(bloqueios, iso).find(b => !b.hr_inicio) ?? null
}

// Data ISO + N dias (sem fuso: meio-dia local).
export function somarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const r = new Date(a, m - 1, d + dias, 12)
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`
}

// "25/12/2026" a partir de "2026-12-25".
export function dataBR(iso: string): string {
  return iso.split('-').reverse().join('/')
}

// "25/12/2026 a 27/12/2026 · das 13:00 às 18:00"
export function descreverBloqueio(b: BloqueioLoja): string {
  const dias = b.dt_inicio === b.dt_fim ? dataBR(b.dt_inicio) : `${dataBR(b.dt_inicio)} a ${dataBR(b.dt_fim)}`
  return b.hr_inicio ? `${dias} · das ${b.hr_inicio} às ${b.hr_fim}` : `${dias} · dia inteiro`
}

// Texto de um bloqueio dentro de um dia já escolhido.
export function textoBloqueioNoDia(b: BloqueioLoja): string {
  return b.hr_inicio
    ? `Fechado das ${b.hr_inicio} às ${b.hr_fim} (${b.motivo})`
    : `Loja fechada neste dia (${b.motivo})`
}

// Mensagens do banco com "Loja fechada:" (trava do agendamento) ou
// "Bloqueio:" (cadastro) já vêm prontas para mostrar.
export function mensagemErroBloqueio(msg: string | undefined | null): string | null {
  if (!msg) return null
  const m = msg.match(/(?:Loja fechada|Bloqueio): ([^\n]+)/)
  if (!m) return null
  return m[1].charAt(0).toUpperCase() + m[1].slice(1)
}

// ── Feriados nacionais (sugestão na tela de Horários) ──

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarDias(d: Date, dias: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias)
}

export interface Feriado {
  data: string
  nome: string
  // Ponto facultativo (Carnaval, Corpus Christi): muita loja abre.
  facultativo: boolean
}

function feriadosDoAno(ano: number): Feriado[] {
  const p = pascoa(ano)
  const fixo = (mes: number, dia: number, nome: string): Feriado => ({
    data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, nome, facultativo: false,
  })
  const movel = (dias: number, nome: string, facultativo: boolean): Feriado => ({
    data: isoLocal(somarDias(p, dias)), nome, facultativo,
  })
  return [
    fixo(1, 1, 'Confraternização Universal'),
    movel(-48, 'Carnaval (segunda)', true),
    movel(-47, 'Carnaval (terça)', true),
    movel(-2, 'Sexta-feira Santa', false),
    fixo(4, 21, 'Tiradentes'),
    fixo(5, 1, 'Dia do Trabalho'),
    movel(60, 'Corpus Christi', true),
    fixo(9, 7, 'Independência do Brasil'),
    fixo(10, 12, 'Nossa Senhora Aparecida'),
    fixo(11, 2, 'Finados'),
    fixo(11, 15, 'Proclamação da República'),
    fixo(11, 20, 'Dia da Consciência Negra'),
    fixo(12, 25, 'Natal'),
  ]
}

// Feriados nacionais de hoje até ~1 ano pra frente.
export function proximosFeriados(hojeISO: string): Feriado[] {
  const ano = Number(hojeISO.slice(0, 4))
  const limite = `${ano + 1}${hojeISO.slice(4)}`
  return [...feriadosDoAno(ano), ...feriadosDoAno(ano + 1)]
    .filter(f => f.data >= hojeISO && f.data < limite)
    .sort((a, b) => a.data.localeCompare(b.data))
}
