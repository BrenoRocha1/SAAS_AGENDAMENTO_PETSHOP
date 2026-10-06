import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Opcao } from '@/components/Opcao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao } from '@/lib/acoes'
import { colors, spacing, typography } from '@/theme/theme'

type Modo = 'fixo' | 'distancia' | 'regiao' | 'personalizado'

// Números ficam como texto enquanto a pessoa digita ("15," no meio da
// digitação não pode virar NaN e apagar o campo); só viram número ao salvar.
interface FaixaForm { km_ate: string; valor_trecho: string; valor_ida_volta: string }
interface RegiaoForm { bairro: string; cidade: string; uf: string; valor_trecho: string; valor_ida_volta: string; ativo: boolean }

const MODOS: { valor: Modo; titulo: string; descricao: string }[] = [
  { valor: 'fixo', titulo: 'Valor fixo', descricao: 'O mesmo preço para qualquer endereço.' },
  { valor: 'distancia', titulo: 'Por distância', descricao: 'O preço muda conforme a distância até a loja.' },
  { valor: 'regiao', titulo: 'Por região', descricao: 'Um preço para cada bairro ou cidade atendida.' },
  { valor: 'personalizado', titulo: 'Região + distância', descricao: 'Preço do bairro/cidade cadastrado; nos outros endereços, a distância.' },
]

const txt = (n: number | string | null | undefined) => (n == null ? '' : String(Number(n)).replace('.', ','))
const num = (s: string) => Number(s.replace(',', '.').trim())
const numOuNull = (s: string) => (s.trim() === '' ? null : num(s))
const valido = (s: string) => s.trim() !== '' && Number.isFinite(num(s)) && num(s) >= 0

