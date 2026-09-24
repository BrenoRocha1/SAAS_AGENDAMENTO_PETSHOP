// ============================================================
// Distância e tempo REAIS da rota — Google Maps (Routes API)
// ============================================================
// Só no servidor (a chave nunca vai pro navegador). Recebe os pontos na
// ordem (loja → paradas...) e devolve a soma pelo trajeto de carro.
// Configuração: GOOGLE_MAPS_API_KEY no .env.local, de um projeto do
// Google Cloud com a "Routes API" ativada (e faturamento ligado).

export type PontoRota = { endereco: string } | { lat: number; lng: number }

export type ResultadoTrajeto =
  | { ok: true; distanciaM: number; duracaoS: number }
  | { ok: false; motivo: 'sem_chave' | 'falha'; detalhe?: string }

const URL_ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes'
// Limite da Routes API pra carro sem trânsito: 25 pontos intermediários.
const MAX_INTERMEDIARIOS = 25

export function googleMapsConfigurado(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY
}

function waypoint(p: PontoRota) {
  return 'endereco' in p
    ? { address: p.endereco }
    : { location: { latLng: { latitude: p.lat, longitude: p.lng } } }
}

async function trecho(pontos: PontoRota[], chave: string): Promise<{ distanciaM: number; duracaoS: number }> {
  const res = await fetch(URL_ROUTES, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': chave,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: waypoint(pontos[0]),
      destination: waypoint(pontos[pontos.length - 1]),
      intermediates: pontos.slice(1, -1).map(waypoint),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'pt-BR',
      regionCode: 'BR',
    }),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => null)) as {
    routes?: { distanceMeters?: number; duration?: string }[]
    error?: { message?: string }
  } | null
  if (!res.ok || !json?.routes?.[0]) {
    throw new Error(json?.error?.message ?? `Routes API respondeu ${res.status}`)
  }
  const rota = json.routes[0]
  return {
    distanciaM: rota.distanceMeters ?? 0,
    duracaoS: Number(String(rota.duration ?? '0s').replace('s', '')) || 0,
  }
}

export async function calcularTrajeto(pontos: PontoRota[]): Promise<ResultadoTrajeto> {
  const chave = process.env.GOOGLE_MAPS_API_KEY
  if (!chave) return { ok: false, motivo: 'sem_chave' }
  if (pontos.length < 2) return { ok: true, distanciaM: 0, duracaoS: 0 }

  try {
    // Rotas com mais de 25 intermediários são quebradas em pedaços
    // encadeados (o fim de um é o começo do próximo).
    let distanciaM = 0
    let duracaoS = 0
    const tamanho = MAX_INTERMEDIARIOS + 2
    for (let inicio = 0; inicio < pontos.length - 1; inicio += tamanho - 1) {
      const pedaco = pontos.slice(inicio, inicio + tamanho)
      if (pedaco.length < 2) break
      const r = await trecho(pedaco, chave)
      distanciaM += r.distanciaM
      duracaoS += r.duracaoS
    }
    return { ok: true, distanciaM, duracaoS }
  } catch (e) {
    return { ok: false, motivo: 'falha', detalhe: e instanceof Error ? e.message : String(e) }
  }
}
