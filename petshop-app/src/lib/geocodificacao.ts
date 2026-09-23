// ============================================================
// Geocodificação (endereço -> coordenada), só no servidor
// ============================================================
// Usada apenas quando o TaxiDog cobra por distância. Provedor: Nominatim
// (OpenStreetMap) — gratuito e sem chave de API, o que deixa o recurso
// funcionando sem nenhuma configuração. Regras de uso dele que este
// arquivo respeita: User-Agent identificando a aplicação, resultado em
// cache (o Data Cache do Next guarda cada consulta por 30 dias) e no
// máximo ~1 requisição por segundo (a segunda tentativa espera 1 s).
// Se o volume crescer, troque só a função `consultar` por um provedor
// pago (Google Geocoding, Mapbox) — o resto do sistema recebe só
// { lat, lng }.
//
// Importado apenas por Server Actions: nunca chega no navegador.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = process.env.GEOCODING_USER_AGENT || 'SAIP-PetSaaS/1.0 (agendamento de petshop)'
const CACHE_SEGUNDOS = 60 * 60 * 24 * 30

export interface Coordenadas {
  lat: number
  lng: number
  // 'endereco' = achou a rua; 'bairro'/'cidade' = aproximação mais grosseira.
  precisao: 'endereco' | 'bairro' | 'cidade'
}

async function consultar(params: Record<string, string>): Promise<{ lat: number; lng: number } | null> {
  const url = new URL(NOMINATIM_URL)
  const todos = { ...params, format: 'jsonv2', limit: '1', countrycodes: 'br', 'accept-language': 'pt-BR' }
  for (const [chave, valor] of Object.entries(todos)) url.searchParams.set(chave, valor)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: CACHE_SEGUNDOS },
    })
    if (!res.ok) return null
    const json = (await res.json()) as Array<{ lat: string; lon: string }>
    if (!Array.isArray(json) || json.length === 0) return null
    const lat = Number(json[0].lat)
    const lng = Number(json[0].lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function geocodificarEndereco(e: {
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  uf: string
}): Promise<Coordenadas | null> {
  const porRua = await consultar({
    street: `${e.numero} ${e.logradouro}`.trim(),
    city: e.cidade,
    state: e.uf,
    country: 'Brasil',
  })
  if (porRua) return { ...porRua, precisao: 'endereco' }

  await esperar(1100)
  const porBairro = await consultar({ q: `${e.bairro}, ${e.cidade}, ${e.uf}, Brasil` })
  if (porBairro) return { ...porBairro, precisao: 'bairro' }

  return null
}

// Endereço da loja vem de um campo livre ("Rua X, 123 - Bairro") + cidade
// e estado — por isso a busca é texto livre, não estruturada.
export async function geocodificarLoja(l: {
  endereco: string | null
  cidade: string | null
  estado: string | null
}): Promise<Coordenadas | null> {
  if (!l.cidade) return null

  if (l.endereco) {
    const completo = await consultar({ q: [l.endereco, l.cidade, l.estado, 'Brasil'].filter(Boolean).join(', ') })
    if (completo) return { ...completo, precisao: 'endereco' }
    await esperar(1100)
  }

  const cidade = await consultar({ q: [l.cidade, l.estado, 'Brasil'].filter(Boolean).join(', ') })
  return cidade ? { ...cidade, precisao: 'cidade' } : null
}
