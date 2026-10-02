import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from './ScreenContainer'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Campo } from './Campo'
import { LinhaSwitch } from './LinhaSwitch'
import { useAuth } from '@/contexts/AuthContext'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { mascaraCpf, mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { colors, spacing, typography } from '@/theme/theme'

// Quem entrou pelo Google e ainda não tem cadastro: faltam o CPF e o
// telefone para virar cliente (o nome e o e-mail vêm do Google) — a mesma
// etapa /completar-cadastro/cliente do site.
export function CompletarCadastro() {
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
        <Text style={styles.titulo}>Falta pouco{nome ? `, ${nome.split(' ')[0]}` : ''}!</Text>
        <Text style={styles.texto}>
          Para agendar pelo app, complete o seu cadastro de cliente. Entrou com {user?.email}.
        </Text>
        {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} />}
        <Campo rotulo="CPF" value={cpf} onChangeText={t => setCpf(mascaraCpf(t))} keyboardType="number-pad" placeholder="000.000.000-00" maxLength={14} />
        <Campo rotulo="Telefone / WhatsApp" value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(11) 98765-4321" maxLength={15} />
        <LinhaSwitch titulo="Li e aceito os Termos de Uso e a Política de Privacidade" valor={aceita} onChange={setAceita} />
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Botao rotulo="Concluir cadastro" onPress={concluir} carregando={enviando} />
        <Aviso tipo="info" texto="Tem um petshop? O cadastro da loja é feito pelo site — depois é só entrar aqui com a mesma conta." />
        <Botao rotulo="Sair" variante="secundario" onPress={signOut} desativado={enviando} />
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  titulo: { ...typography.heading.xl, color: colors.text },
  texto: { ...typography.body.lg, color: colors.textMuted },
})
