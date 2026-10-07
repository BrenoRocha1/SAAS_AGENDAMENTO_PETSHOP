import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { CartaoConfig, CartaoInterruptor } from '@/components/CartaoConfig'
import { DetailHeader } from '@/components/DetailHeader'
import { IconCalendar, IconCheck, IconClock, IconCopy, IconKanban, IconLink, IconMoney, IconUsers } from '@/components/IconesDoSite'
import { ScreenContainer } from '@/components/ScreenContainer'
import { Seletor } from '@/components/Seletor'
import { SemPermissao } from '@/components/SemPermissao'
import { Text, TextInput } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { faltaMigration } from '@/lib/erros'
import { soDigitos } from '@/lib/mascaras'
import { urlDoSite } from '@/lib/site'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

type Unidade = 'horas' | 'dias'
interface Janela { minValor: number; minUnidade: Unidade; maxValor: number; maxUnidade: Unidade }

const UNIDADES: { valor: Unidade; rotulo: string }[] = [{ valor: 'horas', rotulo: 'horas' }, { valor: 'dias', rotulo: 'dias' }]

// Configurações → Configurações de Agendamentos, igual à página do site:
// Kanban, agendamentos simultâneos, agendamento online (com o link e a
// antecedência) e o aviso de preço estimado. Os liga/desliga gravam pelas
// actions do painel; sem o site configurado no app, só o dono da conta
// consegue mudar (RLS).
export function TelaConfigAgendamentos() {
  const { contexto, recarregar } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const comSite = acoesDisponiveis()
  const podeGravar = comSite || contexto?.role === 'lojista'

  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState(false)
  const [kanban, setKanban] = useState(false)
  const [online, setOnline] = useState(false)
  // Cada grupo abaixo é de uma migration: `undefined` = ela ainda não rodou.
  const [slug, setSlug] = useState<string | null | undefined>(undefined)
  const [janela, setJanela] = useState<Janela | undefined>(undefined)
  const [estimado, setEstimado] = useState<boolean | undefined>(undefined)
  const [simultaneos, setSimultaneos] = useState<number | undefined>(undefined)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    // Consultas separadas e tolerantes, como no painel web: uma coluna que
    // ainda não existe não derruba o resto da tela.
    const loja = (colunas: string) => supabase.from('lojista').select(colunas).eq('id_lojista', idLojista).maybeSingle()
    const [base, slugRow, janelaRow, estimadoRow, simultaneosRow] = await Promise.all([
      loja('kanban_ativo, aceita_agendamento_online'),
      loja('slug'),
      loja('agendamento_min_valor, agendamento_min_unidade, agendamento_max_valor, agendamento_max_unidade'),
      loja('precos_estimados'),
      loja('agendamentos_simultaneos'),
    ])
    const b = base.data as unknown as { kanban_ativo: boolean; aceita_agendamento_online: boolean } | null
    setErroCarga(!!base.error || !b)
    setKanban(!!b?.kanban_ativo)
    setOnline(!!b?.aceita_agendamento_online)
    setSlug(slugRow.error ? undefined : ((slugRow.data as unknown as { slug: string | null } | null)?.slug ?? null))
    const j = janelaRow.error ? null : (janelaRow.data as unknown as { agendamento_min_valor: number; agendamento_min_unidade: Unidade; agendamento_max_valor: number; agendamento_max_unidade: Unidade } | null)
    setJanela(j ? { minValor: j.agendamento_min_valor, minUnidade: j.agendamento_min_unidade, maxValor: j.agendamento_max_valor, maxUnidade: j.agendamento_max_unidade } : undefined)
    setEstimado(estimadoRow.error ? undefined : !!(estimadoRow.data as unknown as { precos_estimados: boolean | null } | null)?.precos_estimados)
    setSimultaneos(simultaneosRow.error ? undefined : Number((simultaneosRow.data as unknown as { agendamentos_simultaneos: number | null } | null)?.agendamentos_simultaneos ?? 1))
    setCarregando(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode || !idLojista) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Configurações de Agendamentos" />
        <SemPermissao area="mudar as configurações da loja" />
      </ScreenContainer>
    )
  }

  // Grava um liga/desliga da loja: pela action do painel ou, sem o site
  // configurado, direto na tabela (só o dono passa na RLS).
  async function alternar(acao: string, coluna: string, ativo: boolean, guardar: (v: boolean) => void): Promise<string | undefined> {
    let falha: string | undefined
    if (comSite) {
      falha = (await chamarAcao(acao, ativo)).error
    } else {
      const { data, error } = await supabase.from('lojista').update({ [coluna]: ativo }).eq('id_lojista', idLojista).select('id_lojista')
      if (error || !data || data.length === 0) falha = 'Não foi possível salvar. Tente novamente.'
    }
    if (!falha) guardar(ativo)
    return falha
  }

  return (
    <ScreenContainer refreshing={carregando} onRefresh={carregar}>
      <DetailHeader title="Configurações de Agendamentos" />

      {carregando ? null : erroCarga ? (
        <Aviso tipo="erro" texto="Não foi possível carregar as configurações agora. Execute a migration 020_configuracoes_loja.sql se ainda não rodou, e tente novamente." />
      ) : (
        <View style={styles.pilha}>
          <CartaoInterruptor
            icone={IconKanban}
            titulo="Gestor de Agendamentos (Kanban)"
            descricao="Acompanhe os atendimentos em tempo real, separados por Pendente, Em Andamento e Finalizado."
            descricaoDesativado="Desativado, o item some do menu lateral — os agendamentos continuam existindo normalmente, só a tela de Kanban fica indisponível."
            valor={kanban}
            desativado={!podeGravar}
            onMudar={async v => {
              const falha = await alternar('alternarKanbanAction', 'kanban_ativo', v, setKanban)
              // O item some do menu (ou volta) na hora.
              if (!falha) recarregar()
              return falha
            }}
          />

          {simultaneos === undefined ? (
            <Aviso tipo="alerta" texto="Ainda não dá pra escolher quantos agendamentos a loja aceita ao mesmo tempo — execute a migration 076_agendamentos_simultaneos.sql." />
          ) : (
            <Simultaneos atual={simultaneos} />
          )}

          <CartaoInterruptor
            icone={IconCalendar}
            titulo="Agendamento Online"
            descricao="Permite que clientes já cadastrados agendem sozinhos, pelo app, sem precisar ligar ou ir até a loja."
            descricaoDesativado="Desativado, sua loja some do seletor de lojas no app do cliente e novas tentativas de agendamento público são recusadas — agendamentos feitos por você (walk-in, telefone) continuam funcionando normalmente."
            valor={online}
            desativado={!podeGravar}
            onMudar={v => alternar('alternarAgendamentoOnlineAction', 'aceita_agendamento_online', v, setOnline)}
          />

          {online && (
            <>
              {slug === undefined && (
                <Aviso tipo="alerta" texto="Ainda não dá pra personalizar o nome do link — execute a migration 024_slug_lojista.sql." />
              )}
              <LinkAgendamento idLojista={idLojista} slugAtual={slug ?? null} podeMudar={comSite} />

              {janela === undefined ? (
                <Aviso tipo="alerta" texto="Ainda não dá pra configurar a antecedência do agendamento online — execute a migration 025_janela_agendamento.sql." />
              ) : (
                <JanelaAgendamento atual={janela} podeMudar={comSite} />
              )}
            </>
          )}

          {estimado !== undefined && (
            <CartaoInterruptor
              icone={IconMoney}
              titulo="Avisar que o preço pode mudar no dia"
              descricao="Ligado, o cliente vê um aviso antes de confirmar o agendamento online: o valor do banho ou da tosa é uma estimativa e a loja pode ajustar no dia, conforme a pelagem e as condições do pet. É só o aviso — nenhum preço muda sozinho."
              descricaoDesativado="Desligado, o cliente não vê aviso nenhum: o preço do serviço aparece como valor final."
              valor={estimado}
              desativado={!podeGravar}
              onMudar={v => alternar('alternarPrecosEstimadosAction', 'precos_estimados', v, setEstimado)}
            />
          )}
        </View>
      )}
    </ScreenContainer>
  )
}

