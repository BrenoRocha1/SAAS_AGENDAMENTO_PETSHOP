import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ilustracao, type NomeIlustracao } from '@/components/Ilustracao'
import { LogoSaip } from '@/components/LogoSaip'
import { IconCheck, IconChevronRight } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'
import { FONTE_TITULO } from '@/theme/fontes'

export type PerfilCadastro = 'cliente' | 'lojista'

// Primeira tela de quem entrou com o Google e ainda não tem cadastro: é
// cliente ou tem um petshop? Obrigatória — a tela de entrar não pergunta, e
// é daqui que saem os dois cadastros em etapas. A mesma tela do site
// (/completar-cadastro), com as medidas de `cadastro-loja.css`.
export function EscolhaPerfil({ nome, email, onEscolher, onOutraConta }: {
  nome?: string | null
  email?: string | null
  onEscolher: (perfil: PerfilCadastro) => void
  onOutraConta: () => void
}) {
  const primeiroNome = (nome ?? '').trim().split(/\s+/)[0] ?? ''
  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.topo}><LogoSaip altura={22} /></View>
      <ScrollView contentContainerStyle={styles.corpo}>
        <View style={styles.palco}>
          <View style={styles.circulo} />
          <Ilustracao nome="boas-vindas" altura={190} />
        </View>

        <View style={styles.conteudo}>
          <Text style={styles.titulo}>{primeiroNome ? `Boas-vindas, ${primeiroNome}!` : 'Boas-vindas ao SAIP!'}</Text>
          <Text style={styles.sub}>Para começar, conte como você vai usar o SAIP.</Text>
          <View style={styles.escolhas}>
            <Opcao ilustracao="pets" titulo="Sou cliente" desc="Quero agendar banho, tosa e outros cuidados para o meu pet." onPress={() => onEscolher('cliente')} />
            <Opcao ilustracao="loja" titulo="Tenho um petshop" desc="Quero receber agendamentos e organizar a minha loja." onPress={() => onEscolher('lojista')} />
          </View>
        </View>

        <View style={styles.rodape}>
          {email ? (
            <View style={styles.google}>
              <IconCheck size={15} color={colors.success} />
              <Text style={styles.googleTexto}>Conectado com o Google · {email}</Text>
            </View>
          ) : null}
          <Pressable onPress={onOutraConta} accessibilityRole="button" style={styles.outra}>
            <Text style={styles.outraTexto}>Entrar com outra conta</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Opcao({ ilustracao, titulo, desc, onPress }: { ilustracao: NomeIlustracao; titulo: string; desc: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={titulo} style={({ pressed }) => [styles.escolha, pressed && styles.escolhaApertada]}>
      <View style={styles.figura}><Ilustracao nome={ilustracao} altura={64} /></View>
      <View style={styles.textos}>
        <Text style={styles.escolhaTitulo}>{titulo}</Text>
        <Text style={styles.escolhaDesc}>{desc}</Text>
      </View>
      <IconChevronRight size={20} color="#858d99" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.surface },
  topo: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 20 },
  corpo: { flexGrow: 1, paddingHorizontal: 20 },
  palco: { height: 230, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  circulo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: colors.primary50 },
  conteudo: { gap: 10, paddingTop: 20 },
  titulo: { fontFamily: FONTE_TITULO, fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  sub: { fontSize: 15, lineHeight: 22.5, color: colors.textMuted, marginBottom: 6 },
  escolhas: { gap: 12 },
  escolha: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.surface },
  escolhaApertada: { borderColor: colors.primary600, transform: [{ scale: 0.99 }] },
  figura: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary50, overflow: 'hidden' },
  textos: { flex: 1, gap: 2 },
  escolhaTitulo: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text },
  escolhaDesc: { fontSize: 14, lineHeight: 19.6, color: colors.textMuted },
  rodape: { marginTop: 'auto', paddingTop: 20, paddingBottom: 16, gap: 10, alignItems: 'center' },
  google: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  googleTexto: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: '#858d99' },
  outra: { height: 40, alignItems: 'center', justifyContent: 'center' },
  outraTexto: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.textMuted },
})
