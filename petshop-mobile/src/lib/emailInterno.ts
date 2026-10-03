// Funcionário não tem e-mail nem senha: entra só pelo código de acesso
// rápido. A conta dele no Supabase Auth é criada pelo painel com um
// endereço interno (petshop-app/src/lib/email-interno.ts), que não é para
// aparecer em tela nenhuma.
const DOMINIO_INTERNO = 'funcionario.saip.invalid'

export function ehEmailInterno(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${DOMINIO_INTERNO}`)
}
