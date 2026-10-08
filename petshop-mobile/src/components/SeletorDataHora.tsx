import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconChevronLeft, IconChevronRight } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { hojeBrasilISO } from '@/lib/agenda'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

export interface SlotHorario { hr_slot: string; disponivel: boolean }

// Dia inteiro fechado (feriado, folga — migration 066).
interface Fechamento { dt_inicio: string; dt_fim: string; hr_inicio: string | null; motivo: string }

const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const dois = (n: number) => String(n).padStart(2, '0')
const iso = (ano: number, mes: number, dia: number) => `${ano}-${dois(mes + 1)}-${dois(dia)}`
// Meio-dia local: sem surpresa de fuso ao ler o dia da semana.
const dataDe = (texto: string) => new Date(`${texto}T12:00:00`)

// Dias em que a loja abre e os fechamentos, pra apagar no calendário o que
// não dá para escolher. Enquanto não carrega (ou se a consulta falhar),
// nenhum dia fica apagado por isso — o banco recusa do mesmo jeito.
function useCalendarioDaLoja(idLojista: string | null) {
  const [carregado, setCarregado] = useState<{ idLojista: string; abertos: Set<string> | null; fechamentos: Fechamento[] } | null>(null)

  useEffect(() => {
    if (!idLojista) return
    let cancelado = false
    const hoje = hojeBrasilISO()
    Promise.all([
      supabase.from('horario').select('dia_semana, ativo').eq('id_lojista', idLojista),
      supabase.rpc('fn_bloqueios_loja', { p_id_lojista: idLojista, p_de: hoje, p_ate: `${Number(hoje.slice(0, 4)) + 1}-12-31` }),
    ]).then(([horarios, bloqueios]) => {
      if (cancelado) return
      const linhas = (horarios.data ?? []) as { dia_semana: string; ativo: boolean }[]
      setCarregado({
        idLojista,
        abertos: horarios.error || linhas.length === 0 ? null : new Set(linhas.filter(h => h.ativo).map(h => h.dia_semana)),
        fechamentos: Array.isArray(bloqueios.data) ? (bloqueios.data as Fechamento[]) : [],
      })
    })
    return () => { cancelado = true }
  }, [idLojista])

  return carregado?.idLojista === idLojista ? carregado : null
}

interface Props {
  idLojista: string | null
  // 'AAAA-MM-DD'
  data: string
  onData: (iso: string) => void
  // 'HH:MM'
  hora: string
  onHora: (hora: string) => void
  // Horários do dia escolhido (ocupados vêm com disponivel=false). null = carregando.
  slots: SlotHorario[] | null
  // No lugar da lista: dia fechado, erro, dia sem horário.
  aviso?: string
  dataMin: string
  desativado?: boolean
  // Começo da frase do rodapé: "Agendamento para…", "Remarcar para…".
  rotulo?: string
  // Tela "Novo agendamento": cinco horários por linha e sem o rodapé (o
  // que foi escolhido aparece no resumo), pra caber sem rolar.
  enxuto?: boolean
}

