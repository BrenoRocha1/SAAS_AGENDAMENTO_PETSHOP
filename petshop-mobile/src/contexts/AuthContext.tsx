import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { SITE_URL } from '@/lib/site'
import { obterContextoLojista, type ContextoLojista } from '@/lib/lojistaContext'

// 'novo' = entrou (pelo Google) mas ainda não tem cadastro nenhum: falta
// completar os dados de cliente.
type Role = 'lojista' | 'funcionario' | 'cliente' | 'novo' | null

// 'loja' = abas da equipe (Início, Agendamentos, Clientes, Pets).
// 'taxidog' = área das corridas (Início, Corridas, Rotas, Histórico).
// 'cliente' = área do cliente (Início, Agendamentos, Pets, Petshops).
export type ModoApp = 'loja' | 'taxidog' | 'cliente'

const CHAVE_MODO = 'saip:modo-app'

interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  role: Role
  contexto: ContextoLojista | null
  // Funcionário existe no auth mas foi desativado (ativo=false) — trata
  // diferente de "não é da equipe" (role cliente), pra dar um aviso claro.
  funcionarioInativo: boolean
  modo: ModoApp
  // Tem alguma permissão da loja além de ser TaxiDog? Só assim faz sentido
  // oferecer a troca de área.
  temAcessoLoja: boolean
  setModo: (modo: ModoApp) => void
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>
  // Funcionário: entra só com o código de acesso rápido (6 dígitos).
  signInWithCode: (codigo: string) => Promise<{ error: string | null }>
  // Login com Google (a mesma conta do painel web). `error: null` também
  // quando a pessoa só fechou a janela do Google.
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  // Lê de novo o papel e as permissões (depois de completar o cadastro).
  recarregar: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// Mesmo fallback do loginAction do dashboard web: nem toda conta antiga
// tem `role` no user_metadata, então confirma direto nas tabelas quando
// falta. Fonte de verdade é o banco, o metadata é só um atalho.
async function resolverRole(user: User): Promise<Exclude<Role, null>> {
  const metaRole = user.user_metadata?.role
  if (metaRole === 'lojista' || metaRole === 'funcionario' || metaRole === 'cliente') return metaRole

  const { data: lojista } = await supabase.from('lojista').select('id_lojista').eq('id_lojista', user.id).maybeSingle()
  if (lojista) return 'lojista'

  const { data: funcionario } = await supabase
    .from('funcionario')
    .select('id_funcionario')
    .eq('id_funcionario', user.id)
    .maybeSingle()
  if (funcionario) return 'funcionario'

  const { data: cliente } = await supabase.from('cliente').select('id_cliente').eq('id_cliente', user.id).maybeSingle()
  return cliente ? 'cliente' : 'novo'
}

