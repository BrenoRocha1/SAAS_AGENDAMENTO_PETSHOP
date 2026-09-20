import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { obterContextoLojista, type ContextoLojista } from '@/lib/lojistaContext'

type Role = 'lojista' | 'funcionario' | 'cliente' | null

interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  role: Role
  contexto: ContextoLojista | null
  // Funcionário existe no auth mas foi desativado (ativo=false) — trata
  // diferente de "não é da equipe" (role cliente), pra dar um aviso claro.
  funcionarioInativo: boolean
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
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

  return 'cliente'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [contexto, setContexto] = useState<ContextoLojista | null>(null)
  const [funcionarioInativo, setFuncionarioInativo] = useState(false)

  async function carregarContexto(user: User) {
    const resolvedRole = await resolverRole(user)
    setRole(resolvedRole)

    if (resolvedRole === 'cliente') {
      setContexto(null)
      setFuncionarioInativo(false)
      return
    }

    const ctx = await obterContextoLojista(supabase, user.id, resolvedRole)
    if (!ctx && resolvedRole === 'funcionario') {
      // Existe na auth mas não achou linha ativa em `funcionario` —
      // conta desativada (mesma checagem do loginAction web).
      setFuncionarioInativo(true)
    } else {
      setFuncionarioInativo(false)
    }
    setContexto(ctx)
  }

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return
      setSession(data.session)
      if (data.session?.user) await carregarContexto(data.session.user)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, novaSession) => {
      if (!ativo) return
      setSession(novaSession)
      if (novaSession?.user) {
        await carregarContexto(novaSession.user)
      } else {
        setRole(null)
        setContexto(null)
        setFuncionarioInativo(false)
      }
      setLoading(false)
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

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      contexto,
      funcionarioInativo,
      signIn,
      signOut,
    }),
    [loading, session, role, contexto, funcionarioInativo]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
