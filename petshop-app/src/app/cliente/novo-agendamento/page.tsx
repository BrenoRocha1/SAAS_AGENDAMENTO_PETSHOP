import { createClient } from '@/lib/supabase/server'
import NovoAgendamentoWizard from '@/components/cliente/NovoAgendamentoWizard'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Novo Agendamento' }

export default async function NovoAgendamentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: pets }, { data: vinculos }] = await Promise.all([
    supabase
      .from('pet')
      .select('id_pet, nome, raca, sexo')
      .eq('id_cliente', user!.id)
      .eq('ativo', true)
      .order('nome'),
    // Só petshops com quem o cliente já tem vínculo (migration 014/026) —
    // ou seja, onde ele já agendou pelo menos uma vez pelo link público da
    // loja (/agendamento/[slug]). Evita expor um marketplace com TODOS os
    // petshops da plataforma; aqui é só pra agendar de novo, mais rápido,
    // com quem ele já conhece.
    supabase
      .from('cliente_lojista')
      .select('id_lojista')
      .eq('id_cliente', user!.id),
  ])

  const idsLojistas = (vinculos ?? []).map(v => v.id_lojista)

  const { data: lojistas } = idsLojistas.length
    ? await supabase
        .from('lojista')
        .select('id_lojista, nome_loja, cidade, estado, descricao, telefone')
        .eq('ativo', true)
        .eq('aceita_agendamento_online', true)
        .in('id_lojista', idsLojistas)
        .order('nome_loja')
    : { data: [] as { id_lojista: string; nome_loja: string; cidade: string | null; estado: string | null; descricao: string | null; telefone: string | null }[] }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Novo Agendamento</h1>
        <p className="page-subtitle">Escolha a loja, pet, serviço e horário</p>
      </div>

      <NovoAgendamentoWizard pets={pets ?? []} lojistas={lojistas ?? []} />
    </>
  )
}
