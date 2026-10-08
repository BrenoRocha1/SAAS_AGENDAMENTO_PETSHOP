import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from './Aviso'
import { Campo } from './Campo'
import { IconCar, IconMapPin, IconStore } from './IconesDoSite'
import { ItemEscolha } from './ItemEscolha'
import { Opcao } from './Opcao'
import { Text, TextInput } from '@/components/Texto'
import { supabase } from '@/lib/supabase'
import { chamarAcao } from '@/lib/acoes'
import { formatarMoeda } from '@/lib/format'
import { mascaraCep, soDigitos } from '@/lib/mascaras'
import { ROTULO_MODALIDADE, formatarKm, type ModalidadeTaxiDog } from '@/lib/taxidog'
import {
  DESCRICAO_MODALIDADE,
  MODALIDADES,
  enderecoCompleto,
  type CotacaoTaxiDog,
  type EnderecoTaxiDog,
  type EstadoTransporte,
} from '@/lib/transporte'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, spacing, typography } from '@/theme/theme'

interface Props {
  idLojista: string
  valor: EstadoTransporte
  onChange: Dispatch<SetStateAction<EstadoTransporte>>
  // Quando é a LOJA mexendo no transporte de um agendamento (detalhe do
  // agendamento): cota pela action da loja, com os textos do painel, e pode
  // limitar o que dá para pedir (pet já na loja: só a entrega).
  loja?: {
    idCliente?: string | null
    modalidades?: readonly ModalidadeTaxiDog[]
    rotuloLevar?: string
  }
  // Tela "Novo agendamento" da loja: as opções lado a lado e o endereço
  // numa linha só quando já está completo, pra caber sem rolar — o
  // `TaxiDogCampos compacto` do site.
  compacto?: boolean
}

// "Rua, número · complemento · bairro · cidade - UF", como no site.
function enderecoEmUmaLinha(e: EnderecoTaxiDog): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const cidade = [e.cidade, e.uf].filter(Boolean).join(' - ')
  return [rua, e.complemento, e.bairro, cidade].filter(Boolean).join(' · ')
}

type RespostaCotacao = {
  cotacoes: Record<ModalidadeTaxiDog, CotacaoTaxiDog>
  precisao: 'endereco' | 'bairro' | 'cidade' | null
}

