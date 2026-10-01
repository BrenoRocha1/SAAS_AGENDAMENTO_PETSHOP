import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/theme/theme'

// Retorno do login com Google. No Android, o endereço de volta
// (saip://auth#…) também chega ao roteador como um link — sem esta tela
// apareceria "rota não encontrada" por um instante. Ela não faz o login
// (quem lê os dados do retorno é o AuthContext): só segura a tela e
// devolve a pessoa pro lugar certo.
export default function RetornoDoLogin() {
  const { loading, session, modo } = useAuth()

  if (loading) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.primary600} />
      </View>
    )
  }
  return <Redirect href={!session ? '/login' : modo === 'taxidog' ? '/taxidog' : '/'} />
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
})
