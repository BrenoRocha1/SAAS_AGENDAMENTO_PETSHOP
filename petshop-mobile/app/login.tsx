import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IconeGoogle } from '@/components/IconeGoogle'
import { Ilustracao } from '@/components/Ilustracao'
import { MarcaSaip } from '@/components/MarcaSaip'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Entrar — a mesma tela do site (petshop-app/src/app/login/page.tsx): só
// com a conta Google (quem ainda não tem cadastro termina ali mesmo, em
// CompletarCadastro) ou, para a equipe do petshop, com o código de acesso
// rápido. Não há mais e-mail e senha.
export default function LoginScreen() {
  const { signInWithGoogle } = useAuth()
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [abrindoGoogle, setAbrindoGoogle] = useState(false)

  async function entrarComGoogle() {
    setErro(null)
    setAbrindoGoogle(true)
    const { error } = await signInWithGoogle()
    setAbrindoGoogle(false)
    if (error) setErro(error)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <MarcaSaip />

        <Ilustracao nome="login" altura={120} style={styles.ilustracao} />

        <Text style={styles.title}>Entrar ou criar conta</Text>
        <Text style={styles.subtitle}>
          Cliente, loja ou equipe: a mesma conta do site. É só com a sua conta Google: o sistema identifica sozinho se você já
          tem conta — se não tiver, ela é criada na hora.
        </Text>

        {erro && (
          <View style={styles.alerta}>
            <IconeApp name="alert-circle" size={16} color={colors.dangerFg} />
            <Text style={styles.alertaTexto}>{erro}</Text>
          </View>
        )}

        {/* Botão do Google como a marca pede: fundo branco e o "G" nas
            quatro cores. */}
        <Pressable
          onPress={entrarComGoogle}
          disabled={abrindoGoogle}
          accessibilityRole="button"
          style={({ pressed }) => [styles.botao, (pressed || abrindoGoogle) && styles.botaoPressionado]}
        >
          {abrindoGoogle ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <IconeGoogle size={18} />
              <Text style={styles.botaoTexto}>Continuar com o Google</Text>
            </>
          )}
        </Pressable>

        {/* Equipe do petshop: entra só com o código de 6 dígitos que o
            responsável gera. */}
        <Pressable
          onPress={() => router.push('/codigo')}
          disabled={abrindoGoogle}
          accessibilityRole="button"
          style={({ pressed }) => [styles.botao, styles.botaoCodigo, pressed && styles.botaoPressionado]}
        >
          <Text style={styles.cerquilha}>#</Text>
          <Text style={styles.botaoTexto}>Código de acesso rápido</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
  botao: {
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
  botaoPressionado: { opacity: 0.85 },
  botaoTexto: { ...typography.heading.sm, color: colors.text },
  botaoCodigo: { marginTop: spacing.md },
  cerquilha: { ...typography.heading.sm, fontSize: 18, color: colors.text },
})
