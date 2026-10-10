import { redirect } from 'next/navigation'

// Entrar e criar conta são a mesma tela: o login com o Google identifica se a
// pessoa já tem conta e, se não tiver, cria na hora. Links antigos para
// /cadastro caem no /login (mantendo a volta para o agendamento).
export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo } = await searchParams
  redirect(redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login')
}
