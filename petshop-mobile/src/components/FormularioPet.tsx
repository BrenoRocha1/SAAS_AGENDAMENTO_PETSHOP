import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from './Aviso'
import { Campo } from './Campo'
import { IconSave } from './IconesDoSite'
import { Seletor } from './Seletor'
import { Text } from '@/components/Texto'
import { dataParaISO, isoParaData, mascaraData, numeroParaCampo, paraNumero } from '@/lib/mascaras'
import { hojeBrasilISO } from '@/lib/agenda'
import { colors } from '@/theme/theme'

export interface DadosPet {
  nome: string
  raca: string
  sexo: 'Macho' | 'Fêmea'
  especie: 'Cão' | 'Gato' | ''
  porte: 'Pequeno' | 'Médio' | 'Grande' | ''
  dt_nasc: string // ISO
  peso: number | null
  obs: string
}

interface Props {
  inicial?: Partial<DadosPet>
  // Edição: o botão vira "Salvar alterações", com o disquete.
  editando?: boolean
  onSalvar: (dados: DadosPet) => Promise<string | null>
  onCancelar: () => void
}

const SEXOS: { valor: DadosPet['sexo'] | ''; rotulo: string }[] = [
  { valor: '', rotulo: 'Selecione' },
  { valor: 'Macho', rotulo: 'Macho' },
  { valor: 'Fêmea', rotulo: 'Fêmea' },
]
const ESPECIES: { valor: DadosPet['especie']; rotulo: string }[] = [
  { valor: '', rotulo: 'Não informar' },
  { valor: 'Cão', rotulo: 'Cão' },
  { valor: 'Gato', rotulo: 'Gato' },
]
const PORTES: { valor: DadosPet['porte']; rotulo: string }[] = [
  { valor: '', rotulo: 'Não informar' },
  { valor: 'Pequeno', rotulo: 'Pequeno' },
  { valor: 'Médio', rotulo: 'Médio' },
  { valor: 'Grande', rotulo: 'Grande' },
]

