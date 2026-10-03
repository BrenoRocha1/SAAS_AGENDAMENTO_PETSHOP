import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'

// Login pelo código de acesso rápido do funcionário (migrations 077 a 080).
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

  const invalido = { error: 'Código inválido ou expirado. Peça um novo ao responsável da loja.' }

  // 1. Achar o código e já apagá-lo (uso único). É um DELETE só, então o
  // mesmo código não serve pra dois logins. A tabela dos códigos (migration
  // 080) não é legível pela API — só este servidor, com a service_role.
  const { data: usado } = await adminClient
    .from('funcionario_codigo_acesso')
    .delete()
    .eq('codigo', codigoLimpo)
    .gt('expira_em', new Date().toISOString())
    .select('id_funcionario')
    .maybeSingle()
  if (!usado) return invalido

  // Desativado depois de o código ser gerado: não entra.
  const { data: func } = await adminClient
    .from('funcionario')
    .select('id_funcionario')
    .eq('id_funcionario', usado.id_funcionario)
    .eq('ativo', true)
    .maybeSingle()
  if (!func) return invalido

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
