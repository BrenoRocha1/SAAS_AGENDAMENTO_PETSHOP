import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { SeletorDia } from '@/components/SeletorDia'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataBR, dataExtensaISO, hojeBrasilISO } from '@/lib/agenda'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { urlDoSite } from '@/lib/site'
import { colors, spacing, typography } from '@/theme/theme'

interface Horario {
  id_horario: string
  dia_semana: string
  hr_inicio: string
  hr_fim: string
  ativo: boolean
}

// fn_bloqueios_da_loja (migration 066)
interface Bloqueio {
  id_bloqueio: string
  dt_inicio: string
  dt_fim: string
  hr_inicio: string | null
  hr_fim: string | null
  motivo: string
  agendamentos: { id_agendamento: string }[]
}

const ORDEM_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

function periodoDoBloqueio(b: Bloqueio): string {
  const dias = b.dt_inicio === b.dt_fim ? dataBR(b.dt_inicio) : `${dataBR(b.dt_inicio)} a ${dataBR(b.dt_fim)}`
  return b.hr_inicio && b.hr_fim ? `${dias}, das ${b.hr_inicio} às ${b.hr_fim}` : `${dias} — dia inteiro`
}

// O que a loja mais mexe no dia a dia, pelo celular: ligar/desligar o
// agendamento online, os dias da semana em que abre e os dias fechados
// (feriado, folga). O resto (pagamentos, TaxiDog, link, sons, janela de
// antecedência) continua no painel web.
export default function ConfiguracoesScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  // A RLS só deixa o dono da conta gravar em `lojista` e `horario` (o
  // administrador grava pelo painel web). Fechar dias vai por função do
  // banco, que aceita os dois.
  const ehDono = contexto?.role === 'lojista'
  const hoje = hojeBrasilISO()

  const [online, setOnline] = useState<boolean | null>(null)
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Painel "fechar um dia".
  const [painel, setPainel] = useState(false)
  const [dtInicio, setDtInicio] = useState(hoje)
  const [dtFim, setDtFim] = useState(hoje)
  const [variosDias, setVariosDias] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const [loja, hrs, blq] = await Promise.all([
      supabase.from('lojista').select('aceita_agendamento_online').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('horario').select('id_horario, dia_semana, hr_inicio, hr_fim, ativo').eq('id_lojista', idLojista),
      supabase.rpc('fn_bloqueios_da_loja', { p_id_lojista: idLojista }),
    ])
    // Sem a migration 020 a coluna não existe: o interruptor some.
    setOnline(loja.error ? null : ((loja.data as { aceita_agendamento_online: boolean } | null)?.aceita_agendamento_online ?? null))
    setHorarios(
      ((hrs.data ?? []) as Horario[]).sort((a, b) => ORDEM_DIAS.indexOf(a.dia_semana) - ORDEM_DIAS.indexOf(b.dia_semana)),
    )
    // Sem a migration 066: a seção avisa.
    setBloqueios(blq.error ? null : ((blq.data ?? []) as Bloqueio[]))
    setErro(hrs.error ? 'Não foi possível carregar os horários.' : null)
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Configurações" />
        <SemPermissao area="mudar as configurações da loja" />
      </ScreenContainer>
    )
  }

  async function alternarOnline(ativo: boolean) {
    if (!idLojista) return
    setErro(null)
    setOcupado('online')
    const { data, error } = await supabase
      .from('lojista')
      .update({ aceita_agendamento_online: ativo })
      .eq('id_lojista', idLojista)
      .select('id_lojista')
    setOcupado(null)
    if (error || !data || data.length === 0) {
      setErro('Não foi possível mudar o agendamento online.')
      return
    }
    setOnline(ativo)
  }

  async function alternarHorario(h: Horario, ativo: boolean) {
    if (!idLojista) return
    setErro(null)
    setOcupado(h.id_horario)
    const { data, error } = await supabase
      .from('horario')
      .update({ ativo })
      .eq('id_horario', h.id_horario)
      .eq('id_lojista', idLojista)
      .select('id_horario')
    setOcupado(null)
    if (error || !data || data.length === 0) {
      setErro('Não foi possível mudar esse dia.')
      return
    }
    setHorarios(lista => lista.map(x => (x.id_horario === h.id_horario ? { ...x, ativo } : x)))
  }

  function abrirPainel() {
    setDtInicio(hoje)
    setDtFim(hoje)
    setVariosDias(false)
    setMotivo('')
    setErroPainel(null)
    setPainel(true)
  }

  async function fecharPeriodo() {
    if (!idLojista) return
    const texto = motivo.trim()
    if (!texto) {
      setErroPainel('Informe o motivo (ex.: Feriado de Natal).')
      return
    }
    const fim = variosDias ? dtFim : dtInicio
    if (fim < dtInicio) {
      setErroPainel('A data final vem antes da inicial.')
      return
    }
    setErroPainel(null)
    setSalvando(true)
    const { error } = await supabase.rpc('fn_salvar_bloqueio', {
      p_id_lojista: idLojista,
      p_dt_inicio: dtInicio,
      p_dt_fim: fim,
      p_hr_inicio: null,
      p_hr_fim: null,
      p_motivo: texto,
    })
    setSalvando(false)
    if (error) {
      setErroPainel(faltaMigration(error) ? 'Fechar dias ainda não foi ativado no sistema da loja.' : mensagemDoBanco(error, 'Não foi possível fechar esse período.'))
      return
    }
    setPainel(false)
    carregar()
  }

  function pedirReabrir(b: Bloqueio) {
    Alert.alert('Reabrir', `${periodoDoBloqueio(b)} (${b.motivo}) volta a aceitar agendamentos. Continuar?`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Reabrir',
        onPress: async () => {
          setErro(null)
          setOcupado(b.id_bloqueio)
          const { error } = await supabase.rpc('fn_excluir_bloqueio', { p_id_bloqueio: b.id_bloqueio })
          setOcupado(null)
          if (error) setErro(mensagemDoBanco(error, 'Não foi possível reabrir esse período.'))
          else carregar()
        },
      },
    ])
  }

  const painelWeb = urlDoSite('/lojista/configuracoes')

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Configurações" />

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}
      {!ehDono && (
        <Aviso
          tipo="info"
          style={{ marginBottom: spacing.md }}
          texto="Pelo app, só o responsável pela conta muda o agendamento online e os dias da semana. Fechar dias você também pode."
        />
      )}

      {online !== null && (
        <Card style={styles.linhaSwitch}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.titulo}>Agendamento online</Text>
            <Text style={styles.sub}>
              {online ? 'Clientes podem agendar pelo site.' : 'Desligado — só a loja cria agendamentos.'}
            </Text>
          </View>
          <Switch
            value={online}
            disabled={!ehDono || ocupado === 'online'}
            onValueChange={alternarOnline}
            trackColor={{ true: colors.primary500, false: colors.borderStrong }}
            thumbColor={colors.white}
            accessibilityLabel="Agendamento online"
          />
        </Card>
      )}

      <Text style={styles.secao}>Dias de funcionamento</Text>
      {horarios.length === 0 && !loading ? (
        <Aviso tipo="alerta" texto="Nenhum horário de funcionamento cadastrado — configure em Horários no painel web." />
      ) : (
        <Card style={{ gap: spacing.md }}>
          {horarios.map(h => (
            <View key={h.id_horario} style={styles.linhaSwitch}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.titulo, !h.ativo && styles.apagado]}>{h.dia_semana}</Text>
                <Text style={styles.sub}>{h.ativo ? `${h.hr_inicio.slice(0, 5)} às ${h.hr_fim.slice(0, 5)}` : 'Fechado'}</Text>
              </View>
              <Switch
                value={h.ativo}
                disabled={!ehDono || ocupado === h.id_horario}
                onValueChange={v => alternarHorario(h, v)}
                trackColor={{ true: colors.primary500, false: colors.borderStrong }}
                thumbColor={colors.white}
                accessibilityLabel={`${h.dia_semana} aberto`}
              />
            </View>
          ))}
          <Text style={styles.sub}>Para mudar os horários de abrir e fechar, use Horários no painel web.</Text>
        </Card>
      )}

      <Text style={styles.secao}>Dias fechados</Text>
      {bloqueios === null ? (
        <Aviso tipo="alerta" texto="Fechar dias (feriado, folga) ainda não foi ativado no sistema da loja." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {bloqueios.length === 0 && <Text style={styles.sub}>Nenhum dia fechado daqui pra frente.</Text>}
          {bloqueios.map(b => (
            <Card key={b.id_bloqueio} style={styles.linhaSwitch}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.titulo}>{b.motivo}</Text>
                <Text style={styles.sub}>{periodoDoBloqueio(b)}</Text>
                {b.agendamentos.length > 0 && (
                  <Text style={styles.alerta}>
                    {b.agendamentos.length} {b.agendamentos.length === 1 ? 'agendamento marcado' : 'agendamentos marcados'} nesse período — remarque ou cancele.
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => pedirReabrir(b)}
                disabled={ocupado === b.id_bloqueio}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Reabrir ${b.motivo}`}
                style={styles.lixeira}
              >
                <Ionicons name="trash-outline" size={20} color={colors.dangerFg} />
              </Pressable>
            </Card>
          ))}
          <Botao rotulo="Fechar um dia" icone="add" variante="secundario" onPress={abrirPainel} />
        </View>
      )}

      <Aviso
        tipo="info"
        style={{ marginTop: spacing.xl }}
        texto="Formas de pagamento, TaxiDog, link de agendamento, antecedência e sons ficam no painel web."
      />
      {painelWeb && (
        <Botao rotulo="Abrir o painel web" icone="open-outline" variante="secundario" style={{ marginTop: spacing.md }} onPress={() => Linking.openURL(painelWeb)} />
      )}

      <Folha visivel={painel} titulo="Fechar um dia" onFechar={() => setPainel(false)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Ex.: Feriado de Natal" maxLength={80} />

        <Text style={styles.rotulo}>{variosDias ? 'Primeiro dia fechado' : 'Dia fechado'}</Text>
        <SeletorDia
          inicio={hoje}
          dias={180}
          valor={dtInicio}
          onChange={d => { setDtInicio(d); if (dtFim < d) setDtFim(d) }}
        />
        <Text style={styles.sub}>{dataExtensaISO(dtInicio)}</Text>

        <View style={styles.linhaSwitch}>
          <Text style={[styles.titulo, { flex: 1 }]}>Fechar vários dias seguidos</Text>
          <Switch
            value={variosDias}
            onValueChange={v => { setVariosDias(v); if (v && dtFim < dtInicio) setDtFim(dtInicio) }}
            trackColor={{ true: colors.primary500, false: colors.borderStrong }}
            thumbColor={colors.white}
          />
        </View>
        {variosDias && (
          <>
            <Text style={styles.rotulo}>Último dia fechado</Text>
            <SeletorDia inicio={dtInicio} dias={90} valor={dtFim < dtInicio ? dtInicio : dtFim} onChange={setDtFim} />
            <Text style={styles.sub}>{dataExtensaISO(dtFim < dtInicio ? dtInicio : dtFim)}</Text>
          </>
        )}

        <Text style={styles.sub}>
          O dia inteiro fica sem horário para agendar. Para fechar só algumas horas, use Horários no painel web.
        </Text>
        <Botao rotulo="Fechar" onPress={fecharPeriodo} carregando={salvando} />
      </Folha>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titulo: { ...typography.body.lg, fontWeight: '600', color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  rotulo: { ...typography.label.md, color: colors.textDim },
  alerta: { ...typography.body.sm, color: colors.warningFg, marginTop: 2 },
  lixeira: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
