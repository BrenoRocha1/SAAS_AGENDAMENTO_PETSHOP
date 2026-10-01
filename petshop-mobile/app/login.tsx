import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { urlDoSite } from '@/lib/site'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth()
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
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Ionicons name="paw" size={24} color={colors.white} />
            </View>
            <Text style={styles.brandText}>
              SA<Text style={{ color: colors.primary600 }}>IP</Text>
            </Text>
          </View>

          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.subtitle}>Acesse o painel da sua loja</Text>

          {erro && (
            <View style={styles.alerta}>
              <Ionicons name="alert-circle" size={16} color={colors.dangerFg} />
              <Text style={styles.alertaTexto}>{erro}</Text>
            </View>
          )}

          {info && (
            <View style={[styles.alerta, styles.alertaInfo]}>
              <Ionicons name="information-circle" size={16} color={colors.infoFg} />
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
                <Ionicons name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textMuted} />
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
                <Ionicons name="logo-google" size={18} color={colors.text} />
                <Text style={styles.botaoGoogleTexto}>Entrar com Google</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.rodape}>Feito para a equipe do seu petshop</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing['2xl'] },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing['3xl'] },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { ...typography.heading.lg, color: colors.text },
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
  botaoTexto: { color: colors.white, ...typography.heading.sm },
  rodape: { textAlign: 'center', color: colors.textFaint, ...typography.body.sm, marginTop: spacing['2xl'] },
})
