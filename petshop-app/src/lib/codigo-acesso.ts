import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'

// Login pelo código de acesso rápido do funcionário (migrations 077/078).
//
// O código (6 dígitos, 1 minuto, uso único) vira um "token de entrada" do
// Supabase, que quem chamou troca pela sessão:
//   - painel web: loginFuncionarioCodigoAction troca aqui no servidor e a
//     sessão fica nos cookies;
//   - app mobile: /api/app/login-codigo devolve o token e o app troca no
//     próprio aparelho (supabase.auth.verifyOtp).
// O token vale uma vez só e a senha do funcionário (quando ele tem uma)
// não é tocada.
export async function trocarCodigoPorToken(
  codigo: string
): Promise<{ error: string } | { tokenHash: string }> {
  const rl = await checkRateLimit('loginFuncionario', 10, 5)
  if (!rl.success) {
    return { error: `Muitas tentativas. Tente novamente em ${rl.retryAfter}s.` }
  }

  const codigoLimpo = (codigo ?? '').replace(/\D/g, '')
  if (codigoLimpo.length !== 6) return { error: 'Digite os 6 números do código.' }

  const adminClient = createAdminClient()
  if (!adminClient) return { error: 'Erro de servidor' }

  // 1. Achar o funcionário pelo código e já apagar o código (uso único).
  // É um UPDATE só, então o mesmo código não serve pra dois logins.
  const { data: func } = await adminClient
    .from('funcionario')
    .update({ codigo_login: null, codigo_login_expiracao: null })
    .eq('codigo_login', codigoLimpo)
    .eq('ativo', true)
    .gt('codigo_login_expiracao', new Date().toISOString())
    .select('id_funcionario')
    .maybeSingle()

  if (!func) {
    return { error: 'Código inválido ou expirado. Peça um novo ao responsável da loja.' }
  }

  // 2. Link de acesso gerado aqui no servidor (nenhum e-mail é enviado) —
  // o que interessa dele é só o token.
  const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(func.id_funcionario)
  if (!authUser?.email) return { error: 'Erro ao autenticar.' }

  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.email,
  })
  if (linkError || !link.properties?.hashed_token) {
    return { error: 'Erro ao autenticar.' }
  }

  return { tokenHash: link.properties.hashed_token }
}
