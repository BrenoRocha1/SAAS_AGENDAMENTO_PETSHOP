import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ilustracao } from '@/components/Ilustracao'
import { MarcaSaip } from '@/components/MarcaSaip'
import { Text, TextInput } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { urlDoSite } from '@/lib/site'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [abrindoGoogle, setAbrindoGoogle] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  async function entrarComGoogle() {
    setErro(null)
    setInfo(null)
    setAbrindoGoogle(true)
    const { error } = await signInWithGoogle()
    setAbrindoGoogle(false)
    if (error) setErro(error)
  }

  // A redefinição de senha é a do painel web (o link do e-mail abre lá).
  function esqueciSenha() {
    const url = urlDoSite('/esqueci-senha')
    setErro(null)
    if (url) Linking.openURL(url)
    else setInfo('Para criar uma senha nova, abra o site da loja e toque em "Esqueci minha senha" na tela de entrar.')
  }

  async function handleSubmit() {
    if (!email.trim() || !senha) {
      setErro('Preencha e-mail e senha.')
      return
    }
    setErro(null)
    setInfo(null)
    setEnviando(true)
    const { error } = await signIn(email.trim(), senha)
    setEnviando(false)
    if (error) setErro(error)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <MarcaSaip />

          <Ilustracao nome="login" altura={120} style={styles.ilustracao} />

          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.subtitle}>Cliente, loja ou equipe: a mesma conta do site</Text>

          {erro && (
            <View style={styles.alerta}>
              <IconeApp name="alert-circle" size={16} color={colors.dangerFg} />
              <Text style={styles.alertaTexto}>{erro}</Text>
            </View>
          )}

          {info && (
            <View style={[styles.alerta, styles.alertaInfo]}>
              <IconeApp name="information-circle" size={16} color={colors.infoFg} />
              <Text style={[styles.alertaTexto, { color: colors.infoFg }]}>{info}</Text>
            </View>
          )}

          <View style={styles.campo}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="voce@petshop.com"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.campo}>
            <Text style={styles.label}>Senha</Text>
            <View style={styles.senhaWrap}>
              <TextInput
                value={senha}
                onChangeText={setSenha}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!mostrarSenha}
                autoCapitalize="none"
                style={[styles.input, styles.senhaInput]}
              />
              <Pressable onPress={() => setMostrarSenha(v => !v)} hitSlop={8} style={styles.olho}>
                <IconeApp name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={enviando || abrindoGoogle}
            accessibilityRole="button"
            style={({ pressed }) => [styles.botao, (pressed || enviando) && styles.botaoPressionado]}
          >
            {enviando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoTexto}>Entrar</Text>}
          </Pressable>

          <Pressable onPress={esqueciSenha} hitSlop={8} accessibilityRole="link" style={styles.esqueci}>
            <Text style={styles.esqueciTexto}>Esqueci minha senha</Text>
          </Pressable>

          <View style={styles.divisor}>
            <View style={styles.divisorLinha} />
            <Text style={styles.divisorTexto}>ou</Text>
            <View style={styles.divisorLinha} />
          </View>

          <Pressable
            onPress={entrarComGoogle}
            disabled={enviando || abrindoGoogle}
            accessibilityRole="button"
            style={({ pressed }) => [styles.botaoGoogle, (pressed || abrindoGoogle) && styles.botaoPressionado]}
          >
            {abrindoGoogle ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <IconeApp name="logo-google" size={18} color={colors.text} />
                <Text style={styles.botaoGoogleTexto}>Entrar com Google</Text>
              </>
            )}
          </Pressable>

          {/* Equipe do petshop: entra só com o código de 6 dígitos que o
              responsável gera (sem e-mail nem senha). */}
          <Pressable
            onPress={() => router.push('/codigo')}
            disabled={enviando || abrindoGoogle}
            accessibilityRole="button"
            style={({ pressed }) => [styles.botaoGoogle, styles.botaoCodigo, pressed && styles.botaoPressionado]}
          >
            <Text style={styles.cerquilha}>#</Text>
            <Text style={styles.botaoGoogleTexto}>Código de acesso rápido</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/cadastro')} hitSlop={8} accessibilityRole="link" style={styles.criarConta}>
            <Text style={styles.criarContaTexto}>
              Ainda não tem conta? <Text style={styles.esqueciTexto}>Criar conta de cliente</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing['2xl'] },
  ilustracao: { marginBottom: spacing.xl },
  title: { ...typography.heading.xl, color: colors.text, marginBottom: 4 },
  subtitle: { ...typography.body.lg, color: colors.textMuted, marginBottom: spacing['2xl'] },
  alerta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  alertaTexto: { ...typography.body.md, color: colors.dangerFg, flex: 1 },
  alertaInfo: { backgroundColor: colors.infoBg },
  campo: { marginBottom: spacing.lg },
  label: { ...typography.label.md, color: colors.textDim, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    ...typography.body.lg,
    color: colors.text,
  },
  senhaWrap: { justifyContent: 'center' },
  senhaInput: { paddingRight: 44 },
  olho: { position: 'absolute', right: spacing.md },
  botao: {
    backgroundColor: colors.primary600,
    borderRadius: radius.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  botaoPressionado: { opacity: 0.85 },
  esqueci: { alignSelf: 'center', marginTop: spacing.lg, minHeight: 32, justifyContent: 'center' },
  esqueciTexto: { ...typography.label.md, color: colors.primary600 },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
  divisorLinha: { flex: 1, height: 1, backgroundColor: colors.border },
  divisorTexto: { ...typography.body.sm, color: colors.textFaint },
  botaoGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    height: 50,
  },
  botaoGoogleTexto: { ...typography.heading.sm, color: colors.text },
  botaoCodigo: { marginTop: spacing.md },
  cerquilha: { ...typography.heading.sm, fontSize: 18, color: colors.text },
  botaoTexto: { color: colors.white, ...typography.heading.sm },
  criarConta: { alignSelf: 'center', marginTop: spacing['2xl'], minHeight: 32, justifyContent: 'center' },
  criarContaTexto: { ...typography.body.md, color: colors.textMuted, textAlign: 'center' },
})
