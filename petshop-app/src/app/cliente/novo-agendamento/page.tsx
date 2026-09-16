import { createClient } from '@/lib/supabase/server'
import NovoAgendamentoWizard from '@/components/cliente/NovoAgendamentoWizard'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Novo Agendamento' }

export default async function NovoAgendamentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Carregar dados necessários para o wizard
  const [{ data: pets }, { data: lojistas }] = await Promise.all([
    supabase
      .from('pet')
      .select('id_pet, nome, raca, sexo')
      .eq('id_cliente', user!.id)
      .eq('ativo', true)
      .order('nome'),
    // Só lojas que aceitam agendamento online (migration 020) — quem
    // desativou nas Configurações some do seletor. A RPC (fn_criar_
    // agendamento) confere isso de novo no backend, então mesmo que
    // alguém force o id_lojista de uma loja fora dessa lista, o agendamento
    // é recusado — este filtro aqui é só pra não oferecer uma opção morta.
    supabase
      .from('lojista')
      .select('id_lojista, nome_loja, cidade, estado, descricao')
      .eq('ativo', true)
      .eq('aceita_agendamento_online', true)
      .order('nome_loja'),
  ])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Novo Agendamento 📅</h1>
        <p className="page-subtitle">Escolha a loja, pet, serviço e horário</p>
      </div>

      <NovoAgendamentoWizard pets={pets ?? []} lojistas={lojistas ?? []} />
    </>
  )
}