// A mensagem "Configuração salva!" some sozinha depois de 3 segundos.
function useSucesso(): [boolean, (v: boolean) => void] {
  const [sucesso, setSucesso] = useState(false)
  useEffect(() => {
    if (!sucesso) return
    const t = setTimeout(() => setSucesso(false), 3000)
    return () => clearTimeout(t)
  }, [sucesso])
  return [sucesso, setSucesso]
}

const MAXIMO = 20

// Quantos agendamentos a loja aceita no mesmo horário (migration 076).
// Vale para tudo que confere horário: agendamento online, os que a loja
// cria, remarcar e trocar serviço.
function Simultaneos({ atual }: { atual: number }) {
  const [quantidade, setQuantidade] = useState(atual)
  const [salvo, setSalvo] = useState(atual)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useSucesso()
  const [salvando, setSalvando] = useState(false)

  function mudar(n: number) {
    setQuantidade(Math.min(MAXIMO, Math.max(1, n)))
    setSucesso(false)
  }

  async function salvar() {
    setErro(null)
    setSucesso(false)
    setSalvando(true)
    const { error } = await supabase.rpc('fn_definir_agendamentos_simultaneos', { p_quantidade: quantidade })
    setSalvando(false)
    if (error) {
      if (faltaMigration(error)) return setErro('Para usar agendamentos simultâneos, execute a migration 076_agendamentos_simultaneos.sql.')
      if (error.message.includes('Acesso não autorizado')) return setErro('Só o dono ou um administrador da loja muda essa configuração.')
      const m = error.message.match(/Simultâneos: ([^\n]+)/)
      return setErro(m ? `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)}.` : 'Não foi possível salvar. Tente novamente.')
    }
    setSalvo(quantidade)
    setSucesso(true)
  }

  return (
    <CartaoConfig
      icone={IconUsers}
      titulo="Agendamentos simultâneos"
      descricao="Quantos pets a loja atende ao mesmo tempo. Um horário só fica ocupado quando esse número é atingido."
    >
      {erro && <Aviso tipo="erro" texto={erro} style={styles.avisoDoCartao} />}
      {sucesso && <Aviso tipo="sucesso" texto="Configuração salva!" style={styles.avisoDoCartao} />}
      <View style={styles.grupo}>
        <Text style={styles.rotulo}>Agendamentos no mesmo horário</Text>
        <View style={styles.passos}>
          <BotaoPequeno normal rotulo="−" desativado={salvando || quantidade <= 1} onPress={() => mudar(quantidade - 1)} />
          <TextInput
            value={String(quantidade)}
            onChangeText={t => mudar(Math.round(Number(soDigitos(t))) || 1)}
            keyboardType="number-pad"
            maxLength={2}
            editable={!salvando}
            accessibilityLabel="Agendamentos no mesmo horário"
            style={[styles.campo, styles.quantidade]}
          />
          <BotaoPequeno normal rotulo="+" desativado={salvando || quantidade >= MAXIMO} onPress={() => mudar(quantidade + 1)} />
        </View>
        <Text style={styles.ajuda}>
          {quantidade === 1
            ? 'Com 1, cada horário aceita um agendamento só (como sempre foi).'
            : `Com ${quantidade}, o mesmo horário aceita até ${quantidade} agendamentos de pets diferentes.`}
          {' '}Vale para o agendamento online e para os que a loja cria. O mesmo pet nunca fica com dois serviços no mesmo horário.
        </Text>
      </View>
      <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : 'Salvar'} desativado={salvando || quantidade === salvo} style={styles.salvar} onPress={salvar} />
    </CartaoConfig>
  )
}

