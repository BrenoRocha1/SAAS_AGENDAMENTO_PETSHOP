import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ScreenContainer } from './ScreenContainer'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Campo } from './Campo'
import { LinhaSwitch } from './LinhaSwitch'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { mascaraCpf, mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { Ilustracao } from './Ilustracao'
import { CadastroLoja } from './CadastroLoja'
import { supabase } from '@/lib/supabase'
import { guardarPerfilCadastro, lerPerfilCadastro, type PerfilCadastro } from '@/lib/cadastro-loja'
import { colors, spacing, typography } from '@/theme/theme'

// Quem entrou pelo Google e ainda não tem cadastro. Escolheu "Sou lojista"
// na tela de entrar: o cadastro do petshop em etapas (CadastroLoja, o mesmo
// /completar-cadastro/lojista do site). Senão: faltam o CPF e o telefone
// para virar cliente — a etapa /completar-cadastro/cliente do site.
export function CompletarCadastro() {
  const { user, recarregar } = useAuth()
  const [perfil, setPerfil] = useState<PerfilCadastro | null>(null)
  useEffect(() => { lerPerfilCadastro().then(setPerfil) }, [])

  function trocar(novo: PerfilCadastro) {
    guardarPerfilCadastro(novo)
    setPerfil(novo)
  }

  if (!perfil) return null

  if (perfil === 'lojista') {
    return (
      <CadastroLoja
        email={user?.email}
        onSair={() => trocar('cliente')}
        onEnviar={async campos => {
          if (!acoesDisponiveis()) return { error: MSG_SEM_SITE }
          const r = await chamarAcao('completarCadastroLojistaGoogleAction', form(campos))
          if (r.error) return { error: r.error }
          // A conta virou lojista: o token novo já traz o papel, e o app
          // passa para a área da loja.
          await supabase.auth.refreshSession().catch(() => null)
          await recarregar()
          return {}
        }}
      />
    )
  }

  return <CadastroCliente onSouLojista={() => trocar('lojista')} />
}

function CadastroCliente({ onSouLojista }: { onSouLojista: () => void }) {
  const { user, signOut, recarregar } = useAuth()
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [aceita, setAceita] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const nome = (user?.user_metadata?.full_name as string | undefined) ?? (user?.user_metadata?.name as string | undefined) ?? ''

  async function concluir() {
    if (soDigitos(cpf).length !== 11) return setErro('Informe o CPF com 11 dígitos.')
    if (soDigitos(telefone).length < 10) return setErro('Informe o telefone com DDD.')
    if (!aceita) return setErro('Você precisa aceitar os Termos de Uso e a Política de Privacidade.')
    setErro(null)
    setEnviando(true)
    const r = await chamarAcao('completarCadastroClienteGoogleAction', form({
      cpf: soDigitos(cpf),
      telefone: soDigitos(telefone),
      aceita_termos: 'on',
    }))
    if (r.error) {
      setEnviando(false)
      return setErro(r.error)
    }
    await recarregar()
    setEnviando(false)
  }

  return (
    <ScreenContainer>
      <View style={{ gap: spacing.md }}>
        <Ilustracao nome="boas-vindas" altura={150} style={styles.figura} />
        <View style={styles.selo}><Text style={styles.seloTexto}>Último passo</Text></View>
        <Text style={styles.titulo}>Falta pouco{nome ? `, ${nome.split(' ')[0]}` : ''}!</Text>
        <Text style={styles.texto}>
          Confirme o seu CPF e o WhatsApp para agendar — é por ele que a loja fala com você. Você entrou com {user?.email}.
        </Text>
        {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} />}
        <Campo rotulo="CPF" value={cpf} onChangeText={t => setCpf(mascaraCpf(t))} keyboardType="number-pad" placeholder="000.000.000-00" maxLength={14} />
        <Campo rotulo="Telefone / WhatsApp" value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(11) 98765-4321" maxLength={15} />
        <LinhaSwitch titulo="Li e aceito os Termos de Uso e a Política de Privacidade" valor={aceita} onChange={setAceita} />
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Botao rotulo="Concluir cadastro" onPress={concluir} carregando={enviando} />
        <Botao rotulo="Tenho um petshop — cadastrar a loja" variante="secundario" icone="storefront-outline" onPress={onSouLojista} desativado={enviando} />
        <Botao rotulo="Sair" variante="secundario" onPress={signOut} desativado={enviando} />
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  figura: { marginTop: spacing.sm, marginBottom: spacing.xs },
  selo: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primary50 },
  seloTexto: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primary600 },
  titulo: { ...typography.heading.xl, color: colors.text },
  texto: { ...typography.body.lg, color: colors.textMuted },
})
