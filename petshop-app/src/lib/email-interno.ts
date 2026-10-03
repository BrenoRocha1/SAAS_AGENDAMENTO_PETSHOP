// Funcionário não tem e-mail nem senha (migration 078): entra só pelo
// código de acesso rápido. Mas o Supabase Auth exige um e-mail em toda
// conta, então a conta dele é criada com um endereço interno, num domínio
// reservado (.invalid nunca existe na internet — nada é enviado pra lá).
// Esse endereço não aparece em tela nenhuma: use ehEmailInterno() antes de
// mostrar o e-mail de quem está logado.
const DOMINIO_INTERNO = 'funcionario.saip.invalid'

export function gerarEmailInterno(): string {
  return `f-${crypto.randomUUID()}@${DOMINIO_INTERNO}`
}

export function ehEmailInterno(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${DOMINIO_INTERNO}`)
}
