import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit() {
    if (!email.trim() || !senha) {
      setErro('Preencha e-mail e senha.')
      return
    }
    setErro(null)
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
        <View style={styles.content}>
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
            disabled={enviando}
            style={({ pressed }) => [styles.botao, (pressed || enviando) && styles.botaoPressionado]}
          >
            {enviando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoTexto}>Entrar</Text>}
          </Pressable>

          <Text style={styles.rodape}>Feito para a equipe do seu petshop</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
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
  botaoTexto: { color: colors.white, ...typography.heading.sm },
  rodape: { textAlign: 'center', color: colors.textFaint, ...typography.body.sm, marginTop: spacing['2xl'] },
})