// "Como seu pet irá até a loja?" — o cliente leva, ou pede o TaxiDog
// (buscar, entregar ou os dois) informando o endereço. A taxa vem da
// cotação do servidor (cotarTaxiDogAction) assim que o endereço fica
// completo, e é calculada de novo na hora de agendar.
export function EtapaTransporte({ idLojista, valor, onChange, loja, compacto }: Props) {
  const modoLoja = !!loja
  const idClienteDaLoja = loja?.idCliente ?? null
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState<string | null>(null)
  const [cotando, setCotando] = useState(false)
  const [erroCotacao, setErroCotacao] = useState<string | null>(null)
  const chaveAtual = useRef('')
  const jaPreencheu = useRef(false)
  // Só no compacto: o formulário do endereço fica aberto enquanto a pessoa
  // digita (null = abre sozinho quando falta alguma parte do endereço).
  const [formularioAberto, setFormularioAberto] = useState<boolean | null>(null)

  // Último endereço usado num TaxiDog deste cliente — poupa digitar de
  // novo (a RLS já limita às corridas dele).
  useEffect(() => {
    if (jaPreencheu.current || valor.endereco.cep) return
    // Pela loja, só o último endereço DESTE cliente (a loja enxerga todos).
    if (modoLoja && !idClienteDaLoja) return
    jaPreencheu.current = true
    let consulta = supabase
      .from('taxidog_corrida')
      .select('cep, logradouro, numero, complemento, bairro, cidade, uf')
    if (modoLoja && idClienteDaLoja) consulta = consulta.eq('id_cliente', idClienteDaLoja)
    consulta
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const d = data as { cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string }
        onChange(prev => prev.endereco.cep ? prev : {
          ...prev,
          endereco: { cep: mascaraCep(d.cep), logradouro: d.logradouro, numero: d.numero, complemento: d.complemento ?? '', bairro: d.bairro, cidade: d.cidade, uf: d.uf },
          cotacoes: null,
        })
      })
  }, [valor.endereco.cep, onChange, modoLoja, idClienteDaLoja])

  const chaveEndereco = valor.opcao === 'taxidog' && enderecoCompleto(valor.endereco) ? JSON.stringify(valor.endereco) : ''
  const temCotacao = !!valor.cotacoes

  // Cota assim que o endereço fica completo (com uma pausa curta, pra não
  // cotar a cada tecla). Resposta de um endereço antigo é descartada.
  useEffect(() => {
    chaveAtual.current = chaveEndereco
    if (!chaveEndereco || temCotacao) return
    const endereco = JSON.parse(chaveEndereco) as EnderecoTaxiDog
    const timer = setTimeout(async () => {
      setCotando(true)
      setErroCotacao(null)
      const r = modoLoja
        ? await chamarAcao<RespostaCotacao>('cotarTaxiDogLojaAction', endereco)
        : await chamarAcao<RespostaCotacao>('cotarTaxiDogAction', idLojista, endereco)
      setCotando(false)
      if (chaveAtual.current !== chaveEndereco) return
      if (r.error || !r.cotacoes) {
        setErroCotacao(r.error ?? 'Não foi possível calcular a taxa agora.')
        return
      }
      const cotacoes = r.cotacoes
      onChange(prev => ({ ...prev, cotacoes, precisao: r.precisao ?? null }))
    }, 600)
    return () => clearTimeout(timer)
  }, [chaveEndereco, temCotacao, idLojista, onChange, modoLoja])

  function atualizar(campo: keyof EnderecoTaxiDog, texto: string) {
    setErroCotacao(null)
    setFormularioAberto(true)
    onChange(prev => ({ ...prev, endereco: { ...prev.endereco, [campo]: texto }, cotacoes: null, precisao: null }))
  }

  // CEP completo: ViaCEP preenche rua, bairro, cidade e UF.
  async function aoMudarCep(texto: string) {
    const digitos = soDigitos(texto).slice(0, 8)
    atualizar('cep', mascaraCep(digitos))
    setErroCep(null)
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const json = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (json.erro) {
        setErroCep('CEP não encontrado. Preencha o endereço à mão.')
      } else {
        onChange(prev => ({
          ...prev,
          endereco: {
            ...prev.endereco,
            logradouro: json.logradouro || prev.endereco.logradouro,
            bairro: json.bairro || prev.endereco.bairro,
            cidade: json.localidade || prev.endereco.cidade,
            uf: json.uf || prev.endereco.uf,
          },
          cotacoes: null,
          precisao: null,
        }))
      }
    } catch {
      setErroCep('Não foi possível buscar o CEP. Preencha o endereço à mão.')
    }
    setBuscandoCep(false)
  }

  const cotacao = valor.cotacoes?.[valor.modalidade] ?? null

  if (compacto) {
    const mostrarFormulario = formularioAberto ?? !chaveEndereco
    const paraQue = `Endereço para ${valor.modalidade === 'entregar' ? 'entrega' : 'busca'} do pet`
    const campo = (nome: keyof EnderecoTaxiDog, rotulo: string, maximo: number, extra?: object) => (
      <TextInput
        value={valor.endereco[nome]}
        onChangeText={t => atualizar(nome, t)}
        placeholder={rotulo}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={rotulo}
        maxLength={maximo}
        style={c.campo}
        {...extra}
      />
    )
    return (
      <View style={{ gap: 12 }}>
        <View style={c.opcoes}>
          {([
            ['levar', IconStore, loja?.rotuloLevar ?? (modoLoja ? 'Cliente leva o pet' : 'Vou levar o pet')],
            ['taxidog', IconCar, 'TaxiDog'],
          ] as const).map(([opcao, Icone, rotulo]) => {
            const ativa = valor.opcao === opcao
            return (
              <Pressable
                key={opcao}
                onPress={() => onChange(prev => ({ ...prev, opcao }))}
                accessibilityRole="button"
                accessibilityState={{ selected: ativa }}
                style={[c.opcao, ativa && c.ativa]}
              >
                <Icone size={22} color={colors.primary600} />
                <Text style={[c.opcaoTexto, ativa && c.textoAtivo]}>{rotulo}</Text>
              </Pressable>
            )
          })}
        </View>

        {valor.opcao === 'taxidog' && (
          <>
            <View style={c.modalidades}>
              {(loja?.modalidades ?? MODALIDADES).map(m => {
                const cot = valor.cotacoes?.[m]
                const ativa = valor.modalidade === m
                return (
                  <Pressable
                    key={m}
                    onPress={() => onChange(prev => ({ ...prev, modalidade: m }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ativa }}
                    style={[c.modalidade, ativa && c.modalidadeAtiva]}
                  >
                    <Text style={[c.modalidadeNome, ativa && c.textoAtivo]}>{ROTULO_MODALIDADE[m]}</Text>
                    <Text style={[c.modalidadeValor, ativa && c.textoAtivo, cot && !cot.disponivel && c.indisponivel]}>
                      {cot ? (cot.disponivel ? formatarMoeda(cot.valor) : 'Indisponível') : 'Taxa pelo endereço'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {mostrarFormulario ? (
              <View style={{ gap: 8 }}>
                <View style={c.enderecoTopo}>
                  <View style={c.enderecoRotulo}>
                    <IconMapPin size={14} color={colors.primary600} />
                    <Text style={c.rotulo}>{paraQue}</Text>
                  </View>
                  {!!chaveEndereco && (
                    <Pressable onPress={() => setFormularioAberto(false)} hitSlop={8} accessibilityRole="button" style={c.botaoLink}>
                      <Text style={c.link}>Pronto</Text>
                    </Pressable>
                  )}
                </View>
                <View style={c.linha}>
                  <TextInput
                    value={valor.endereco.cep}
                    onChangeText={aoMudarCep}
                    placeholder="CEP"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="CEP"
                    keyboardType="number-pad"
                    maxLength={9}
                    style={[c.campo, c.metade]}
                  />
                  <View style={c.metade}>{campo('numero', 'Número', 20)}</View>
                </View>
                {campo('logradouro', 'Rua', 150)}
                {campo('complemento', 'Complemento (opcional)', 80)}
                <View style={c.linha}>
                  <View style={c.metade}>{campo('bairro', 'Bairro', 80)}</View>
                  <View style={c.metade}>{campo('cidade', 'Cidade', 80)}</View>
                  <TextInput
                    value={valor.endereco.uf}
                    onChangeText={t => atualizar('uf', t.toUpperCase())}
                    placeholder="UF"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="UF"
                    autoCapitalize="characters"
                    maxLength={2}
                    style={[c.campo, c.uf]}
                  />
                </View>
                {buscandoCep && <Text style={c.nota}>Buscando CEP...</Text>}
                {erroCep && <Text style={[c.nota, c.notaErro]}>{erroCep}</Text>}
              </View>
            ) : (
              <View style={c.enderecoLinha}>
                <IconMapPin size={18} color={colors.primary600} />
                <View style={c.enderecoTexto}>
                  <Text style={c.enderecoPequeno}>{paraQue}</Text>
                  <Text style={c.enderecoForte}>{enderecoEmUmaLinha(valor.endereco)}</Text>
                </View>
                <Pressable onPress={() => setFormularioAberto(true)} hitSlop={8} accessibilityRole="button" style={c.botaoLink}>
                  <Text style={c.link}>Alterar</Text>
                </Pressable>
              </View>
            )}

            {!chaveEndereco ? (
              <Text style={c.nota}>Preencha o endereço completo para calcular a taxa do TaxiDog.</Text>
            ) : cotando || !valor.cotacoes ? (
              erroCotacao
                ? <Text style={[c.nota, c.notaErro]}>{erroCotacao}</Text>
                : <Text style={c.nota}>Calculando a taxa do TaxiDog...</Text>
            ) : cotacao && !cotacao.disponivel ? (
              <Text style={[c.nota, c.notaAviso]}>
                {cotacao.motivo ?? 'O TaxiDog não está disponível para este endereço.'}
                {modoLoja ? ' O cliente ainda pode levar o pet até a loja.' : ' Você ainda pode levar o pet até a loja.'}
              </Text>
            ) : cotacao ? (
              <View style={c.taxa}>
                <View style={c.enderecoTexto}>
                  <Text style={c.taxaNome}>Taxa do TaxiDog · {ROTULO_MODALIDADE[valor.modalidade]}</Text>
                  <Text style={c.taxaDetalhe}>
                    {[
                      cotacao.distanciaKm != null ? `${formatarKm(cotacao.distanciaKm)} da loja` : null,
                      cotacao.criterio,
                      valor.precisao === 'bairro' ? 'rua não achada no mapa: usamos o centro do bairro' : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={c.taxaValor}>{formatarMoeda(cotacao.valor)}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    )
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        {/* Os dois cartões com ícone da etapa de transporte do site (TaxiDogCampos). */}
        <ItemEscolha
          grande
          icone={IconStore}
          tamanhoDoIcone={20}
          titulo={loja?.rotuloLevar ?? (modoLoja ? 'O cliente leva o pet até a loja' : 'Vou levar o pet até a loja')}
          detalhe="Sem taxa de transporte"
          selecionado={valor.opcao === 'levar'}
          onPress={() => onChange(prev => ({ ...prev, opcao: 'levar' }))}
        />
        <ItemEscolha
          grande
          icone={IconCar}
          tamanhoDoIcone={20}
          titulo={modoLoja ? 'Usar o TaxiDog' : 'Quero utilizar o TaxiDog'}
          detalhe="Busca e/ou entrega do pet · taxa calculada pelo endereço"
          selecionado={valor.opcao === 'taxidog'}
          onPress={() => onChange(prev => ({ ...prev, opcao: 'taxidog' }))}
        />
      </View>

      {valor.opcao === 'taxidog' && (
        <>
          <Text style={styles.rotulo}>{modoLoja ? 'O que o cliente precisa?' : 'O que você precisa?'}</Text>
          <View style={{ gap: spacing.sm }}>
            {(loja?.modalidades ?? MODALIDADES).map(m => {
              const cot = valor.cotacoes?.[m]
              return (
                <Opcao
                  key={m}
                  titulo={ROTULO_MODALIDADE[m]}
                  detalhe={DESCRICAO_MODALIDADE[m]}
                  lateral={cot ? (cot.disponivel ? formatarMoeda(cot.valor) : 'Indisponível') : undefined}
                  selecionada={valor.modalidade === m}
                  onPress={() => onChange(prev => ({ ...prev, modalidade: m }))}
                />
              )
            })}
          </View>

          <Text style={styles.rotulo}>Endereço para {valor.modalidade === 'entregar' ? 'entrega' : 'busca'} do pet</Text>
          <Campo
            rotulo="CEP"
            value={valor.endereco.cep}
            onChangeText={aoMudarCep}
            keyboardType="number-pad"
            maxLength={9}
            ajuda={buscandoCep ? 'Buscando o CEP…' : erroCep ?? undefined}
          />
          <View style={styles.duas}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Rua" value={valor.endereco.logradouro} onChangeText={t => atualizar('logradouro', t)} maxLength={150} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Número" value={valor.endereco.numero} onChangeText={t => atualizar('numero', t)} maxLength={20} />
            </View>
          </View>
          <Campo rotulo="Complemento (opcional)" value={valor.endereco.complemento} onChangeText={t => atualizar('complemento', t)} maxLength={80} />
          <Campo rotulo="Bairro" value={valor.endereco.bairro} onChangeText={t => atualizar('bairro', t)} maxLength={80} />
          <View style={styles.duas}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Cidade" value={valor.endereco.cidade} onChangeText={t => atualizar('cidade', t)} maxLength={80} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="UF" value={valor.endereco.uf} onChangeText={t => atualizar('uf', t.toUpperCase())} autoCapitalize="characters" maxLength={2} />
            </View>
          </View>

          {cotando && (
            <View style={styles.cotando}>
              <ActivityIndicator color={colors.primary600} />
              <Text style={styles.texto}>Calculando a taxa…</Text>
            </View>
          )}
          {erroCotacao && <Aviso tipo="erro" texto={erroCotacao} />}
          {!cotando && !erroCotacao && !valor.cotacoes && !enderecoCompleto(valor.endereco) && (
            <Text style={styles.texto}>Preencha o endereço completo para ver a taxa.</Text>
          )}
          {cotacao && (
            cotacao.disponivel ? (
              <Aviso
                tipo="sucesso"
                texto={`Taxa do TaxiDog (${ROTULO_MODALIDADE[valor.modalidade].toLowerCase()}): ${formatarMoeda(cotacao.valor)}${cotacao.distanciaKm != null ? ` · ${cotacao.distanciaKm.toFixed(1).replace('.', ',')} km` : ''}`}
              />
            ) : (
              <Aviso tipo="alerta" texto={cotacao.motivo ?? 'O TaxiDog não atende este endereço nessa opção.'} />
            )
          )}
          {valor.precisao && valor.precisao !== 'endereco' && cotacao?.disponivel && (
            <Text style={styles.texto}>
              Não encontramos a rua no mapa: a distância foi medida pelo {valor.precisao === 'bairro' ? 'bairro' : 'centro da cidade'}.
            </Text>
          )}
        </>
      )}
    </View>
  )
}

// `compacto`: as medidas do `.tdc-*` do site em largura de celular.
const SUAVE = 'rgba(79,70,229,0.08)'
const c = StyleSheet.create({
  opcoes: { flexDirection: 'row', gap: 12 },
  opcao: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ativa: { borderColor: colors.primary600, backgroundColor: SUAVE },
  opcaoTexto: { flexShrink: 1, fontSize: 14, lineHeight: 18.2, fontWeight: '600', color: '#1f2937' },
  textoAtivo: { color: colors.primary300 },
  modalidades: { flexDirection: 'row', gap: 8 },
  modalidade: {
    flex: 1,
    gap: 2,
    paddingVertical: 8.8,
    paddingHorizontal: 9.6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalidadeAtiva: { borderColor: colors.primary600, backgroundColor: SUAVE },
  modalidadeNome: { fontSize: 13, lineHeight: 16.9, fontWeight: '600', color: '#1f2937' },
  modalidadeValor: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: '#858d99' },
  indisponivel: { color: colors.dangerFg },
  enderecoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  enderecoRotulo: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  // `.tdc-link`: botão pequeno, branco com borda fina.
  botaoLink: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 13, lineHeight: 13, fontWeight: '600', color: colors.primary600 },
  linha: { flexDirection: 'row', gap: 8 },
  metade: { flex: 1 },
  uf: { width: 84 },
  campo: {
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  enderecoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9.6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  enderecoTexto: { flex: 1 },
  enderecoPequeno: { fontSize: 12, lineHeight: 19.2, color: '#858d99' },
  enderecoForte: { fontSize: 14, lineHeight: 18.9, fontWeight: '600', color: colors.text },
  nota: { fontSize: 13, lineHeight: 18.2, color: '#858d99' },
  notaErro: { color: colors.dangerFg },
  notaAviso: { color: colors.warningFg },
  taxa: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9.6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: SUAVE },
  taxaNome: { fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text },
  taxaDetalhe: { fontSize: 12, lineHeight: 16.2, color: colors.textMuted },
  taxaValor: { fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 25.6, fontWeight: '800', color: colors.text },
})

const styles = StyleSheet.create({
  rotulo: { ...typography.label.md, color: colors.textDim },
  texto: { ...typography.body.md, color: colors.textMuted },
  duas: { flexDirection: 'row', gap: spacing.md },
  cotando: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
