import { useCallback, useState, type ReactNode } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { IconCar, IconCheck, IconMapPin, IconPlus, IconRoute, IconTrash, IconUsers } from '@/components/IconesDoSite'
import { Interruptor } from '@/components/Interruptor'
import { StatusBadge } from '@/components/StatusBadge'
import { Text, TextInput } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao } from '@/lib/acoes'
import { formatarReais } from '@/lib/taxidog'
import { colors } from '@/theme/theme'

type Modo = 'fixo' | 'distancia' | 'regiao' | 'personalizado'

// Números ficam como texto enquanto a pessoa digita ("15," no meio da
// digitação não pode virar NaN e apagar o campo); só viram número ao salvar.
interface FaixaForm { km_ate: string; valor_trecho: string; valor_ida_volta: string }
interface RegiaoForm { bairro: string; cidade: string; uf: string; valor_trecho: string; valor_ida_volta: string; ativo: boolean }

const MODOS: { valor: Modo; titulo: string; descricao: string }[] = [
  { valor: 'fixo', titulo: 'Valor fixo', descricao: 'O mesmo preço para qualquer endereço.' },
  { valor: 'distancia', titulo: 'Por distância', descricao: 'O preço muda conforme a distância até a loja.' },
  { valor: 'regiao', titulo: 'Por região', descricao: 'Um preço para cada bairro ou cidade que você atende.' },
  { valor: 'personalizado', titulo: 'Região + distância', descricao: 'Usa o preço do bairro/cidade cadastrado; nos outros endereços, a distância.' },
]

const ROTULO_MODO: Record<Modo, string> = {
  fixo: 'Valor fixo',
  distancia: 'Por distância',
  regiao: 'Por região',
  personalizado: 'Região + distância',
}

const txt = (n: number | string | null | undefined) => (n == null ? '' : String(Number(n)).replace('.', ','))
const num = (s: string) => Number(s.replace(',', '.').trim())
const numOuNull = (s: string) => (s.trim() === '' ? null : num(s))
const valido = (s: string) => s.trim() !== '' && Number.isFinite(num(s)) && num(s) >= 0

