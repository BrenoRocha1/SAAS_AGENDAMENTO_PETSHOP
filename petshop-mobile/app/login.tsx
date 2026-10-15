import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { IconeApp } from '@/components/IconeApp'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IconeGoogle } from '@/components/IconeGoogle'
import { Ilustracao } from '@/components/Ilustracao'
import { MarcaSaip } from '@/components/MarcaSaip'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { FONTE_TITULO } from '@/theme/fontes'

// Os desenhos da própria tela de entrar do site (login/page.tsx).
function Traco({ size, color, children }: { size: number; color: string; children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  )
}
const IconeCerquilha = ({ size, color }: { size: number; color: string }) => (
  <Traco size={size} color={color}><Path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" /></Traco>
)

// Entrar — a tela do site no celular (petshop-app/src/app/login/page.tsx),
// com as mesmas medidas: só com a conta Google ou, para a equipe do petshop,
// com o código de acesso rápido. Não pergunta se é cliente ou lojista: conta
// nova escolhe isso na primeira tela do cadastro (CompletarCadastro).
// Não há e-mail e senha.
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
        <MarcaSaip style={styles.marca} />

        <Ilustracao nome="login" altura={110} style={styles.ilustracao} />

        <Text style={styles.title}>Entrar ou criar conta</Text>
        {/* O mesmo texto do site (login/page.tsx). */}
        <Text style={styles.subtitle}>
          Para clientes e petshops, é só com a sua conta Google: o sistema identifica sozinho se você já tem conta. Se não tiver, a gente cria na hora e pergunta se você é cliente ou tem um petshop.
        </Text>

        {erro && (
          <View style={styles.alerta}>
            <IconeApp name="alert-circle" size={15} color={colors.dangerFg} />
            <Text style={styles.alertaTexto}>{erro}</Text>
          </View>
        )}

        {/* Sem o aviso de erro, o espaço do texto (32) já separa os botões. */}
        <View style={[styles.botoes, !erro && { marginTop: 0 }]}>
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
                <IconeGoogle size={16} />
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
            style={({ pressed }) => [styles.botao, pressed && styles.botaoPressionado]}
          >
            <IconeCerquilha size={16} color={colors.text} />
            <Text style={styles.botaoTexto}>Código de acesso rápido</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// Medidas do site em 375 de largura (`.login-*` em globals.css).
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: 40 },
  marca: { marginBottom: 48 },
  ilustracao: { marginBottom: spacing.lg },
  title: { fontFamily: FONTE_TITULO, fontSize: 22, lineHeight: 27.5, fontWeight: '700', letterSpacing: -0.33, color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 21.7, color: colors.textMuted, marginBottom: 32 },
  alerta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: 0,
  },
  alertaTexto: { ...typography.body.md, color: colors.dangerFg, flex: 1 },
  botoes: { gap: 12, marginTop: 32 },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    height: 42,
  },
  botaoPressionado: { opacity: 0.85 },
  botaoTexto: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
})
