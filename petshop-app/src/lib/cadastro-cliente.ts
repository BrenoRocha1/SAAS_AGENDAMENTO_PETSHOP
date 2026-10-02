import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { cadastroClienteSchema } from '@/lib/validations'

// Criação da conta de cliente (login + cadastro), sem nada de sessão ou
// redirecionamento — usada pelos dois lugares em que alguém se cadastra
// sozinho: a página /cadastro (cadastroClienteAction, que depois faz o
// login por cookie) e o app mobile (POST /api/app/cadastro-cliente, que
// depois faz o login no próprio aparelho). Não é um arquivo 'use server'.

export interface DadosCadastroCliente {
  nome: string
  cpf: string
  email: string
  telefone: string
  senha: string
  confirmaSenha: string
  aceita_termos: boolean | undefined
}

export async function criarContaCliente(raw: DadosCadastroCliente): Promise<{ error: string } | { email: string; senha: string }> {
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
  // conta mas o signInWithPassword logo depois falhava com "Email not
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
    // Em produção só a mensagem amigável; em dev, a causa junto.
    return {
      error: process.env.NODE_ENV !== 'production'
        ? `Erro ao criar conta. Tente novamente. [DEV: ${authError.message}]`
        : 'Erro ao criar conta. Tente novamente.',
    }
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

  return { email: parsed.data.email, senha: parsed.data.senha }
}
