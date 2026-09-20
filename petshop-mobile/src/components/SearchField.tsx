import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, TextInput, View } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
}

export function SearchField({ value, onChangeText, placeholder = 'Buscar...' }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={18} color={colors.textFaint} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  icon: { marginRight: spacing.sm },
  input: { flex: 1, ...typography.body.lg, color: colors.text, height: '100%' },
})