// Link público de agendamento da loja: copiar e trocar o nome dele.
function LinkAgendamento({ idLojista, slugAtual, podeMudar }: { idLojista: string; slugAtual: string | null; podeMudar: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const [slugSalvo, setSlugSalvo] = useState(slugAtual)
  const [slug, setSlug] = useState(slugAtual ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useSucesso()
  const [salvando, setSalvando] = useState(false)

  const caminho = `/agendamento/${slugSalvo ?? idLojista}`
  const link = urlDoSite(caminho) ?? caminho

  async function copiar() {
    try {
      await Clipboard.setStringAsync(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // sem área de transferência: o link continua à vista
    }
  }

  async function salvar() {
    setErro(null)
    setSucesso(false)
    setSalvando(true)
    const r = await chamarAcao<{ slug: string }>('atualizarSlugLojistaAction', form({ slug }))
    setSalvando(false)
    if (r.error) return setErro(r.error)
    setSlug(r.slug ?? slug)
    setSlugSalvo(r.slug ?? slug)
    setSucesso(true)
  }

  return (
    <CartaoConfig
      icone={IconLink}
      titulo="Link de agendamento"
      descricao="Compartilhe com seus clientes (WhatsApp, Instagram, etc.) para eles agendarem direto."
    >
      <Text style={styles.rotuloSolto}>Link da sua loja</Text>
      <Pressable onPress={copiar} accessibilityRole="button" accessibilityLabel={copiado ? 'Copiado!' : 'Copiar link'} style={styles.link}>
        <Text style={styles.linkTexto} numberOfLines={1}>{link}</Text>
        <View style={styles.linkBotao}>
          {copiado ? <IconCheck size={17} color={colors.successFg} /> : <IconCopy size={17} color={colors.textDim} />}
        </View>
      </Pressable>

      <View style={styles.trocar}>
        <Text style={styles.rotuloSolto}>{slugSalvo ? 'Trocar o nome do link' : 'Personalizar o nome do link'}</Text>
        <Text style={styles.nota}>Só letras minúsculas, números e hífen. Precisa ser único — se já estiver em uso, tente outro nome.</Text>
        {erro && <Aviso tipo="erro" texto={erro} style={styles.avisoDoLink} />}
        {sucesso && <Aviso tipo="sucesso" texto="Link atualizado com sucesso!" style={styles.avisoDoLink} />}
        <View style={styles.linha}>
          <View style={[styles.campo, styles.nomeDoLink]}>
            <Text style={styles.prefixo}>/agendamento/</Text>
            <TextInput
              value={slug}
              onChangeText={t => setSlug(t.toLowerCase())}
              placeholder="petshopbacanadopedro"
              placeholderTextColor={colors.textFaint}
              maxLength={60}
              autoCapitalize="none"
              autoCorrect={false}
              editable={podeMudar && !salvando}
              accessibilityLabel="Nome do link"
              style={styles.nomeDoLinkCampo}
            />
          </View>
          <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : 'Salvar'} desativado={!podeMudar || salvando || !slug || slug === slugSalvo} style={styles.salvarAoLado} onPress={salvar} />
        </View>
      </View>
    </CartaoConfig>
  )
}

// Só afeta o agendamento que o CLIENTE faz sozinho (online) — a loja
// continua criando agendamento para qualquer data e hora.
function JanelaAgendamento({ atual, podeMudar }: { atual: Janela; podeMudar: boolean }) {
  const [minValor, setMinValor] = useState(String(atual.minValor))
  const [minUnidade, setMinUnidade] = useState<Unidade>(atual.minUnidade)
  const [maxValor, setMaxValor] = useState(String(atual.maxValor))
  const [maxUnidade, setMaxUnidade] = useState<Unidade>(atual.maxUnidade)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useSucesso()
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setErro(null)
    setSucesso(false)
    setSalvando(true)
    const r = await chamarAcao('atualizarJanelaAgendamentoAction', form({
      minValor: Number(minValor || '0'),
      minUnidade,
      maxValor: Number(maxValor || '0'),
      maxUnidade,
    }))
    setSalvando(false)
    if (r.error) return setErro(r.error)
    setSucesso(true)
  }

  return (
    <CartaoConfig
      icone={IconClock}
      titulo="Antecedência do agendamento online"
      descricao="Controle com quanto tempo de antecedência o cliente pode agendar sozinho pelo link."
    >
      {erro && <Aviso tipo="erro" texto={erro} style={styles.avisoDoCartao} />}
      {sucesso && <Aviso tipo="sucesso" texto="Configuração salva!" style={styles.avisoDoCartao} />}
      <View style={styles.grade}>
        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Antecedência mínima</Text>
          <View style={styles.linha}>
            <TextInput value={minValor} onChangeText={t => setMinValor(soDigitos(t))} keyboardType="number-pad" maxLength={3} editable={podeMudar && !salvando} accessibilityLabel="Antecedência mínima" style={[styles.campo, styles.valor]} />
            <Seletor titulo="Antecedência mínima em" valor={minUnidade} opcoes={UNIDADES} desativado={!podeMudar || salvando} style={styles.unidade} onChange={setMinUnidade} />
          </View>
          <Text style={styles.ajuda}>Ex.: 3 horas — não dá pra agendar pros próximos 3h.</Text>
        </View>
        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Antecedência máxima</Text>
          <View style={styles.linha}>
            <TextInput value={maxValor} onChangeText={t => setMaxValor(soDigitos(t))} keyboardType="number-pad" maxLength={3} editable={podeMudar && !salvando} accessibilityLabel="Antecedência máxima" style={[styles.campo, styles.valor]} />
            <Seletor titulo="Antecedência máxima em" valor={maxUnidade} opcoes={UNIDADES} desativado={!podeMudar || salvando} style={styles.unidade} onChange={setMaxUnidade} />
          </View>
          <Text style={styles.ajuda}>Ex.: 5 dias — só mostra disponibilidade até 5 dias à frente.</Text>
        </View>
      </View>
      <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : 'Salvar'} desativado={!podeMudar || salvando} style={styles.salvar} onPress={salvar} />
    </CartaoConfig>
  )
}

