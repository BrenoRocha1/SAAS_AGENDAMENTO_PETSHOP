import { useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { format } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { PillStatusRota, rotuloDia } from '@/components/RotaCard'
import { useTaxiDogTempoReal } from '@/contexts/TaxiDogContext'
import { useEnderecoLoja, useRota } from '@/hooks/useMinhasRotas'
import { supabase } from '@/lib/supabase'
import { formatarTelefone } from '@/lib/format'
import {
  acaoOpcional,
  contarPets,
  enderecoParada,
  horarioParada,
  linhasLoja,
  linkMaps,
  proximaParada,
  rotuloAcao,
  rotuloConfirmar,
  tituloParada,
  trajetoDaRota,
  type ItemParada,
  type Parada,
} from '@/lib/taxidog-rotas'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Tela da rota do TaxiDog: resumo + INICIAR ROTA; depois de sair, só a
// PRÓXIMA PARADA em destaque — Abrir no Google Maps → Cheguei → confirmar
// os pets → a próxima aparece sozinha. Tudo é conferido no banco
// (fn_iniciar_rota / fn_chegar_parada / fn_concluir_parada, migration 052).
export default function RotaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { rota, loading, erro: erroCarga, recarregar } = useRota(id)
  const enderecoLoja = useEnderecoLoja()
  const { marcarFeitoPorMim } = useTaxiDogTempoReal()
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [avisoFechado, setAvisoFechado] = useState(0)
  const [verFeitas, setVerFeitas] = useState(false)

  function confirmarCancelamento(idRota: string) {
    Alert.alert('Cancelar rota', 'As corridas voltam para a lista e podem entrar em outra rota. Continuar?', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar rota',
        style: 'destructive',
        onPress: () => {
          marcarFeitoPorMim(idRota)
          chamar('fn_cancelar_rota', { p_id_rota: idRota })
        },
      },
    ])
  }

  async function chamar(fn: string, params: Record<string, unknown>) {
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.rpc(fn, params)
    setEnviando(false)
    if (error) setErro(error.message)
    recarregar()
  }

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Rota" />
        <View style={styles.centro}><ActivityIndicator color={colors.primary600} /></View>
      </ScreenContainer>
    )
  }

  if (!rota) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Rota" />
        <EmptyState icon="alert-circle-outline" title="Rota não encontrada" subtitle={erroCarga ?? 'Ela pode ter sido passada para outro TaxiDog.'} />
      </ScreenContainer>
    )
  }

  const r = rota
  const proxima = r.status === 'em_andamento' ? proximaParada(r) : null
  const feitas = r.paradas.filter(p => p.status === 'concluida')
  const depois = r.paradas.filter(p => p.status !== 'concluida' && p.id_parada !== proxima?.id_parada)
  const trajeto = trajetoDaRota(r)
  const mostrarAviso = !!r.ultima_alteracao && r.versao > 1 && avisoFechado < r.versao
    && (r.status === 'aguardando_saida' || r.status === 'em_andamento')
  const antesDeSair = r.status === 'planejamento' || r.status === 'aguardando_aprovacao' || r.status === 'aguardando_saida'

  return (
    <ScreenContainer onRefresh={recarregar} refreshing={false}>
      <DetailHeader title={`Rota #${r.numero}`} />

      {mostrarAviso && (
        <View style={styles.aviso}>
          <Ionicons name="refresh-circle" size={22} color={colors.warningFg} />
          <View style={{ flex: 1 }}>
            <Text style={styles.avisoTitulo}>Rota atualizada</Text>
            <Text style={styles.avisoTexto}>{r.ultima_alteracao}</Text>
          </View>
          <Pressable onPress={() => setAvisoFechado(r.versao)} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.warningFg} />
          </Pressable>
        </View>
      )}

      <Card style={styles.resumo}>
        <View style={styles.resumoTopo}>
          <Text style={styles.resumoDia}>{rotuloDia(r.data)}</Text>
          <PillStatusRota status={r.status} />
        </View>
        <View style={styles.resumoNumeros}>
          <Numero valor={r.paradas.length} rotulo={r.paradas.length === 1 ? 'parada' : 'paradas'} />
          <Numero valor={contarPets(r)} rotulo={contarPets(r) === 1 ? 'pet' : 'pets'} />
          {trajeto && <Numero valor={trajeto.split(' · ')[0]} rotulo={trajeto.split(' · ')[1] ?? ''} />}
        </View>
      </Card>

      {erro && (
        <View style={styles.alertaErro}>
          <Ionicons name="alert-circle" size={16} color={colors.dangerFg} />
          <Text style={styles.alertaErroTexto}>{erro}</Text>
        </View>
      )}

      {r.status === 'aguardando_aprovacao' && (
        <View style={styles.aviso}>
          <Ionicons name="hourglass-outline" size={22} color={colors.warningFg} />
          <View style={{ flex: 1 }}>
            <Text style={styles.avisoTitulo}>Aguardando aprovação</Text>
            <Text style={styles.avisoTexto}>A loja precisa aprovar esta rota. Você recebe um aviso e pode iniciar assim que aprovarem.</Text>
          </View>
        </View>
      )}

      {r.status === 'cancelada' && (
        <EmptyState icon="close-circle-outline" title="Rota cancelada" subtitle={r.ultima_alteracao ?? 'Esta rota foi cancelada.'} />
      )}

      {r.status === 'concluida' && (
        <View style={styles.fim}>
          <Ionicons name="checkmark-done-circle" size={40} color={colors.successFg} />
          <Text style={styles.fimTitulo}>Rota concluída</Text>
          {r.iniciada_em && r.concluida_em && (
            <Text style={styles.fimTexto}>{format(new Date(r.iniciada_em), 'HH:mm')} → {format(new Date(r.concluida_em), 'HH:mm')}</Text>
          )}
        </View>
      )}

      {antesDeSair && (
        <>
          <Text style={styles.secao}>Paradas</Text>
          <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
            {r.paradas.map((p, idx) => <LinhaParada key={p.id_parada} parada={p} numero={idx + 1} enderecoLoja={enderecoLoja} />)}
          </View>
          {r.status === 'aguardando_saida' && (
            <BotaoGrande
              rotulo="INICIAR ROTA"
              carregando={enviando}
              onPress={() => chamar('fn_iniciar_rota', { p_id_rota: r.id_rota })}
            />
          )}
          {r.status !== 'planejamento' && (
            <Pressable style={styles.cancelarRota} disabled={enviando} onPress={() => confirmarCancelamento(r.id_rota)}>
              <Text style={styles.cancelarRotaTexto}>Cancelar rota</Text>
            </Pressable>
          )}
          <Text style={styles.dicaWeb}>Para mudar a ordem das paradas, use o painel web.</Text>
        </>
      )}

      {proxima && (
        <ProximaParada
          key={`${proxima.id_parada}:${proxima.status}:${r.versao}`}
          parada={proxima}
          numero={r.paradas.indexOf(proxima) + 1}
          total={r.paradas.length}
          enderecoLoja={enderecoLoja}
          enviando={enviando}
          onChegar={() => chamar('fn_chegar_parada', { p_id_parada: proxima.id_parada })}
          onConfirmar={itens => {
            if (itens) marcarFeitoPorMim(r.id_rota)
            chamar('fn_concluir_parada', { p_id_parada: proxima.id_parada, p_itens: itens })
          }}
        />
      )}

      {r.status === 'em_andamento' && depois.length > 0 && (
        <>
          <Text style={styles.secao}>Depois</Text>
          <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
            {depois.map(p => <LinhaParada key={p.id_parada} parada={p} numero={r.paradas.indexOf(p) + 1} enderecoLoja={enderecoLoja} />)}
          </View>
        </>
      )}

      {feitas.length > 0 && r.status !== 'aguardando_saida' && (
        <>
          <Pressable style={styles.feitasToggle} onPress={() => setVerFeitas(v => !v)}>
            <Text style={styles.secao}>Paradas feitas ({feitas.length})</Text>
            <Ionicons name={verFeitas ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable>
          {verFeitas && (
            <View style={{ gap: spacing.sm }}>
              {feitas.map(p => <LinhaParada key={p.id_parada} parada={p} numero={r.paradas.indexOf(p) + 1} enderecoLoja={enderecoLoja} />)}
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  )
}

function Numero({ valor, rotulo }: { valor: string | number; rotulo: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.numeroValor}>{valor}</Text>
      <Text style={styles.numeroRotulo}>{rotulo}</Text>
    </View>
  )
}

function BotaoGrande({ rotulo, onPress, carregando, secundario, icone }: {
  rotulo: string
  onPress: () => void
  carregando?: boolean
  secundario?: boolean
  icone?: keyof typeof Ionicons.glyphMap
}) {
  return (
    <Pressable
      style={({ pressed }) => [secundario ? styles.botaoSecundario : styles.botaoPrimario, (pressed || carregando) && { opacity: 0.85 }]}
      disabled={carregando}
      onPress={onPress}
    >
      {carregando
        ? <ActivityIndicator color={secundario ? colors.primary600 : colors.white} />
        : (
          <View style={styles.botaoConteudo}>
            {icone && <Ionicons name={icone} size={20} color={secundario ? colors.primary600 : colors.white} />}
            <Text style={secundario ? styles.botaoSecundarioTexto : styles.botaoPrimarioTexto}>{rotulo}</Text>
          </View>
        )}
    </Pressable>
  )
}

function LinhaParada({ parada: p, numero, enderecoLoja }: { parada: Parada; numero: number; enderecoLoja: string }) {
  const feita = p.status === 'concluida'
  const horario = horarioParada(p)
  return (
    <View style={[styles.linha, feita && { opacity: 0.6 }]}>
      <View style={[styles.linhaNumero, feita && { backgroundColor: colors.successBg }]}>
        {feita
          ? <Ionicons name="checkmark" size={14} color={colors.successFg} />
          : <Text style={styles.linhaNumeroTexto}>{numero}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {p.local === 'loja' && <Ionicons name="storefront-outline" size={14} color={colors.text} />}
          <Text style={styles.linhaTitulo}>{tituloParada(p)}</Text>
        </View>
        {p.local === 'loja'
          ? linhasLoja(p).map(l => <Text key={l} style={styles.linhaTexto}>{l}</Text>)
          : <Text style={styles.linhaTexto} numberOfLines={1}>{enderecoParada(p, enderecoLoja)}{horario ? ` · ${horario}` : ''}</Text>}
      </View>
    </View>
  )
}

function ProximaParada({ parada: p, numero, total, enderecoLoja, enviando, onChegar, onConfirmar }: {
  parada: Parada
  numero: number
  total: number
  enderecoLoja: string
  enviando: boolean
  onChegar: () => void
  onConfirmar: (itensOk: string[] | null) => void
}) {
  const aFazer = p.itens.filter(i => !i.feito)
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(aFazer.filter(i => i.acao !== 'pegar_loja' || i.status_corrida === 'pronto_entrega').map(i => i.id_item)),
  )
  const desmarcados = aFazer.filter(i => acaoOpcional(i.acao) && !marcados.has(i.id_item))
  const temOpcional = aFazer.some(i => acaoOpcional(i.acao))
  const horario = horarioParada(p)
  // Um contato por tutor (dois pets do mesmo tutor = um telefone só).
  const clientes = p.local === 'cliente'
    ? [...new Map(p.itens.map(i => [i.cliente_telefone, i])).values()]
    : []

  function alternar(idItem: string) {
    setMarcados(prev => {
      const novo = new Set(prev)
      if (novo.has(idItem)) novo.delete(idItem)
      else novo.add(idItem)
      return novo
    })
  }

  function confirmar() {
    if (desmarcados.length === 0) {
      onConfirmar(null)
      return
    }
    const nomes = desmarcados.map(i => i.pet_nome).join(', ')
    Alert.alert('Confirmar', `${nomes} vai sair desta rota e volta para a loja reorganizar. Continuar?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => onConfirmar(aFazer.filter(i => marcados.has(i.id_item) || !acaoOpcional(i.acao)).map(i => i.id_item)) },
    ])
  }

  return (
    <Card style={styles.proxima}>
      <View style={styles.proximaTopo}>
        <Text style={styles.proximaRotulo}>PRÓXIMA PARADA</Text>
        <Text style={styles.proximaRotulo}>{numero} de {total}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {p.local === 'loja' && <Ionicons name="storefront" size={20} color={colors.text} />}
        <Text style={styles.proximaTitulo}>{tituloParada(p)}</Text>
      </View>
      <Text style={styles.proximaEndereco}>{enderecoParada(p, enderecoLoja)}</Text>
      {horario && <Text style={styles.proximaHorario}>Horário combinado: {horario}</Text>}
      {p.local === 'loja' && linhasLoja(p).map(l => <Text key={l} style={styles.proximaLoja}>{l}</Text>)}

      {clientes.map(c => {
        const tel = c.cliente_telefone.replace(/\D/g, '')
        return (
          <View key={c.cliente_telefone} style={styles.contato}>
            <Text style={styles.contatoNome} numberOfLines={1}>{c.cliente_nome} · {formatarTelefone(c.cliente_telefone)}</Text>
            <View style={styles.contatoBotoes}>
              <Pressable style={styles.contatoBotao} onPress={() => Linking.openURL(`tel:${tel}`)}>
                <Ionicons name="call" size={16} color={colors.primary600} />
              </Pressable>
              <Pressable style={styles.contatoBotao} onPress={() => Linking.openURL(`https://wa.me/55${tel}`)}>
                <Ionicons name="logo-whatsapp" size={16} color={colors.primary600} />
              </Pressable>
            </View>
          </View>
        )
      })}

      {p.status === 'pendente' ? (
        <View style={styles.botoes}>
          <BotaoGrande rotulo="ABRIR NO GOOGLE MAPS" icone="navigate" secundario onPress={() => Linking.openURL(linkMaps(p, enderecoLoja))} />
          <BotaoGrande rotulo="CHEGUEI" carregando={enviando} onPress={onChegar} />
        </View>
      ) : (
        <>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {aFazer.map(i => (
              <ItemPet key={i.id_item} item={i} naLoja={p.local === 'loja'} marcado={marcados.has(i.id_item)} onAlternar={() => alternar(i.id_item)} />
            ))}
          </View>
          {temOpcional && (
            <Text style={styles.dica}>
              {desmarcados.length > 0
                ? `${desmarcados.map(i => i.pet_nome).join(', ')} vai sair desta rota.`
                : 'Desmarque o pet que não foi (cliente ausente ou pet não pronto).'}
            </Text>
          )}
          <View style={styles.botoes}>
            <BotaoGrande rotulo={rotuloConfirmar(p).toUpperCase()} carregando={enviando} onPress={confirmar} />
          </View>
        </>
      )}
    </Card>
  )
}

