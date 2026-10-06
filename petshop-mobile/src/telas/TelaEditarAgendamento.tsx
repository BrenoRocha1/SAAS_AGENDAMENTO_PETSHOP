import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Opcao } from '@/components/Opcao'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { supabase } from '@/lib/supabase'
import { dataBR } from '@/lib/agenda'
import { carregarAgendamento, editarAgendamento, whatsappAlterado } from '@/lib/agendamentos'
import { formatarMoeda } from '@/lib/format'
import { nomeDaLoja } from '@/lib/loja'
import { colors, spacing, typography } from '@/theme/theme'

interface Dados {
  idLojista: string
  idPet: string | null
  idServico: string
  dt: string
  hr: string
  valor: number
  servicos: { id_servico: string; nome: string; duracao: number }[]
  pets: { id_pet: string; nome: string; raca: string | null }[]
}

// fn_beneficios_do_pet (migration 060)
interface PlanoDoPet {
  plano: string
  beneficios: { id_servico: string; quantidade: number; usados: number }[]
}

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
        .select('id_lojista, id_cliente, id_pet, id_servico, dt_agendamento, hr_agendamento, valor')
        .eq('id_agendamento', id)
        .maybeSingle()
      if (!ag) {
        if (!cancelado) setErroCarga('Agendamento não encontrado.')
        return
      }
      const [{ data: servicos }, { data: pets }] = await Promise.all([
        supabase.from('servico').select('id_servico, nome, duracao').eq('id_lojista', ag.id_lojista).eq('status', 'Ativo').order('nome'),
        ag.id_cliente
          ? supabase.from('pet').select('id_pet, nome, raca').eq('id_cliente', ag.id_cliente).eq('ativo', true).order('nome')
          : Promise.resolve({ data: [] }),
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
        <DetailHeader title="Alterar agendamento" />
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
        <DetailHeader title="Alterar agendamento" />
        <View style={{ gap: spacing.md }}>
          <Aviso
            tipo="sucesso"
            texto={`Agendamento alterado. Valor: ${formatarMoeda(feito.anterior)} → ${formatarMoeda(feito.novo)}.${modo === 'cliente' ? ' A loja vê a mudança no seu pedido.' : ''}`}
          />
          {feito.avisos.map((av, i) => <Aviso key={i} tipo="info" texto={av} />)}
          {feito.whatsapp && (
            <Botao
              rotulo="Avisar o cliente no WhatsApp"
              icone="logo-whatsapp"
              variante="secundario"
              onPress={() => Linking.openURL(feito.whatsapp!)}
            />
          )}
          <Botao rotulo="Concluir" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Alterar agendamento" />

      <Card style={styles.resumo}>
        <Text style={styles.resumoTitulo}>{petAtual?.nome ?? 'Pet'} — {servicoAtual?.nome ?? 'Serviço'}</Text>
        <Text style={styles.resumoTexto}>{dataBR(d.dt)} às {d.hr} · {formatarMoeda(d.valor)}</Text>
        <Text style={styles.resumoTexto}>A data e o horário não mudam aqui — para isso, use Remarcar.</Text>
      </Card>

      <Text style={styles.secao}>Serviço</Text>
      <View style={{ gap: spacing.sm }}>
        {d.servicos.map(s => (
          <Opcao
            key={s.id_servico}
            titulo={s.nome}
            detalhe={`${s.duracao} min${s.id_servico === d.idServico ? ' · atual' : ''}`}
            selecionada={idServico === s.id_servico}
            onPress={() => setIdServico(s.id_servico)}
          />
        ))}
      </View>

      {d.pets.length > 1 && (
        <>
          <Text style={styles.secao}>Pet</Text>
          <View style={{ gap: spacing.sm }}>
            {d.pets.map(p => (
              <Opcao
                key={p.id_pet}
                titulo={p.nome}
                detalhe={`${p.raca ?? ''}${p.id_pet === d.idPet ? `${p.raca ? ' · ' : ''}atual` : ''}`}
                selecionada={idPet === p.id_pet}
                onPress={() => setIdPet(p.id_pet)}
              />
            ))}
          </View>
        </>
      )}

      <View style={styles.rodape}>
        {beneficio && (
          <Card style={styles.beneficio}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.beneficioTitulo}>Usar o plano {beneficio.plano}</Text>
              <Text style={styles.resumoTexto}>
                {beneficio.quantidade - Number(beneficio.usados)} de {beneficio.quantidade} usos disponíveis — o serviço sai sem cobrança.
              </Text>
            </View>
            <Interruptor
              value={usarBeneficio}
              onValueChange={setUsarBeneficio}
            />
          </Card>
        )}

        {(mudaServico || mudaPet) && (
          <Aviso
            tipo="info"
            texto={
              vaiUsarBeneficio
                ? 'Serviço coberto pelo plano — o valor do serviço fica R$ 0,00.'
                : precoNovo === undefined
                  ? 'Calculando o novo valor do serviço…'
                  : precoNovo === null
                    ? 'O novo valor aparece depois de salvar.'
                    : `Novo valor do serviço: ${formatarMoeda(precoNovo)} (produtos e TaxiDog, se houver, continuam somados).`
            }
          />
        )}
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Botao rotulo="Salvar alteração" icone="checkmark" onPress={salvar} carregando={enviando} desativado={!mudaServico && !mudaPet} />
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resumo: { gap: 4 },
  resumoTitulo: { ...typography.heading.sm, color: colors.text },
  resumoTexto: { ...typography.body.md, color: colors.textMuted },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  rodape: { marginTop: spacing.xl, gap: spacing.md },
  beneficio: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  beneficioTitulo: { ...typography.body.lg, fontWeight: '600', color: colors.text },
})
