import { Image, Pressable, StyleSheet, View } from 'react-native'
import { IconDog, IconPaw, IconUser } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { colors, shadow } from '@/theme/theme'

// Card de pet — o `.pet-card` do site no celular
// (petshop-app/src/components/lojista/pets-lista.css): a foto em cima
// (4:3), o nome, raça e porte e uma última linha: o tutor (na lista da
// loja) ou um detalhe em texto (sexo e idade, em "Meus pets" do cliente).
// Dois por linha; o card inteiro abre a ficha do pet.
export function PetCartao({ pet, tutor, detalhe, onPress }: {
  pet: { nome: string; especie?: string | null; raca?: string | null; porte?: string | null; foto_url?: string | null }
  tutor?: string | null
  detalhe?: string | null
  onPress: () => void
}) {
  const Icone = pet.especie === 'Gato' ? IconPaw : IconDog
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir a ficha de ${pet.nome}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressionado]}
    >
      <View style={styles.foto}>
        {pet.foto_url
          ? <Image source={{ uri: pet.foto_url }} style={styles.imagem} resizeMode="cover" />
          : <Icone size={40} color={colors.primary300} />}
        {pet.especie ? (
          <View style={styles.selo}>
            <Text style={styles.seloTexto}>{pet.especie}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>{pet.nome}</Text>
        <Text style={styles.sub} numberOfLines={1}>{[pet.raca, pet.porte].filter(Boolean).join(' · ') || 'Pet'}</Text>
        {tutor ? (
          <View style={styles.linha}>
            <IconUser size={13} color={colors.primary600} />
            <Text style={styles.linhaTexto} numberOfLines={1}>{tutor}</Text>
          </View>
        ) : detalhe ? (
          <View style={styles.linha}>
            <Text style={[styles.linhaTexto, styles.linhaSimples]} numberOfLines={1}>{detalhe}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden', ...shadow.sm },
  pressionado: { borderColor: colors.primary200 },
  foto: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(79,70,229,0.12)' },
  imagem: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  selo: { position: 'absolute', left: 8, bottom: 8, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)' },
  seloTexto: { fontSize: 11, lineHeight: 17.6, fontWeight: '700', color: colors.primary300 },
  info: { gap: 2, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
  nome: { fontSize: 15, lineHeight: 19.5, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, lineHeight: 17.55, color: '#858d99' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  linhaTexto: { flexShrink: 1, fontSize: 13, lineHeight: 17.55, color: '#1f2937' },
  linhaSimples: { color: colors.textMuted },
})