// Cadastro e edição de pet pelo próprio cliente — o mesmo formulário das
// páginas do site (/cliente/pets/novo e /cliente/pets/[id]/editar), com as
// medidas delas em largura de celular: cartão, campos na mesma ordem e, no
// pé, "Cancelar" e o botão de salvar.
export function FormularioPet({ inicial, editando, onSalvar, onCancelar }: Props) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [raca, setRaca] = useState(inicial?.raca ?? '')
  const [sexo, setSexo] = useState<DadosPet['sexo'] | ''>(inicial?.sexo ?? '')
  const [especie, setEspecie] = useState<DadosPet['especie']>(inicial?.especie ?? '')
  const [porte, setPorte] = useState<DadosPet['porte']>(inicial?.porte ?? '')
  const [nascimento, setNascimento] = useState(isoParaData(inicial?.dt_nasc))
  const [peso, setPeso] = useState(inicial?.peso ? numeroParaCampo(inicial.peso, 1) : '')
  const [obs, setObs] = useState(inicial?.obs ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!nome.trim()) return setErro('Informe o nome do pet.')
    if (!raca.trim()) return setErro('Informe a raça (use "SRD" se não tiver).')
    if (!sexo) return setErro('Selecione o sexo do pet.')
    const iso = dataParaISO(nascimento)
    if (!iso) return setErro('Data de nascimento é obrigatória')
    if (iso > hojeBrasilISO()) return setErro('Data de nascimento não pode ser futura')
    const kg = peso.trim() ? paraNumero(peso) : null
    if (kg !== null && (!Number.isFinite(kg) || kg <= 0)) return setErro('Peso inválido')
    if (kg !== null && kg >= 200) return setErro('Peso muito alto')
    setErro(null)
    setSalvando(true)
    const falha = await onSalvar({ nome: nome.trim(), raca: raca.trim(), sexo, especie, porte, dt_nasc: iso, peso: kg, obs: obs.trim() })
    setSalvando(false)
    if (falha) setErro(falha)
  }

  return (
    <View style={styles.cartao}>
      {erro && <Aviso tipo="erro" texto={erro} style={styles.aviso} />}

      <View style={styles.formulario}>
        <View style={styles.dupla}>
          <Campo rotulo="Nome do Pet" obrigatorio value={nome} onChangeText={setNome} placeholder="Rex" maxLength={80} autoCapitalize="words" editable={!salvando} />
          <Campo rotulo="Raça" obrigatorio value={raca} onChangeText={setRaca} placeholder="Labrador" maxLength={80} autoCapitalize="words" editable={!salvando} />
        </View>

        <View style={styles.dupla}>
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Sexo<Text style={styles.estrela}> *</Text></Text>
            <Seletor titulo="Sexo" valor={sexo} opcoes={SEXOS} desativado={salvando} onChange={setSexo} />
          </View>
          <Campo
            rotulo="Data de Nascimento"
            obrigatorio
            value={nascimento}
            onChangeText={t => setNascimento(mascaraData(t))}
            keyboardType="number-pad"
            placeholder="dd/mm/aaaa"
            maxLength={10}
            editable={!salvando}
          />
        </View>

        <View style={styles.dupla}>
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Espécie</Text>
            <Seletor titulo="Espécie" valor={especie} opcoes={ESPECIES} desativado={salvando} onChange={setEspecie} />
            <Text style={styles.ajuda}>Usado para calcular preços por porte/raça, quando o petshop configura</Text>
          </View>
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Porte</Text>
            <Seletor titulo="Porte" valor={porte} opcoes={PORTES} desativado={salvando} onChange={setPorte} />
          </View>
        </View>

        <Campo rotulo="Peso (kg)" value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="8.5" maxLength={6} editable={!salvando} />
        <Campo
          rotulo="Observações"
          value={obs}
          onChangeText={setObs}
          placeholder="Informações importantes sobre o pet (alergias, comportamento, etc.)"
          maxLength={500}
          multiline
          editable={!salvando}
        />

        <View style={styles.rodape}>
          <Pressable
            onPress={onCancelar}
            disabled={salvando}
            accessibilityRole="button"
            style={({ pressed }) => [styles.botao, styles.cancelar, (pressed || salvando) && styles.apagado]}
          >
            {/* Na edição o site chama este botão de "Voltar". */}
            <Text style={[styles.botaoTexto, styles.cancelarTexto]}>{editando ? 'Voltar' : 'Cancelar'}</Text>
          </Pressable>
          <Pressable
            onPress={salvar}
            disabled={salvando}
            accessibilityRole="button"
            accessibilityState={{ disabled: salvando }}
            style={({ pressed }) => [styles.botao, styles.salvar, (pressed || salvando) && styles.apagado]}
          >
            {salvando ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                {editando && <IconSave size={15} color={colors.white} />}
                <Text style={[styles.botaoTexto, styles.salvarTexto]} numberOfLines={1}>{editando ? 'Salvar alterações' : 'Cadastrar Pet'}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cartao: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  aviso: { marginBottom: 16 },
  formulario: { gap: 16 },
  // O `.form-grid-2` do site: no celular, um campo embaixo do outro.
  dupla: { gap: 12 },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  estrela: { color: colors.dangerFg },
  ajuda: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  rodape: { flexDirection: 'row', gap: 12, marginTop: 8 },
  // `.btn.btn-lg` do site: 50 de altura, letra de 16.
  botao: { height: 50, paddingHorizontal: 32, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botaoTexto: { fontSize: 16, lineHeight: 16, fontWeight: '600' },
  cancelar: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  cancelarTexto: { color: '#1f2937' },
  // Ocupa o que sobra da linha; sem respiro dos lados para o texto caber
  // inteiro (no site ele também passa do respiro, numa linha só).
  salvar: { flex: 1, paddingHorizontal: 0, backgroundColor: colors.primary600, borderColor: colors.primary600 },
  salvarTexto: { color: colors.white },
  apagado: { opacity: 0.6 },
})
