import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput as TextInputRN } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ilustracao, type NomeIlustracao } from '@/components/Ilustracao'
import { LogoSaip } from '@/components/LogoSaip'
import { Seletor } from '@/components/Seletor'
import { IconAlert, IconCheck, IconChevronLeft, IconStore } from '@/components/IconesDoSite'
import { Text, TextInput } from '@/components/Texto'
import { TextoTermos } from '@/components/TextoTermos'
import {
  DADOS_LOJA_VAZIOS,
  ETAPAS_LOJA,
  TEXTO_ETAPA,
  UFS,
  camposDoCadastro,
  enderecoEmUmaLinha,
  etapaDoErro,
  mascaraCepLoja,
  mascaraDocumentoLoja,
  mascaraTelefoneLoja,
  problemaDaEtapa,
  soDigitos,
  type DadosLoja,
} from '@/lib/cadastro-loja'
import { colors } from '@/theme/theme'
import { FONTE_TITULO } from '@/theme/fontes'

// Cadastro do petshop em etapas — o mesmo do site (CadastroLojaEtapas): uma
// pergunta por tela, a ilustração muda a cada passo e o nome da loja, depois
// de escrito, acompanha até o fim. Quem grava é `onEnviar` (a action do
// site), que confere tudo de novo.
export function CadastroLoja({ email, onEnviar, onVoltarInicio }: {
  email?: string | null
  onEnviar: (campos: Record<string, string>) => Promise<{ error?: string }>
  // No primeiro passo, a seta volta para a escolha "cliente ou lojista".
  onVoltarInicio?: () => void
}) {
  const [dados, setDados] = useState<DadosLoja>(DADOS_LOJA_VAZIOS)
  const [indice, setIndice] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const numeroRef = useRef<TextInputRN>(null)

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

  const etapa = ETAPAS_LOJA[indice]
  const texto = TEXTO_ETAPA[etapa]
  const compacto = etapa === 'endereco' || etapa === 'pronto'
  const nomeLoja = dados.nome_loja.trim()
  const mudar = (parte: Partial<DadosLoja>) => { setDados(d => ({ ...d, ...parte })); setErro(null) }

  function irPara(i: number) {
    setDirecao(i >= indice ? 1 : -1)
    setIndice(Math.max(0, Math.min(ETAPAS_LOJA.length - 1, i)))
    setErro(null)
  }

  async function avancar() {
    const problema = problemaDaEtapa(etapa, dados)
    if (problema) return setErro(problema)
    if (etapa !== 'pronto') return irPara(indice + 1)
    setEnviando(true)
    const r = await onEnviar(camposDoCadastro(dados))
    setEnviando(false)
    if (r.error) {
      // Volta para a etapa do problema, com a mensagem do servidor.
      const alvo = ETAPAS_LOJA.indexOf(etapaDoErro(r.error))
      if (alvo !== indice) irPara(alvo)
      setErro(r.error)
    }
  }

  // CEP completo: o ViaCEP preenche rua, bairro, cidade e UF.
  async function aoDigitarCep(t: string) {
    const cep = mascaraCepLoja(t)
    mudar({ cep })
    const digitos = soDigitos(cep)
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (j.erro) return setErro('CEP não encontrado. Preencha o endereço abaixo.')
      setDados(d => ({ ...d, endereco: j.logradouro || d.endereco, bairro: j.bairro || d.bairro, cidade: j.localidade || d.cidade, estado: j.uf || d.estado }))
      numeroRef.current?.focus()
    } catch {
      setErro('Não deu para buscar o CEP agora. Preencha o endereço abaixo.')
    } finally {
      setBuscandoCep(false)
    }
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.topo}>
        {indice > 0 || onVoltarInicio ? (
          <Pressable onPress={() => (indice > 0 ? irPara(indice - 1) : onVoltarInicio?.())} disabled={enviando} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar" style={styles.voltar}>
            <IconChevronLeft size={22} color={colors.text} />
          </Pressable>
        ) : (
          <LogoSaip altura={22} />
        )}
        <View style={styles.progresso} accessibilityLabel={`Passo ${indice + 1} de ${ETAPAS_LOJA.length}`}>
          {ETAPAS_LOJA.map((e, i) => <View key={e} style={[styles.traco, i <= indice && styles.tracoFeito]} />)}
        </View>
        <Text style={styles.passo}>{indice + 1} de {ETAPAS_LOJA.length}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.corpo} keyboardShouldPersistTaps="handled">
          <Animated.View style={[styles.palco, compacto && styles.palcoCompacto, estiloEntrada]}>
            <View style={[styles.circulo, compacto && styles.circuloCompacto]} />
            <Ilustracao nome={texto.ilustracao as NomeIlustracao} altura={compacto ? 130 : 190} />
            {/* O nome da loja numa placa: aparece enquanto é digitado e segue nas próximas telas. */}
            {nomeLoja !== '' && etapa !== 'pronto' && (
              <View style={styles.placa}>
                <IconStore size={16} color={colors.primary600} />
                <Text style={styles.placaTexto} numberOfLines={1}>{nomeLoja}</Text>
              </View>
            )}
          </Animated.View>

          <Animated.View style={[styles.conteudo, estiloEntrada]}>
            {texto.opcional && <View style={styles.opcional}><Text style={styles.opcionalTexto}>Opcional</Text></View>}
            <Text style={styles.titulo}>{etapa === 'pronto' && nomeLoja ? `Tudo pronto, ${nomeLoja}!` : texto.titulo}</Text>
            <Text style={styles.sub}>{texto.sub}</Text>

            {etapa === 'nome' && (
              <>
                <TextInput style={styles.input} autoFocus placeholder="PetShop do Bairro" placeholderTextColor={colors.textFaint} value={dados.nome_loja} maxLength={150}
                  onChangeText={t => mudar({ nome_loja: t })} accessibilityLabel="Nome do petshop" returnKeyType="next" onSubmitEditing={avancar} />
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
                onChangeText={t => mudar({ telefone: mascaraTelefoneLoja(t) })} accessibilityLabel="WhatsApp da loja" />
            )}

            {etapa === 'documento' && (
              <TextInput style={styles.input} autoFocus keyboardType="number-pad" placeholder="000.000.000-00" placeholderTextColor={colors.textFaint} value={dados.documento}
                onChangeText={t => mudar({ documento: mascaraDocumentoLoja(t) })} accessibilityLabel="CPF ou CNPJ" />
            )}

            {etapa === 'endereco' && (
              <View style={styles.campos}>
                <View style={styles.linha}>
                  <TextInput style={[styles.input, styles.cresce]} autoFocus keyboardType="number-pad" placeholder="CEP" placeholderTextColor={colors.textFaint} value={dados.cep}
                    onChangeText={aoDigitarCep} accessibilityLabel="CEP" />
                  {buscandoCep && <ActivityIndicator color={colors.primary600} />}
                </View>
                <View style={styles.linha}>
                  <TextInput style={[styles.input, styles.cresce]} placeholder="Rua" placeholderTextColor={colors.textFaint} value={dados.endereco} maxLength={200}
                    onChangeText={t => mudar({ endereco: t })} accessibilityLabel="Rua" />
                  <TextInput ref={numeroRef} style={[styles.input, styles.numero]} placeholder="Nº" placeholderTextColor={colors.textFaint} value={dados.numero} maxLength={20}
                    onChangeText={t => mudar({ numero: t })} accessibilityLabel="Número" />
                </View>
                <TextInput style={styles.input} placeholder="Bairro" placeholderTextColor={colors.textFaint} value={dados.bairro} maxLength={80}
                  onChangeText={t => mudar({ bairro: t })} accessibilityLabel="Bairro" />
                <View style={styles.linha}>
                  <TextInput style={[styles.input, styles.cresce]} placeholder="Cidade" placeholderTextColor={colors.textFaint} value={dados.cidade} maxLength={100}
                    onChangeText={t => mudar({ cidade: t })} accessibilityLabel="Cidade" />
                  <View style={styles.uf}>
                    <Seletor titulo="Estado" valor={dados.estado} opcoes={[{ valor: '', rotulo: 'UF' }, ...UFS.map(uf => ({ valor: uf, rotulo: uf }))]} onChange={uf => mudar({ estado: uf })} />
                  </View>
                </View>
              </View>
            )}

            {etapa === 'sobre' && (
              <>
                <TextInput style={[styles.input, styles.texto]} autoFocus multiline maxLength={500} placeholder="Banho e tosa com carinho desde 2015, atendimento sem pressa…"
                  placeholderTextColor={colors.textFaint} value={dados.descricao} onChangeText={t => mudar({ descricao: t })} accessibilityLabel="Sobre a loja" />
                <Text style={styles.contador}>{dados.descricao.length}/500</Text>
              </>
            )}

            {etapa === 'pronto' && (
              <View>
                <LinhaRevisao rotulo="Petshop" valor={nomeLoja} onAlterar={() => irPara(0)} />
                <LinhaRevisao rotulo="WhatsApp" valor={dados.telefone} onAlterar={() => irPara(1)} />
                <LinhaRevisao rotulo="CPF/CNPJ" valor={dados.documento} onAlterar={() => irPara(2)} />
                <LinhaRevisao rotulo="Endereço" valor={enderecoEmUmaLinha(dados) || 'Completar depois'} apagado={!enderecoEmUmaLinha(dados)} onAlterar={() => irPara(3)} />
                <LinhaRevisao rotulo="Sobre" valor={dados.descricao.trim() || 'Completar depois'} apagado={!dados.descricao.trim()} onAlterar={() => irPara(4)} />
                <Pressable onPress={() => mudar({ aceita_termos: !dados.aceita_termos })} accessibilityRole="checkbox" accessibilityState={{ checked: dados.aceita_termos }} style={styles.termos}>
                  <View style={[styles.caixa, dados.aceita_termos && styles.caixaMarcada]}>{dados.aceita_termos && <IconCheck size={12} color={colors.white} />}</View>
                  <TextoTermos style={styles.termosTexto} />
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
                <Text style={styles.ctaTexto}>{etapa === 'pronto' ? 'Criar meu petshop' : 'Continuar'}</Text>
              )}
            </Pressable>
            {texto.opcional && (
              <Pressable onPress={() => irPara(indice + 1)} disabled={enviando} accessibilityRole="button" style={styles.pular}>
                <Text style={styles.pularTexto}>Pular por agora</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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

// Medidas de `cadastro-loja.css` do site em 375 de largura.
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
  texto: { height: 120, paddingTop: 14, textAlignVertical: 'top' },
  contador: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 16, color: '#858d99' },
  campos: { gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cresce: { flex: 1, minWidth: 0 },
  numero: { width: 92 },
  uf: { width: 96 },
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