// O Google devolve a sessão no endereço de retorno: no fragmento
// (#access_token=…&refresh_token=…) ou, no fluxo com código, em ?code=….
function parametrosDoRetorno(url: string): Record<string, string> {
  const [antes, fragmento] = url.split('#')
  const saida: Record<string, string> = {}
  for (const parte of [antes.split('?')[1], fragmento]) {
    if (!parte) continue
    for (const par of parte.split('&')) {
      const i = par.indexOf('=')
      const chave = i < 0 ? par : par.slice(0, i)
      if (!chave) continue
      try {
        saida[decodeURIComponent(chave)] = decodeURIComponent((i < 0 ? '' : par.slice(i + 1)).replace(/\+/g, ' '))
      } catch {
        // par mal formado: ignora
      }
    }
  }
  return saida
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [contexto, setContexto] = useState<ContextoLojista | null>(null)
  const [funcionarioInativo, setFuncionarioInativo] = useState(false)
  const [modoPreferido, setModoPreferido] = useState<ModoApp | null>(null)

  // O papel só é publicado junto com o contexto: enquanto `role` é null
  // (logo depois do login), as telas mostram "carregando" em vez de
  // piscar um aviso de acesso negado.
  async function carregarContexto(user: User) {
    const resolvedRole = await resolverRole(user)

    if (resolvedRole === 'cliente' || resolvedRole === 'novo') {
      setContexto(null)
      setFuncionarioInativo(false)
      setRole(resolvedRole)
      return
    }

    const ctx = await obterContextoLojista(supabase, user.id, resolvedRole)
    // Existe na auth mas não achou linha ativa em `funcionario` — conta
    // desativada (mesma checagem do loginAction web).
    setFuncionarioInativo(!ctx && resolvedRole === 'funcionario')
    setContexto(ctx)
    setRole(resolvedRole)
  }

  useEffect(() => {
    let ativo = true

    async function aplicar(sessao: Session | null) {
      if (!ativo) return
      setSession(sessao)
      if (sessao?.user) {
        await carregarContexto(sessao.user)
      } else {
        setRole(null)
        setContexto(null)
        setFuncionarioInativo(false)
      }
    }

    // A preferência de área é lida antes de liberar a tela, pra não abrir
    // numa área e pular pra outra logo em seguida.
    Promise.all([supabase.auth.getSession(), AsyncStorage.getItem(CHAVE_MODO).catch(() => null)]).then(async ([{ data }, salvo]) => {
      if (!ativo) return
      if (salvo === 'loja' || salvo === 'taxidog') setModoPreferido(salvo)
      await aplicar(data.session)
      if (ativo) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((evento, novaSession) => {
      // A sessão guardada no aparelho já foi carregada logo acima.
      if (evento === 'INITIAL_SESSION') return
      // Nada de consultar o Supabase AQUI DENTRO: este aviso chega com a
      // trava da sessão ainda presa (na renovação do token, por exemplo), e
      // uma consulta ficaria esperando a própria trava — o app inteiro
      // pararia de responder. Por isso o trabalho vai pro próximo ciclo.
      setTimeout(() => { aplicar(novaSession) }, 0)
    })

    return () => {
      ativo = false
      listener.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só monta uma vez, carregarContexto usa supabase (estável)
  }, [])

  async function signIn(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) return { error: 'E-mail ou senha incorretos.' }
    return { error: null }
  }

  // O site confere o código (o mesmo de /login/funcionario) e devolve um
  // token de entrada, trocado aqui pela sessão deste aparelho. Precisa de
  // EXPO_PUBLIC_SITE_URL: a conferência só existe no servidor do site.
  async function signInWithCode(codigo: string) {
    if (!SITE_URL) return { error: 'Entrar com código precisa do endereço do site configurado no app (EXPO_PUBLIC_SITE_URL).' }
    let corpo: { token_hash?: string; error?: string } | null = null
    try {
      const resposta = await fetch(`${SITE_URL}/api/app/login-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      corpo = await resposta.json()
    } catch {
      return { error: 'Sem conexão com o site da loja. Confira a internet e tente de novo.' }
    }
    if (!corpo?.token_hash) return { error: corpo?.error ?? 'Não foi possível entrar com o código.' }
    const { error } = await supabase.auth.verifyOtp({ token_hash: corpo.token_hash, type: 'magiclink' })
    return { error: error ? 'Não foi possível entrar com o código. Peça um novo ao responsável da loja.' : null }
  }

  async function signInWithGoogle() {
    // saip://auth no app instalado; exp://…/--/auth no Expo Go. Os dois
    // precisam estar liberados em Authentication > URL Configuration >
    // Redirect URLs do Supabase (ver README).
    const retorno = Linking.createURL('auth')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: retorno, skipBrowserRedirect: true },
    })
    if (error || !data?.url) return { error: 'Não foi possível abrir o login do Google.' }

    let resultado: WebBrowser.WebBrowserAuthSessionResult
    try {
      resultado = await WebBrowser.openAuthSessionAsync(data.url, retorno)
    } catch {
      return { error: 'Não foi possível abrir o navegador para o login do Google.' }
    }
    // Fechou a janela sem concluir: não é erro.
    if (resultado.type !== 'success') return { error: null }

    const p = parametrosDoRetorno(resultado.url)
    if (p.error || p.error_description) return { error: 'O Google não concluiu o login. Tente de novo.' }
    if (p.code) {
      const { error: erroTroca } = await supabase.auth.exchangeCodeForSession(p.code)
      return { error: erroTroca ? 'Não foi possível concluir o login com o Google.' : null }
    }
    if (p.access_token && p.refresh_token) {
      const { error: erroSessao } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token })
      return { error: erroSessao ? 'Não foi possível concluir o login com o Google.' : null }
    }
    return { error: 'O login com o Google voltou sem os dados da sessão.' }
  }

  async function signOut() {
    // Só este aparelho: o padrão do Supabase ('global') encerra todas as
    // sessões da conta e tiraria a pessoa também do site. Sair daqui tem
    // que funcionar sempre — sem internet ou com a sessão já inválida no
    // servidor, a sessão local é apagada do mesmo jeito.
    await supabase.auth.signOut({ scope: 'local' })
  }

  async function recarregar() {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) await carregarContexto(data.session.user)
  }

  function setModo(novo: ModoApp) {
    setModoPreferido(novo)
    AsyncStorage.setItem(CHAVE_MODO, novo).catch(() => {})
  }

  const temAcessoLoja = !contexto || contexto.role === 'lojista' || contexto.acessoTotal ||
    contexto.podeGerenciarAgenda || contexto.podeGerenciarClientesPets ||
    contexto.podeGerenciarProdutos || contexto.podeGerenciarServicos

  // Quem é TaxiDog cai direto nas corridas; quem também é da equipe pode
  // trocar (e a escolha fica salva no aparelho). Quem não é TaxiDog nunca
  // vê a área de corridas.
  const modo: ModoApp = role === 'cliente' || role === 'novo'
    ? 'cliente'
    : !contexto?.podeTaxidog ? 'loja' : !temAcessoLoja ? 'taxidog' : modoPreferido === 'loja' ? 'loja' : 'taxidog'

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      contexto,
      funcionarioInativo,
      modo,
      temAcessoLoja,
      setModo,
      signIn,
      signInWithCode,
      signInWithGoogle,
      signOut,
      recarregar,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setModo/signIn/signOut só usam setters e o client estável
    [loading, session, role, contexto, funcionarioInativo, modo, temAcessoLoja]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
