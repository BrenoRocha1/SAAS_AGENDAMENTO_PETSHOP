'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  cadastroClienteSchema,
  cadastroClienteLojistaSchema,
  editarClienteLojistaSchema,
  cadastroLojistSchema,
  slugLojistaSchema,
  janelaAgendamentoSchema,
  loginSchema,
  petSchema,
  classificacaoPetSchema,
  petLojistaSchema,
  servicoSchema,
  servicoVariacaoSchema,
  horarioSchema,
  agendamentoSchema,
  agendamentoOnlineSchema,
  agendamentoLojistaSchema,
  funcionarioSchema,
  editarFuncionarioSchema,
  perfilClienteSchema,
  redefinirSenhaSchema,
  avaliacaoSchema,
  somNotificacaoSchema,
  produtoSchema,
  movimentoEstoqueSchema,
  categoriaProdutoSchema,
  completarCadastroClienteGoogleSchema,
  completarCadastroLojistaGoogleSchema,
} from '@/lib/validations'
import { checkRateLimit } from '@/lib/rate-limit'
import { obterContextoLojista, ehResponsavelPelaConta, type ContextoLojista } from '@/lib/lojista-context'
import { ORDEM_ETAPA, etapaEncerrada, etapaExigeDia } from '@/lib/status-agendamento'
import { hojeBrasilISO } from '@/lib/agenda'
import { coordenadasParaTaxiDog, lerTaxiDogDoFormulario, mensagemErroTaxiDog, paramsRpcTaxiDog } from '@/lib/taxidog-servidor'
import { ehFormaPagamento, mensagemErroPagamento, type FormaPagamento } from '@/lib/pagamento'
import { erroQuantidadeInteira } from '@/lib/produto'
import type { ServicoVariacaoData } from '@/lib/validations'

// ============================================================
// HELPER: erro com detalhe técnico em dev
// ============================================================
// Em produção o usuário só vê a mensagem amigável (não vaza detalhe
// interno). Em dev (`npm run dev`), gruda a causa técnica real (mensagem
// do Supabase/Postgres) na mesma string, pra debugar sem precisar ficar
// catando log no terminal — some sozinho no build de produção.
function devError(mensagemAmigavel: string, detalheTecnico?: string | null) {
  if (process.env.NODE_ENV !== 'production' && detalheTecnico) {
    return `${mensagemAmigavel} [DEV: ${detalheTecnico}]`
  }
  return mensagemAmigavel
}

// ============================================================
// HELPER: origin da requisição (pra montar redirectTo de e-mails do
// Supabase Auth — convite, redefinição de senha). Não existe URL fixa
// de produção configurada ainda, então deriva do header Host em vez de
// hardcodar — funciona igual em localhost e no domínio real.
// ============================================================
async function obterOrigin() {
  // Usa a URL de produção definida em NEXT_PUBLIC_SITE_URL (ex: https://meuapp.vercel.app).
  // Sem ela, deriva do header Host — funciona em localhost mas gera link errado
  // quando o servidor é acessado por proxy (Vercel, etc.).
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const protocolo = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocolo}://${host}`
}