// Data e horário num bloco só — o `SeletorDataHora` do site
// (petshop-app/src/components/SeletorDataHora.tsx) no celular: o mês em
// grade, os horários do dia embaixo e, no rodapé, o que ficou escolhido.
// Mesmas medidas: células de 36 de altura, horários em 4 colunas.
export function SeletorDataHora({ idLojista, data, onData, hora, onHora, slots, aviso, dataMin, desativado, rotulo = 'Agendamento para', enxuto }: Props) {
  const calendario = useCalendarioDaLoja(idLojista)
  const hoje = hojeBrasilISO()
  const base = dataDe(data || dataMin || hoje)
  const [mes, setMes] = useState({ ano: base.getFullYear(), mes: base.getMonth() })

  const primeiroDia = new Date(mes.ano, mes.mes, 1, 12)
  const diasNoMes = new Date(mes.ano, mes.mes + 1, 0, 12).getDate()
  // Células vazias até o dia da semana do dia 1 (a semana começa no domingo).
  const celulas: (number | null)[] = [...Array<null>(primeiroDia.getDay()).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)]
  while (celulas.length % 7 !== 0) celulas.push(null)

  const anterior = mes.mes === 0 ? { ano: mes.ano - 1, mes: 11 } : { ano: mes.ano, mes: mes.mes - 1 }
  const proximo = mes.mes === 11 ? { ano: mes.ano + 1, mes: 0 } : { ano: mes.ano, mes: mes.mes + 1 }
  // Dá para voltar enquanto o mês anterior ainda tiver algum dia permitido.
  const podeVoltar = iso(anterior.ano, anterior.mes, new Date(anterior.ano, anterior.mes + 1, 0, 12).getDate()) >= dataMin

  const escolhido = data ? dataDe(data) : null
  const quando = escolhido ? `${DIAS_LONGOS[escolhido.getDay()]}, ${escolhido.getDate()} de ${MESES[escolhido.getMonth()]}` : null

  return (
    <View style={[styles.caixa, enxuto && styles.caixaEnxuta]}>
      <View style={[styles.calendario, enxuto && styles.calendarioEnxuto]}>
        <View style={styles.cabecalho}>
          <Pressable
            onPress={() => setMes(anterior)}
            disabled={!podeVoltar || desativado}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            style={[styles.nav, !podeVoltar && styles.navApagada]}
          >
            <IconChevronLeft size={14} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.mes}>{MESES[mes.mes][0].toUpperCase() + MESES[mes.mes].slice(1)} de {mes.ano}</Text>
          <Pressable onPress={() => setMes(proximo)} disabled={desativado} hitSlop={8} accessibilityRole="button" accessibilityLabel="Próximo mês" style={styles.nav}>
            <IconChevronRight size={14} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.semana}>
          {DIAS_CURTOS.map(d => <Text key={d} style={styles.diaDaSemana}>{d}</Text>)}
        </View>

        <View style={styles.dias}>
          {celulas.map((dia, i) => {
            if (dia === null) return <View key={`v${i}`} style={[styles.celula, enxuto && styles.celulaEnxuta]} />
            const texto = iso(mes.ano, mes.mes, dia)
            const diaSemana = new Date(mes.ano, mes.mes, dia, 12).getDay()
            const fechado = calendario?.fechamentos.find(b => b.dt_inicio <= texto && texto <= b.dt_fim && !b.hr_inicio) ?? null
            const semExpediente = !!calendario?.abertos && !calendario.abertos.has(NOMES_DIA[diaSemana])
            const foraDoLimite = texto < dataMin
            const parado = !!desativado || foraDoLimite || semExpediente || !!fechado
            const selecionado = texto === data
            return (
              <View key={texto} style={[styles.celula, enxuto && styles.celulaEnxuta]}>
              <Pressable
                onPress={() => onData(texto)}
                disabled={parado}
                accessibilityRole="button"
                accessibilityState={{ selected: selecionado, disabled: parado }}
                accessibilityLabel={`${dia} de ${MESES[mes.mes]}${fechado ? `, fechado: ${fechado.motivo}` : semExpediente ? ', a loja não abre neste dia' : ''}`}
                style={[styles.dia, selecionado && styles.diaSelecionado]}
              >
                <Text
                  style={[
                    styles.diaTexto,
                    texto === hoje && styles.diaHoje,
                    parado && styles.diaApagado,
                    fechado && !foraDoLimite && styles.riscado,
                    selecionado && styles.diaTextoSelecionado,
                  ]}
                >
                  {dia}
                </Text>
              </Pressable>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.horarios}>
        {!data ? (
          <Text style={styles.vazio}>Escolha um dia para ver os horários.</Text>
        ) : slots === null ? (
          <Text style={styles.vazio}>Carregando horários...</Text>
        ) : aviso ? (
          <Text style={[styles.vazio, styles.avisoTexto]}>{aviso}</Text>
        ) : (
          <View style={styles.grade}>
            {slots.map(s => {
              const h = s.hr_slot.slice(0, 5)
              const selecionado = hora === h
              const ocupado = !s.disponivel
              return (
                <View key={s.hr_slot} style={[styles.slotCaixa, enxuto && styles.slotCaixaEnxuta]}>
                <Pressable
                  onPress={() => onHora(h)}
                  disabled={ocupado || desativado}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selecionado, disabled: ocupado }}
                  accessibilityLabel={ocupado ? `${h}, horário ocupado` : h}
                  style={[styles.slot, enxuto && styles.slotEnxuto, selecionado && styles.slotSelecionado, ocupado && !selecionado && styles.slotOcupado]}
                >
                  <Text style={[styles.slotTexto, selecionado && styles.slotTextoSelecionado, ocupado && !selecionado && styles.slotTextoOcupado]}>{h}</Text>
                </Pressable>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {!enxuto && <View style={styles.rodape}>
        {quando && hora ? (
          <Text style={styles.rodapeTexto}>{rotulo} <Text style={styles.forte}>{quando}</Text> às <Text style={styles.forte}>{hora}</Text>.</Text>
        ) : quando ? (
          <Text style={styles.rodapeTexto}>Dia <Text style={styles.forte}>{quando}</Text> — escolha o horário.</Text>
        ) : (
          <Text style={styles.rodapeTexto}>Escolha o dia e o horário.</Text>
        )}
      </View>}
    </View>
  )
}

const styles = StyleSheet.create({
  caixa: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  calendario: { padding: 16 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 28, marginBottom: 12 },
  nav: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  navApagada: { opacity: 0.35 },
  mes: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text },
  semana: { flexDirection: 'row' },
  diaDaSemana: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 19.2, fontWeight: '500', color: '#858d99', paddingBottom: 8 },
  dias: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  // Sete por linha; a conta em % evita arredondamento empurrar o sétimo para baixo.
  celula: { width: `${100 / 7}%`, height: 36 },
  dia: { flex: 1, marginHorizontal: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  diaSelecionado: { backgroundColor: colors.primary600 },
  diaTexto: { fontSize: 14, lineHeight: 22.4, color: colors.text },
  diaHoje: { fontWeight: '700', color: colors.primary600 },
  diaApagado: { color: colors.textFaint, fontWeight: '400' },
  riscado: { textDecorationLine: 'line-through' },
  diaTextoSelecionado: { color: colors.white, fontWeight: '600' },
  horarios: { borderTopWidth: 1, borderTopColor: colors.border, padding: 12 },
  // Quatro por linha com 6 de vão: cada caixa tem 25% e 3 de respiro em
  // volta, e a grade devolve os 3 das bordas.
  grade: { flexDirection: 'row', flexWrap: 'wrap', margin: -3 },
  slotCaixa: { width: '25%', padding: 3 },
  slot: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  slotSelecionado: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  slotOcupado: { backgroundColor: colors.surfaceMuted },
  slotTexto: { fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text },
  slotTextoSelecionado: { color: colors.white },
  slotTextoOcupado: { color: colors.textFaint, textDecorationLine: 'line-through' },
  vazio: { fontSize: 14, lineHeight: 22.4, color: '#858d99', textAlign: 'center', paddingVertical: 8 },
  avisoTexto: { color: colors.warningFg },
  rodape: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  rodapeTexto: { fontSize: 14, lineHeight: 22.4, color: colors.textDim },
  forte: { fontWeight: '700', color: colors.text },
  // `enxuto`: as medidas do seletor dentro da janela "Novo agendamento" do site.
  caixaEnxuta: { borderRadius: 12 },
  calendarioEnxuto: { padding: 12 },
  celulaEnxuta: { height: 38 },
  slotCaixaEnxuta: { width: '20%' },
  slotEnxuto: { height: 38 },
})