// Regras do TaxiDog da loja (migration 042): liga/desliga, como cobra e
// os valores. Salvar passa por salvarTaxiDogConfigAction, a mesma do
// painel web — é o servidor que localiza a loja no mapa quando a cobrança
// usa distância.
export default function TaxiDogConfigScreen() {
  const { contexto } = useAuth()
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
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const [cfgRes, faixasRes, regioesRes] = await Promise.all([
      supabase.from('taxidog_config').select('*').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('taxidog_faixa').select('km_ate, valor_trecho, valor_ida_volta').eq('id_lojista', idLojista).order('km_ate'),
      supabase.from('taxidog_regiao').select('bairro, cidade, uf, valor_trecho, valor_ida_volta, ativo').eq('id_lojista', idLojista).order('cidade').order('bairro'),
    ])
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
    setAviso(r.aviso ?? null)
    if (r.origemEndereco !== undefined) setOrigem(r.origemEndereco)
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

  return (
    <ScreenContainer>
      <DetailHeader title="TaxiDog" />

      {loading ? (
        <ActivityIndicator color={colors.primary600} />
      ) : semMigration ? (
        <Aviso tipo="alerta" texto="O TaxiDog ainda não foi ativado no sistema da loja." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {!acoesDisponiveis() && <Aviso tipo="alerta" texto={`Só consulta: ${MSG_SEM_SITE}`} />}

          <Card style={{ gap: spacing.md }}>
            <LinhaSwitch titulo="Oferecer TaxiDog" detalhe="Buscar e entregar o pet." valor={ativo} onChange={v => { mudou(); setAtivo(v) }} />
            <LinhaSwitch
              titulo="No agendamento online"
              detalhe="Desligado, só a loja inclui TaxiDog no agendamento."
              valor={online}
              onChange={v => { mudou(); setOnline(v) }}
              desativado={!ativo}
            />
          </Card>

          <Text style={styles.secao}>Como cobra</Text>
          <View style={{ gap: spacing.sm }}>
            {MODOS.map(m => (
              <Opcao key={m.valor} titulo={m.titulo} detalhe={m.descricao} selecionada={modo === m.valor} onPress={() => { mudou(); setModo(m.valor) }} />
            ))}
          </View>

          {modo === 'fixo' && (
            <Card style={{ gap: spacing.md }}>
              <Campo rotulo="Só buscar (R$)" value={valorBuscar} onChangeText={t => { mudou(); setValorBuscar(t) }} keyboardType="decimal-pad" maxLength={8} />
              <Campo rotulo="Só entregar (R$)" value={valorEntregar} onChangeText={t => { mudou(); setValorEntregar(t) }} keyboardType="decimal-pad" maxLength={8} />
              <Campo rotulo="Buscar e entregar (R$)" value={valorAmbos} onChangeText={t => { mudou(); setValorAmbos(t) }} keyboardType="decimal-pad" maxLength={8} />
            </Card>
          )}

          {usaRegiao && (
            <>
              <Text style={styles.secao}>Regiões atendidas</Text>
              <Text style={styles.sub}>Sem bairro, o valor vale para a cidade inteira. "Ida e volta" vazio = o dobro do trecho.</Text>
              {regioes.length === 0 && <Text style={styles.sub}>Nenhuma região cadastrada.</Text>}
              {regioes.map((r, i) => (
                <Card key={i} style={{ gap: spacing.md }}>
                  <View style={styles.duas}>
                    <View style={{ flex: 2 }}>
                      <Campo rotulo="Cidade" value={r.cidade} onChangeText={t => atualizarRegiao(i, 'cidade', t)} maxLength={80} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo="UF" value={r.uf} onChangeText={t => atualizarRegiao(i, 'uf', t.toUpperCase())} autoCapitalize="characters" maxLength={2} />
                    </View>
                  </View>
                  <Campo rotulo="Bairro (opcional)" value={r.bairro} onChangeText={t => atualizarRegiao(i, 'bairro', t)} maxLength={80} />
                  <View style={styles.duas}>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo="Trecho (R$)" value={r.valor_trecho} onChangeText={t => atualizarRegiao(i, 'valor_trecho', t)} keyboardType="decimal-pad" maxLength={8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo="Ida e volta (R$)" value={r.valor_ida_volta} onChangeText={t => atualizarRegiao(i, 'valor_ida_volta', t)} keyboardType="decimal-pad" maxLength={8} />
                    </View>
                  </View>
                  <LinhaSwitch titulo="Atendendo esta região" valor={r.ativo} onChange={v => atualizarRegiao(i, 'ativo', v)} />
                  <Remover rotulo="Remover região" onPress={() => { mudou(); setRegioes(prev => prev.filter((_, j) => j !== i)) }} />
                </Card>
              ))}
              <Botao rotulo="Adicionar região" icone="add" variante="secundario" onPress={adicionarRegiao} />
            </>
          )}

          {usaDistancia && (
            <>
              <Text style={styles.secao}>Faixas de distância</Text>
              <Text style={styles.sub}>
                {origem ? `Distância medida a partir de: ${origem}.` : 'A distância é medida a partir do endereço da loja (Dados da loja).'}
                {' '}"Ida e volta" vazio = o dobro do trecho.
              </Text>
              {faixas.length === 0 && <Text style={styles.sub}>Nenhuma faixa cadastrada.</Text>}
              {faixas.map((f, i) => (
                <Card key={i} style={{ gap: spacing.md }}>
                  <View style={styles.duas}>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo="Até (km)" value={f.km_ate} onChangeText={t => atualizarFaixa(i, 'km_ate', t)} keyboardType="decimal-pad" maxLength={6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo="Trecho (R$)" value={f.valor_trecho} onChangeText={t => atualizarFaixa(i, 'valor_trecho', t)} keyboardType="decimal-pad" maxLength={8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo="Ida e volta" value={f.valor_ida_volta} onChangeText={t => atualizarFaixa(i, 'valor_ida_volta', t)} keyboardType="decimal-pad" maxLength={8} />
                    </View>
                  </View>
                  <Remover rotulo="Remover faixa" onPress={() => { mudou(); setFaixas(prev => prev.filter((_, j) => j !== i)) }} />
                </Card>
              ))}
              <Botao rotulo="Adicionar faixa" icone="add" variante="secundario" onPress={adicionarFaixa} />
              <Campo
                rotulo="Distância máxima atendida (km)"
                value={distMax}
                onChangeText={t => { mudou(); setDistMax(t) }}
                keyboardType="decimal-pad"
                maxLength={6}
                ajuda="Vazio = sem limite. Endereço mais longe que isso vê que o TaxiDog não atende."
              />
            </>
          )}

          <Campo
            rotulo="Valor mínimo por corrida (R$, opcional)"
            value={valorMinimo}
            onChangeText={t => { mudou(); setValorMinimo(t) }}
            keyboardType="decimal-pad"
            maxLength={8}
            ajuda="Nenhuma corrida sai por menos que isso, seja qual for a regra."
          />

          {erro && <Aviso tipo="erro" texto={erro} />}
          {salvo && <Aviso tipo="sucesso" texto="Configuração do TaxiDog salva." />}
          {aviso && <Aviso tipo="alerta" texto={aviso} />}
          <Botao rotulo="Salvar" onPress={salvar} carregando={salvando} />
        </View>
      )}
    </ScreenContainer>
  )
}

function Remover({ rotulo, onPress }: { rotulo: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.remover}>
      <IconeApp name="trash-outline" size={17} color={colors.dangerFg} />
      <Text style={styles.removerTexto}>{rotulo}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.sm },
  sub: { ...typography.body.md, color: colors.textMuted },
  duas: { flexDirection: 'row', gap: spacing.md },
  remover: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', minHeight: 32 },
  removerTexto: { ...typography.label.md, color: colors.dangerFg },
})
