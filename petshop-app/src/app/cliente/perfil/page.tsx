import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import PerfilClienteForm from '@/components/cliente/PerfilClienteForm'
import PerfilFotoUpload from '@/components/cliente/PerfilFotoUpload'
import ExcluirContaCliente from '@/components/cliente/ExcluirContaCliente'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meu Perfil' }

export default async function PerfilClientePage() {
  const supabase = await createClient()
  const user = await obterUsuario()

  // A foto (migration 085) vem numa consulta à parte: enquanto a coluna não
  // existir no banco, o resto do perfil abre normalmente.
  const [{ data: cliente }, { data: foto }] = await Promise.all([
    supabase.from('cliente').select('nome, email, cpf, telefone').eq('id_cliente', user!.id).single(),
    supabase.from('cliente').select('foto_url').eq('id_cliente', user!.id).maybeSingle(),
  ])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Meu Perfil</h1>
        <p className="page-subtitle">Atualize suas informações pessoais</p>
      </div>

      {cliente && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <PerfilFotoUpload fotoUrlInicial={foto?.foto_url ?? null} />
        </div>
      )}
      {cliente && <PerfilClienteForm cliente={cliente} />}
      {cliente && <ExcluirContaCliente />}
    </>
  )
}