function ItemPet({ item: i, naLoja, marcado, onAlternar }: { item: ItemParada; naLoja: boolean; marcado: boolean; onAlternar: () => void }) {
  const opcional = acaoOpcional(i.acao)
  const naoPronto = i.acao === 'pegar_loja' && i.status_corrida !== 'pronto_entrega'
  const comportamento = (i.pet_comportamento ?? []).filter(Boolean)
  const observacoes = [i.obs_agendamento, i.pet_obs, i.pet_obs_comportamento].filter(Boolean) as string[]
  const ativo = marcado || !opcional

  return (
    <Pressable
      disabled={!opcional || naoPronto}
      onPress={onAlternar}
      style={[styles.pet, ativo && styles.petMarcado]}
    >
      <View style={styles.petLinha}>
        <Ionicons
          name={ativo ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={ativo ? colors.successFg : colors.textFaint}
        />
        {i.pet_foto_url
          ? <Image source={{ uri: i.pet_foto_url }} style={styles.petFoto} />
          : <Avatar nome={i.pet_nome} size={40} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.petNome}>{i.pet_nome}</Text>
          <Text style={styles.petDetalhe}>
            {rotuloAcao(i.acao)}{i.pet_raca ? ` · ${i.pet_raca}` : ''}{naLoja ? ` · ${i.cliente_nome}` : ''}
          </Text>
          {naoPronto && <Text style={styles.petAlerta}>Ainda não está pronto</Text>}
        </View>
      </View>
      {(comportamento.length > 0 || observacoes.length > 0) && (
        <View style={styles.petObs}>
          {comportamento.length > 0 && (
            <View style={styles.tags}>
              {comportamento.map(t => <View key={t} style={styles.tag}><Text style={styles.tagTexto}>{t}</Text></View>)}
            </View>
          )}
          {observacoes.map((o, k) => <Text key={k} style={styles.petObsTexto}>{o}</Text>)}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  avisoTitulo: { ...typography.heading.sm, color: colors.warningFg },
  avisoTexto: { ...typography.body.md, color: colors.warningFg },
  resumo: { gap: spacing.md, marginBottom: spacing.lg },
  resumoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resumoDia: { ...typography.heading.md, color: colors.text, textTransform: 'capitalize' },
  resumoNumeros: { flexDirection: 'row', gap: spacing.md },
  numeroValor: { ...typography.heading.lg, color: colors.text },
  numeroRotulo: { ...typography.body.sm, color: colors.textMuted },
  alertaErro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  alertaErroTexto: { ...typography.body.md, color: colors.dangerFg, flex: 1 },
  fim: { alignItems: 'center', gap: spacing.xs, backgroundColor: colors.successBg, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl },
  fimTitulo: { ...typography.heading.md, color: colors.successFg },
  fimTexto: { ...typography.body.md, color: colors.successFg },
  secao: { ...typography.heading.sm, color: colors.text, marginBottom: spacing.sm },
  feitasToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelarRota: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelarRotaTexto: { ...typography.label.md, color: colors.dangerFg },
  dicaWeb: { ...typography.body.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  linhaNumero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linhaNumeroTexto: { ...typography.label.md, color: colors.textDim },
  linhaTitulo: { ...typography.body.lg, color: colors.text, fontWeight: '600', flexShrink: 1 },
  linhaTexto: { ...typography.body.md, color: colors.textMuted },
  proxima: { gap: spacing.xs, borderColor: colors.primary600, borderWidth: 2, marginBottom: spacing.xl },
  proximaTopo: { flexDirection: 'row', justifyContent: 'space-between' },
  proximaRotulo: { ...typography.label.md, color: colors.primary600, letterSpacing: 0.6 },
  proximaTitulo: { ...typography.heading.lg, color: colors.text, flexShrink: 1 },
  proximaEndereco: { ...typography.body.lg, color: colors.textDim },
  proximaHorario: { ...typography.body.md, color: colors.textMuted },
  proximaLoja: { ...typography.body.lg, color: colors.text, fontWeight: '600' },
  contato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  contatoNome: { ...typography.body.md, color: colors.text, flex: 1 },
  contatoBotoes: { flexDirection: 'row', gap: spacing.sm },
  contatoBotao: {
    width: 40,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoes: { gap: spacing.md, marginTop: spacing.md },
  botaoPrimario: {
    backgroundColor: colors.primary600,
    borderRadius: radius.md,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPrimarioTexto: { ...typography.heading.md, color: colors.white, letterSpacing: 0.5 },
  botaoSecundario: {
    backgroundColor: colors.primary50,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoSecundarioTexto: { ...typography.heading.sm, color: colors.primary600, letterSpacing: 0.3 },
  botaoConteudo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dica: { ...typography.body.sm, color: colors.textMuted, marginTop: spacing.xs },
  pet: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  petMarcado: { borderColor: colors.success, backgroundColor: colors.successBg },
  petLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  petFoto: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted },
  petNome: { ...typography.heading.sm, color: colors.text },
  petDetalhe: { ...typography.body.sm, color: colors.textMuted },
  petAlerta: { ...typography.body.sm, color: colors.warningFg, fontWeight: '600' },
  petObs: { gap: 4, marginLeft: 36 },
  petObsTexto: { ...typography.body.md, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { backgroundColor: colors.warningBg, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  tagTexto: { ...typography.label.md, color: colors.warningFg },
})
