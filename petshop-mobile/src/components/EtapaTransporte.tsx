import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Aviso } from './Aviso'
import { Campo } from './Campo'
import { Opcao } from './Opcao'
import { Text } from '@/components/Texto'
import { supabase } from '@/lib/supabase'
import { chamarAcao } from '@/lib/acoes'
import { formatarMoeda } from '@/lib/format'
import { mascaraCep, soDigitos } from '@/lib/mascaras'
import { ROTULO_MODALIDADE, type ModalidadeTaxiDog } from '@/lib/taxidog'
import {
  DESCRICAO_MODALIDADE,
  MODALIDADES,
  enderecoCompleto,
  type CotacaoTaxiDog,
  type EnderecoTaxiDog,
  type EstadoTransporte,
} from '@/lib/transporte'
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
}

type RespostaCotacao = {
  cotacoes: Record<ModalidadeTaxiDog, CotacaoTaxiDog>
  precisao: 'endereco' | 'bairro' | 'cidade' | null
}

// "Como seu pet irá até a loja?" — o cliente leva, ou pede o TaxiDog
// (buscar, entregar ou os dois) informando o endereço. A taxa vem da
// cotação do servidor (cotarTaxiDogAction) assim que o endereço fica
// completo, e é calculada de novo na hora de agendar.
export function EtapaTransporte({ idLojista, valor, onChange, loja }: Props) {
  const modoLoja = !!loja
  const idClienteDaLoja = loja?.idCliente ?? null
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState<string | null>(null)
  const [cotando, setCotando] = useState(false)
  const [erroCotacao, setErroCotacao] = useState<string | null>(null)
  const chaveAtual = useRef('')
  const jaPreencheu = useRef(false)

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

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        <Opcao
          titulo={loja?.rotuloLevar ?? (modoLoja ? 'O cliente leva o pet até a loja' : 'Vou levar o pet até a loja')}
          detalhe="Sem taxa de transporte"
          selecionada={valor.opcao === 'levar'}
          onPress={() => onChange(prev => ({ ...prev, opcao: 'levar' }))}
        />
        <Opcao
          titulo={modoLoja ? 'Usar o TaxiDog' : 'Quero utilizar o TaxiDog'}
          detalhe="Busca e/ou entrega do pet · taxa calculada pelo endereço"
          selecionada={valor.opcao === 'taxidog'}
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

const styles = StyleSheet.create({
  rotulo: { ...typography.label.md, color: colors.textDim },
  texto: { ...typography.body.md, color: colors.textMuted },
  duas: { flexDirection: 'row', gap: spacing.md },
  cotando: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
