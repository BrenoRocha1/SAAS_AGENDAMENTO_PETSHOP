import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ilustracao, type NomeIlustracao } from '@/components/Ilustracao'
import { LogoSaip } from '@/components/LogoSaip'
import { IconAlert, IconCheck, IconChevronLeft, IconPaw, IconUser } from '@/components/IconesDoSite'
import { Text, TextInput } from '@/components/Texto'
import { mascaraTelefoneLoja } from '@/lib/cadastro-loja'
import {
  DADOS_CLIENTE_VAZIOS,
  ESPECIES,
  ETAPAS_CLIENTE,
  PORTES,
  SEXOS,
  TEXTO_ETAPA_CLIENTE,
  camposDoCadastroCliente,
  etapaAnteriorCliente,
  etapaDoErroCliente,
  mascaraCpfCliente,
  mascaraDataCliente,
  petEmUmaLinha,
  primeiroNome,
  problemaDaEtapaCliente,
  proximaEtapaCliente,
  temPet,
  type DadosCliente,
} from '@/lib/cadastro-cliente-etapas'
import { colors } from '@/theme/theme'
import { FONTE_TITULO } from '@/theme/fontes'

// Cadastro do cliente em etapas — o mesmo do site (CadastroClienteEtapas) e
// no mesmo jeito do cadastro da loja (CadastroLoja): uma pergunta por tela,
// a ilustração muda a cada passo, o nome da pessoa e depois o do pet
// acompanham numa placa. Quem grava é `onEnviar` (a action do site).
export function CadastroClienteEtapas({ email, nomeGoogle, onEnviar, onVoltarInicio }: {
  email?: string | null
  nomeGoogle?: string | null
  onEnviar: (campos: Record<string, string>) => Promise<{ error?: string }>
  // No primeiro passo, a seta volta para a escolha "cliente ou lojista".
  onVoltarInicio?: () => void
}) {
  const [dados, setDados] = useState<DadosCliente>({ ...DADOS_CLIENTE_VAZIOS, nome: nomeGoogle ?? '' })
  const [indice, setIndice] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Troca de etapa: a nova entra deslizando de onde se está indo.
  const entrada = useRef(new Animated.Value(1)).current
  const [direcao, setDirecao] = useState(1)
  useEffect(() => {
    entrada.setValue(0)
    Animated.timing(entrada, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== 'web' }).start()
  }, [indice, entrada])
  const estiloEntrada = {
    opacity: entrada,
    transform: [{ translateX: entrada.interpolate({ inputRange: [0, 1], outputRange: [28 * direcao, 0] }) }],
  }

  const etapa = ETAPAS_CLIENTE[indice]
  const texto = TEXTO_ETAPA_CLIENTE[etapa]
  const compacto = etapa === 'pet_detalhes' || etapa === 'pronto'
  const nome = primeiroNome(dados.nome)
  const pet = dados.pet_nome.trim()
  const ehPet = etapa === 'pet' || etapa === 'pet_detalhes'
  const mudar = (parte: Partial<DadosCliente>) => { setDados(d => ({ ...d, ...parte })); setErro(null) }

  function irPara(i: number) {
    setDirecao(i >= indice ? 1 : -1)
    setIndice(Math.max(0, Math.min(ETAPAS_CLIENTE.length - 1, i)))
    setErro(null)
  }

  // "Pular por agora" no pet: sai sem pet nenhum.
  function pularPet() {
    setDados(d => ({ ...d, pet_nome: '', especie: '', sexo: '', porte: '', raca: '', nascimento: '' }))
    irPara(ETAPAS_CLIENTE.indexOf('pronto'))
  }

  async function avancar() {
    const problema = problemaDaEtapaCliente(etapa, dados)
    if (problema) return setErro(problema)
    if (etapa !== 'pronto') return irPara(proximaEtapaCliente(indice, dados))
    setEnviando(true)
    const r = await onEnviar(camposDoCadastroCliente(dados))
    setEnviando(false)
    if (r.error) {
      // Volta para a etapa do problema, com a mensagem do servidor.
      const alvo = ETAPAS_CLIENTE.indexOf(etapaDoErroCliente(r.error))
      if (alvo !== indice) irPara(alvo)
      setErro(r.error.replace(/^Pet: /, ''))
    }
  }

  const titulo = etapa === 'pronto' && nome ? `Tudo pronto, ${nome}!`
    : etapa === 'pet_detalhes' && pet ? `Mais sobre ${pet}`
    : texto.titulo

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.topo}>
        {indice > 0 || onVoltarInicio ? (
          <Pressable onPress={() => (indice > 0 ? irPara(etapaAnteriorCliente(indice, dados)) : onVoltarInicio?.())} disabled={enviando} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar" style={styles.voltar}>
            <IconChevronLeft size={22} color={colors.text} />
          </Pressable>
        ) : (
          <LogoSaip altura={22} />
        )}
        <View style={styles.progresso} accessibilityLabel={`Passo ${indice + 1} de ${ETAPAS_CLIENTE.length}`}>
          {ETAPAS_CLIENTE.map((e, i) => <View key={e} style={[styles.traco, i <= indice && styles.tracoFeito]} />)}
        </View>
        <Text style={styles.passo}>{indice + 1} de {ETAPAS_CLIENTE.length}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.corpo} keyboardShouldPersistTaps="handled">
          <Animated.View style={[styles.palco, compacto && styles.palcoCompacto, estiloEntrada]}>
            <View style={[styles.circulo, compacto && styles.circuloCompacto]} />
            <Ilustracao nome={texto.ilustracao as NomeIlustracao} altura={compacto ? 130 : 190} />
            {/* Numa placa: o nome da pessoa e, nas telas do pet, o nome dele. */}
            {ehPet ? (
              pet !== '' && (
                <View style={styles.placa}>
                  <IconPaw size={16} color={colors.primary600} />
                  <Text style={styles.placaTexto} numberOfLines={1}>{pet}</Text>
                </View>
              )
            ) : (
              nome !== '' && etapa !== 'pronto' && (
                <View style={styles.placa}>
                  <IconUser size={16} color={colors.primary600} />
                  <Text style={styles.placaTexto} numberOfLines={1}>Oi, {nome}!</Text>
                </View>
              )
            )}
          </Animated.View>

          <Animated.View style={[styles.conteudo, estiloEntrada]}>
            {texto.opcional && <View style={styles.opcional}><Text style={styles.opcionalTexto}>Opcional</Text></View>}
            <Text style={styles.titulo}>{titulo}</Text>
            <Text style={styles.sub}>{texto.sub}</Text>

            {etapa === 'nome' && (
              <>
                <TextInput style={styles.input} autoFocus placeholder="Seu nome" placeholderTextColor={colors.textFaint} value={dados.nome} maxLength={120}
                  autoComplete="name" onChangeText={t => mudar({ nome: t })} accessibilityLabel="Seu nome" returnKeyType="next" onSubmitEditing={avancar} />
                {email ? (
                  <View style={styles.google}>
                    <IconCheck size={15} color={colors.success} />
                    <Text style={styles.googleTexto}>Conectado com o Google · {email}</Text>
                  </View>
                ) : null}
              </>
            )}

            {etapa === 'whatsapp' && (
              <TextInput style={styles.input} autoFocus keyboardType="phone-pad" placeholder="(11) 98765-4321" placeholderTextColor={colors.textFaint} value={dados.telefone}
                onChangeText={t => mudar({ telefone: mascaraTelefoneLoja(t) })} accessibilityLabel="Seu WhatsApp" />
            )}

            {etapa === 'cpf' && (
              <TextInput style={styles.input} autoFocus keyboardType="number-pad" placeholder="000.000.000-00" placeholderTextColor={colors.textFaint} value={dados.cpf}
                onChangeText={t => mudar({ cpf: mascaraCpfCliente(t) })} accessibilityLabel="CPF" />
            )}

            {etapa === 'pet' && (
              <View style={styles.campos}>
                <TextInput style={styles.input} autoFocus placeholder="Nome do pet" placeholderTextColor={colors.textFaint} value={dados.pet_nome} maxLength={80}
                  onChangeText={t => mudar({ pet_nome: t })} accessibilityLabel="Nome do pet" />
                <Opcoes rotulo="Espécie" opcoes={ESPECIES} valor={dados.especie} onChange={v => mudar({ especie: v })} />
              </View>
            )}

            {etapa === 'pet_detalhes' && (
              <View style={styles.campos}>
                <Opcoes rotulo="Sexo" opcoes={SEXOS} valor={dados.sexo} onChange={v => mudar({ sexo: v })} />
                <Opcoes rotulo="Porte" opcoes={PORTES} valor={dados.porte} onChange={v => mudar({ porte: v === dados.porte ? '' : v })} />
                <View style={styles.linha}>
                  <TextInput style={[styles.input, styles.cresce]} placeholder={dados.especie === 'Gato' ? 'Raça (ex.: SRD, Siamês)' : 'Raça (ex.: SRD, Shih Tzu)'} placeholderTextColor={colors.textFaint}
                    value={dados.raca} maxLength={80} onChangeText={t => mudar({ raca: t })} accessibilityLabel="Raça" />
                  <TextInput style={[styles.input, styles.nasc]} keyboardType="number-pad" placeholder="Nascimento" placeholderTextColor={colors.textFaint} value={dados.nascimento}
                    onChangeText={t => mudar({ nascimento: mascaraDataCliente(t) })} accessibilityLabel="Data de nascimento (dia/mês/ano)" />
                </View>
              </View>
            )}

            {etapa === 'pronto' && (
              <View>
                <LinhaRevisao rotulo="Nome" valor={dados.nome.trim()} onAlterar={() => irPara(0)} />
                <LinhaRevisao rotulo="WhatsApp" valor={dados.telefone} onAlterar={() => irPara(1)} />
                <LinhaRevisao rotulo="CPF" valor={dados.cpf} onAlterar={() => irPara(2)} />
                <LinhaRevisao rotulo="Pet" valor={petEmUmaLinha(dados) || 'Cadastrar depois'} apagado={!temPet(dados)} onAlterar={() => irPara(3)} />
                <Pressable onPress={() => mudar({ aceita_termos: !dados.aceita_termos })} accessibilityRole="checkbox" accessibilityState={{ checked: dados.aceita_termos }} style={styles.termos}>
                  <View style={[styles.caixa, dados.aceita_termos && styles.caixaMarcada]}>{dados.aceita_termos && <IconCheck size={12} color={colors.white} />}</View>
                  <Text style={styles.termosTexto}>Li e aceito os Termos de Uso e a Política de Privacidade</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>

          <View style={styles.rodape}>
            {erro && (
              <View style={styles.erro} accessibilityRole="alert">
                <IconAlert size={16} color={colors.dangerFg} />
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            )}
            <Pressable onPress={avancar} disabled={enviando} accessibilityRole="button" style={({ pressed }) => [styles.cta, (pressed || enviando) && styles.apertado]}>
              {enviando ? <ActivityIndicator color={colors.white} /> : (
                <Text style={styles.ctaTexto}>{etapa === 'pronto' ? 'Criar minha conta' : 'Continuar'}</Text>
              )}
            </Pressable>
            {etapa === 'pet' && (
              <Pressable onPress={pularPet} disabled={enviando} accessibilityRole="button" style={styles.pular}>
                <Text style={styles.pularTexto}>Pular por agora</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// Escolha de uma opção em botões (espécie, sexo, porte).
function Opcoes<T extends string>({ rotulo, opcoes, valor, onChange }: { rotulo: string; opcoes: readonly T[]; valor: string; onChange: (v: T) => void }) {
  return (
    <View style={styles.opcoes} accessibilityRole="radiogroup" accessibilityLabel={rotulo}>
      {opcoes.map(o => (
        <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ checked: valor === o }} style={[styles.opcao, valor === o && styles.opcaoAtiva]}>
          <Text style={[styles.opcaoTexto, valor === o && styles.opcaoTextoAtivo]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function LinhaRevisao({ rotulo, valor, apagado, onAlterar }: { rotulo: string; valor: string; apagado?: boolean; onAlterar: () => void }) {
  return (
    <View style={styles.revisao}>
      <Text style={styles.revisaoRotulo}>{rotulo}</Text>
      <Text style={[styles.revisaoValor, apagado && styles.revisaoApagado]}>{valor}</Text>
      <Pressable onPress={onAlterar} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Alterar ${rotulo}`}>
        <Text style={styles.alterar}>Alterar</Text>
      </Pressable>
    </View>
  )
}

// Medidas de `cadastro-loja.css` do site em 375 de largura (as mesmas do CadastroLoja).
const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.surface },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60, paddingHorizontal: 20 },
  voltar: { width: 36, height: 36, marginLeft: -8, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  progresso: { flex: 1, flexDirection: 'row', gap: 4 },
  traco: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  tracoFeito: { backgroundColor: colors.primary600 },
  passo: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#858d99' },
  corpo: { flexGrow: 1, paddingHorizontal: 20 },
  palco: { height: 230, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  palcoCompacto: { height: 160 },
  circulo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: colors.primary50 },
  circuloCompacto: { width: 150, height: 150, borderRadius: 75 },
  placa: {
    position: 'absolute', bottom: 6, maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface,
    boxShadow: '0 4px 16px rgba(17,24,39,0.12)',
  },
  placaTexto: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text },
  conteudo: { gap: 10, paddingTop: 20 },
  opcional: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  opcionalTexto: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.textMuted },
  titulo: { fontFamily: FONTE_TITULO, fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  sub: { fontSize: 15, lineHeight: 22.5, color: colors.textMuted, marginBottom: 6 },
  input: { height: 52, paddingHorizontal: 16, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 12, backgroundColor: colors.surface, fontSize: 17, color: colors.text },
  campos: { gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cresce: { flex: 1, minWidth: 0 },
  nasc: { width: 136 },
  opcoes: { flexDirection: 'row', gap: 8 },
  opcao: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 12, backgroundColor: colors.surface },
  opcaoAtiva: { borderColor: colors.primary600, backgroundColor: colors.primary50 },
  opcaoTexto: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.textMuted },
  opcaoTextoAtivo: { color: colors.primary700 },
  google: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  googleTexto: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: '#858d99' },
  revisao: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  revisaoRotulo: { width: 84, fontSize: 13, lineHeight: 20, color: '#858d99' },
  revisaoValor: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  revisaoApagado: { fontWeight: '500', color: '#858d99' },
  alterar: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: colors.primary600 },
  termos: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
  caixa: { width: 18, height: 18, marginTop: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.textFaint, borderRadius: 4 },
  caixaMarcada: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  termosTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  rodape: { marginTop: 'auto', paddingTop: 20, paddingBottom: 16, gap: 10 },
  erro: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, backgroundColor: colors.dangerBg },
  erroTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.dangerFg },
  cta: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary600 },
  apertado: { opacity: 0.8 },
  ctaTexto: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.white },
  pular: { height: 40, alignItems: 'center', justifyContent: 'center' },
  pularTexto: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.textMuted },
})