// Medidas da página do site em 375 de largura.
const styles = StyleSheet.create({
  pilha: { gap: 24 },
  avisoDoCartao: { marginBottom: 16 },
  avisoDoLink: { marginBottom: 12 },
  grupo: { gap: 4 },
  grade: { gap: 12 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  // Rótulo fora de grupo: ocupa a linha inteira do texto do cartão (25,6).
  rotuloSolto: { fontSize: 13, lineHeight: 25.6, fontWeight: '600', color: colors.textDim },
  ajuda: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99', marginBottom: 12 },
  linha: { flexDirection: 'row', gap: 8 },
  passos: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campo: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
  },
  quantidade: { width: 90, textAlign: 'center' },
  valor: { flex: 1, minWidth: 0 },
  unidade: { width: 100 },
  salvar: { alignSelf: 'flex-end', marginTop: 8 },
  salvarAoLado: { height: 48 },
  // O link em formato de pílula, com o botão de copiar dentro.
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    marginBottom: 20,
  },
  linkTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.infoFg },
  linkBotao: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trocar: { paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  nomeDoLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, overflow: 'hidden' },
  prefixo: { paddingLeft: 12, fontSize: 14, lineHeight: 20, color: '#858d99' },
  nomeDoLinkCampo: { flex: 1, minWidth: 0, height: '100%', paddingLeft: 2, paddingRight: 12, fontSize: 14, color: colors.text },
})
