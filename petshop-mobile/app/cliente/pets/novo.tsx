import { useRouter } from 'expo-router'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { FormularioPet } from '@/components/FormularioPet'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { mensagemDoBanco } from '@/lib/erros'

// O cliente cadastra o próprio pet (a RLS só deixa gravar pet dele).
export default function NovoPetClienteScreen() {
  const router = useRouter()
  const { user } = useAuth()

  return (
    <ScreenContainer>
      <DetailHeader title="Novo pet" />
      <FormularioPet
        onCancelar={() => router.back()}
        onSalvar={async d => {
          if (!user) return 'Sua sessão expirou. Entre de novo.'
          const { error } = await supabase.from('pet').insert({
            id_cliente: user.id,
            nome: d.nome,
            raca: d.raca,
            sexo: d.sexo,
            especie: d.especie || null,
            porte: d.porte || null,
            dt_nasc: d.dt_nasc,
            peso: d.peso,
            obs: d.obs || null,
          })
          if (error) return mensagemDoBanco(error, 'Erro ao cadastrar o pet.')
          router.back()
          return null
        }}
      />
    </ScreenContainer>
  )
}
