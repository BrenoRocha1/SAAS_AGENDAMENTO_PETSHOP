import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import PerfilClienteForm from '@/components/cliente/PerfilClienteForm'
import ExcluirContaCliente from '@/components/cliente/ExcluirContaCliente'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meu Perfil' }

export default async function PerfilClientePage() {
  const supabase = await createClient()
  const user = await obterUsuario()

  const { data: cliente } = await supabase
    .from('cliente')
    .select('nome, email, cpf, telefone')
    .eq('id_cliente', user!.id)
    .single()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Meu Perfil</h1>
        <p className="page-subtitle">Atualize suas informações pessoais</p>
      </div>

      {cliente && <PerfilClienteForm cliente={cliente} />}
      {cliente && <ExcluirContaCliente />}
    </>
  )
}
