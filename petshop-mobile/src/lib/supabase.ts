import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createClient } from '@supabase/supabase-js'

// Mesmo projeto Supabase do dashboard web (petshop-app) — mesmo backend,
// banco, autenticação e RLS. Nenhum dado paralelo é criado aqui; o app
// mobile só fala com as tabelas/funções que já existem.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY não configurados. Copie .env.example para .env e preencha com os mesmos valores do dashboard web.'
  )
}

// Só em desenvolvimento: consulta que o banco recusou aparece no console
// (caminho, status e a mensagem do banco) — as telas tratam o erro com
// uma mensagem amigável ou seguem sem aquela parte, e sem isto a causa
// fica invisível. Nunca registra cabeçalhos (o token vai neles).
const fetchComRegistro: typeof fetch = async (entrada, opcoes) => {
  const resposta = await fetch(entrada, opcoes)
  if (!resposta.ok) {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    let corpo = ''
    try {
      corpo = (await resposta.clone().text()).slice(0, 300)
    } catch {
      // sem corpo legível
    }
    console.warn(`[supabase] ${resposta.status} ${url.replace(supabaseUrl, '').split('?')[0]} ${corpo}`)
  }
  return resposta
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  ...(__DEV__ ? { global: { fetch: fetchComRegistro } } : {}),
})

// Renovação do token só com o app aberto na frente (recomendação do
// Supabase pra React Native): em segundo plano os timers param, e ao
// voltar a sessão é conferida e renovada na hora.
AppState.addEventListener('change', estado => {
  if (estado === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