// Regras do TaxiDog da loja (migration 042): liga/desliga, como cobra e
// os valores. Salvar passa por salvarTaxiDogConfigAction, a mesma do
// painel web — é o servidor que localiza a loja no mapa quando a cobrança
// usa distância.
export default function TaxiDogConfigScreen() {
  const router = useRouter()
  const { contexto, recarregar } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const [loading, setLoading] = useState(true)
  const [semMigration, setSemMigration] = useState(false)
  const [ativo, setAtivo] = useState(false)
  const [online, setOnline] = useState(true)
  const [modo, setModo] = useState<Modo>('fixo')
  const [valorBuscar, setValorBuscar] = useState('')
  const [valorEntregar, setValorEntregar] = useState('')
  const [valorAmbos, setValorAmbos] = useState('')
  const [distMax, setDistMax] = useState('')
  const [valorMinimo, setValorMinimo] = useState('')
  const [faixas, setFaixas] = useState<FaixaForm[]>([])
  const [regioes, setRegioes] = useState<RegiaoForm[]>([])
  const [origem, setOrigem] = useState<string | null>(null)
  const [temOrigem, setTemOrigem] = useState(false)
  // Funcionários ativos habilitados como TaxiDog (aparecem no resumo).
  const [taxidogs, setTaxidogs] = useState<string[]>([])
  // "TaxiDog monta rotas sem aprovação": null = a loja ainda não salvou a
  // configuração (o cartão nem aparece); `rotasDisponivel` = a coluna existe.
  const [criaRotas, setCriaRotas] = useState<boolean | null>(null)
  const [rotasDisponivel, setRotasDisponivel] = useState(false)
  const [rotasErro, setRotasErro] = useState<string | null>(null)
  const [rotasSalvo, setRotasSalvo] = useState(false)
  const [rotasOcupado, setRotasOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const [cfgRes, faixasRes, regioesRes, equipe] = await Promise.all([
      supabase.from('taxidog_config').select('*').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('taxidog_faixa').select('km_ate, valor_trecho, valor_ida_volta').eq('id_lojista', idLojista).order('km_ate'),
      supabase.from('taxidog_regiao').select('bairro, cidade, uf, valor_trecho, valor_ida_volta, ativo').eq('id_lojista', idLojista).order('cidade').order('bairro'),
      supabase.from('funcionario').select('nome').eq('id_lojista', idLojista).eq('ativo', true).eq('pode_taxidog', true).order('nome'),
    ])
    setTaxidogs(((equipe.data ?? []) as { nome: string }[]).map(f => f.nome))
    setSemMigration(!!(cfgRes.error ?? faixasRes.error ?? regioesRes.error))
    const cfg = cfgRes.data as Record<string, unknown> | null
    setAtivo(!!cfg?.ativo)
    setOnline(cfg ? cfg.disponivel_online !== false : true)
    setModo(((cfg?.modo_cobranca as Modo) ?? 'fixo'))
    setValorBuscar(txt((cfg?.valor_buscar as number) ?? 0))
    setValorEntregar(txt((cfg?.valor_entregar as number) ?? 0))
    setValorAmbos(txt((cfg?.valor_buscar_entregar as number) ?? 0))
    setDistMax(txt(cfg?.distancia_max_km as number | null))
    setValorMinimo(txt(cfg?.valor_minimo as number | null))
    setOrigem((cfg?.origem_endereco as string | null) ?? null)
    setTemOrigem(cfg?.origem_lat != null && cfg?.origem_lng != null)
    setCriaRotas(cfg ? !!cfg.taxidog_cria_rotas : null)
    setRotasDisponivel(!!cfg && 'taxidog_cria_rotas' in cfg)
    setFaixas(((faixasRes.data ?? []) as { km_ate: number; valor_trecho: number; valor_ida_volta: number | null }[])
      .map(f => ({ km_ate: txt(f.km_ate), valor_trecho: txt(f.valor_trecho), valor_ida_volta: txt(f.valor_ida_volta) })))
    setRegioes(((regioesRes.data ?? []) as { bairro: string | null; cidade: string; uf: string | null; valor_trecho: number; valor_ida_volta: number | null; ativo: boolean }[])
      .map(r => ({ bairro: r.bairro ?? '', cidade: r.cidade, uf: r.uf ?? '', valor_trecho: txt(r.valor_trecho), valor_ida_volta: txt(r.valor_ida_volta), ativo: r.ativo })))
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="TaxiDog" />
        <SemPermissao area="configurar o TaxiDog" />
      </ScreenContainer>
    )
  }

  const usaDistancia = modo === 'distancia' || modo === 'personalizado'
  const usaRegiao = modo === 'regiao' || modo === 'personalizado'
  const mudou = () => setSalvo(false)

  function validar(): string | null {
    if (modo === 'fixo' && (!valido(valorBuscar) || !valido(valorEntregar) || !valido(valorAmbos))) {
      return 'Preencha os três valores fixos (use 0 se não cobrar).'
    }
    if (usaDistancia) {
      if (ativo && faixas.length === 0) return 'Adicione ao menos uma faixa de distância.'
      if (faixas.some(f => !valido(f.km_ate) || num(f.km_ate) <= 0 || !valido(f.valor_trecho))) return 'Preencha a distância e o valor de todas as faixas.'
      if (faixas.some(f => f.valor_ida_volta.trim() !== '' && !valido(f.valor_ida_volta))) return 'Confira o valor de ida e volta das faixas.'
      if (distMax.trim() !== '' && (!valido(distMax) || num(distMax) <= 0)) return 'Confira a distância máxima.'
    }
    if (usaRegiao) {
      if (ativo && modo === 'regiao' && regioes.length === 0) return 'Adicione ao menos uma região atendida.'
      if (regioes.some(r => r.cidade.trim().length < 2 || !valido(r.valor_trecho))) return 'Toda região precisa de cidade e valor.'
      if (regioes.some(r => r.valor_ida_volta.trim() !== '' && !valido(r.valor_ida_volta))) return 'Confira o valor de ida e volta das regiões.'
    }
    if (valorMinimo.trim() !== '' && !valido(valorMinimo)) return 'Confira o valor mínimo.'
    return null
  }

  async function salvar() {
    setErro(null)
    setAviso(null)
    const problema = validar()
    if (problema) return setErro(problema)
    const payload = {
      ativo,
      disponivel_online: online,
      modo_cobranca: modo,
      valor_buscar: valido(valorBuscar) ? num(valorBuscar) : 0,
      valor_entregar: valido(valorEntregar) ? num(valorEntregar) : 0,
      valor_buscar_entregar: valido(valorAmbos) ? num(valorAmbos) : 0,
      distancia_max_km: numOuNull(distMax),
      valor_minimo: numOuNull(valorMinimo),
      // Faixas e regiões vão sempre, mesmo fora do modo atual — trocar de
      // modo e voltar não pode apagar o que já estava cadastrado.
      faixas: [...faixas]
        .filter(f => valido(f.km_ate) && valido(f.valor_trecho))
        .sort((a, b) => num(a.km_ate) - num(b.km_ate))
        .map(f => ({ km_ate: num(f.km_ate), valor_trecho: num(f.valor_trecho), valor_ida_volta: numOuNull(f.valor_ida_volta) })),
      regioes: regioes
        .filter(r => r.cidade.trim().length >= 2 && valido(r.valor_trecho))
        .map(r => ({
          bairro: r.bairro.trim() || null,
          cidade: r.cidade.trim(),
          uf: r.uf.trim().toUpperCase() || null,
          valor_trecho: num(r.valor_trecho),
          valor_ida_volta: numOuNull(r.valor_ida_volta),
          ativo: r.ativo,
        })),
    }
    setSalvando(true)
    const r = await chamarAcao<{ origemEndereco: string | null }>('salvarTaxiDogConfigAction', payload)
    setSalvando(false)
    if (r.error) return setErro(r.error)
    setSalvo(true)
    // O menu e o Gestor acompanham o liga/desliga do TaxiDog.
    recarregar()
    setAviso(r.aviso ?? null)
    if (r.origemEndereco !== undefined) {
      setOrigem(r.origemEndereco)
      setTemOrigem(!!r.origemEndereco)
    }
    // Depois do primeiro salvar a configuração passa a existir (e o cartão das rotas aparece).
    if (criaRotas === null) carregar()
  }

  async function alternarRotas(novo: boolean) {
    setCriaRotas(novo)
    setRotasErro(null)
    setRotasSalvo(false)
    setRotasOcupado(true)
    const r = await chamarAcao('salvarTaxiDogCriaRotasAction', novo)
    setRotasOcupado(false)
    if (r.error) {
      setCriaRotas(!novo)
      return setRotasErro(r.error)
    }
    setRotasSalvo(true)
  }

  const atualizarFaixa = (i: number, campo: keyof FaixaForm, valor: string) => {
    mudou()
    setFaixas(prev => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)))
  }
  const atualizarRegiao = <K extends keyof RegiaoForm>(i: number, campo: K, valor: RegiaoForm[K]) => {
    mudou()
    setRegioes(prev => prev.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)))
  }

  function adicionarFaixa() {
    mudou()
    const ultima = faixas[faixas.length - 1]
    const km = ultima && valido(ultima.km_ate) ? num(ultima.km_ate) + 5 : 3
    const valor = ultima && valido(ultima.valor_trecho) ? num(ultima.valor_trecho) + 5 : 10
    setFaixas(prev => [...prev, { km_ate: txt(km), valor_trecho: txt(valor), valor_ida_volta: '' }])
  }

  function adicionarRegiao() {
    mudou()
    const ultima = regioes[regioes.length - 1]
    setRegioes(prev => [...prev, { bairro: '', cidade: ultima?.cidade ?? '', uf: ultima?.uf ?? '', valor_trecho: '', valor_ida_volta: '', ativo: true }])
  }

  // Valor mínimo vale por cima de qualquer regra — no modo fixo isso muda
  // o preço de verdade, então o resumo mostra o efetivo.
  const minimo = valorMinimo.trim() !== '' && valido(valorMinimo) ? num(valorMinimo) : null
  const efetivo = (s: string) => Math.max(num(s) || 0, minimo ?? 0)
  const subidosPeloMinimo = modo === 'fixo' && minimo != null
    ? ([['Somente buscar', valorBuscar], ['Somente entregar', valorEntregar], ['Buscar e entregar', valorAmbos]] as const)
        .filter(([, v]) => valido(v) && num(v) < minimo)
        .map(([rotulo]) => rotulo)
    : []
  const regioesAtivas = regioes.filter(r => r.ativo).length
  const resumoCobranca = modo === 'fixo'
    ? `Buscar ${formatarReais(efetivo(valorBuscar))} · Entregar ${formatarReais(efetivo(valorEntregar))} · Buscar e entregar ${formatarReais(efetivo(valorAmbos))}`
    : modo === 'distancia'
      ? `${faixas.length} ${faixas.length === 1 ? 'faixa' : 'faixas'} de distância${distMax ? ` · atende até ${distMax} km` : ''}`
      : modo === 'regiao'
        ? `${regioesAtivas} ${regioesAtivas === 1 ? 'região atendida' : 'regiões atendidas'}`
        : `${regioesAtivas} regiões + ${faixas.length} faixas de distância${distMax ? ` (até ${distMax} km)` : ''}`

  return (
    <ScreenContainer>
      <DetailHeader title="TaxiDog" />

      {loading ? (
        <ActivityIndicator color={colors.primary600} />
      ) : semMigration ? (
        <Aviso tipo="erro" texto="Não foi possível carregar o TaxiDog. Execute a migration 042_taxidog.sql se ainda não rodou." />
      ) : (
        <View style={styles.pilha}>
          {!acoesDisponiveis() && <Aviso tipo="alerta" texto={`Só consulta: ${MSG_SEM_SITE}`} />}

          {/* Visão geral */}
          <View style={[styles.cartao, styles.resumo]}>
            <View style={styles.topo}>
              <View style={styles.icone}><IconCar size={18} color={colors.textDim} /></View>
              <View style={styles.cresce}>
                <Text style={styles.titulo}>Resumo do TaxiDog</Text>
                <Text style={styles.descricao}>O que o cliente vai encontrar hoje</Text>
              </View>
              {ativo
                ? <StatusBadge status="Concluído" rotulo="Ativado" style={styles.seloNoMeio} />
                : <View style={[styles.selo, styles.seloNoMeio]}><Text style={styles.seloTexto}>Desativado</Text></View>}
            </View>
            <LinhaResumo rotulo="No agendamento online">{ativo && online ? 'Disponível' : 'Não aparece'}</LinhaResumo>
            <LinhaResumo rotulo="Como cobra">{ROTULO_MODO[modo]} — {resumoCobranca}</LinhaResumo>
            {minimo != null && <LinhaResumo rotulo="Valor mínimo">{formatarReais(minimo)}</LinhaResumo>}
            <LinhaResumo rotulo="Quem pode ser TaxiDog" ultima>
              {taxidogs.length > 0 ? taxidogs.join(', ') : 'Ninguém ainda'}{' · '}
              <Text style={styles.link} onPress={() => router.push('/mais/funcionarios')}>Gerenciar em Equipe</Text>
            </LinhaResumo>
          </View>

          {/* Ativação */}
          <View style={styles.cartao}>
            <Text style={[styles.grupoTitulo, styles.grupoTituloLargo]}>Ativação</Text>
            <LinhaLiga
              titulo="Oferecer TaxiDog"
              descricao="Liga o serviço de busca e entrega da loja e a tela de corridas."
              ligado={ativo}
              onChange={v => { mudou(); setAtivo(v) }}
            />
            <LinhaLiga
              titulo="Disponível no agendamento online"
              descricao="O cliente pode pedir o TaxiDog sozinho, pelo link da loja ou pela conta dele."
              ligado={online}
              desativado={!ativo}
              onChange={v => { mudou(); setOnline(v) }}
            />
          </View>

          {/* Forma de cobrança */}
          <View style={styles.cartao}>
            <Text style={[styles.grupoTitulo, styles.grupoTituloLargo]}>Forma de cobrança</Text>
            <View style={styles.modos}>
              {MODOS.map(m => {
                const sel = modo === m.valor
                return (
                  <Pressable
                    key={m.valor}
                    onPress={() => { mudou(); setModo(m.valor) }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    style={[styles.modo, sel && styles.modoEscolhido]}
                  >
                    <View style={styles.modoTopo}>
                      <Text style={styles.titulo}>{m.titulo}</Text>
                      {sel && <IconCheck size={15} color={colors.primary600} />}
                    </View>
                    <Text style={styles.nota}>{m.descricao}</Text>
                  </Pressable>
                )
              })}
            </View>

            {modo === 'fixo' && (
              <View style={styles.campos}>
                <CampoValor rotulo="Somente buscar" valor={valorBuscar} onChange={v => { mudou(); setValorBuscar(v) }} />
                <CampoValor rotulo="Somente entregar" valor={valorEntregar} onChange={v => { mudou(); setValorEntregar(v) }} />
                <CampoValor rotulo="Buscar e entregar" valor={valorAmbos} onChange={v => { mudou(); setValorAmbos(v) }} />
              </View>
            )}

            {usaRegiao && (
              <View style={usaDistancia ? styles.regioesComFaixas : undefined}>
                <Text style={[styles.titulo, styles.subtitulo]}>Regiões atendidas</Text>
                <Text style={[styles.descricao, styles.depois]}>
                  Deixe o bairro vazio para cobrar a cidade inteira. Um bairro cadastrado vale mais que a cidade dele.
                  {modo === 'personalizado' && ' Endereços fora dessas regiões usam as faixas de distância abaixo.'}
                </Text>
                {regioes.length === 0 && <Text style={[styles.descricao, styles.depois]}>Nenhuma região cadastrada.</Text>}
                <View style={styles.blocos}>
                  {regioes.map((r, i) => (
                    <View key={i} style={[styles.bloco, !r.ativo && styles.blocoApagado]}>
                      <View style={styles.duas}>
                        <View style={styles.cresce}>
                          <Campo rotulo="Cidade" value={r.cidade} onChangeText={v => atualizarRegiao(i, 'cidade', v)} placeholder="Mauá" maxLength={80} />
                        </View>
                        <View style={styles.uf}>
                          <Campo rotulo="UF" value={r.uf} onChangeText={v => atualizarRegiao(i, 'uf', v.toUpperCase().slice(0, 2))} autoCapitalize="characters" placeholder="SP" maxLength={2} />
                        </View>
                      </View>
                      <Campo rotulo="Bairro" opcional value={r.bairro} onChangeText={v => atualizarRegiao(i, 'bairro', v)} placeholder="Centro" maxLength={80} />
                      <View style={styles.duas}>
                        <View style={styles.cresce}>
                          <CampoValor rotulo="Buscar ou entregar" valor={r.valor_trecho} onChange={v => atualizarRegiao(i, 'valor_trecho', v)} />
                        </View>
                        <View style={styles.cresce}>
                          <CampoValor rotulo="Buscar e entregar" valor={r.valor_ida_volta} placeholder={valido(r.valor_trecho) ? txt(num(r.valor_trecho) * 2) : ''} onChange={v => atualizarRegiao(i, 'valor_ida_volta', v)} />
                        </View>
                      </View>
                      <View style={styles.blocoPe}>
                        <View style={styles.ativa}>
                          <Interruptor value={r.ativo} onValueChange={v => atualizarRegiao(i, 'ativo', v)} accessibilityLabel={r.ativo ? 'Desativar região' : 'Ativar região'} />
                          <Text style={styles.ativaTexto}>Ativa</Text>
                        </View>
                        <BotaoPequeno variante="fantasma" rotulo="Remover" icone={IconTrash} onPress={() => { mudou(); setRegioes(prev => prev.filter((_, j) => j !== i)) }} />
                      </View>
                    </View>
                  ))}
                </View>
                <BotaoPequeno rotulo="Adicionar região" icone={IconPlus} style={styles.adicionar} onPress={adicionarRegiao} />
              </View>
            )}

            {usaDistancia && (
              <View>
                <Text style={[styles.titulo, styles.subtitulo]}>Faixas de distância</Text>
                <Text style={[styles.descricao, styles.depois]}>
                  Cada faixa vai até a distância informada, começando onde a anterior termina. Deixe &quot;buscar e entregar&quot; vazio para cobrar o dobro do trecho.
                </Text>
                {faixas.length === 0 && <Text style={[styles.descricao, styles.depois]}>Nenhuma faixa cadastrada.</Text>}
                <View style={styles.blocos}>
                  {faixas.map((f, i) => {
                    const anterior = i === 0 ? '0' : faixas[i - 1].km_ate || '?'
                    return (
                      <View key={i} style={styles.bloco}>
                        <Campo rotulo={`De ${anterior} km até (km)`} value={f.km_ate} onChangeText={v => atualizarFaixa(i, 'km_ate', v)} keyboardType="decimal-pad" maxLength={6} />
                        <View style={styles.duas}>
                          <View style={styles.cresce}>
                            <CampoValor rotulo="Buscar ou entregar" valor={f.valor_trecho} onChange={v => atualizarFaixa(i, 'valor_trecho', v)} />
                          </View>
                          <View style={styles.cresce}>
                            <CampoValor rotulo="Buscar e entregar" valor={f.valor_ida_volta} placeholder={valido(f.valor_trecho) ? txt(num(f.valor_trecho) * 2) : ''} onChange={v => atualizarFaixa(i, 'valor_ida_volta', v)} />
                          </View>
                        </View>
                        <View style={[styles.blocoPe, styles.aDireita]}>
                          <BotaoPequeno variante="fantasma" rotulo="Remover" icone={IconTrash} onPress={() => { mudou(); setFaixas(prev => prev.filter((_, j) => j !== i)) }} />
                        </View>
                      </View>
                    )
                  })}
                </View>
                <BotaoPequeno rotulo="Adicionar faixa" icone={IconPlus} style={styles.adicionar} onPress={adicionarFaixa} />
                <View style={styles.distanciaMaxima}>
                  <Campo
                    rotulo="Distância máxima atendida (km)"
                    value={distMax}
                    onChangeText={v => { mudou(); setDistMax(v) }}
                    keyboardType="decimal-pad"
                    placeholder="Sem limite"
                    maxLength={6}
                    ajuda="Endereços mais longe que isso veem que o TaxiDog não atende."
                  />
                </View>
                <View style={styles.origem}>
                  <IconMapPin size={14} color={temOrigem ? colors.textDim : colors.warningFg} style={styles.semEncolher} />
                  {temOrigem ? (
                    <Text style={[styles.origemTexto, { color: colors.textDim }]}>Distância medida a partir de: {origem}</Text>
                  ) : (
                    <Text style={[styles.origemTexto, { color: colors.warningFg }]}>
                      A localização da loja é calculada ao salvar, a partir do endereço em{' '}
                      <Text style={styles.link} onPress={() => router.push('/mais/perfil-loja')}>Dados da loja</Text>.
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Valor mínimo */}
          <View style={styles.cartao}>
            <Text style={styles.grupoTitulo}>Valor mínimo (opcional)</Text>
            <Text style={[styles.descricao, styles.depois]}>Nenhuma corrida sai por menos que isso, qualquer que seja a regra. Deixe vazio para não usar.</Text>
            <View style={styles.minimo}>
              <InputMoeda valor={valorMinimo} placeholder="Sem mínimo" rotulo="Valor mínimo" onChange={v => { mudou(); setValorMinimo(v) }} />
            </View>
            {subidosPeloMinimo.length > 0 && (
              <Text style={[styles.ajuda, styles.ajudaDoMinimo]}>
                Com este mínimo, {subidosPeloMinimo.join(', ').toLowerCase()} sai por {formatarReais(minimo)}.
              </Text>
            )}
          </View>

          {/* O erro fica junto do botão: o formulário é comprido e quem toca em salvar está aqui embaixo. */}
          <View style={styles.salvarArea}>
            {erro && <Aviso tipo="erro" texto={erro} />}
            {aviso && <Aviso tipo="alerta" texto={aviso} />}
            <View style={styles.salvarLinha}>
              {salvo && !salvando && (
                <View style={styles.salvoLinha}>
                  <IconCheck size={14} color={colors.successFg} />
                  <Text style={styles.salvoTexto}>Configuração salva</Text>
                </View>
              )}
              <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : 'Salvar configuração'} desativado={salvando} onPress={salvar} />
            </View>
            {taxidogs.length === 0 && ativo && (
              <View style={styles.lembrete}>
                <IconUsers size={12} color="#858d99" style={styles.semEncolher} />
                <Text style={[styles.nota, styles.lembreteTexto]}>Lembre de habilitar pelo menos um funcionário como TaxiDog em Equipe para poder atribuir as corridas.</Text>
              </View>
            )}
          </View>

          {/* Rotas — só existe depois de salvar a configuração. */}
          {criaRotas !== null && (
            <View style={styles.cartao}>
              <View style={[styles.topo, styles.rotasTopo]}>
                <View style={styles.icone}><IconRoute size={18} color={colors.textDim} /></View>
                <View style={styles.cresce}>
                  <Text style={styles.titulo}>Rotas</Text>
                  <Text style={styles.descricao}>O TaxiDog pode juntar várias corridas numa rota, além de pegar uma de cada vez pelo Kanban.</Text>
                </View>
              </View>
              <LinhaLiga
                titulo="TaxiDog monta rotas sem aprovação"
                descricao={criaRotas
                  ? 'Ligado: a rota que o TaxiDog montar já pode sair.'
                  : 'Desligado: a rota fica "Aguardando aprovação" até um administrador ou alguém da gestão de agendamentos aprovar.'}
                ligado={criaRotas}
                desativado={!rotasDisponivel}
                ocupado={rotasOcupado}
                onChange={alternarRotas}
              />
              {!rotasDisponivel && <Text style={styles.nota}>Execute a migration 053_taxidog_kanban_e_rotas.sql para usar esta opção.</Text>}
              {rotasErro && <Aviso tipo="erro" texto={rotasErro} style={styles.rotasErro} />}
              {rotasSalvo && !rotasErro && <Text style={[styles.nota, { color: colors.successFg }]}>Salvo.</Text>}
            </View>
          )}
        </View>
      )}
    </ScreenContainer>
  )
}

// Linha "rótulo — valor" do resumo (`.dash-detail-row`).
function LinhaResumo({ rotulo, ultima, children }: { rotulo: string; ultima?: boolean; children: ReactNode }) {
  return (
    <View style={[styles.linhaResumo, ultima && styles.linhaResumoUltima]}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={styles.linhaValor}>{children}</Text>
    </View>
  )
}

// Título, explicação e o liga/desliga à direita.
function LinhaLiga({ titulo, descricao, ligado, desativado, ocupado, onChange }: {
  titulo: string
  descricao: string
  ligado: boolean
  desativado?: boolean
  ocupado?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <View style={[styles.linhaLiga, desativado && styles.meioApagado]}>
      <View style={styles.cresce}>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.descricao}>{descricao}</Text>
      </View>
      <Interruptor value={ligado} disabled={desativado || ocupado} onValueChange={onChange} accessibilityLabel={titulo} />
    </View>
  )
}

// Campo de dinheiro com o "R$" por dentro, à esquerda.
function InputMoeda({ valor, onChange, placeholder, rotulo }: { valor: string; onChange: (v: string) => void; placeholder?: string; rotulo: string }) {
  return (
    <View>
      <TextInput
        value={valor}
        onChangeText={v => onChange(v.replace(/[^\d,.]/g, ''))}
        keyboardType="decimal-pad"
        placeholder={placeholder ?? '0,00'}
        placeholderTextColor={colors.textFaint}
        maxLength={8}
        accessibilityLabel={rotulo}
        style={styles.moeda}
      />
      <Text style={styles.cifrao} pointerEvents="none">R$</Text>
    </View>
  )
}

function CampoValor({ rotulo, valor, onChange, placeholder }: { rotulo: string; valor: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={styles.grupo}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <InputMoeda valor={valor} onChange={onChange} placeholder={placeholder} rotulo={rotulo} />
    </View>
  )
}

// Medidas da página do site em 375 de largura.
const styles = StyleSheet.create({
  pilha: { gap: 24 },
  cartao: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  resumo: { gap: 12 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icone: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cresce: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  descricao: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  // `.badge.badge-inativo`
  selo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.border },
  seloTexto: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.48, color: colors.textMuted },
  seloNoMeio: { alignSelf: 'center' },
  linhaResumo: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  linhaResumoUltima: { borderBottomWidth: 0 },
  linhaRotulo: { fontSize: 14, lineHeight: 22.4, color: '#858d99' },
  linhaValor: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text, textAlign: 'right' },
  link: { color: colors.primary600, fontWeight: '600' },
  // `.config-grupo-titulo`
  grupoTitulo: { fontSize: 12.8, lineHeight: 20.48, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.768, color: '#858d99', marginBottom: 12 },
  grupoTituloLargo: { marginBottom: 16 },
  linhaLiga: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  meioApagado: { opacity: 0.5 },
  modos: { gap: 12, marginBottom: 20 },
  modo: { padding: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted },
  modoEscolhido: { borderColor: colors.primary500, backgroundColor: 'rgba(79,70,229,0.12)' },
  modoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  campos: { gap: 12 },
  subtitulo: { marginBottom: 4 },
  depois: { marginBottom: 12 },
  regioesComFaixas: { marginBottom: 24 },
  blocos: { gap: 8 },
  // `.taxidog-bloco`: uma região ou uma faixa, com os campos empilhados.
  bloco: { gap: 12, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted },
  blocoApagado: { opacity: 0.6 },
  duas: { flexDirection: 'row', gap: 12 },
  uf: { width: 72 },
  blocoPe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  aDireita: { justifyContent: 'flex-end' },
  ativa: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ativaTexto: { fontSize: 14, lineHeight: 22.4, color: colors.text },
  adicionar: { alignSelf: 'flex-start', marginTop: 12 },
  distanciaMaxima: { marginTop: 20, width: 260 },
  origem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  origemTexto: { flex: 1, fontSize: 14, lineHeight: 20 },
  semEncolher: { flexShrink: 0 },
  minimo: { width: 200 },
  ajuda: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  ajudaDoMinimo: { marginTop: 8 },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  moeda: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 34,
    paddingRight: 12,
    fontSize: 16,
    color: colors.text,
  },
  cifrao: { position: 'absolute', left: 10, top: 14, fontSize: 14, lineHeight: 20, color: '#858d99' },
  salvarArea: { gap: 12 },
  salvarLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  salvoLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  salvoTexto: { fontSize: 14, lineHeight: 20, color: colors.successFg },
  lembrete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  lembreteTexto: { flexShrink: 1, textAlign: 'right' },
  rotasTopo: { marginBottom: 8 },
  rotasErro: { marginTop: 8 },
})
