import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { EmptyState } from '@/components/EmptyState'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Aviso } from '@/components/Aviso'
import { IconCheck, IconWhatsapp } from '@/components/IconesDoSite'
import { Seletor } from '@/components/Seletor'
import { Text } from '@/components/Texto'
import { supabase } from '@/lib/supabase'
import { dataBR } from '@/lib/agenda'
import { carregarAgendamento, editarAgendamento, whatsappAlterado } from '@/lib/agendamentos'
import { formatarMoeda } from '@/lib/format'
import { nomeDaLoja } from '@/lib/loja'
import { colors, spacing } from '@/theme/theme'

interface Dados {
  idLojista: string
  idPet: string | null
  idServico: string
  dt: string
  hr: string
  valor: number
  // Serviços marcados juntos (mesmo pet, dia e pedido) ainda por fazer.
  noPedido: number
  servicos: { id_servico: string; nome: string; duracao: number }[]
  pets: { id_pet: string; nome: string; raca: string | null }[]
}

// fn_beneficios_do_pet (migration 060)
interface PlanoDoPet {
  plano: string
  beneficios: { id_servico: string; quantidade: number; usados: number }[]
}

function horaMais(hhmm: string, minutos: number) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutos
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Alterar agendamento — a mesma janela do site (EditarModal em
// petshop-app/src/components/EditarAgendamento.tsx): resumo numa linha,
// Serviço e Pet em campos de escolha, o preço novo e os botões. Mudou lá,
// muda aqui.
// Troca o serviço e/ou o pet (do mesmo cliente) — regras em
// fn_editar_agendamento (migration 070): a loja altera Pendente ou Aceito;
// o cliente, o próprio agendamento só enquanto Pendente.
export function TelaEditarAgendamento({ modo }: { modo: 'loja' | 'cliente' }) {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [idServico, setIdServico] = useState('')
  const [idPet, setIdPet] = useState('')
  const [preco, setPreco] = useState<{ chave: string; valor: number | null } | null>(null)
  const [planos, setPlanos] = useState<{ chave: string; lista: PlanoDoPet[] } | null>(null)
  const [usarBeneficio, setUsarBeneficio] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<{ anterior: number; novo: number; avisos: string[]; whatsapp: string | null } | null>(null)

  // Agendamento, serviços da loja e pets do cliente.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: ag } = await supabase
        .from('agendamento')
        .select('id_lojista, id_cliente, id_pet, id_servico, dt_agendamento, hr_agendamento, valor, created_at')
        .eq('id_agendamento', id)
        .maybeSingle()
      if (!ag) {
        if (!cancelado) setErroCarga('Agendamento não encontrado.')
        return
      }
      const [{ data: servicos }, { data: pets }, { count }] = await Promise.all([
        supabase.from('servico').select('id_servico, nome, duracao').eq('id_lojista', ag.id_lojista).eq('status', 'Ativo').order('nome'),
        ag.id_cliente
          ? supabase.from('pet').select('id_pet, nome, raca').eq('id_cliente', ag.id_cliente).eq('ativo', true).order('nome')
          : Promise.resolve({ data: [] }),
        supabase.from('agendamento').select('id_agendamento', { count: 'exact', head: true })
          .eq('id_lojista', ag.id_lojista).eq('id_pet', ag.id_pet).eq('dt_agendamento', ag.dt_agendamento)
          .eq('created_at', ag.created_at).in('status', ['Pendente', 'Confirmado']),
      ])
      if (cancelado) return
      const lista = (servicos ?? []) as Dados['servicos']
      // O serviço atual pode ter sido desativado: continua na lista.
      if (!lista.some(s => s.id_servico === ag.id_servico)) {
        const { data: atual } = await supabase.from('servico').select('id_servico, nome, duracao').eq('id_servico', ag.id_servico).maybeSingle()
        if (atual) lista.unshift(atual as Dados['servicos'][number])
      }
      if (cancelado) return
      setDados({
        idLojista: ag.id_lojista,
        idPet: ag.id_pet,
        idServico: ag.id_servico,
        dt: ag.dt_agendamento,
        hr: (ag.hr_agendamento as string).slice(0, 5),
        valor: Number(ag.valor),
        noPedido: count ?? 1,
        servicos: lista,
        pets: (pets ?? []) as Dados['pets'],
      })
      setIdServico(ag.id_servico)
      setIdPet(ag.id_pet ?? '')
    })()
    return () => { cancelado = true }
  }, [id])

  // Preço do serviço escolhido para o pet escolhido (faixas por porte/raça).
  const chavePreco = `${idServico}|${idPet}`
  useEffect(() => {
    if (!idServico || !idPet) return
    let cancelado = false
    supabase.rpc('fn_calcular_preco_servico', { p_id_servico: idServico, p_id_pet: idPet }).then(({ data, error }) => {
      if (!cancelado) setPreco({ chave: `${idServico}|${idPet}`, valor: error ? null : Number(data) })
    })
    return () => { cancelado = true }
  }, [idServico, idPet])

  // Plano do pet no dia do agendamento (só a loja usa benefício aqui).
  const dt = dados?.dt ?? ''
  const chavePlano = `${idPet}|${dt}`
  useEffect(() => {
    if (modo !== 'loja' || !idPet || !dt) return
    let cancelado = false
    supabase.rpc('fn_beneficios_do_pet', { p_id_pet: idPet, p_data: dt }).then(({ data, error }) => {
      if (!cancelado) setPlanos({ chave: `${idPet}|${dt}`, lista: error ? [] : ((data ?? []) as PlanoDoPet[]) })
    })
    return () => { cancelado = true }
  }, [idPet, dt, modo])

  if (!dados) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Alterar agendamento" junto />
        {erroCarga ? (
          <EmptyState icon="alert-circle-outline" ilustracao="nao-encontrado" title="Agendamento não encontrado" subtitle={erroCarga} />
        ) : (
          <View style={styles.centro}><ActivityIndicator color={colors.primary600} /></View>
        )}
      </ScreenContainer>
    )
  }

  const d = dados
  const servicoAtual = d.servicos.find(s => s.id_servico === d.idServico) ?? null
  const petAtual = d.pets.find(p => p.id_pet === d.idPet) ?? null
  const mudaServico = idServico !== d.idServico
  const mudaPet = !!idPet && idPet !== d.idPet
  const precoNovo = preco?.chave === chavePreco ? preco.valor : undefined
  const beneficio = modo === 'loja' && planos?.chave === chavePlano
    ? planos.lista
        .flatMap(p => p.beneficios.map(b => ({ ...b, plano: p.plano })))
        .find(b => b.id_servico === idServico && Number(b.usados) < b.quantidade) ?? null
    : null
  const vaiUsarBeneficio = !!beneficio && usarBeneficio

  async function salvar() {
    setErro(null)
    setEnviando(true)
    const r = await editarAgendamento(id, {
      idServico: mudaServico ? idServico : null,
      idPet: mudaPet ? idPet : null,
      usarBeneficio: vaiUsarBeneficio,
    })
    if (r.erro) {
      setEnviando(false)
      setErro(r.erro)
      return
    }
    // Loja: mensagem pronta pro cliente, com os dados já alterados.
    let whatsapp: string | null = null
    if (modo === 'loja') {
      const [novo, loja] = await Promise.all([carregarAgendamento(id), nomeDaLoja(d.idLojista)])
      whatsapp = novo.dados ? whatsappAlterado(novo.dados, loja) : null
    }
    setEnviando(false)
    setFeito({
      anterior: r.valorAnterior ?? 0,
      novo: r.valorNovo ?? 0,
      avisos: modo === 'loja' ? r.avisos ?? [] : [],
      whatsapp,
    })
  }

  if (feito) {
    return (
      <ScreenContainer>
        <DetailHeader title="Alterar agendamento" junto />
        <View style={styles.corpo}>
          <Aviso
            tipo="sucesso"
            texto={`Agendamento alterado. Valor: ${formatarMoeda(feito.anterior)} → ${formatarMoeda(feito.novo)}.${modo === 'cliente' ? ' A loja vê a mudança no seu pedido.' : ''}`}
          />
          {feito.avisos.map((av, i) => <Aviso key={i} tipo="info" texto={av} />)}
        </View>
        <View style={styles.rodape}>
          {feito.whatsapp && (
            <BotaoPequeno normal icone={IconWhatsapp} rotulo="Avisar o cliente no WhatsApp" onPress={() => Linking.openURL(feito.whatsapp!)} />
          )}
          <BotaoPequeno normal variante="primario" rotulo="Fechar" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    )
  }

  const servico = d.servicos.find(s => s.id_servico === idServico) ?? null
  const petNovo = d.pets.find(p => p.id_pet === idPet) ?? null

  return (
    <ScreenContainer>
      <DetailHeader title="Alterar agendamento" junto />

      <View style={styles.corpo}>
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Text style={styles.apoio}>
          {dataBR(d.dt)} às {d.hr} · {servicoAtual?.nome ?? 'Serviço'} · {petAtual?.nome ?? 'Pet'} · {formatarMoeda(d.valor)}
        </Text>

        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Serviço</Text>
          <Seletor
            titulo="Serviço"
            valor={idServico}
            desativado={enviando}
            opcoes={d.servicos.map(s => ({ valor: s.id_servico, rotulo: `${s.nome} · ${s.duracao} min` }))}
            onChange={setIdServico}
          />
          {mudaServico && servico && servicoAtual && servico.duracao !== servicoAtual.duracao && (
            <Text style={styles.dica}>{servico.duracao} min — vai das {d.hr} às {horaMais(d.hr, servico.duracao)}.</Text>
          )}
        </View>

        {d.pets.length > 0 && (
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Pet</Text>
            <Seletor
              titulo="Pet"
              valor={idPet}
              desativado={enviando}
              opcoes={d.pets.map(p => ({ valor: p.id_pet, rotulo: `${p.nome}${p.raca ? ` · ${p.raca}` : ''}` }))}
              onChange={setIdPet}
            />
            {mudaPet && d.noPedido > 1 && (
              <Text style={styles.dica}>Os {d.noPedido} serviços marcados juntos passam para {petNovo?.nome ?? 'o novo pet'}.</Text>
            )}
          </View>
        )}

        {(mudaServico || mudaPet) && (
          <Text style={styles.texto}>
            Preço do serviço{petNovo ? ` para ${petNovo.nome}` : ''}:{' '}
            <Text style={styles.forte}>{precoNovo === undefined ? '...' : precoNovo === null ? '—' : formatarMoeda(precoNovo)}</Text>
            <Text style={styles.dica}> (TaxiDog e produtos continuam no agendamento)</Text>
          </Text>
        )}

        {(mudaServico || mudaPet) && beneficio && (
          <Pressable
            onPress={() => setUsarBeneficio(v => !v)}
            disabled={enviando}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: usarBeneficio }}
            style={styles.marcar}
          >
            <View style={[styles.caixinha, usarBeneficio && styles.caixinhaMarcada]}>
              {usarBeneficio && <IconCheck size={11} color={colors.white} />}
            </View>
            <Text style={styles.texto}>
              Usar o plano {beneficio.plano} ({beneficio.quantidade - Number(beneficio.usados)} de {beneficio.quantidade} restantes) — o serviço não é cobrado
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.rodape}>
        <BotaoPequeno normal variante="primario" rotulo={enviando ? 'Salvando...' : 'Salvar alteração'} desativado={enviando || (!mudaServico && !mudaPet)} onPress={salvar} />
        <BotaoPequeno normal variante="fantasma" rotulo="Cancelar" desativado={enviando} onPress={() => router.back()} />
      </View>
    </ScreenContainer>
  )
}

// Medidas da janela "Alterar agendamento" do site em 375 de largura.
const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  corpo: { gap: 12 },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  apoio: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  dica: { fontSize: 12, lineHeight: 16, fontWeight: '400', color: '#858d99' },
  texto: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  forte: { fontWeight: '700' },
  marcar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caixinha: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixinhaMarcada: { backgroundColor: colors.primary500, borderColor: colors.primary500 },
  rodape: { gap: 8, marginTop: spacing.xl },
})