// ============================================================
// Google OAuth via Server Action — PKCE code verifier armazenado
// via Set-Cookie no servidor para que o /auth/callback consiga
// encontrá-lo (não depende de document.cookie do browser).
// ============================================================
export async function getGoogleOAuthUrlAction(role?: string): Promise<{ error?: string; url?: string }> {
  const supabase = await createClient()
  const origin = await obterOrigin()
  
  const callbackUrl = role 
    ? `${origin}/auth/callback?role=${role}`
    : `${origin}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    return { error: `Não foi possível conectar com o Google: ${error?.message ?? 'URL não retornada'}` }
  }
  
  // Retorna a URL para o cliente fazer o redirecionamento.
  // Isso evita o bug do Next.js/Vercel onde Set-Cookie é perdido em redirects 30x para URLs externas.
  return { url: data.url }
}

// ============================================================
// HELPER: client pra gravar em telas "só lojista" (perfil da loja,
// horários, equipe, clientes/pets, etc.). O lojista grava com o client
// normal (RLS de sempre); um funcionário com acesso_total ("administrador",
// migration 029) não tem policy de escrita nessas tabelas — grava com o
// client admin (service_role), só depois de confirmado em código que
// `contexto.acessoTotal` é true. Nunca chamar isso sem checar acesso
// antes: o admin client ignora RLS por completo.
// ============================================================
function clienteParaEscritaLojista(contexto: ContextoLojista, supabaseNormal: Awaited<ReturnType<typeof createClient>>) {
  return contexto.role === 'lojista' ? supabaseNormal : createAdminClient()
}

// ============================================================
// AUTH ACTIONS
// ============================================================

export async function loginAction(formData: FormData) {
  const raw = {
    email: formData.get('email') as string,
    senha: formData.get('senha') as string,
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const rl = await checkRateLimit('login', 10, 5)
  if (!rl.success) {
    return { error: `Muitas tentativas. Tente novamente em ${rl.retryAfter}s.` }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (error) {
    return { error: 'E-mail ou senha incorretos' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  let role = user?.user_metadata?.role

  // Fallback: se o role não estiver no metadata (contas antigas ou timing de auth),
  // busca da tabela perfil_usuario que é a fonte de verdade
  if (!role && user) {
    const { data: perfil } = await supabase
      .from('perfil_usuario')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = perfil?.role

    // Fallback final: verifica diretamente nas tabelas lojista/cliente/funcionario
    if (!role) {
      const { data: lojista } = await supabase
        .from('lojista')
        .select('id_lojista')
        .eq('id_lojista', user.id)
        .maybeSingle()
      if (lojista) {
        role = 'lojista'
      } else {
        const { data: funcionario } = await supabase
          .from('funcionario')
          .select('id_funcionario')
          .eq('id_funcionario', user.id)
          .eq('ativo', true)
          .maybeSingle()
        if (funcionario) {
          role = 'funcionario'
        } else {
          role = 'cliente'
        }
      }
    }
  }

  // Verificar se funcionário está ativo, e pra onde mandar ele — o
  // funcionário usa o mesmo painel do lojista (agenda/serviços), então
  // vai direto pra primeira área que ele tem permissão de usar.
  let destinoFuncionario = '/lojista/agendamentos'
  if (role === 'funcionario') {
    const { data: func } = await supabase
      .from('funcionario')
      .select('ativo, pode_gerenciar_agenda, pode_gerenciar_servicos')
      .eq('id_funcionario', user!.id)
      .maybeSingle()
    if (!func?.ativo) {
      await supabase.auth.signOut()
      return { error: 'Sua conta de funcionário foi desativada. Entre em contato com o responsável pelo petshop.' }
    }
    if (!func.pode_gerenciar_agenda) {
      // TaxiDog (migration 042) numa consulta à parte: sem a migration a
      // coluna não existe, e isso não pode impedir o login.
      const { data: taxidog } = await supabase
        .from('funcionario')
        .select('pode_taxidog')
        .eq('id_funcionario', user!.id)
        .maybeSingle()
      if (taxidog?.pode_taxidog) {
        destinoFuncionario = '/lojista/taxidog'
      } else if (func.pode_gerenciar_servicos) {
        destinoFuncionario = '/lojista/servicos'
      }
    }
  }

  revalidatePath('/', 'layout')

  // Só honra redirectTo de volta pro link público de agendamento (é onde a
  // middleware manda quem clicou em /agendamento/[id] sem estar logado) —
  // nunca redireciona pra fora do domínio nem pra rota arbitrária.
  const redirectTo = formData.get('redirectTo') as string | null
  if (role === 'cliente' && redirectTo?.startsWith('/agendamento/')) {
    redirect(redirectTo)
  }

  if (role === 'lojista') redirect('/lojista/dashboard')
  if (role === 'funcionario') redirect(destinoFuncionario)
  redirect('/cliente/dashboard')
}

// redirectTo opcional — usado em /agendamento/[id] quando quem clicou
// "sair e entrar com outra conta" está logado com o papel errado (ex.:
// lojista testando o próprio link) e precisa voltar pro mesmo link
// depois de entrar de novo como cliente. Sem o parâmetro, comportamento
// de sempre (volta pro /login genérico).
export async function logoutAction(redirectTo?: string) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect(redirectTo?.startsWith('/agendamento/') ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login')
}

// ============================================================
// REDEFINIÇÃO DE SENHA
// ============================================================
// Duas entradas pra mesma tela (/redefinir-senha): "esqueci minha senha"
// (a própria pessoa pede) e o convite de cliente/funcionário cadastrado
// pelo lojista (cadastrarClienteLojistaAction/cadastrarFuncionarioAction),
// que nunca teve senha nenhuma. Ambas passam por /auth/callback, que
// troca o código do link por uma sessão antes de chegar aqui.

export async function solicitarRedefinicaoSenhaAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return { error: 'Informe um e-mail válido.' }
  }

  const supabase = await createClient()
  const origin = await obterOrigin()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
  })

  if (error) {
    console.error('[solicitarRedefinicaoSenhaAction] error:', error.message)
  }

  // Sempre "sucesso" pro chamador — nunca revela se o e-mail existe ou
  // não no banco (evita enumeração de contas).
  return { success: true }
}

export async function atualizarSenhaAction(formData: FormData) {
  const raw = {
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
  }

  const parsed = redefinirSenhaSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Link expirado ou inválido. Solicite um novo link de redefinição de senha.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.senha })
  if (error) {
    return { error: devError('Não foi possível atualizar a senha. Tente novamente.', error.message) }
  }

  return { success: true }
}

export async function cadastroClienteAction(formData: FormData) {
  const raw = {
    nome: formData.get('nome') as string,
    cpf: (formData.get('cpf') as string).replace(/\D/g, ''),
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
    aceita_termos: formData.get('aceita_termos') === 'on' ? true : undefined,
  }

  const parsed = cadastroClienteSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const rl = await checkRateLimit('cadastroCliente', 5, 15)
  if (!rl.success) {
    return { error: `Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfter! / 60)} minutos.` }
  }

  // Cria a conta via Admin API (email_confirm:true) em vez de signUp normal
  // — mesmo padrão de cadastroLojistaAction/cadastrarClienteLojistaAction.
  // Com "Confirm email" habilitado no projeto Supabase, signUp criava a
  // conta mas o signInWithPassword logo abaixo falhava com "Email not
  // confirmed", deixando o cliente com uma conta que não conseguia acessar.
  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.' }
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.senha,
    email_confirm: true,
    user_metadata: { role: 'cliente', nome: parsed.data.nome },
  })

  if (authError) {
    const msg = authError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate') || msg.includes('registered')) {
      return { error: 'Este e-mail já está cadastrado' }
    }
    return { error: devError('Erro ao criar conta. Tente novamente.', authError.message) }
  }

  if (!authData.user) {
    return { error: 'Erro interno. Tente novamente.' }
  }

  const { error: clienteError } = await adminClient.from('cliente').insert({
    id_cliente: authData.user.id,
    nome: parsed.data.nome,
    cpf: parsed.data.cpf,
    email: parsed.data.email,
    telefone: parsed.data.telefone,
  })

  if (clienteError) {
    // Rollback: remover usuário criado
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { error: 'Não foi possível finalizar o cadastro. Tente novamente ou entre em contato com o suporte.' }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Estabelecer sessão nos cookies ANTES do redirect.
  // O adminClient não lida com cookies/sessão do browser — usamos o client
  // normal pra fazer signIn e gravar o JWT nos cookies (mesmo padrão de
  // cadastroLojistaAction).
  // ──────────────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (signInError) {
    // O cadastro foi feito com sucesso, mas não conseguimos logar automaticamente.
    // Redirecionar para login para o usuário entrar manualmente.
    console.error('[cadastroClienteAction] signIn pós-cadastro falhou:', signInError.message)
    redirect('/login')
  }

  revalidatePath('/', 'layout')
  redirect('/cliente/dashboard')
}

export async function cadastroLojistaAction(formData: FormData) {
  // Campos opcionais do schema (descricao/endereco/cidade/estado/cep) só devem
  // ir para o Zod como `undefined` quando não preenchidos. Vindos de <input>/
  // <select> vazios eles chegam como string vazia (""), e `.optional()` não
  // trata "" como ausente — "" ainda cai nas validações de tamanho (ex.:
  // estado com .length(2)), gerando um erro confuso pro usuário mesmo com o
  // campo em branco, que é justamente o comportamento esperado.
  const raw = {
    nome_loja: formData.get('nome_loja') as string,
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    descricao: (formData.get('descricao') as string) || undefined,
    endereco: (formData.get('endereco') as string) || undefined,
    cidade: (formData.get('cidade') as string) || undefined,
    estado: (formData.get('estado') as string) || undefined,
    cep: (formData.get('cep') as string).replace(/\D/g, '') || undefined,
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
    aceita_termos: formData.get('aceita_termos') === 'on' ? true : undefined,
  }

  const parsed = cadastroLojistSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  if (parsed.data.endereco?.trim() && !(formData.get('numero') as string)?.trim()) {
    return { error: 'Informe o número da loja (use S/N se não tiver).' }
  }

  const rl = await checkRateLimit('cadastroLojista', 3, 15)
  if (!rl.success) {
    return { error: `Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfter! / 60)} minutos.` }
  }

  // Admin client — obrigatório para:
  // 1. Criar o usuário Auth via admin API (evita ID fake do signUp normal)
  // 2. Chamar o RPC sem depender do JWT da sessão atual
  // 3. Rollback (deletar usuário Auth órfão se o INSERT falhar)
  const adminClient = createAdminClient()
  if (!adminClient) {
    return {
      error: 'Serviço indisponível: chave de servidor não configurada (SUPABASE_SERVICE_ROLE_KEY). Entre em contato com o suporte.'
    }
  }

  // ── PASSO 1: Verificar duplicata de e-mail na tabela lojista ──────────────
  const { data: existente } = await adminClient
    .from('lojista')
    .select('id_lojista')
    .eq('email', parsed.data.email)
    .maybeSingle()

  if (existente) {
    return { error: 'Este e-mail já está cadastrado como lojista. Acesse a tela de login.' }
  }

  // ── PASSO 2: Criar usuário em auth.users via Admin API ────────────────────
  // Por que admin.createUser e não supabase.auth.signUp?
  // • signUp com email já existente retorna um ID *fake* (prevenção de enumeração)
  //   → esse ID não existe em auth.users → viola a FK da tabela lojista
  // • admin.createUser falha explicitamente se o email já existir
  // • email_confirm:true pula a etapa de confirmação → signIn funciona imediatamente
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.senha,
    email_confirm: true,
    user_metadata: { role: 'lojista', nome_loja: parsed.data.nome_loja },
  })

  if (authError) {
    console.error('[cadastroLojistaAction] admin.createUser error:', authError)
    const msg = authError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate') || msg.includes('registered')) {
      return { error: 'Este e-mail já está cadastrado. Acesse a tela de login para entrar na sua conta.' }
    }
    if (msg.includes('password') || msg.includes('weak')) {
      return { error: 'Senha inválida. Use pelo menos 8 caracteres com maiúscula, número e símbolo.' }
    }
    if (msg.includes('rate limit')) {
      return { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' }
    }
    return { error: `Não foi possível criar a conta: ${authError.message}. Verifique os dados e tente novamente.` }
  }

  if (!authData.user?.id) {
    return { error: 'Erro interno ao criar conta. Tente novamente.' }
  }

  // ── PASSO 3: Inserir na tabela lojista via RPC (sempre com adminClient) ───
  // adminClient usa service_role → não depende de JWT/sessão ativa
  const { error: rpcError } = await adminClient.rpc('fn_registrar_lojista', {
    p_id_lojista: authData.user.id,
    p_nome_loja: parsed.data.nome_loja,
    p_email: parsed.data.email,
    p_telefone: parsed.data.telefone,
    p_descricao: parsed.data.descricao ?? null,
    p_endereco: parsed.data.endereco ?? null,
    p_cidade: parsed.data.cidade ?? null,
    p_estado: parsed.data.estado ?? null,
    p_cep: parsed.data.cep ?? null,
  })

  if (rpcError) {
    console.error('[cadastroLojistaAction] RPC error:', rpcError)
    // Rollback: remove o usuário Auth para não deixar registro órfão
    await adminClient.auth.admin.deleteUser(authData.user.id)

    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists') || msg.includes('23505')) {
      return { error: 'Este e-mail já está cadastrado. Acesse a tela de login.' }
    }
    if (msg.includes('Could not find') || msg.includes('does not exist') || msg.includes('42883')) {
      return { error: 'Erro de configuração: função fn_registrar_lojista não encontrada no banco. Execute as migrations.' }
    }
    if (msg.includes('permission denied') || msg.includes('42501')) {
      return { error: 'Permissão negada no banco de dados. Verifique as configurações do Supabase.' }
    }
    return { error: `Não foi possível salvar os dados: ${msg || 'erro desconhecido'}. Tente novamente.` }
  }

  // Número da loja em campo próprio (migration 045). Fora do RPC de
  // propósito: sem a migration a coluna não existe, e o cadastro não
  // pode falhar por isso.
  const numeroLoja = (formData.get('numero') as string)?.trim().slice(0, 20)
  if (numeroLoja) {
    await adminClient.from('lojista').update({ numero: numeroLoja }).eq('id_lojista', authData.user.id)
  }

  // ── PASSO 4: Estabelecer sessão para o redirect ───────────────────────────
  // O adminClient não lida com cookies/sessão do browser.
  // Usamos o supabase client normal para fazer signIn e gravar o JWT nos cookies.
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (signInError) {
    // Cadastro salvo com sucesso, mas sessão não foi estabelecida.
    // Redireciona para login para o usuário entrar manualmente.
    console.error('[cadastroLojistaAction] signIn pós-cadastro falhou:', signInError.message)
    redirect('/login')
  }

  revalidatePath('/', 'layout')
  redirect('/lojista/dashboard')
}
// ============================================================
// COMPLETAR CADASTRO VIA GOOGLE OAUTH
// ============================================================
// Quando o usuário se registra via Google, ele já tem uma conta auth
// mas não tem registro na tabela cliente/lojista. Essas actions criam
// o registro faltante com os dados que o Google não fornece (CPF, telefone).

export async function completarCadastroClienteGoogleAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado. Faça login novamente.' }

  // Verificar se já tem perfil de cliente
  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.' }
  }

  const { data: existing } = await adminClient.from('cliente').select('id_cliente').eq('id_cliente', user.id).maybeSingle()
  if (existing) {
    redirect('/cliente/dashboard')
  }

  const raw = {
    cpf: (formData.get('cpf') as string).replace(/\D/g, ''),
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    aceita_termos: formData.get('aceita_termos') === 'on' ? true : undefined,
  }

  const parsed = completarCadastroClienteGoogleSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const nome = user.user_metadata?.full_name || user.user_metadata?.name || 'Usuário'
  const email = user.email!

  const { error: clienteError } = await adminClient.from('cliente').insert({
    id_cliente: user.id,
    nome,
    cpf: parsed.data.cpf,
    email,
    telefone: parsed.data.telefone,
  })

  if (clienteError) {
    const msg = clienteError.message?.toLowerCase() ?? ''
    if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
      if (msg.includes('cpf')) {
        return { error: 'Este CPF já está cadastrado.' }
      }
      if (msg.includes('email')) {
        return { error: 'Este e-mail já está cadastrado.' }
      }
      return { error: 'Dados duplicados. Verifique CPF e e-mail.' }
    }
    return { error: devError('Não foi possível completar o cadastro. Tente novamente.', clienteError.message) }
  }

  // Atualizar user_metadata com role
  await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, role: 'cliente', nome },
  })

  revalidatePath('/', 'layout')
  redirect('/cliente/dashboard')
}

export async function completarCadastroLojistaGoogleAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado. Faça login novamente.' }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.' }
  }

  // Verificar se já tem perfil de lojista
  const { data: existing } = await adminClient.from('lojista').select('id_lojista').eq('id_lojista', user.id).maybeSingle()
  if (existing) {
    redirect('/lojista/dashboard')
  }

  const raw = {
    nome_loja: formData.get('nome_loja') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    descricao: (formData.get('descricao') as string) || undefined,
    endereco: (formData.get('endereco') as string) || undefined,
    cidade: (formData.get('cidade') as string) || undefined,
    estado: (formData.get('estado') as string) || undefined,
    cep: (formData.get('cep') as string).replace(/\D/g, '') || undefined,
    aceita_termos: formData.get('aceita_termos') === 'on' ? true : undefined,
  }

  const parsed = completarCadastroLojistaGoogleSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  if (parsed.data.endereco?.trim() && !(formData.get('numero') as string)?.trim()) {
    return { error: 'Informe o número da loja (use S/N se não tiver).' }
  }

  const email = user.email!

  const { error: rpcError } = await adminClient.rpc('fn_registrar_lojista', {
    p_id_lojista: user.id,
    p_nome_loja: parsed.data.nome_loja,
    p_email: email,
    p_telefone: parsed.data.telefone,
    p_descricao: parsed.data.descricao ?? null,
    p_endereco: parsed.data.endereco ?? null,
    p_cidade: parsed.data.cidade ?? null,
    p_estado: parsed.data.estado ?? null,
    p_cep: parsed.data.cep ?? null,
  })

  if (rpcError) {
    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists') || msg.includes('23505')) {
      return { error: 'Este e-mail já está cadastrado como lojista.' }
    }
    return { error: devError('Não foi possível completar o cadastro. Tente novamente.', msg) }
  }

  // Número da loja em campo próprio (migration 045) — ver cadastroLojistaAction.
  const numeroLoja = (formData.get('numero') as string)?.trim().slice(0, 20)
  if (numeroLoja) {
    await adminClient.from('lojista').update({ numero: numeroLoja }).eq('id_lojista', user.id)
  }

  // Atualizar user_metadata com role
  await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, role: 'lojista', nome_loja: parsed.data.nome_loja },
  })

  revalidatePath('/', 'layout')
  redirect('/lojista/dashboard')
}


// ============================================================
// PET ACTIONS
// ============================================================

export async function criarPetAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const raw = {
    nome: formData.get('nome') as string,
    raca: formData.get('raca') as string,
    sexo: formData.get('sexo') as string,
    especie: (formData.get('especie') as string) || undefined,
    porte: (formData.get('porte') as string) || undefined,
    dt_nasc: formData.get('dt_nasc') as string,
    peso: formData.get('peso') ? parseFloat(formData.get('peso') as string) : undefined,
    obs: formData.get('obs') as string,
  }

  const parsed = petSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.from('pet').insert({
    id_cliente: user.id,
    ...parsed.data,
  })

  if (error) return { error: 'Erro ao cadastrar pet.' }

  revalidatePath('/cliente/pets')
  return { success: true }
}

export async function editarPetAction(id_pet: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const raw = {
    nome: formData.get('nome') as string,
    raca: formData.get('raca') as string,
    sexo: formData.get('sexo') as string,
    especie: (formData.get('especie') as string) || undefined,
    porte: (formData.get('porte') as string) || undefined,
    dt_nasc: formData.get('dt_nasc') as string,
    peso: formData.get('peso') ? parseFloat(formData.get('peso') as string) : undefined,
    obs: formData.get('obs') as string,
  }

  const parsed = petSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('pet')
    .update(parsed.data)
    .eq('id_pet', id_pet)
    .eq('id_cliente', user.id)

  if (error) return { error: 'Erro ao atualizar pet.' }

  revalidatePath('/cliente/pets')
  return { success: true }
}

// Complementar só espécie+porte de um pet que já existe, sem tocar no
// resto do cadastro (nome/raça/sexo/dt_nasc) — usado no link público de
// agendamento quando o pet ainda não tem essa classificação.
export async function atualizarClassificacaoPetAction(id_pet: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const raw = {
    especie: formData.get('especie') as string,
    porte: formData.get('porte') as string,
  }

  const parsed = classificacaoPetSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('pet')
    .update(parsed.data)
    .eq('id_pet', id_pet)
    .eq('id_cliente', user.id)

  if (error) return { error: devError('Erro ao atualizar informações do pet.', error.message) }

  return { success: true }
}

export async function desativarPetAction(id_pet: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('pet')
    .update({ ativo: false })
    .eq('id_pet', id_pet)
    .eq('id_cliente', user.id)

  if (error) return { error: 'Erro ao remover pet.' }

  revalidatePath('/cliente/pets')
  return { success: true }
}

// ============================================================
// SERVIÇO ACTIONS (Lojista)
// ============================================================

export async function criarServicoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }

  const raw = {
    nome: formData.get('nome') as string,
    descricao: formData.get('descricao') as string,
    preco: parseFloat(formData.get('preco') as string),
    duracao: parseInt(formData.get('duracao') as string),
    status: (formData.get('status') as string) || 'Ativo',
  }

  const parsed = servicoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // "Preços e Variações" podem vir junto já na criação (rascunho montado
  // no cliente antes de existir id_servico) — valida tudo ANTES de criar
  // o serviço, pra não salvar o serviço com variação inválida silenciosa.
  const variacoesRaw = formData.get('variacoes') as string | null
  const variacoesParsed: ServicoVariacaoData[] = []
  if (variacoesRaw) {
    let lista: unknown[]
    try {
      lista = JSON.parse(variacoesRaw)
    } catch {
      return { error: 'Dados de variação de preço inválidos.' }
    }
    for (const item of lista) {
      const r = servicoVariacaoSchema.safeParse(item)
      if (!r.success) return { error: `Variação de preço inválida: ${r.error.issues[0].message}` }
      variacoesParsed.push(r.data)
    }
  }

  const { data: novoServico, error } = await supabase
    .from('servico')
    .insert({ id_lojista: contexto.idLojista, ...parsed.data })
    .select('id_servico')
    .single()

  if (error || !novoServico) return { error: 'Erro ao cadastrar serviço.' }

  if (variacoesParsed.length > 0) {
    const { error: variacaoError } = await supabase.from('servico_variacao').insert(
      variacoesParsed.map(v => ({ id_servico: novoServico.id_servico, ...v }))
    )
    if (variacaoError) {
      revalidatePath('/lojista/servicos')
      return {
        error: 'Serviço criado, mas não foi possível salvar as variações de preço (talvez duplicadas). Edite o serviço para ajustar.',
      }
    }
  }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

export async function editarServicoAction(id_servico: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }

  const raw = {
    nome: formData.get('nome') as string,
    descricao: formData.get('descricao') as string,
    preco: parseFloat(formData.get('preco') as string),
    duracao: parseInt(formData.get('duracao') as string),
  }

  // Sem "status" aqui de propósito — esse formulário não tem mais o campo
  // (o switch da listagem já cuida disso via alternarStatusServicoAction).
  // Se voltasse a mandar status aqui, todo "Salvar Serviço" reativaria o
  // serviço mesmo que o lojista tivesse acabado de desativá-lo pelo switch.
  const parsed = servicoSchema.omit({ status: true }).safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('servico')
    .update(parsed.data)
    .eq('id_servico', id_servico)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: 'Erro ao atualizar serviço.' }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

// Toggle rápido de status Ativo/Inativo, direto na listagem — não abre o
// modal de edição inteiro. Serviço "Inativo" simplesmente para de
// aparecer pro cliente na hora de agendar (fn_criar_agendamento já
// filtra `status = 'Ativo'`); nada é excluído, histórico e agendamentos
// já existentes continuam intactos.
export async function alternarStatusServicoAction(id_servico: string, ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }

  const { error } = await supabase
    .from('servico')
    .update({ status: ativo ? 'Ativo' : 'Inativo' })
    .eq('id_servico', id_servico)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: devError('Erro ao atualizar status do serviço.', error.message) }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

// Exclusão de verdade (não é o toggle de status Ativo/Inativo). Só é
// possível quando o serviço nunca teve nenhum agendamento (nem
// cancelado) — a FK agendamento.id_servico é ON DELETE RESTRICT de
// propósito, pra nunca perder histórico. Por isso a checagem prévia
// aqui, pra devolver uma mensagem clara em vez do erro cru do banco.
export async function excluirServicoAction(id_servico: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const { count } = await supabase
    .from('agendamento')
    .select('id_agendamento', { count: 'exact', head: true })
    .eq('id_servico', id_servico)

  if (count && count > 0) {
    return {
      error: 'Este serviço já tem agendamentos (inclusive cancelados) e não pode ser excluído. Marque-o como "Inativo" em vez de excluir.',
    }
  }

  const { error } = await db
    .from('servico')
    .delete()
    .eq('id_servico', id_servico)
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '23503') {
      return { error: 'Este serviço tem agendamentos vinculados e não pode ser excluído. Marque-o como "Inativo" em vez de excluir.' }
    }
    return { error: 'Erro ao excluir serviço.' }
  }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

// "Preços e Variações": cobrar diferente por porte ou por raça
// específica para um serviço já existente. Ver migration 010
// (servico_variacao) e fn_calcular_preco_servico.
export async function adicionarVariacaoServicoAction(id_servico: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }

  const tipo = formData.get('tipo') as string
  const raw = tipo === 'raca'
    ? {
        tipo: 'raca' as const,
        especie: formData.get('especie') as string,
        raca: formData.get('raca') as string,
        preco: parseFloat(formData.get('preco') as string),
      }
    : {
        tipo: 'porte' as const,
        especie: formData.get('especie') as string,
        porte: formData.get('porte') as string,
        preco: parseFloat(formData.get('preco') as string),
      }

  const parsed = servicoVariacaoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Confere que o serviço é do lojista logado antes de inserir (defense
  // in depth — a policy de INSERT já garante isso, mas dá pra devolver
  // uma mensagem melhor aqui).
  const { data: servico } = await supabase
    .from('servico')
    .select('id_servico')
    .eq('id_servico', id_servico)
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()
  if (!servico) return { error: 'Serviço não encontrado' }

  const { error } = await supabase.from('servico_variacao').insert({
    id_servico,
    ...parsed.data,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Já existe uma faixa de preço cadastrada para essa combinação.' }
    }
    return { error: 'Erro ao cadastrar variação de preço.' }
  }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

export async function removerVariacaoServicoAction(id_variacao: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }

  const { error } = await supabase
    .from('servico_variacao')
    .delete()
    .eq('id_variacao', id_variacao)

  if (error) return { error: 'Erro ao remover variação de preço.' }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

// ============================================================
// PRODUTO ACTIONS (Lojista) — migration 037
// ============================================================
// Permissão própria (podeGerenciarProdutos, migration 040) — reaproveitava
// pode_gerenciar_servicos antes, mas Produtos cresceu (categorias, foto,
// estoque, venda no agendamento online) e ganhou peso suficiente pra ter
// uma entrada dedicada na tela de Equipe.

export async function criarProdutoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const raw = {
    nome: formData.get('nome') as string,
    id_categoria: formData.get('id_categoria') as string,
    unidade_venda: formData.get('unidade_venda') as string,
    preco_venda: parseFloat(formData.get('preco_venda') as string),
    estoque_atual: parseFloat((formData.get('estoque_atual') as string) || '0'),
    estoque_minimo: parseFloat((formData.get('estoque_minimo') as string) || '0'),
    disponivel_agendamento_online: formData.get('disponivel_agendamento_online') === 'true',
  }

  const parsed = produtoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const erroInteiro = erroQuantidadeInteira(parsed.data.unidade_venda, parsed.data.estoque_atual, parsed.data.estoque_minimo)
  if (erroInteiro) return { error: erroInteiro }

  const { data: novoProduto, error } = await supabase
    .from('produto')
    .insert({ id_lojista: contexto.idLojista, ...parsed.data })
    .select('*')
    .single()

  if (error || !novoProduto) return { error: devError('Erro ao cadastrar produto.', error?.message) }

  revalidatePath('/lojista/produtos')
  // Devolve a linha inteira pra tela mesclar direto no estado local, em
  // vez de reconsultar a tabela pelo client do navegador — esse refetch
  // separado é quem causava o "lista some inteira depois de criar" (o
  // resultado do próprio insert, feito pelo client do servidor, é sempre
  // confiável; um SELECT * solto pelo lado do cliente logo em seguida
  // não precisa existir).
  return { success: true, produto: novoProduto as Record<string, unknown> }
}

// Estoque atual fica de fora de propósito — depois de criado, só muda
// por uma movimentação (movimentarEstoqueAction), nunca sobrescrito
// direto na edição, senão a movimentação vira uma auditoria furada.
export async function editarProdutoAction(id_produto: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const raw = {
    nome: formData.get('nome') as string,
    id_categoria: formData.get('id_categoria') as string,
    unidade_venda: formData.get('unidade_venda') as string,
    preco_venda: parseFloat(formData.get('preco_venda') as string),
    estoque_minimo: parseFloat((formData.get('estoque_minimo') as string) || '0'),
    disponivel_agendamento_online: formData.get('disponivel_agendamento_online') === 'true',
  }

  const parsed = produtoSchema.omit({ estoque_atual: true }).safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const erroInteiro = erroQuantidadeInteira(parsed.data.unidade_venda, parsed.data.estoque_minimo)
  if (erroInteiro) return { error: erroInteiro }

  const { data: atualizado, error } = await supabase
    .from('produto')
    .update(parsed.data)
    .eq('id_produto', id_produto)
    .eq('id_lojista', contexto.idLojista)
    .select('*')
    .single()

  if (error || !atualizado) return { error: devError('Erro ao atualizar produto.', error?.message) }

  revalidatePath('/lojista/produtos')
  // Mesmo motivo do criarProdutoAction: devolve a linha atualizada pra
  // mesclar direto no estado, sem depender de um refetch separado.
  return { success: true, produto: atualizado as Record<string, unknown> }
}

export async function alternarStatusProdutoAction(id_produto: string, ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const { error } = await supabase
    .from('produto')
    .update({ status: ativo ? 'Ativo' : 'Inativo' })
    .eq('id_produto', id_produto)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: devError('Erro ao atualizar status do produto.', error.message) }

  revalidatePath('/lojista/produtos')
  return { success: true }
}

// Adicionar ou remover estoque — via fn_movimentar_estoque (migration
// 037), que atualiza produto.estoque_atual e grava o histórico de forma
// atômica, e é o mesmo ponto que uma venda futura vai usar pra dar baixa
// automática (origem='venda', não usada por esta action).
export async function movimentarEstoqueAction(id_produto: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const parsed = movimentoEstoqueSchema.safeParse({
    tipo: formData.get('tipo'),
    quantidade: parseFloat(formData.get('quantidade') as string),
    motivo: (formData.get('motivo') as string) || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: produtoAtual } = await supabase.from('produto').select('unidade_venda').eq('id_produto', id_produto).maybeSingle()
  const erroInteiro = produtoAtual ? erroQuantidadeInteira(produtoAtual.unidade_venda, parsed.data.quantidade) : null
  if (erroInteiro) return { error: erroInteiro }

  const { data: novoEstoque, error } = await supabase.rpc('fn_movimentar_estoque', {
    p_id_produto: id_produto,
    p_tipo: parsed.data.tipo,
    p_quantidade: parsed.data.quantidade,
    p_motivo: parsed.data.motivo ?? null,
  })

  if (error) return { error: error.message }

  revalidatePath('/lojista/produtos')
  return { success: true, novoEstoque: novoEstoque as number }
}

// Exclusão é só lojista/administrador (mesma regra de
// excluirServicoAction). Desde a migration 040, ter movimentação de
// estoque não trava mais a exclusão (movimento_estoque tem ON DELETE
// CASCADE em produto) — só um produto já vendido de verdade pelo
// agendamento online barra (agendamento_produto é ON DELETE RESTRICT,
// ver catch do código 23503 abaixo), pra não quebrar o histórico de
// compras do cliente.
export async function excluirProdutoAction(id_produto: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const { error } = await db
    .from('produto')
    .delete()
    .eq('id_produto', id_produto)
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '23503') {
      return { error: 'Este produto já foi vendido pelo agendamento online e não pode ser excluído. Marque-o como "Inativo" em vez de excluir.' }
    }
    return { error: 'Erro ao excluir produto.' }
  }

  revalidatePath('/lojista/produtos')
  return { success: true }
}

// ============================================================
// CATEGORIA DE PRODUTO ACTIONS (Lojista) — migration 038
// ============================================================
// Cada loja cria/renomeia/apaga as próprias categorias — deixou de ser
// uma lista fixa. Toda loja já nasce com 5 categorias padrão (trigger
// fn_seed_categorias_produto), então isso aqui é só pra quem quer
// ajustar essa lista, não pra montar o catálogo do zero.

export async function criarCategoriaProdutoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const parsed = categoriaProdutoSchema.safeParse({ nome: formData.get('nome') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: nova, error } = await supabase
    .from('categoria_produto')
    .insert({ id_lojista: contexto.idLojista, nome: parsed.data.nome.trim() })
    .select('id_categoria, nome')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma categoria com esse nome.' }
    return { error: devError('Erro ao criar categoria.', error.message) }
  }

  revalidatePath('/lojista/produtos')
  return { success: true, categoria: nova }
}

export async function editarCategoriaProdutoAction(id_categoria: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const parsed = categoriaProdutoSchema.safeParse({ nome: formData.get('nome') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('categoria_produto')
    .update({ nome: parsed.data.nome.trim() })
    .eq('id_categoria', id_categoria)
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma categoria com esse nome.' }
    return { error: devError('Erro ao renomear categoria.', error.message) }
  }

  revalidatePath('/lojista/produtos')
  return { success: true }
}

// Apagar a categoria não apaga os produtos dela (ON DELETE SET NULL) —
// eles só ficam "sem categoria" e continuam aparecendo normalmente.
export async function excluirCategoriaProdutoAction(id_categoria: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const { error } = await supabase
    .from('categoria_produto')
    .delete()
    .eq('id_categoria', id_categoria)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: devError('Erro ao excluir categoria.', error.message) }

  revalidatePath('/lojista/produtos')
  return { success: true }
}

// ============================================================
// FOTO DO PRODUTO (migration 038 — bucket 'fotos-produto')
// ============================================================
// Mesmo padrão de atualizarLogoLojistaAction/atualizarFotoPetAction:
// {id_lojista}/{id_produto}.{ext}, apagando o que já existe na pasta
// antes de subir a nova imagem, e conferindo o CONTEÚDO do arquivo
// (magic numbers), não a extensão declarada pelo navegador.

const PRODUTO_FOTO_BUCKET = 'fotos-produto'
const PRODUTO_FOTO_TAMANHO_MAXIMO = 5 * 1024 * 1024 // 5 MB

async function limparFotoDoProduto(db: Awaited<ReturnType<typeof createClient>>, idLojista: string, idProduto: string) {
  const { data: existentes } = await db.storage.from(PRODUTO_FOTO_BUCKET).list(idLojista)
  const doProduto = existentes?.filter(f => f.name.startsWith(`${idProduto}.`)) ?? []
  if (doProduto.length > 0) {
    await db.storage.from(PRODUTO_FOTO_BUCKET).remove(doProduto.map(f => `${idLojista}/${f.name}`))
  }
}

export async function atualizarFotoProdutoAction(
  id_produto: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean; url?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  // O produto precisa ser da própria loja — o client admin usado por um
  // funcionário ignora RLS, então essa checagem aqui (com o client
  // normal, que passa por RLS) é quem garante o isolamento entre lojas.
  const { data: produto } = await supabase
    .from('produto')
    .select('id_produto')
    .eq('id_produto', id_produto)
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()
  if (!produto) return { error: 'Produto não encontrado.' }

  const arquivo = formData.get('foto') as File | null
  if (!arquivo || arquivo.size === 0) return { error: 'Selecione uma imagem.' }
  if (arquivo.size > PRODUTO_FOTO_TAMANHO_MAXIMO) return { error: 'Imagem muito grande. O limite é 5 MB.' }

  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const extensao = detectarExtensaoImagem(bytes)
  if (!extensao) return { error: 'Formato de imagem inválido. Envie um arquivo JPG, PNG ou WEBP.' }

  await limparFotoDoProduto(db, contexto.idLojista, id_produto)

  const caminho = `${contexto.idLojista}/${id_produto}.${extensao}`
  const { error: uploadError } = await db.storage
    .from(PRODUTO_FOTO_BUCKET)
    .upload(caminho, bytes, {
      contentType: extensao === 'jpg' ? 'image/jpeg' : `image/${extensao}`,
      upsert: true,
    })

  if (uploadError) {
    return { error: devError('Não foi possível enviar a imagem. Tente novamente.', uploadError.message) }
  }

  const { data: { publicUrl } } = db.storage.from(PRODUTO_FOTO_BUCKET).getPublicUrl(caminho)
  const urlComVersao = `${publicUrl}?v=${Date.now()}`

  const { error: dbError } = await db
    .from('produto')
    .update({ foto_url: urlComVersao })
    .eq('id_produto', id_produto)
    .eq('id_lojista', contexto.idLojista)

  if (dbError) {
    return { error: devError('Imagem enviada, mas não foi possível salvar a referência. Tente novamente.', dbError.message) }
  }

  revalidatePath('/lojista/produtos')
  return { success: true, url: urlComVersao }
}

export async function removerFotoProdutoAction(id_produto: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  await limparFotoDoProduto(db, contexto.idLojista, id_produto)

  const { error } = await db
    .from('produto')
    .update({ foto_url: null })
    .eq('id_produto', id_produto)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: devError('Não foi possível remover a imagem. Tente novamente.', error.message) }

  revalidatePath('/lojista/produtos')
  return { success: true }
}

// ============================================================
// HORÁRIO ACTIONS (Lojista)
// ============================================================

export async function salvarHorarioAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const raw = {
    dia_semana: formData.get('dia_semana') as string,
    hr_inicio: formData.get('hr_inicio') as string,
    hr_fim: formData.get('hr_fim') as string,
  }

  const parsed = horarioSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Upsert por lojista + dia_semana
  const { error } = await db.from('horario').upsert(
    { id_lojista: contexto.idLojista, ...parsed.data },
    { onConflict: 'id_lojista,dia_semana' }
  )

  if (error) return { error: 'Erro ao salvar horário.' }

  revalidatePath('/lojista/horarios')
  return { success: true }
}

// Mesma coisa que salvarHorarioAction, mas pra vários dias de uma vez
// com o mesmo horário (ex.: Segunda a Sexta das 09h às 22h) — reaproveita
// horarioSchema pra validar cada dia individualmente antes de gravar.
export async function salvarHorariosEmLoteAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const dias = formData.getAll('dias') as string[]
  const hr_inicio = formData.get('hr_inicio') as string
  const hr_fim = formData.get('hr_fim') as string

  if (dias.length === 0) return { error: 'Selecione pelo menos um dia da semana.' }

  const linhas: { id_lojista: string; dia_semana: string; hr_inicio: string; hr_fim: string }[] = []
  for (const dia_semana of dias) {
    const parsed = horarioSchema.safeParse({ dia_semana, hr_inicio, hr_fim })
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    linhas.push({ id_lojista: contexto.idLojista, ...parsed.data })
  }

  const { error } = await db
    .from('horario')
    .upsert(linhas, { onConflict: 'id_lojista,dia_semana' })

  if (error) return { error: 'Erro ao salvar horários.' }

  revalidatePath('/lojista/horarios')
  return { success: true }
}

export async function toggleHorarioAction(id_horario: string, ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const { error } = await db
    .from('horario')
    .update({ ativo })
    .eq('id_horario', id_horario)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: devError('Erro ao atualizar horário.', error.message) }

  revalidatePath('/lojista/horarios')
  return { success: true }
}

// ============================================================
// AGENDAMENTO ACTIONS
// ============================================================

// Forma de pagamento do pedido (migration 057) — obrigatória em todo
// agendamento novo. O banco confere de novo se a loja aceita.
function lerFormaPagamento(formData: FormData): { forma?: FormaPagamento; erro?: string } {
  const forma = formData.get('forma_pagamento')
  if (!ehFormaPagamento(forma)) return { erro: 'Escolha a forma de pagamento.' }
  return { forma }
}

// Função "com pagamento" ainda não existe no banco.
function faltaMigrationPagamento(error: { message: string; code?: string }): boolean {
  return (error.code === 'PGRST202' || error.message.includes('Could not find the function')) && error.message.includes('com_pagamento')
}
const MSG_MIGRATION_PAGAMENTO = 'Para agendar com forma de pagamento, execute a migration 057_formas_pagamento.sql.'

export async function criarAgendamentoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'cliente') {
    return { error: 'Acesso não autorizado' }
  }

  // Produtos são opcionais (migration 039) — só vêm quando o cliente
  // escolheu algum na tela de confirmação.
  let produtos: unknown
  try {
    produtos = JSON.parse((formData.get('produtos') as string) || '[]')
  } catch {
    return { error: 'Produtos inválidos.' }
  }

  const raw = {
    id_lojista: formData.get('id_lojista') as string,
    id_pet: formData.get('id_pet') as string,
    id_servico: formData.get('id_servico') as string,
    dt_agendamento: formData.get('dt_agendamento') as string,
    hr_agendamento: formData.get('hr_agendamento') as string,
    obs: formData.get('obs') as string,
    produtos,
  }

  const parsed = agendamentoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // TaxiDog opcional (migration 042) — sem ele, o caminho é o de sempre.
  // O cliente não escolhe quem faz a corrida (só a loja).
  const taxidog = lerTaxiDogDoFormulario(formData, { semEscolhaDeTaxiDog: true })
  if (taxidog.erro) return { error: taxidog.erro }
  const pagamento = lerFormaPagamento(formData)
  if (pagamento.erro) return { error: pagamento.erro }

  const paramsAgendamento = {
    p_forma_pagamento: pagamento.forma,
    p_id_pet: parsed.data.id_pet,
    p_id_servico: parsed.data.id_servico,
    p_id_cliente: user.id,
    p_id_lojista: parsed.data.id_lojista,
    p_data: parsed.data.dt_agendamento,
    p_hora: parsed.data.hr_agendamento,
    p_obs: parsed.data.obs || null,
    p_produtos: parsed.data.produtos?.map(p => p.id_produto) ?? null,
    p_quantidades: parsed.data.produtos?.map(p => p.quantidade) ?? null,
  }

  // Chamar função do banco que possui lock anti-double-booking
  const { data, error } = taxidog.dados
    ? await supabase.rpc('fn_criar_agendamento_com_taxidog_com_pagamento', {
        ...paramsAgendamento,
        ...paramsRpcTaxiDog(
          taxidog.dados,
          await coordenadasParaTaxiDog(supabase, parsed.data.id_lojista, taxidog.dados.endereco)
        ),
      })
    : await supabase.rpc('fn_criar_agendamento_com_pagamento', paramsAgendamento)

  if (error) {
    if (faltaMigrationPagamento(error)) return { error: MSG_MIGRATION_PAGAMENTO }
    const erroPagamento = mensagemErroPagamento(error.message)
    if (erroPagamento) return { error: erroPagamento }
    const erroTaxiDog = mensagemErroTaxiDog(error.message)
    if (erroTaxiDog) return { error: erroTaxiDog }
    if (error.message.includes('Horário não disponível')) {
      return { error: 'Horário não disponível. Escolha outro horário.' }
    }
    if (error.message.includes('não está aceitando agendamentos online')) {
      return { error: 'Este petshop não está aceitando agendamentos online no momento. Entre em contato diretamente com a loja.' }
    }
    // Mensagens de produto (estoque insuficiente, produto não mais
    // disponível) já vêm prontas pra mostrar — não são detalhe técnico.
    if (error.message.includes('Estoque insuficiente') || error.message.includes('produtos escolhidos não está')) {
      return { error: error.message }
    }
    return { error: devError('Erro ao criar agendamento. Tente novamente.', error.message) }
  }

  revalidatePath('/cliente/agendamentos')
  return { success: true, id_agendamento: data }
}

// Carrinho com um ou mais serviços, criado a partir do link público de
// agendamento da loja (/agendamento/[id_lojista]) — ver
// fn_criar_agendamento_multiplo (migration 022). Cria um agendamento por
// serviço, encadeados, numa transação só (ou agenda tudo, ou nada).
export async function criarAgendamentoOnlineAction(
  formData: FormData
): Promise<{ error?: string; success?: boolean; ids_agendamento?: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'cliente') {
    return { error: 'Acesso não autorizado' }
  }

  let servicos: unknown
  try {
    servicos = JSON.parse((formData.get('servicos') as string) || '[]')
  } catch {
    return { error: 'Serviços inválidos.' }
  }

  let produtos: unknown
  try {
    produtos = JSON.parse((formData.get('produtos') as string) || '[]')
  } catch {
    return { error: 'Produtos inválidos.' }
  }

  const raw = {
    id_lojista: formData.get('id_lojista') as string,
    id_pet: formData.get('id_pet') as string,
    id_funcionario: (formData.get('id_funcionario') as string) || null,
    servicos,
    dt_agendamento: formData.get('dt_agendamento') as string,
    hr_agendamento: formData.get('hr_agendamento') as string,
    obs: formData.get('obs') as string,
    produtos,
  }

  const parsed = agendamentoOnlineSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const taxidog = lerTaxiDogDoFormulario(formData, { semEscolhaDeTaxiDog: true })
  if (taxidog.erro) return { error: taxidog.erro }
  const pagamento = lerFormaPagamento(formData)
  if (pagamento.erro) return { error: pagamento.erro }

  const paramsAgendamento = {
    p_forma_pagamento: pagamento.forma,
    p_id_pet: parsed.data.id_pet,
    p_id_cliente: user.id,
    p_id_lojista: parsed.data.id_lojista,
    p_data: parsed.data.dt_agendamento,
    p_hora_inicio: parsed.data.hr_agendamento,
    p_servicos: parsed.data.servicos,
    p_id_funcionario: parsed.data.id_funcionario || null,
    p_obs: parsed.data.obs || null,
    p_produtos: parsed.data.produtos?.map(p => p.id_produto) ?? null,
    p_quantidades: parsed.data.produtos?.map(p => p.quantidade) ?? null,
  }

  const { data, error } = taxidog.dados
    ? await supabase.rpc('fn_criar_agendamento_multiplo_com_taxidog_com_pagamento', {
        ...paramsAgendamento,
        ...paramsRpcTaxiDog(
          taxidog.dados,
          await coordenadasParaTaxiDog(supabase, parsed.data.id_lojista, taxidog.dados.endereco)
        ),
      })
    : await supabase.rpc('fn_criar_agendamento_multiplo_com_pagamento', paramsAgendamento)

  if (error) {
    if (faltaMigrationPagamento(error)) return { error: MSG_MIGRATION_PAGAMENTO }
    const erroPagamento = mensagemErroPagamento(error.message)
    if (erroPagamento) return { error: erroPagamento }
    const erroTaxiDog = mensagemErroTaxiDog(error.message)
    if (erroTaxiDog) return { error: erroTaxiDog }
    if (error.message.includes('Horário não disponível')) {
      return { error: 'Horário não disponível. Escolha outro horário.' }
    }
    if (error.message.includes('não está aceitando agendamentos online')) {
      return { error: 'Este petshop não está aceitando agendamentos online no momento. Entre em contato diretamente com a loja.' }
    }
    if (error.message.includes('fora do funcionamento')) {
      return { error: 'Esse horário não cabe dentro do funcionamento da loja para os serviços escolhidos. Escolha outro horário.' }
    }
    if (error.message.includes('Estoque insuficiente') || error.message.includes('produtos escolhidos não está')) {
      return { error: error.message }
    }
    return { error: devError('Erro ao criar agendamento. Tente novamente.', error.message) }
  }

  revalidatePath('/cliente/agendamentos')
  return { success: true, ids_agendamento: data ?? [] }
}

// Agendamento manual criado pelo LOJISTA (walk-in / telefone) para um
// cliente que já existe na base dele. Ação separada de
// criarAgendamentoAction (que é do cliente) porque as regras de quem pode
// chamar e o status inicial são diferentes — ver fn_criar_agendamento_lojista
// (migration 008) e agendamentoLojistaSchema.
export async function criarAgendamentoLojistaAction(
  formData: FormData
): Promise<{ error?: string; success?: boolean; id_agendamento?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarAgenda) return { error: 'Você não tem permissão para gerenciar a agenda.' }

  const raw = {
    id_lojista: contexto.idLojista,
    id_cliente: formData.get('id_cliente') as string,
    id_pet: formData.get('id_pet') as string,
    id_servico: formData.get('id_servico') as string,
    dt_agendamento: formData.get('dt_agendamento') as string,
    hr_agendamento: formData.get('hr_agendamento') as string,
    obs: (formData.get('obs') as string) || undefined,
  }

  const parsed = agendamentoLojistaSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // TaxiDog opcional também no agendamento da loja (migration 047).
  const taxidog = lerTaxiDogDoFormulario(formData)
  if (taxidog.erro) return { error: taxidog.erro }
  // Pagamento obrigatório (migration 057): a loja pode lançar já "pago".
  const pagamento = lerFormaPagamento(formData)
  if (pagamento.erro) return { error: pagamento.erro }
  const statusPagamento = formData.get('status_pagamento') === 'pago' ? 'pago' : 'pendente'

  const paramsAgendamento = {
    p_forma_pagamento: pagamento.forma,
    p_status_pagamento: statusPagamento,
    p_id_lojista: parsed.data.id_lojista,
    p_id_cliente: parsed.data.id_cliente,
    p_id_pet: parsed.data.id_pet,
    p_id_servico: parsed.data.id_servico,
    p_data: parsed.data.dt_agendamento,
    p_hora: parsed.data.hr_agendamento,
    p_obs: parsed.data.obs || null,
  }

  const { data, error } = taxidog.dados
    ? await supabase.rpc('fn_criar_agendamento_lojista_com_taxidog_com_pagamento', {
        ...paramsAgendamento,
        ...paramsRpcTaxiDog(
          taxidog.dados,
          await coordenadasParaTaxiDog(supabase, parsed.data.id_lojista, taxidog.dados.endereco, true)
        ),
      })
    : await supabase.rpc('fn_criar_agendamento_lojista_com_pagamento', paramsAgendamento)

  if (error) {
    if (faltaMigrationPagamento(error)) return { error: MSG_MIGRATION_PAGAMENTO }
    const erroPagamento = mensagemErroPagamento(error.message)
    if (erroPagamento) return { error: erroPagamento }
    const erroTaxiDog = mensagemErroTaxiDog(error.message)
    if (erroTaxiDog) return { error: erroTaxiDog }
    if (taxidog.dados && (error.code === 'PGRST202' || error.message.includes('Could not find'))) {
      return { error: 'Para agendar com TaxiDog pela loja, execute a migration 047_taxidog_agendamento_loja_e_escolha.sql.' }
    }
    if (error.message.includes('does not exist') || error.message.includes('Could not find') || error.code === '42883') {
      return { error: 'Função fn_criar_agendamento_lojista não encontrada no banco. Execute a migration 008_fn_criar_agendamento_lojista.sql.' }
    }
    return {
      error: error.message.includes('Horário não disponível')
        ? 'Horário não disponível. Escolha outro horário.'
        : error.message.includes('histórico')
          ? 'Este cliente ainda não possui agendamentos com o seu petshop.'
          : 'Erro ao criar agendamento. Tente novamente.'
    }
  }

  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/agendamentos')
  return { success: true, id_agendamento: data }
}

export async function cancelarAgendamentoAction(id_agendamento: string, motivo?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.rpc('fn_cancelar_agendamento', {
    p_id_agendamento: id_agendamento,
    p_motivo: motivo || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/cliente/agendamentos')
  revalidatePath('/lojista/agendamentos')
  return { success: true }
}

export async function atualizarStatusAgendamentoAction(
  id_agendamento: string,
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarAgenda) return { error: 'Você não tem permissão para gerenciar a agenda.' }

  // O status não pode voltar — nem por drag-and-drop, nem por uma chamada
  // direta a esta action (o front já bloqueia isso, mas quem garante de
  // verdade é aqui: busca o status atual antes de aceitar a mudança).
  const { data: atual, error: buscaError } = await supabase
    .from('agendamento')
    .select('status, dt_agendamento')
    .eq('id_agendamento', id_agendamento)
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()

  if (buscaError || !atual) return { error: 'Agendamento não encontrado.' }
  if (etapaExigeDia(status) && atual.dt_agendamento > hojeBrasilISO()) {
    const [, mes, dia] = atual.dt_agendamento.split('-')
    return { error: `Este agendamento é para ${dia}/${mes} — o atendimento só pode ser iniciado ou finalizado a partir desse dia.` }
  }
  if (etapaEncerrada(atual.status)) {
    return { error: 'Este agendamento já foi finalizado e não pode mais mudar de status.' }
  }
  if (status !== 'Cancelado') {
    const ordemAtual = ORDEM_ETAPA[atual.status as keyof typeof ORDEM_ETAPA] ?? 0
    const ordemNova = ORDEM_ETAPA[status as keyof typeof ORDEM_ETAPA] ?? 0
    if (ordemNova <= ordemAtual) {
      return { error: 'Não é possível voltar para uma etapa anterior.' }
    }
  }

  const updateData: Record<string, string> = { status }
  if (status === 'Cancelado') {
    updateData.cancelado_por = contexto.role === 'funcionario' ? 'funcionario' : 'lojista'
  }

  const { error } = await supabase
    .from('agendamento')
    .update(updateData)
    .eq('id_agendamento', id_agendamento)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: devError('Erro ao atualizar status.', error.message) }

  revalidatePath('/lojista/agendamentos')
  return { success: true }
}

// Atribui (ou remove, se id_funcionario vier null) o profissional
// responsável por um agendamento. Ver migration 012 — todo agendamento
// nasce sem funcionário, mesmo os que o cliente cria sozinho; o
// lojista (ou um funcionário com permissão de agenda) atribui
// manualmente pela tela de agenda.
export async function atribuirFuncionarioAction(id_agendamento: string, id_funcionario: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  // Só o responsável pela conta ou um administrador (funcionário com
  // acesso_total) pode atribuir/trocar o profissional responsável — um
  // funcionário comum, mesmo com "Gerenciar Agenda", não pode se
  // auto-atribuir nem reatribuir outro agendamento.
  if (!contexto.acessoTotal) return { error: 'Apenas administradores podem atribuir o profissional responsável.' }

  if (id_funcionario) {
    const { data: func } = await supabase
      .from('funcionario')
      .select('id_funcionario')
      .eq('id_funcionario', id_funcionario)
      .eq('id_lojista', contexto.idLojista)
      .eq('ativo', true)
      .maybeSingle()
    if (!func) return { error: 'Funcionário não encontrado ou inativo' }
  }

  const { error } = await supabase
    .from('agendamento')
    .update({ id_funcionario })
    .eq('id_agendamento', id_agendamento)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: devError('Erro ao atribuir profissional.', error.message) }

  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/dashboard')
  return { success: true }
}

// ============================================================
// PERFIL LOJISTA ACTION
// ============================================================

export async function atualizarPerfilLojistaAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const nome_loja = (formData.get('nome_loja') as string)?.trim()
  const telefone = (formData.get('telefone') as string)?.replace(/\D/g, '')
  const descricao = (formData.get('descricao') as string)?.trim() || null
  const endereco = (formData.get('endereco') as string)?.trim() || null
  const cidade = (formData.get('cidade') as string)?.trim() || null
  const estado = (formData.get('estado') as string)?.trim().toUpperCase().slice(0, 2) || null
  const cepRaw = (formData.get('cep') as string)?.replace(/\D/g, '')
  const cep = cepRaw?.length === 8 ? cepRaw : null
  // Migration 045: número, complemento e bairro em campos próprios
  // (`endereco` passa a ser só a rua).
  const numero = (formData.get('numero') as string)?.trim().slice(0, 20) || null
  const complemento = (formData.get('complemento') as string)?.trim().slice(0, 80) || null
  const bairro = (formData.get('bairro') as string)?.trim().slice(0, 80) || null

  if (!nome_loja || nome_loja.length < 2) return { error: 'Nome da loja inválido' }
  if (!telefone || !/^\d{10,11}$/.test(telefone)) return { error: 'Telefone inválido' }
  if (endereco && !numero) return { error: 'Informe o número da loja no campo Número (use S/N se não tiver).' }

  const { error } = await db
    .from('lojista')
    .update({ nome_loja, telefone, descricao, endereco, cidade, estado, cep })
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: 'Erro ao atualizar perfil.' }

  // Separado de propósito: sem a migration 045 as colunas não existem, e
  // isso não pode impedir de salvar o resto do perfil.
  const { error: enderecoError } = await db
    .from('lojista')
    .update({ numero, complemento, bairro })
    .eq('id_lojista', contexto.idLojista)

  revalidatePath('/lojista/perfil')
  if (enderecoError) {
    return { error: devError('Perfil salvo, mas o número, o complemento e o bairro precisam da migration 045_endereco_loja.sql.', enderecoError.message) }
  }
  return { success: true }
}

// ============================================================
// LOGO DA LOJA (migration 021 — bucket 'logos-loja')
// ============================================================
const LOGO_BUCKET = 'logos-loja'
// Mesmo limite configurado no bucket (migration 021) — o Storage já
// recusa no nível de API, isso aqui é só pra dar um erro amigável antes
// de sequer tentar o upload.
const LOGO_TAMANHO_MAXIMO = 5 * 1024 * 1024 // 5 MB

// Confere os primeiros bytes do arquivo (magic numbers), não o nome nem
// o Content-Type declarado pelo navegador — os dois são fáceis de
// forjar; o conteúdo real do arquivo não. Defesa em profundidade: o
// preview/otimização já roda no navegador, mas o servidor nunca confia
// só nisso.
function detectarExtensaoImagem(bytes: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50   // "WEBP"
  ) return 'webp'
  return null
}

// Apaga tudo que já existe na pasta do lojista antes de subir uma nova
// imagem — evita ficar com arquivo órfão no Storage quando o formato
// muda entre um upload e outro (ex.: era .png, virou .webp), sem
// precisar fixar uma extensão única pra sempre.
async function limparPastaDoLojista(supabase: Awaited<ReturnType<typeof createClient>>, idLojista: string) {
  const { data: existentes } = await supabase.storage.from(LOGO_BUCKET).list(idLojista)
  if (existentes && existentes.length > 0) {
    await supabase.storage.from(LOGO_BUCKET).remove(existentes.map(f => `${idLojista}/${f.name}`))
  }
}

export async function atualizarLogoLojistaAction(
  formData: FormData
): Promise<{ error?: string; success?: boolean; url?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const arquivo = formData.get('logo') as File | null
  if (!arquivo || arquivo.size === 0) {
    return { error: 'Selecione uma imagem.' }
  }
  if (arquivo.size > LOGO_TAMANHO_MAXIMO) {
    return { error: 'Imagem muito grande. O limite é 5 MB.' }
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const extensao = detectarExtensaoImagem(bytes)
  if (!extensao) {
    return { error: 'Formato de imagem inválido. Envie um arquivo JPG, PNG ou WEBP.' }
  }

  await limparPastaDoLojista(db, contexto.idLojista)

  const caminho = `${contexto.idLojista}/logo.${extensao}`
  const { error: uploadError } = await db.storage
    .from(LOGO_BUCKET)
    .upload(caminho, bytes, {
      contentType: extensao === 'jpg' ? 'image/jpeg' : `image/${extensao}`,
      upsert: true,
    })

  if (uploadError) {
    console.error('[atualizarLogoLojistaAction] upload error:', uploadError.message)
    return { error: devError('Não foi possível enviar a imagem. Tente novamente.', uploadError.message) }
  }

  const { data: { publicUrl } } = db.storage.from(LOGO_BUCKET).getPublicUrl(caminho)
  // Cache-busting: o caminho pode ser idêntico ao da imagem anterior
  // (mesma extensão) — sem isso, o navegador continuaria mostrando a
  // versão antiga em cache mesmo depois de trocar a imagem.
  const urlComVersao = `${publicUrl}?v=${Date.now()}`

  const { error: dbError } = await db
    .from('lojista')
    .update({ logo_url: urlComVersao })
    .eq('id_lojista', contexto.idLojista)

  if (dbError) {
    return { error: devError('Imagem enviada, mas não foi possível salvar a referência. Tente novamente.', dbError.message) }
  }

  revalidatePath('/lojista/perfil')
  return { success: true, url: urlComVersao }
}

export async function removerLogoLojistaAction(): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  await limparPastaDoLojista(db, contexto.idLojista)

  const { error } = await db.from('lojista').update({ logo_url: null }).eq('id_lojista', contexto.idLojista)
  if (error) {
    return { error: devError('Não foi possível remover a imagem. Tente novamente.', error.message) }
  }

  revalidatePath('/lojista/perfil')
  return { success: true }
}

// Liga/desliga o Kanban de agendamentos (migration 013). Mesmo padrão
// de toggleHorarioAction/toggleFuncionarioAction — troca só essa coluna,
// sem passar pelo formulário inteiro de perfil.
export async function alternarKanbanAction(ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const { error } = await db
    .from('lojista')
    .update({ kanban_ativo: ativo })
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '42703' || error.message?.includes('kanban_ativo')) {
      return { error: 'Coluna kanban_ativo não encontrada no banco. Execute a migration 013_lojista_kanban_ativo.sql.' }
    }
    return { error: 'Erro ao atualizar configuração do Kanban.' }
  }

  revalidatePath('/lojista/perfil')
  revalidatePath('/lojista', 'layout')
  return { success: true }
}

// Liga/desliga o agendamento online (migration 020) — mesmo padrão de
// alternarKanbanAction, só troca a coluna. Não mexe em nada da RPC de
// agendamento do lojista (walk-in continua funcionando sempre); só
// fn_criar_agendamento (a do cliente) passa a checar essa coluna.
export async function alternarAgendamentoOnlineAction(ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const { error } = await db
    .from('lojista')
    .update({ aceita_agendamento_online: ativo })
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '42703' || error.message?.includes('aceita_agendamento_online')) {
      return { error: 'Coluna aceita_agendamento_online não encontrada no banco. Execute a migration 020_configuracoes_loja.sql.' }
    }
    return { error: 'Erro ao atualizar configuração de agendamento online.' }
  }

  revalidatePath('/lojista/configuracoes/agendamentos')
  revalidatePath('/lojista/configuracoes')
  revalidatePath('/cliente/novo-agendamento')
  return { success: true }
}

// Som de novos agendamentos (migration 036) — ativo + qual dos 5 sons,
// salvos juntos num "Salvar alterações" só (diferente do toggle solo do
// Kanban/Agendamento Online, que salva na hora). revalidatePath('/lojista',
// 'layout') é o que importa aqui: é o layout que lê essas duas colunas pra
// alimentar o listener de Realtime (NotificacaoNovoAgendamento), então
// precisa recarregar em QUALQUER página do painel, não só nesta tela.
export async function atualizarSomNotificacaoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const parsed = somNotificacaoSchema.safeParse({
    ativo: formData.get('ativo') === 'true',
    tipo: formData.get('tipo'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await db
    .from('lojista')
    .update({
      som_novo_agendamento_ativo: parsed.data.ativo,
      som_novo_agendamento_tipo: parsed.data.tipo,
    })
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '42703' || error.message?.includes('som_novo_agendamento')) {
      return { error: 'Colunas de som ainda não encontradas no banco. Execute a migration 036_som_novo_agendamento.sql.' }
    }
    return { error: devError('Erro ao salvar a configuração de som.', error.message) }
  }

  revalidatePath('/lojista/configuracoes/notificacoes')
  revalidatePath('/lojista', 'layout')
  return { success: true }
}

// Link personalizado de agendamento (/agendamento/[slug]) — migration 024.
// Unicidade é garantida pelo UNIQUE do banco; aqui só traduz a violação
// (código 23505) numa mensagem amigável, sem checar disponibilidade
// antes (evita race condition entre checar e salvar).
export async function atualizarSlugLojistaAction(formData: FormData): Promise<{ error?: string; success?: boolean; slug?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const raw = { slug: ((formData.get('slug') as string) || '').trim().toLowerCase() }
  const parsed = slugLojistaSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await db
    .from('lojista')
    .update({ slug: parsed.data.slug })
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Esse link já está em uso por outra loja. Tente outro nome.' }
    }
    if (error.code === '42703' || error.message?.includes('column "slug"')) {
      return { error: 'Coluna slug não encontrada no banco. Execute a migration 024_slug_lojista.sql.' }
    }
    return { error: devError('Erro ao salvar o link personalizado.', error.message) }
  }

  revalidatePath('/lojista/configuracoes/agendamentos')
  revalidatePath('/lojista/dashboard')
  return { success: true, slug: parsed.data.slug }
}

// Antecedência mínima/máxima do agendamento online (migration 025) —
// só afeta o que o CLIENTE agenda sozinho (fn_criar_agendamento e
// fn_criar_agendamento_multiplo), nunca o walk-in criado pelo lojista.
export async function atualizarJanelaAgendamentoAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const raw = {
    minValor: Number(formData.get('minValor')),
    minUnidade: formData.get('minUnidade') as string,
    maxValor: Number(formData.get('maxValor')),
    maxUnidade: formData.get('maxUnidade') as string,
  }

  const parsed = janelaAgendamentoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await db
    .from('lojista')
    .update({
      agendamento_min_valor: parsed.data.minValor,
      agendamento_min_unidade: parsed.data.minUnidade,
      agendamento_max_valor: parsed.data.maxValor,
      agendamento_max_unidade: parsed.data.maxUnidade,
    })
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '42703') {
      return { error: 'Colunas de antecedência não encontradas no banco. Execute a migration 025_janela_agendamento.sql.' }
    }
    return { error: devError('Erro ao salvar a configuração de antecedência.', error.message) }
  }

  revalidatePath('/lojista/configuracoes/agendamentos')
  return { success: true }
}

// ============================================================
// CLIENTE ACTIONS (Lojista)
// ============================================================

// Cadastra um cliente direto pelo lojista (walk-in, telefone — cliente
// que não usa o app). O lojista informa só os dados, nunca uma senha —
// a conta é criada via convite (admin.inviteUserByEmail), que dispara um
// e-mail com um link de acesso único; o cliente define a própria senha
// ao abrir esse link em /redefinir-senha (mesma tela usada por "esqueci
// minha senha"). Insere na tabela `cliente` via RPC SECURITY DEFINER
// (migration 014), que também grava o vínculo em cliente_lojista pra o
// cliente aparecer na lista e já poder receber o primeiro agendamento
// manual.
export async function cadastrarClienteLojistaAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    cpf: (formData.get('cpf') as string).replace(/\D/g, ''),
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
  }

  const parsed = cadastroClienteLojistaSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }
  }

  const origin = await obterOrigin()
  const { data: authData, error: authError } = await adminClient.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
    data: { role: 'cliente', nome: parsed.data.nome },
  })

  if (authError) {
    console.error('[cadastrarClienteLojistaAction] inviteUserByEmail error:', authError.message)
    const msg = authError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate') || msg.includes('registered')) {
      return { error: 'Este e-mail já está cadastrado no sistema.' }
    }
    return { error: devError('Não foi possível convidar o cliente. Tente novamente.', authError.message) }
  }

  if (!authData.user) {
    return { error: 'Erro interno ao criar conta. Tente novamente.' }
  }

  const { error: rpcError } = await supabase.rpc('fn_registrar_cliente_lojista', {
    p_id_cliente: authData.user.id,
    p_id_lojista: contexto.idLojista,
    p_nome: parsed.data.nome,
    p_cpf: parsed.data.cpf,
    p_email: parsed.data.email,
    p_telefone: parsed.data.telefone,
  })

  if (rpcError) {
    // Rollback: remover conta Auth criada
    console.error('[cadastrarClienteLojistaAction] RPC error:', rpcError.message)
    await adminClient.auth.admin.deleteUser(authData.user.id)

    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists')) {
      return { error: 'Este e-mail já está cadastrado como cliente, lojista ou funcionário.' }
    }
    if (msg.includes('cpf_already_exists')) {
      return { error: 'Este CPF já está cadastrado.' }
    }
    return { error: devError('Não foi possível cadastrar o cliente. Tente novamente.', rpcError.message) }
  }

  revalidatePath('/lojista/clientes')
  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/agendamentos')
  return { success: true }
}

// Edita nome/telefone de um cliente já vinculado a este lojista (migration
// 019) — não existia NENHUM caminho pro lojista corrigir esses dados antes
// (a policy de UPDATE em `cliente` só permite o próprio cliente editar-se).
export async function editarClienteLojistaAction(id_cliente: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
  }

  const parsed = editarClienteLojistaSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.rpc('fn_editar_cliente_lojista', {
    p_id_lojista: contexto.idLojista,
    p_id_cliente: id_cliente,
    p_nome: parsed.data.nome,
    p_telefone: parsed.data.telefone,
  })

  if (error) {
    console.error('[editarClienteLojistaAction] RPC error:', error.message)
    return { error: devError('Não foi possível salvar as alterações. Tente novamente.', error.message) }
  }

  revalidatePath('/lojista/clientes')
  revalidatePath(`/lojista/clientes/${id_cliente}`)
  revalidatePath('/lojista/dashboard')
  return { success: true }
}

// Cadastra um pet em nome de um cliente já vinculado a este lojista
// (migration 015) — cobre o cliente cadastrado pelo botão acima que
// ainda não tem nenhum pet, e por isso travava no modal de "Novo
// Agendamento" na etapa de escolher o pet.
export async function criarPetLojistaAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarAgenda) return { error: 'Você não tem permissão para gerenciar a agenda.' }

  const raw = {
    id_cliente: formData.get('id_cliente') as string,
    nome: formData.get('nome') as string,
    raca: formData.get('raca') as string,
    sexo: formData.get('sexo') as string,
    especie: (formData.get('especie') as string) || undefined,
    porte: (formData.get('porte') as string) || undefined,
    dt_nasc: formData.get('dt_nasc') as string,
    peso: formData.get('peso') ? parseFloat(formData.get('peso') as string) : undefined,
    obs: (formData.get('obs') as string) || undefined,
  }

  const parsed = petLojistaSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: id_pet, error } = await supabase.rpc('fn_criar_pet_lojista', {
    p_id_lojista: contexto.idLojista,
    p_id_cliente: parsed.data.id_cliente,
    p_nome: parsed.data.nome,
    p_raca: parsed.data.raca,
    p_sexo: parsed.data.sexo,
    p_especie: parsed.data.especie ?? null,
    p_porte: parsed.data.porte ?? null,
    p_dt_nasc: parsed.data.dt_nasc,
    p_peso: parsed.data.peso ?? null,
    p_obs: parsed.data.obs ?? null,
  })

  if (error) {
    console.error('[criarPetLojistaAction] RPC error:', error.message)
    return { error: devError('Não foi possível cadastrar o pet. Tente novamente.', error.message) }
  }

  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/clientes')
  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/pets')
  return { success: true, id_pet: id_pet as string }
}

// Edita um pet já cadastrado (nome, espécie, raça, porte, tutor) — só
// funciona se o pet já pertence a um cliente vinculado a este lojista, e
// se estiver trocando o tutor, o novo também precisa estar vinculado
// (fn_editar_pet_lojista, migration 018). Não existia NENHUM caminho pro
// lojista editar pet antes disso — a policy de UPDATE em `pet` só deixa
// o próprio cliente editar o dele.
export async function editarPetLojistaAction(id_pet: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    id_cliente: formData.get('id_cliente') as string,
    nome: formData.get('nome') as string,
    raca: formData.get('raca') as string,
    sexo: formData.get('sexo') as string,
    especie: (formData.get('especie') as string) || undefined,
    porte: (formData.get('porte') as string) || undefined,
    dt_nasc: formData.get('dt_nasc') as string,
    peso: formData.get('peso') ? parseFloat(formData.get('peso') as string) : undefined,
    obs: (formData.get('obs') as string) || undefined,
  }

  const parsed = petLojistaSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.rpc('fn_editar_pet_lojista', {
    p_id_lojista: contexto.idLojista,
    p_id_pet: id_pet,
    p_id_cliente: parsed.data.id_cliente,
    p_nome: parsed.data.nome,
    p_raca: parsed.data.raca,
    p_sexo: parsed.data.sexo,
    p_especie: parsed.data.especie ?? null,
    p_porte: parsed.data.porte ?? null,
    p_dt_nasc: parsed.data.dt_nasc,
    p_peso: parsed.data.peso ?? null,
    p_obs: parsed.data.obs ?? null,
  })

  if (error) {
    console.error('[editarPetLojistaAction] RPC error:', error.message)
    return { error: devError('Não foi possível salvar as alterações. Tente novamente.', error.message) }
  }

  revalidatePath('/lojista/pets')
  revalidatePath(`/lojista/pets/${id_pet}`)
  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/agendamentos')
  return { success: true }
}

// ============================================================
// RELATÓRIOS DE VENDAS (Lojista)
// ============================================================

// Máximo de linhas por exportação — protege contra alguém pedindo um CSV
// gigante (ex.: período personalizado enorme) e travando a Server Action.
// Se bater no limite, orienta a estreitar o período em vez de cortar
// silenciosamente o arquivo pela metade sem avisar.
const LIMITE_LINHAS_CSV = 5000

function escaparCsv(valor: string) {
  if (/[",\n;]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

export async function exportarRelatorioVendasCsvAction(filtros: {
  dataIni: string
  dataFim: string
  idFuncionario?: string
  idServico?: string
  status?: string
}): Promise<{ csv: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  // Dono ou administrador da equipe (acesso total), como a tela de Relatórios.
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }

  let query = supabase
    .from('agendamento')
    .select(`
      dt_agendamento, hr_agendamento, valor, status,
      pet:id_pet ( nome ),
      servico:id_servico ( nome ),
      cliente:id_cliente ( nome ),
      funcionario:id_funcionario ( nome )
    `)
    .eq('id_lojista', contexto.idLojista)
    .gte('dt_agendamento', filtros.dataIni)
    .lte('dt_agendamento', filtros.dataFim)
    .order('dt_agendamento', { ascending: true })
    .order('hr_agendamento', { ascending: true })
    .limit(LIMITE_LINHAS_CSV + 1)

  if (filtros.idFuncionario) query = query.eq('id_funcionario', filtros.idFuncionario)
  if (filtros.idServico) query = query.eq('id_servico', filtros.idServico)
  if (filtros.status) query = query.eq('status', filtros.status)

  const { data, error } = await query

  if (error) {
    console.error('[exportarRelatorioVendasCsvAction] erro:', error.message)
    return { error: devError('Não foi possível gerar o CSV. Tente novamente.', error.message) }
  }

  const linhas = (data ?? []) as unknown as Array<{
    dt_agendamento: string
    hr_agendamento: string
    valor: number
    status: string
    pet: { nome: string } | null
    servico: { nome: string } | null
    cliente: { nome: string } | null
    funcionario: { nome: string } | null
  }>

  if (linhas.length > LIMITE_LINHAS_CSV) {
    return { error: `O período selecionado tem mais de ${LIMITE_LINHAS_CSV} registros. Estreite o período ou aplique um filtro antes de exportar.` }
  }

  const cabecalho = ['Data', 'Horário', 'Cliente', 'Pet', 'Serviço', 'Profissional', 'Valor', 'Status']
  const corpo = linhas.map(l => [
    l.dt_agendamento.split('-').reverse().join('/'),
    l.hr_agendamento.slice(0, 5),
    l.cliente?.nome ?? '',
    l.pet?.nome ?? '',
    l.servico?.nome ?? '',
    l.funcionario?.nome ?? '',
    l.valor.toFixed(2).replace('.', ','),
    l.status,
  ].map(v => escaparCsv(String(v))).join(';'))

  const csv = '﻿' + [cabecalho.join(';'), ...corpo].join('\r\n')
  return { csv }
}

// ============================================================
// FUNCIONÁRIO ACTIONS (Lojista)
// ============================================================

export async function cadastrarFuncionarioAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }

  const acessoTotalSolicitado = formData.get('acesso_total') === 'true'
  // Só o responsável pela conta (o lojista de verdade) pode criar outro
  // administrador — um funcionário com acesso_total NUNCA pode, mesmo
  // que "acesso total" signifique paridade com o lojista em tudo mais.
  // O trigger fn_bloquear_acesso_total_por_funcionario (migration 029)
  // garante isso de novo no banco, mesmo se este código tiver um bug.
  if (acessoTotalSolicitado && !ehResponsavelPelaConta(contexto)) {
    return { error: 'Apenas o responsável pela conta pode conceder acesso total (administrador).' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    cargo: formData.get('cargo') as string,
    pode_gerenciar_agenda: formData.get('pode_gerenciar_agenda') === 'true',
    pode_gerenciar_servicos: formData.get('pode_gerenciar_servicos') === 'true',
    pode_gerenciar_produtos: formData.get('pode_gerenciar_produtos') === 'true',
    pode_gerenciar_clientes_pets: formData.get('pode_gerenciar_clientes_pets') === 'true',
    acesso_total: acessoTotalSolicitado,
    pode_taxidog: formData.get('pode_taxidog') === 'true',
  }

  const parsed = funcionarioSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Admin client é obrigatório para criar conta Auth para o novo membro
  // (quem convida não pode usar signUp — isso deslogaria a própria sessão)
  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }
  }

  // Convida o membro por e-mail em vez de definir uma senha por ele —
  // ele define a própria senha ao aceitar o convite em /redefinir-senha.
  const origin = await obterOrigin()
  const { data: authData, error: authError } = await adminClient.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
    data: {
      role: 'funcionario',
      nome: parsed.data.nome,
      id_lojista: contexto.idLojista,
    },
  })

  if (authError) {
    console.error('[cadastrarFuncionarioAction] inviteUserByEmail error:', authError.message)
    const msg = authError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate') || msg.includes('registered')) {
      return { error: 'Este e-mail já está cadastrado no sistema.' }
    }
    return { error: devError('Não foi possível convidar o membro. Tente novamente.', authError.message) }
  }

  if (!authData.user) {
    return { error: 'Erro interno ao criar conta. Tente novamente.' }
  }

  // Inserir na tabela funcionario via RPC (SECURITY DEFINER) — chamada
  // com o client normal (não o admin), pra auth.uid()/auth_role() dentro
  // da função continuarem sendo os de quem está convidando, não os do
  // service_role (necessário pro trigger de acesso_total funcionar).
  const { error: rpcError } = await supabase.rpc('fn_registrar_funcionario', {
    p_id_funcionario: authData.user.id,
    p_id_lojista: contexto.idLojista,
    p_nome: parsed.data.nome,
    p_email: parsed.data.email,
    p_telefone: parsed.data.telefone,
    p_cargo: parsed.data.cargo ?? null,
    p_pode_agenda: parsed.data.pode_gerenciar_agenda,
    p_pode_servicos: parsed.data.pode_gerenciar_servicos,
    p_pode_clientes_pets: parsed.data.pode_gerenciar_clientes_pets,
    p_acesso_total: parsed.data.acesso_total,
    p_pode_produtos: parsed.data.pode_gerenciar_produtos,
    p_pode_taxidog: parsed.data.pode_taxidog,
  })

  if (rpcError) {
    // Rollback: remover conta Auth criada
    console.error('[cadastrarFuncionarioAction] RPC error:', rpcError.message)
    await adminClient.auth.admin.deleteUser(authData.user.id)

    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists')) {
      return { error: 'Este e-mail já está cadastrado como funcionário, lojista ou cliente.' }
    }
    if (msg.includes('acesso total')) {
      return { error: 'Apenas o responsável pela conta pode conceder acesso total (administrador).' }
    }
    return { error: devError('Não foi possível cadastrar o membro. Tente novamente.', rpcError.message) }
  }

  revalidatePath('/lojista/equipe')
  return { success: true }
}

export async function editarFuncionarioAction(id_funcionario: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const acessoTotalSolicitado = formData.get('acesso_total') === 'true'
  if (acessoTotalSolicitado && !ehResponsavelPelaConta(contexto)) {
    return { error: 'Apenas o responsável pela conta pode conceder acesso total (administrador).' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    cargo: formData.get('cargo') as string,
    pode_gerenciar_agenda: formData.get('pode_gerenciar_agenda') === 'true',
    pode_gerenciar_servicos: formData.get('pode_gerenciar_servicos') === 'true',
    pode_gerenciar_produtos: formData.get('pode_gerenciar_produtos') === 'true',
    pode_gerenciar_clientes_pets: formData.get('pode_gerenciar_clientes_pets') === 'true',
    acesso_total: acessoTotalSolicitado,
    pode_taxidog: formData.get('pode_taxidog') === 'true',
  }

  const parsed = editarFuncionarioSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await db
    .from('funcionario')
    .update({
      nome: parsed.data.nome,
      telefone: parsed.data.telefone,
      cargo: parsed.data.cargo ?? null,
      pode_gerenciar_agenda: parsed.data.pode_gerenciar_agenda,
      pode_gerenciar_servicos: parsed.data.pode_gerenciar_servicos,
      pode_gerenciar_produtos: parsed.data.pode_gerenciar_produtos,
      pode_gerenciar_clientes_pets: parsed.data.pode_gerenciar_clientes_pets,
      acesso_total: parsed.data.acesso_total,
      pode_taxidog: parsed.data.pode_taxidog,
    })
    .eq('id_funcionario', id_funcionario)
    .eq('id_lojista', contexto.idLojista) // Garante que é membro da SUA equipe

  if (error) {
    if (error.message?.toLowerCase().includes('acesso total')) {
      return { error: 'Apenas o responsável pela conta pode conceder acesso total (administrador).' }
    }
    return { error: 'Erro ao atualizar membro.' }
  }

  revalidatePath('/lojista/equipe')
  return { success: true }
}

export async function toggleFuncionarioAction(id_funcionario: string, ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }
  const db = clienteParaEscritaLojista(contexto, supabase)
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const { error } = await db
    .from('funcionario')
    .update({ ativo })
    .eq('id_funcionario', id_funcionario)
    .eq('id_lojista', contexto.idLojista)

  if (error) return { error: ativo ? 'Erro ao reativar membro.' : 'Erro ao desativar membro.' }

  revalidatePath('/lojista/equipe')
  return { success: true }
}

export async function excluirFuncionarioAction(id_funcionario: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }

  if (id_funcionario === user.id) {
    return { error: 'Você não pode excluir a si mesmo.' }
  }

  // Lê com o client normal (RLS) antes de excluir — garante que o membro
  // pertence mesmo à sua loja, e não a outra (defesa em profundidade,
  // igual ao resto das actions de escrita neste arquivo).
  const { data: alvo } = await supabase
    .from('funcionario')
    .select('id_lojista, acesso_total')
    .eq('id_funcionario', id_funcionario)
    .maybeSingle()

  if (!alvo || alvo.id_lojista !== contexto.idLojista) {
    return { error: 'Acesso não autorizado' }
  }

  // Mesma regra de "quem pode mexer em acesso total": só o responsável
  // pela conta pode remover um administrador.
  if (alvo.acesso_total && !ehResponsavelPelaConta(contexto)) {
    return { error: 'Apenas o responsável pela conta pode remover um administrador.' }
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }
  }

  // Exclui a conta de autenticação — a linha em `funcionario` some junto
  // (FK id_funcionario -> auth.users ON DELETE CASCADE, migration 005), e
  // os agendamentos que ele atendeu ficam com id_funcionario = NULL em vez
  // de sumir (FK ON DELETE SET NULL, migration 012), preservando o histórico.
  const { error } = await adminClient.auth.admin.deleteUser(id_funcionario)
  if (error) {
    return { error: devError('Não foi possível excluir o membro. Tente novamente.', error.message) }
  }

  revalidatePath('/lojista/equipe')
  return { success: true }
}

// ============================================================
// PERFIL DO CLIENTE
// ============================================================

export async function atualizarPerfilClienteAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const raw = {
    nome: (formData.get('nome') as string)?.trim(),
    telefone: (formData.get('telefone') as string)?.replace(/\D/g, ''),
  }

  const parsed = perfilClienteSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('cliente')
    .update(parsed.data)
    .eq('id_cliente', user.id)

  if (error) return { error: devError('Erro ao atualizar perfil.', error.message) }

  revalidatePath('/cliente/perfil')
  revalidatePath('/cliente', 'layout')
  return { success: true }
}

// ============================================================
// FOTO DO PET — Storage (migration 026), mesmo padrão de
// atualizarLogoLojistaAction/removerLogoLojistaAction acima, mas a pasta
// é por CLIENTE (não por pet) já que um cliente pode ter vários pets —
// cada foto é um arquivo {id_pet}.{ext} dentro da pasta do cliente.
// ============================================================

const PET_FOTO_BUCKET = 'fotos-pet'
const PET_FOTO_TAMANHO_MAXIMO = 5 * 1024 * 1024 // 5 MB

type ClienteSupabase = Awaited<ReturnType<typeof createClient>>

async function limparArquivosDoPet(cliente: ClienteSupabase, idCliente: string, idPet: string) {
  const { data: existentes } = await cliente.storage.from(PET_FOTO_BUCKET).list(idCliente)
  const doPet = existentes?.filter(f => f.name.startsWith(`${idPet}.`)) ?? []
  if (doPet.length > 0) {
    await cliente.storage.from(PET_FOTO_BUCKET).remove(doPet.map(f => `${idCliente}/${f.name}`))
  }
}

// Descobre o dono (id_cliente) do pet e QUAL client usar pra gravar
// (Storage + tabela pet): o cliente edita a própria foto com o client
// normal (RLS já permite); o lojista só pode mexer na foto de um pet de
// um cliente vinculado a ele (cliente_lojista) — e como não existe
// policy de UPDATE em `pet`/Storage pra lojista (só RPCs SECURITY
// DEFINER pros outros campos), usa o adminClient depois de confirmar a
// autorização pela própria SELECT com RLS abaixo (que já só devolve a
// linha se o lojista realmente tiver esse cliente vinculado).
async function resolverAutorizacaoFotoPet(
  supabase: ClienteSupabase,
  userId: string,
  role: string | undefined,
  id_pet: string
): Promise<{ error: string } | { idCliente: string; clienteParaEscrita: ClienteSupabase }> {
  const { data: pet } = await supabase
    .from('pet')
    .select('id_cliente')
    .eq('id_pet', id_pet)
    .maybeSingle()

  if (!pet) return { error: 'Pet não encontrado.' }

  if (role === 'cliente') {
    if (pet.id_cliente !== userId) return { error: 'Pet não encontrado.' }
    return { idCliente: pet.id_cliente, clienteParaEscrita: supabase }
  }

  if (role === 'lojista') {
    const adminClient = createAdminClient()
    if (!adminClient) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }
    return { idCliente: pet.id_cliente, clienteParaEscrita: adminClient }
  }

  return { error: 'Acesso não autorizado' }
}

export async function atualizarFotoPetAction(
  id_pet: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean; url?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const arquivo = formData.get('foto') as File | null
  if (!arquivo || arquivo.size === 0) {
    return { error: 'Selecione uma imagem.' }
  }
  if (arquivo.size > PET_FOTO_TAMANHO_MAXIMO) {
    return { error: 'Imagem muito grande. O limite é 5 MB.' }
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const extensao = detectarExtensaoImagem(bytes)
  if (!extensao) {
    return { error: 'Formato de imagem inválido. Envie um arquivo JPG, PNG ou WEBP.' }
  }

  const autorizacao = await resolverAutorizacaoFotoPet(supabase, user.id, user.user_metadata?.role, id_pet)
  if ('error' in autorizacao) return { error: autorizacao.error }
  const { idCliente, clienteParaEscrita } = autorizacao

  await limparArquivosDoPet(clienteParaEscrita, idCliente, id_pet)

  const caminho = `${idCliente}/${id_pet}.${extensao}`
  const { error: uploadError } = await clienteParaEscrita.storage
    .from(PET_FOTO_BUCKET)
    .upload(caminho, bytes, {
      contentType: extensao === 'jpg' ? 'image/jpeg' : `image/${extensao}`,
      upsert: true,
    })

  if (uploadError) {
    return { error: devError('Não foi possível enviar a imagem. Tente novamente.', uploadError.message) }
  }

  const { data: { publicUrl } } = clienteParaEscrita.storage.from(PET_FOTO_BUCKET).getPublicUrl(caminho)
  const urlComVersao = `${publicUrl}?v=${Date.now()}`

  const { error: dbError } = await clienteParaEscrita
    .from('pet')
    .update({ foto_url: urlComVersao })
    .eq('id_pet', id_pet)

  if (dbError) {
    return { error: devError('Imagem enviada, mas não foi possível salvar a referência. Tente novamente.', dbError.message) }
  }

  revalidatePath('/cliente/pets')
  revalidatePath('/lojista/pets')
  return { success: true, url: urlComVersao }
}

export async function removerFotoPetAction(id_pet: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const autorizacao = await resolverAutorizacaoFotoPet(supabase, user.id, user.user_metadata?.role, id_pet)
  if ('error' in autorizacao) return { error: autorizacao.error }
  const { idCliente, clienteParaEscrita } = autorizacao

  await limparArquivosDoPet(clienteParaEscrita, idCliente, id_pet)

  const { error } = await clienteParaEscrita
    .from('pet')
    .update({ foto_url: null })
    .eq('id_pet', id_pet)

  if (error) return { error: devError('Não foi possível remover a imagem. Tente novamente.', error.message) }

  revalidatePath('/cliente/pets')
  revalidatePath('/lojista/pets')
  return { success: true }
}

// ============================================================
// AVALIAÇÕES (migration 034)
// ============================================================
// O cliente avalia um atendimento finalizado. Quem valida de verdade são
// as funções fn_criar_avaliacao / fn_editar_avaliacao no banco — elas
// conferem dono do agendamento, status 'Concluído' e copiam do próprio
// agendamento a loja/pet/serviço/profissional, então o cliente só manda
// id do agendamento + nota + comentário. Aqui em cima fica a validação
// de formato (Zod) e a tradução dos erros do Postgres pra mensagem
// amigável — a mesma divisão de responsabilidade das outras actions.

// Erros vindos das funções SQL viram mensagem de usuário. A UNIQUE de
// id_agendamento é o que garante "uma avaliação por atendimento": se
// duas tentativas correrem juntas, uma delas volta 23505 e cai aqui.
function traduzirErroAvaliacao(mensagem: string): string {
  const msg = mensagem.toLowerCase()
  if (msg.includes('duplicate key') || msg.includes('23505') || msg.includes('avaliacao_id_agendamento_key')) {
    return 'Você já avaliou este atendimento.'
  }
  if (msg.includes('finalizado')) return 'Só é possível avaliar um atendimento finalizado.'
  if (msg.includes('não autorizado')) return 'Este atendimento não é seu.'
  if (msg.includes('não encontrado')) return 'Atendimento não encontrado.'
  if (msg.includes('nota')) return 'A nota precisa ser de 1 a 5.'
  return devError('Não foi possível salvar sua avaliação. Tente novamente.', mensagem)
}

function lerFormAvaliacao(formData: FormData) {
  const comentarioBruto = ((formData.get('comentario') as string) ?? '').trim()
  return avaliacaoSchema.safeParse({
    nota: Number(formData.get('nota')),
    comentario: comentarioBruto === '' ? undefined : comentarioBruto,
  })
}

export async function criarAvaliacaoAction(id_agendamento: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'cliente') {
    return { error: 'Acesso não autorizado' }
  }

  const parsed = lerFormAvaliacao(formData)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.rpc('fn_criar_avaliacao', {
    p_id_agendamento: id_agendamento,
    p_nota: parsed.data.nota,
    p_comentario: parsed.data.comentario ?? null,
  })

  if (error) return { error: traduzirErroAvaliacao(error.message) }

  revalidatePath('/cliente/agendamentos')
  return { success: true }
}

export async function editarAvaliacaoAction(id_avaliacao: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'cliente') {
    return { error: 'Acesso não autorizado' }
  }

  const parsed = lerFormAvaliacao(formData)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.rpc('fn_editar_avaliacao', {
    p_id_avaliacao: id_avaliacao,
    p_nota: parsed.data.nota,
    p_comentario: parsed.data.comentario ?? null,
  })

  if (error) return { error: traduzirErroAvaliacao(error.message) }

  revalidatePath('/cliente/agendamentos')
  return { success: true }
}
