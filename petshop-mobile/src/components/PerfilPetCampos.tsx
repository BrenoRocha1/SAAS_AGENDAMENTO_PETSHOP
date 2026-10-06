import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Campo } from '@/components/Campo'
import { IconCheck, IconChevronRight, IconPlus } from '@/components/IconesDoSite'
import { Seletor } from '@/components/Seletor'
import { Text, TextInput } from '@/components/Texto'
import { COMPORTAMENTOS_SUGERIDOS } from '@/lib/taxidog'
import { colors } from '@/theme/theme'

// Perfil opcional do pet (migration 042): pelagem, características e
// comportamento. Fica recolhido — nada aqui é obrigatório para agendar.
export interface PerfilPet {
  pelagem: string
  comprimento_pelo: string
  caracteristicas: string
  comportamento: string[]
  obs_comportamento: string
}

export const PERFIL_PET_VAZIO: PerfilPet = {
  pelagem: '',
  comprimento_pelo: '',
  caracteristicas: '',
  comportamento: [],
  obs_comportamento: '',
}

// No formato que a salvarPerfilPetAction recebe.
export function perfilPetParaAction(p: PerfilPet) {
  return {
    pelagem: p.pelagem || null,
    comprimento_pelo: p.comprimento_pelo || null,
    caracteristicas: p.caracteristicas.trim() || null,
    comportamento: p.comportamento,
    obs_comportamento: p.obs_comportamento.trim() || null,
  }
}

export function perfilPetPreenchido(p: PerfilPet): boolean {
  return !!(p.pelagem || p.comprimento_pelo || p.caracteristicas.trim() || p.comportamento.length || p.obs_comportamento.trim())
}

const PELAGENS = [
  { valor: '', rotulo: 'Não informado' },
  { valor: 'Lisa', rotulo: 'Lisa' },
  { valor: 'Ondulada', rotulo: 'Ondulada' },
  { valor: 'Crespa', rotulo: 'Crespa' },
  { valor: 'Dupla', rotulo: 'Dupla (subpelo)' },
]

const COMPRIMENTOS = [
  { valor: '', rotulo: 'Não informado' },
  { valor: 'Curto', rotulo: 'Curto' },
  { valor: 'Médio', rotulo: 'Médio' },
  { valor: 'Longo', rotulo: 'Longo' },
]

interface Props {
  valor: PerfilPet
  onChange: (p: PerfilPet) => void
  desativado?: boolean
}

// "Mais informações" da janela do pet — o PerfilPetCampos do site.
export function PerfilPetCampos({ valor, onChange, desativado }: Props) {
  const [aberto, setAberto] = useState(perfilPetPreenchido(valor))
  const [novoTag, setNovoTag] = useState('')

  const sugestoes = [...COMPORTAMENTOS_SUGERIDOS, ...valor.comportamento.filter(t => !COMPORTAMENTOS_SUGERIDOS.includes(t))]

  function alternarTag(tag: string) {
    const tem = valor.comportamento.includes(tag)
    onChange({ ...valor, comportamento: tem ? valor.comportamento.filter(t => t !== tag) : [...valor.comportamento, tag] })
  }

  function adicionarTag() {
    const tag = novoTag.trim().slice(0, 40)
    if (!tag || valor.comportamento.includes(tag)) return
    onChange({ ...valor, comportamento: [...valor.comportamento, tag] })
    setNovoTag('')
  }

  return (
    <View style={styles.caixa}>
      <Pressable onPress={() => setAberto(a => !a)} accessibilityRole="button" accessibilityState={{ expanded: aberto }} style={styles.topo}>
        <IconChevronRight size={14} color={COR_TITULO} style={aberto ? styles.girado : undefined} />
        {/* Em tela estreita o "opcional…" desce para baixo do título. */}
        <View style={styles.titulos}>
          <Text style={styles.titulo}>Mais informações</Text>
          <Text style={styles.nota}>opcional · pelagem e comportamento</Text>
        </View>
      </Pressable>

      {aberto && (
        <View style={styles.campos}>
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Tipo de pelagem</Text>
            <Seletor titulo="Tipo de pelagem" valor={valor.pelagem} opcoes={PELAGENS} desativado={desativado} onChange={v => onChange({ ...valor, pelagem: v })} />
          </View>
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Comprimento do pelo</Text>
            <Seletor titulo="Comprimento do pelo" valor={valor.comprimento_pelo} opcoes={COMPRIMENTOS} desativado={desativado} onChange={v => onChange({ ...valor, comprimento_pelo: v })} />
          </View>

          <Campo
            rotulo="Características"
            value={valor.caracteristicas}
            onChangeText={t => onChange({ ...valor, caracteristicas: t })}
            placeholder="Ex: pelo costuma embolar atrás das orelhas"
            maxLength={300}
            editable={!desativado}
          />

          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Comportamento</Text>
            <Text style={[styles.nota, styles.depois]}>Uso interno da loja — aparece pra equipe e pro TaxiDog, nunca pro cliente.</Text>
            <View style={[styles.tags, styles.depois]}>
              {sugestoes.map(tag => {
                const ativo = valor.comportamento.includes(tag)
                return (
                  <Pressable
                    key={tag}
                    onPress={() => alternarTag(tag)}
                    disabled={desativado}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ativo, disabled: !!desativado }}
                    style={[styles.tag, ativo && styles.tagAtiva, desativado && styles.apagado]}
                  >
                    {ativo && <IconCheck size={12} color={colors.white} />}
                    <Text style={[styles.tagTexto, ativo && styles.tagTextoAtivo]}>{tag}</Text>
                  </Pressable>
                )
              })}
            </View>
            <View style={styles.novo}>
              <TextInput
                value={novoTag}
                onChangeText={setNovoTag}
                onSubmitEditing={adicionarTag}
                placeholder="Outro comportamento..."
                placeholderTextColor={colors.textFaint}
                maxLength={40}
                editable={!desativado}
                accessibilityLabel="Outro comportamento"
                style={styles.novoCampo}
              />
              <Pressable
                onPress={adicionarTag}
                disabled={desativado || !novoTag.trim()}
                accessibilityRole="button"
                accessibilityLabel="Adicionar comportamento"
                style={[styles.novoBotao, (desativado || !novoTag.trim()) && styles.apagado]}
              >
                <IconPlus size={13} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <Campo
            rotulo="Observações de comportamento"
            value={valor.obs_comportamento}
            onChangeText={t => onChange({ ...valor, obs_comportamento: t })}
            placeholder="Ex: fica mais calmo com o tutor por perto no começo"
            maxLength={500}
            multiline
            editable={!desativado}
          />
        </View>
      )}
    </View>
  )
}

const COR_TITULO = '#1f2937'

// Medidas do bloco no site, em 375 de largura.
const styles = StyleSheet.create({
  caixa: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  girado: { transform: [{ rotate: '90deg' }] },
  titulos: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  titulo: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: COR_TITULO },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  campos: { marginTop: 16, gap: 12 },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  // O que vem depois fica a 12 (4 do grupo + 8).
  depois: { marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // `.btn.btn-sm` em formato de pílula: cinza, ou índigo com o "✓" quando marcada.
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.border,
  },
  tagAtiva: { borderColor: colors.primary600, backgroundColor: colors.primary600 },
  tagTexto: { fontSize: 13, lineHeight: 13, fontWeight: '600', color: colors.text },
  tagTextoAtivo: { color: colors.white },
  apagado: { opacity: 0.5 },
  novo: { flexDirection: 'row', gap: 8 },
  novoCampo: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
  },
  novoBotao: {
    width: 37,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
