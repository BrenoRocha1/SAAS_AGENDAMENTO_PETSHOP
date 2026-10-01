import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Campo } from './Campo'
import { Segmentos } from './Opcao'
import { dataParaISO, isoParaData, mascaraData, numeroParaCampo, paraNumero } from '@/lib/mascaras'
import { hojeBrasilISO } from '@/lib/agenda'
import { colors, spacing, typography } from '@/theme/theme'

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
  rotuloBotao: string
  onSalvar: (dados: DadosPet) => Promise<string | null>
}

// Cadastro e edição de pet pela loja (os mesmos campos do painel web).
// Espécie e porte são o que casa com as faixas de preço dos serviços.
export function FormularioPet({ inicial, rotuloBotao, onSalvar }: Props) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [raca, setRaca] = useState(inicial?.raca ?? '')
  const [sexo, setSexo] = useState<'Macho' | 'Fêmea'>(inicial?.sexo ?? 'Macho')
  const [especie, setEspecie] = useState<DadosPet['especie']>(inicial?.especie ?? 'Cão')
  const [porte, setPorte] = useState<DadosPet['porte']>(inicial?.porte ?? '')
  const [nascimento, setNascimento] = useState(isoParaData(inicial?.dt_nasc))
  const [peso, setPeso] = useState(inicial?.peso ? numeroParaCampo(inicial.peso, 1) : '')
  const [obs, setObs] = useState(inicial?.obs ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!nome.trim()) return setErro('Informe o nome do pet.')
    if (!raca.trim()) return setErro('Informe a raça (use "SRD" se não tiver).')
    const iso = dataParaISO(nascimento)
    if (!iso) return setErro('Informe a data de nascimento (dia/mês/ano). Pode ser aproximada.')
    if (iso > hojeBrasilISO()) return setErro('A data de nascimento não pode ser futura.')
    const kg = peso.trim() ? paraNumero(peso) : null
    if (kg !== null && (!Number.isFinite(kg) || kg <= 0 || kg >= 200)) return setErro('Peso inválido.')
    setErro(null)
    setSalvando(true)
    const falha = await onSalvar({ nome: nome.trim(), raca: raca.trim(), sexo, especie, porte, dt_nasc: iso, peso: kg, obs: obs.trim() })
    setSalvando(false)
    if (falha) setErro(falha)
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Campo rotulo="Nome do pet" value={nome} onChangeText={setNome} maxLength={80} autoCapitalize="words" />

      <Text style={styles.rotulo}>Espécie</Text>
      <Segmentos valor={especie} onChange={setEspecie} opcoes={[{ valor: 'Cão', rotulo: 'Cão' }, { valor: 'Gato', rotulo: 'Gato' }]} />

      <Text style={styles.rotulo}>Porte</Text>
      <Segmentos
        valor={porte}
        onChange={setPorte}
        opcoes={[{ valor: 'Pequeno', rotulo: 'Pequeno' }, { valor: 'Médio', rotulo: 'Médio' }, { valor: 'Grande', rotulo: 'Grande' }]}
      />
      {porte === '' && <Text style={styles.ajuda}>Sem porte, o pet paga o preço padrão do serviço (as faixas por porte não se aplicam).</Text>}

      <Campo rotulo="Raça" value={raca} onChangeText={setRaca} placeholder="Ex.: Shih Tzu, SRD" maxLength={80} autoCapitalize="words" />

      <Text style={styles.rotulo}>Sexo</Text>
      <Segmentos valor={sexo} onChange={setSexo} opcoes={[{ valor: 'Macho', rotulo: 'Macho' }, { valor: 'Fêmea', rotulo: 'Fêmea' }]} />

      <View style={styles.duas}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nascimento" value={nascimento} onChangeText={t => setNascimento(mascaraData(t))} keyboardType="number-pad" placeholder="dd/mm/aaaa" maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Peso (kg, opcional)" value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="Ex.: 8,5" maxLength={6} />
        </View>
      </View>

      <Campo rotulo="Observações (opcional)" value={obs} onChangeText={setObs} placeholder="Alergias, medos, cuidados…" maxLength={500} multiline />

      {erro && <Aviso tipo="erro" texto={erro} />}
      <Botao rotulo={rotuloBotao} onPress={salvar} carregando={salvando} />
    </View>
  )
}

// Campos do formulário no formato que as actions de pet recebem.
export function camposDoPet(idCliente: string, d: DadosPet): Record<string, string | number | null> {
  return {
    id_cliente: idCliente,
    nome: d.nome,
    raca: d.raca,
    sexo: d.sexo,
    especie: d.especie || null,
    porte: d.porte || null,
    dt_nasc: d.dt_nasc,
    peso: d.peso,
    obs: d.obs || null,
  }
}

const styles = StyleSheet.create({
  rotulo: { ...typography.label.md, color: colors.textDim },
  ajuda: { ...typography.body.sm, color: colors.textMuted },
  duas: { flexDirection: 'row', gap: spacing.md },
})
