import { useState } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { useAuth } from '@/contexts/AuthContext'
import { mascaraCpf, mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { SITE_URL } from '@/lib/site'
import { colors, spacing, typography } from '@/theme/theme'

// Cadastro de cliente pelo app — a mesma criação de conta da página
// /cadastro do site (POST /api/app/cadastro-cliente): o servidor valida,
// cria o login e o cadastro, e o app entra em seguida. Quem tem petshop se
// cadastra pelo site.
export default function CadastroScreen() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [aceita, setAceita] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function cadastrar() {
    if (nome.trim().length < 2) return setErro('Informe o seu nome.')
    if (soDigitos(cpf).length !== 11) return setErro('Informe o CPF com 11 dígitos.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro('Informe um e-mail válido.')
    if (soDigitos(telefone).length < 10) return setErro('Informe o telefone com DDD.')
    if (senha.length < 8 || !/[A-Z]/.test(senha) || !/[0-9]/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
      return setErro('A senha precisa de 8 caracteres ou mais, com letra maiúscula, número e símbolo.')
    }
    if (senha !== confirma) return setErro('As senhas não conferem.')
    if (!aceita) return setErro('Você precisa aceitar os Termos de Uso e a Política de Privacidade.')
    if (!SITE_URL) return setErro('O cadastro pelo app precisa do endereço do site configurado (EXPO_PUBLIC_SITE_URL). Cadastre-se pelo site.')

    setErro(null)
    setEnviando(true)
    let resposta: { error?: string; success?: boolean } | null = null
    try {
      const res = await fetch(`${SITE_URL}/api/app/cadastro-cliente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          cpf: soDigitos(cpf),
          email: email.trim().toLowerCase(),
          telefone: soDigitos(telefone),
          senha,
          confirmaSenha: confirma,
          aceita_termos: true,
        }),
      })
      resposta = (await res.json()) as { error?: string; success?: boolean }
    } catch {
      resposta = { error: 'Sem conexão com o site. Confira a internet e tente de novo.' }
    }
    if (!resposta?.success) {
      setEnviando(false)
      return setErro(resposta?.error ?? 'Não foi possível criar a conta. Tente de novo.')
    }
    // Conta criada: entra neste aparelho.
    const { error } = await signIn(email.trim().toLowerCase(), senha)
    setEnviando(false)
    // A conta existe; se o login automático falhar, a pessoa entra pela tela de login.
    if (error) router.back()
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Criar conta" />
      <View style={{ gap: spacing.md }}>
        <Text style={styles.texto}>Conta de cliente, para agendar e acompanhar os serviços do seu pet.</Text>
        <Campo rotulo="Nome completo" value={nome} onChangeText={setNome} maxLength={120} autoCapitalize="words" autoComplete="name" />
        <Campo rotulo="CPF" value={cpf} onChangeText={t => setCpf(mascaraCpf(t))} keyboardType="number-pad" placeholder="000.000.000-00" maxLength={14} />
        <Campo rotulo="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        <Campo rotulo="Telefone / WhatsApp" value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(11) 98765-4321" maxLength={15} />
        <Campo
          rotulo="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          ajuda="8 caracteres ou mais, com letra maiúscula, número e símbolo."
        />
        <Campo rotulo="Repita a senha" value={confirma} onChangeText={setConfirma} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
        <LinhaSwitch titulo="Li e aceito os Termos de Uso e a Política de Privacidade" valor={aceita} onChange={setAceita} />
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Botao rotulo="Criar conta" onPress={cadastrar} carregando={enviando} />
        <Aviso tipo="info" texto="Tem um petshop? O cadastro da loja é feito pelo site — depois é só entrar aqui com a mesma conta." />
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  texto: { ...typography.body.lg, color: colors.textMuted },
})
