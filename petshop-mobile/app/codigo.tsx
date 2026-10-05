import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ilustracao } from '@/components/Ilustracao'
import { useAuth } from '@/contexts/AuthContext'
import { colors, radius, spacing, typography } from '@/theme/theme'

const TAMANHO = 6

// Login da equipe: só o código de acesso rápido que o responsável da loja
// gera na tela do funcionário (6 dígitos, 1 minuto, uso único) — o mesmo
// de /login/funcionario no painel web. Não tem e-mail nem senha: o código
// já diz quem está entrando. Entra sozinho ao completar os 6 dígitos.
//
// As células são só desenho: quem recebe a digitação é um campo invisível
// por cima delas (assim colar e o preenchimento automático do código
// funcionam como em qualquer campo).
export default function CodigoScreen() {
  const { signInWithCode } = useAuth()
  const router = useRouter()
  const campo = useRef<TextInput>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [recusado, setRecusado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // Código recusado: as células ficam vermelhas e depois esvaziam pra
  // digitar de novo.
  useEffect(() => {
    if (!recusado) return
    const volta = setTimeout(() => {
      setCodigo('')
      setRecusado(false)
      campo.current?.focus()
    }, 900)
    return () => clearTimeout(volta)
  }, [recusado])

  async function entrar(valor: string) {
    setErro(null)
    setEnviando(true)
    const { error } = await signInWithCode(valor)
    setEnviando(false)
    // Deu certo: a sessão muda e o app sai desta tela sozinho.
    if (error) {
      setErro(error)
      setRecusado(true)
    }
  }

  function aoDigitar(texto: string) {
    if (enviando || recusado) return
    const valor = texto.replace(/\D/g, '').slice(0, TAMANHO)
    setCodigo(valor)
    if (valor) setErro(null)
    if (valor.length === TAMANHO) entrar(valor)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Ionicons name="paw" size={24} color={colors.white} />
            </View>
            <Text style={styles.brandText}>
              SA<Text style={{ color: colors.primary600 }}>IP</Text>
            </Text>
          </View>

          <Ilustracao nome="codigo" altura={140} style={styles.ilustracao} />

          <Text style={styles.title}>Código de acesso rápido</Text>
          <Text style={styles.subtitle}>Digite os 6 números que o responsável da loja gerou para você</Text>

          {erro && (
            <View style={styles.alerta} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.dangerFg} />
              <Text style={styles.alertaTexto}>{erro}</Text>
            </View>
          )}

          <Pressable onPress={() => campo.current?.focus()} style={styles.celulas} accessibilityLabel="Código de acesso">
            {Array.from({ length: TAMANHO }, (_, i) => {
              const digito = codigo[i] ?? ''
              const ativa = !enviando && !recusado && i === Math.min(codigo.length, TAMANHO - 1)
              return (
                <View
                  key={i}
                  style={[
                    styles.celula,
                    i === TAMANHO / 2 && styles.celulaGrupo,
                    !!digito && styles.celulaCheia,
                    ativa && styles.celulaAtiva,
                    recusado && styles.celulaErro,
                  ]}
                >
                  <Text style={styles.digito}>{digito}</Text>
                </View>
              )
            })}
            <TextInput
              ref={campo}
              value={codigo}
              onChangeText={aoDigitar}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={TAMANHO}
              autoFocus
              editable={!enviando}
              caretHidden
              accessibilityLabel="Código de acesso, 6 dígitos"
              style={styles.campoInvisivel}
            />
          </Pressable>

          <View style={styles.rodape}>
            {enviando ? (
              <ActivityIndicator color={colors.primary600} />
            ) : (
              <Text style={styles.ajuda}>
                O código vale 1 minuto e já identifica você — não precisa de e-mail nem senha.
              </Text>
            )}
          </View>

          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="link" style={styles.voltar}>
            <Text style={styles.voltarTexto}>Voltar para o login</Text>
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
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  ilustracao: { marginBottom: spacing.xl },
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
  celulas: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  // Largura flexível com teto: em tela estreita as seis células encolhem
  // pra caber (com largura fixa, a primeira e a última saíam da tela).
  celula: {
    flex: 1,
    maxWidth: 44,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celulaGrupo: { marginLeft: spacing.md },
  celulaCheia: { borderColor: colors.borderStrong, backgroundColor: colors.surface },
  celulaAtiva: { borderColor: colors.primary600, backgroundColor: colors.surface },
  celulaErro: { borderColor: colors.dangerFg, backgroundColor: colors.surface },
  digito: { ...typography.heading.lg, color: colors.text },
  // Cobre as células inteiras: tocar em qualquer uma abre o teclado.
  campoInvisivel: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0 },
  rodape: { minHeight: 44, justifyContent: 'center', marginTop: spacing.lg },
  ajuda: { ...typography.body.md, color: colors.textMuted, textAlign: 'center' },
  voltar: { alignSelf: 'center', marginTop: spacing.xl, minHeight: 32, justifyContent: 'center' },
  voltarTexto: { ...typography.label.md, color: colors.primary600 },
})
