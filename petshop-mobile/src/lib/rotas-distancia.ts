import { supabase } from '@/lib/supabase'
import { urlDoSite } from '@/lib/site'

// Pede ao painel web a distância e o tempo de uma rota (Google Maps). A
// chave do Google é só do servidor, então o cálculo acontece lá
// (/api/rotas/recalcular) — o app se identifica com o token da própria
// sessão e a resposta chega pelo Realtime, quando a rota é atualizada.
// Sem EXPO_PUBLIC_SITE_URL configurado, não faz nada: a rota fica sem
// distância até alguém abrir o painel de rotas no site.
const pedidas = new Set<string>()

export async function pedirCalculoDaRota(idRota: string, versao: number): Promise<void> {
  const url = urlDoSite('/api/rotas/recalcular')
  if (!url) return
  // Uma vez por versão da rota (o servidor também ignora pedido repetido).
  const chave = `${idRota}:${versao}`
  if (pedidas.has(chave)) return
  pedidas.add(chave)

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id_rota: idRota }),
    })
  } catch {
    // Sem internet ou site fora do ar: a rota só fica sem a distância.
    pedidas.delete(chave)
  }
}
