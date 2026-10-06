import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { DetailHeader } from '@/components/DetailHeader'
import { Folha } from '@/components/Folha'
import { IconCalendar, IconCheck, IconCircle, IconLock, IconPencil, IconPlus, IconTrash, type IconeProps } from '@/components/IconesDoSite'
import { Interruptor } from '@/components/Interruptor'
import { ScreenContainer } from '@/components/ScreenContainer'
import { SemPermissao } from '@/components/SemPermissao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import { descreverBloqueio, proximosFeriados, type BloqueioLoja } from '@/lib/bloqueios'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { dataParaISO, horaValida, isoParaData, mascaraData, mascaraHora } from '@/lib/mascaras'
import { rotuloStatus } from '@/lib/statusAgendamento'
import { supabase } from '@/lib/supabase'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const

interface Horario {
  id_horario: string
  dia_semana: string
  hr_inicio: string
  hr_fim: string
  ativo: boolean
}

// fn_bloqueios_da_loja (migration 066): o período e quem ainda está marcado nele.
interface Bloqueio extends BloqueioLoja {
  agendamentos: {
    id_agendamento: string
    dt: string
    hr: string
    status: string
    pet: string | null
    cliente: string | null
    servico: string
  }[]
}

// Configurações → Horários de funcionamento, igual à página do site: os
// sete dias da semana (com "Configurar vários dias") e os dias fechados
// (feriados e folgas). Gravar horário passa pelas actions do painel; o
// liga/desliga do dia, sem o site configurado, só o dono muda (RLS).
export function TelaHorarios() {
  const router = useRouter()
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const comSite = acoesDisponiveis()
  const podeGravar = comSite || contexto?.role === 'lojista'
  const hoje = hojeBrasilISO()

  const [horarios, setHorarios] = useState<Horario[]>([])
  // null = a migration dos dias fechados ainda não rodou.
  const [bloqueios, setBloqueios] = useState<Bloqueio[] | null>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  // Horários
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, avisar] = useAvisoTemporario()
  const [editDia, setEditDia] = useState<string | null>(null)
  const [abre, setAbre] = useState('')
  const [fecha, setFecha] = useState('')
  // Vários dias de uma vez (ex.: Segunda a Sexta das 09h às 22h).
  const [loteAberto, setLoteAberto] = useState(false)
  const [diasLote, setDiasLote] = useState<string[]>([])
  const [loteInicio, setLoteInicio] = useState('09:00')
  const [loteFim, setLoteFim] = useState('18:00')
  const [loteErro, setLoteErro] = useState<string | null>(null)

  // Dias fechados
  const [erroBloqueio, setErroBloqueio] = useState<string | null>(null)
  const [sucessoBloqueio, avisarBloqueio] = useAvisoTemporario()
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [verFeriados, setVerFeriados] = useState(false)
  const [formAberto, setFormAberto] = useState(false)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [diaInteiro, setDiaInteiro] = useState(true)
  const [das, setDas] = useState('')
  const [as, setAs] = useState('')
  const [motivo, setMotivo] = useState('')
  const [formErro, setFormErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const [hrs, blq] = await Promise.all([
      // Só os da loja: a policy deixa qualquer um ver horários ativos de todas.
      supabase.from('horario').select('id_horario, dia_semana, hr_inicio, hr_fim, ativo').eq('id_lojista', idLojista),
      supabase.rpc('fn_bloqueios_da_loja', { p_id_lojista: idLojista }),
    ])
    if (hrs.error) setErro('Não foi possível carregar os horários.')
    else setHorarios((hrs.data ?? []) as Horario[])
    setBloqueios(blq.error ? null : ((blq.data ?? []) as Bloqueio[]))
    setCarregando(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  // Feriado já fechado = existe bloqueio de dia inteiro cobrindo a data.
  const feriados = useMemo(() => proximosFeriados(hoje).filter(f =>
    !(bloqueios ?? []).some(b => !b.hr_inicio && b.dt_inicio <= f.data && f.data <= b.dt_fim)
  ), [bloqueios, hoje])

  if (!pode || !idLojista) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Horários de funcionamento" />
        <SemPermissao area="mudar as configurações da loja" />
      </ScreenContainer>
    )
  }

  // ── Horários ──
  function abrirEdicao(dia: string, h?: Horario) {
    if (editDia === dia) return setEditDia(null)
    setAbre(h ? h.hr_inicio.slice(0, 5) : '')
    setFecha(h ? h.hr_fim.slice(0, 5) : '')
    setEditDia(dia)
  }

  async function salvarHorario(dia: string) {
    setErro(null)
    if (!horaValida(abre) || !horaValida(fecha)) return setErro('Informe o horário de abertura e fechamento.')
    setOcupado(true)
    const r = await chamarAcao('salvarHorarioAction', form({ dia_semana: dia, hr_inicio: abre, hr_fim: fecha }))
    setOcupado(false)
    if (r.error) return setErro(r.error)
    avisar('Horário salvo com sucesso!')
    setEditDia(null)
    carregar()
  }

  async function alternarHorario(h: Horario, ativo: boolean) {
    setErro(null)
    setOcupado(true)
    let falha: string | undefined
    if (comSite) {
      falha = (await chamarAcao('toggleHorarioAction', h.id_horario, ativo)).error
    } else {
      const { data, error } = await supabase.from('horario').update({ ativo }).eq('id_horario', h.id_horario).eq('id_lojista', idLojista).select('id_horario')
      if (error || !data || data.length === 0) falha = 'Não foi possível mudar esse dia.'
    }
    setOcupado(false)
    if (falha) return setErro(falha)
    // Só o "ativo" muda — os horários do dia continuam os mesmos.
    setHorarios(lista => lista.map(x => (x.id_horario === h.id_horario ? { ...x, ativo } : x)))
  }

  function abrirLote() {
    setLoteErro(null)
    setDiasLote([])
    setLoteInicio('09:00')
    setLoteFim('18:00')
    setLoteAberto(true)
  }

  async function salvarLote() {
    setLoteErro(null)
    if (diasLote.length === 0) return setLoteErro('Selecione pelo menos um dia da semana.')
    if (!horaValida(loteInicio) || !horaValida(loteFim)) return setLoteErro('Informe o horário de abertura e fechamento.')
    if (loteFim <= loteInicio) return setLoteErro('O horário de fechamento deve ser depois do de abertura.')
    setOcupado(true)
    const r = await chamarAcao('salvarHorariosEmLoteAction', form({ dias: DIAS.filter(d => diasLote.includes(d)), hr_inicio: loteInicio, hr_fim: loteFim }))
    setOcupado(false)
    if (r.error) return setLoteErro(r.error)
    setLoteAberto(false)
    avisar('Horários salvos com sucesso!')
    carregar()
  }

  // ── Dias fechados ──
  function abrirForm() {
    setDe(isoParaData(hoje))
    setAte('')
    setDiaInteiro(true)
    setDas('')
    setAs('')
    setMotivo('')
    setFormErro(null)
    setFormAberto(true)
  }

  async function fechar(dtInicio: string, dtFim: string, hrInicio: string | null, hrFim: string | null, texto: string): Promise<string | null> {
    const { error } = await supabase.rpc('fn_salvar_bloqueio', {
      p_id_lojista: idLojista,
      p_dt_inicio: dtInicio,
      p_dt_fim: dtFim,
      p_hr_inicio: hrInicio,
      p_hr_fim: hrFim,
      p_motivo: texto,
    })
    if (!error) return null
    return faltaMigration(error) ? 'Para fechar dias, execute a migration 066_bloqueio_datas.sql.' : mensagemDoBanco(error, 'Não foi possível fechar esse período.')
  }

  async function salvarBloqueio() {
    setFormErro(null)
    const texto = motivo.trim()
    if (!texto) return setFormErro('Informe o motivo (ex.: Feriado de Natal).')
    const inicio = dataParaISO(de)
    if (!inicio) return setFormErro('Escolha a data.')
    const fim = ate.trim() ? dataParaISO(ate) : inicio
    if (!fim) return setFormErro('Data final inválida.')
    if (fim < inicio) return setFormErro('A data final vem antes da inicial.')
    if (!diaInteiro) {
      if (!horaValida(das) || !horaValida(as)) return setFormErro('Informe o horário de início e de fim.')
      if (as <= das) return setFormErro('O horário final precisa ser depois do inicial.')
    }
    setOcupado(true)
    const falha = await fechar(inicio, fim, diaInteiro ? null : das, diaInteiro ? null : as, texto)
    setOcupado(false)
    if (falha) return setFormErro(falha)
    setFormAberto(false)
    avisarBloqueio('Período fechado. Os clientes já não conseguem marcar nesses horários.')
    carregar()
  }

  async function fecharFeriado(data: string, nome: string) {
    setErroBloqueio(null)
    setOcupado(true)
    const falha = await fechar(data, data, null, null, nome)
    setOcupado(false)
    if (falha) return setErroBloqueio(falha)
    avisarBloqueio(`${nome} (${dataBR(data)}) fechado.`)
    carregar()
  }

  async function reabrir(id: string) {
    setErroBloqueio(null)
    setConfirmandoId(null)
    setOcupado(true)
    const { error } = await supabase.rpc('fn_excluir_bloqueio', { p_id_bloqueio: id })
    setOcupado(false)
    if (error) return setErroBloqueio(mensagemDoBanco(error, 'Não foi possível reabrir esse período.'))
    avisarBloqueio('Período reaberto para agendamentos.')
    carregar()
  }

  return (
    <ScreenContainer refreshing={carregando} onRefresh={carregar}>
      <DetailHeader title="Horários de funcionamento" />

      {erro && <Aviso tipo="erro" texto={erro} style={styles.aviso} />}
      {sucesso && <Aviso tipo="sucesso" texto={sucesso} style={styles.aviso} />}

      <BotaoPequeno rotulo="Configurar vários dias" icone={IconPlus} desativado={!comSite} style={styles.varios} onPress={abrirLote} />

      <View style={styles.pilha}>
        {DIAS.map(dia => {
          const h = horarios.find(x => x.dia_semana === dia)
          const editando = editDia === dia
          return (
            <View key={dia} style={styles.cartao}>
              <View style={styles.linha}>
                <CaixaDoIcone icone={h?.ativo ? IconCheck : IconCircle} tom={h?.ativo ? 'ativo' : 'apagado'} />
                <View style={styles.textos}>
                  <Text style={styles.titulo}>{dia}</Text>
                  {h ? (
                    <View style={styles.subLinha}>
                      <Text style={styles.sub}>{h.hr_inicio.slice(0, 5)} — {h.hr_fim.slice(0, 5)}</Text>
                      {!h.ativo && (
                        <View style={styles.selo}><Text style={styles.seloTexto}>Desativado</Text></View>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.sub}>Não configurado</Text>
                  )}
                </View>
                <View style={styles.acoes}>
                  {h && (
                    <Interruptor
                      value={h.ativo}
                      disabled={!podeGravar || ocupado}
                      onValueChange={v => alternarHorario(h, v)}
                      accessibilityLabel={`${dia} aberto`}
                    />
                  )}
                  <BotaoPequeno
                    rotulo={editando ? 'Cancelar' : h ? 'Editar' : '+ Configurar'}
                    icone={!editando && h ? IconPencil : undefined}
                    desativado={!comSite}
                    onPress={() => abrirEdicao(dia, h)}
                  />
                </View>
              </View>

              {editando && (
                <View style={styles.edicao}>
                  <Campo rotulo="Abertura" obrigatorio value={abre} onChangeText={t => setAbre(mascaraHora(t))} keyboardType="number-pad" placeholder="--:--" maxLength={5} />
                  <Campo rotulo="Fechamento" obrigatorio value={fecha} onChangeText={t => setFecha(mascaraHora(t))} keyboardType="number-pad" placeholder="--:--" maxLength={5} />
                  <BotaoPequeno variante="primario" rotulo={ocupado ? 'Salvando...' : 'Salvar'} desativado={ocupado} style={styles.aDireita} onPress={() => salvarHorario(dia)} />
                </View>
              )}
            </View>
          )
        })}
      </View>

      {/* Dias fechados — feriados, folgas e horários em que a loja não atende */}
      <View style={styles.secao}>
        <Text style={styles.secaoTitulo}>Dias fechados</Text>
        <Text style={styles.secaoTexto}>Feriados, folgas ou horários em que a loja não atende. Ninguém consegue marcar nesses horários.</Text>
        <BotaoPequeno rotulo="Fechar um período" icone={IconPlus} desativado={bloqueios === null} style={styles.fecharPeriodo} onPress={abrirForm} />
      </View>

      {bloqueios === null && <Aviso tipo="info" texto="Para fechar dias, execute a migration 066_bloqueio_datas.sql." style={styles.aviso} />}
      {erroBloqueio && <Aviso tipo="erro" texto={erroBloqueio} style={styles.aviso} />}
      {sucessoBloqueio && <Aviso tipo="sucesso" texto={sucessoBloqueio} style={styles.aviso} />}

      {bloqueios !== null && (
        <View style={styles.pilha}>
          {bloqueios.length === 0 ? (
            <View style={styles.cartao}><Text style={styles.sub}>Nenhum dia fechado daqui para frente.</Text></View>
          ) : bloqueios.map(b => (
            <View key={b.id_bloqueio} style={styles.cartao}>
              <View style={styles.linha}>
                <CaixaDoIcone icone={IconLock} tom="alerta" />
                <View style={styles.textos}>
                  <Text style={styles.titulo}>{b.motivo}</Text>
                  <Text style={styles.sub}>{descreverBloqueio(b)}</Text>
                </View>
                {confirmandoId === b.id_bloqueio ? (
                  <View style={styles.acoes}>
                    <BotaoPequeno variante="perigo" rotulo="Reabrir" desativado={ocupado} onPress={() => reabrir(b.id_bloqueio)} />
                    <BotaoPequeno variante="fantasma" rotulo="Voltar" desativado={ocupado} onPress={() => setConfirmandoId(null)} />
                  </View>
                ) : (
                  <BotaoPequeno variante="fantasma" rotulo="Reabrir" icone={IconTrash} desativado={ocupado} onPress={() => setConfirmandoId(b.id_bloqueio)} />
                )}
              </View>
              {b.agendamentos.length > 0 && (
                <View style={styles.marcados}>
                  <Text style={styles.marcadosTexto}>
                    {b.agendamentos.length === 1
                      ? 'Ainda tem 1 agendamento marcado nesse período. Remarque ou cancele:'
                      : `Ainda tem ${b.agendamentos.length} agendamentos marcados nesse período. Remarque ou cancele:`}
                  </Text>
                  {b.agendamentos.map(a => (
                    <Text key={a.id_agendamento} style={styles.marcadosTexto}>
                      {'•  '}
                      <Text style={styles.sublinhado} onPress={() => router.push(`/agendamentos/${a.id_agendamento}`)}>
                        {dataBR(a.dt).slice(0, 5)} às {a.hr.slice(0, 5)}
                      </Text>
                      {' · '}{a.pet ?? 'Pet'}{a.cliente ? ` (${a.cliente})` : ''} · {a.servico} · {rotuloStatus(a.status)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))}

          {feriados.length > 0 && (
            <View style={styles.cartao}>
              <Pressable onPress={() => setVerFeriados(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: verFeriados }} style={styles.feriadosBotao}>
                <IconCalendar size={14} color={colors.textMuted} style={styles.semEncolher} />
                <Text style={styles.feriadosRotulo}>
                  {verFeriados ? 'Esconder feriados nacionais' : `Ver feriados nacionais (${feriados.length} nos próximos 12 meses)`}
                </Text>
              </Pressable>
              {verFeriados && (
                <View style={styles.feriados}>
                  {feriados.map(f => (
                    <View key={f.data} style={styles.feriado}>
                      <Text style={styles.feriadoTexto}>
                        <Text style={styles.forte}>{dataBR(f.data).slice(0, 5)}</Text> · {f.nome}
                        {f.facultativo && <Text style={styles.apagado}> · ponto facultativo</Text>}
                      </Text>
                      <BotaoPequeno rotulo="Fechar" desativado={ocupado} onPress={() => fecharFeriado(f.data, f.nome)} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Configurar vários dias */}
      <Folha visivel={loteAberto} titulo="Configurar vários dias" onFechar={() => setLoteAberto(false)} ocupado={ocupado}>
        <Text style={styles.explica}>
          Escolha os dias que têm o mesmo horário de funcionamento e defina abertura/fechamento uma única vez. Repita o processo pra configurar outro grupo de dias com outro horário (ex.: Segunda a Sexta das 09h às 22h, depois Sábado e Domingo das 12h às 15h).
        </Text>
        {loteErro && <Aviso tipo="erro" texto={loteErro} style={styles.aviso} />}
        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Dias da semana<Text style={styles.estrela}> *</Text></Text>
          <View style={styles.grade}>
            {DIAS.map(dia => {
              const marcado = diasLote.includes(dia)
              return (
                <Pressable
                  key={dia}
                  onPress={() => setDiasLote(lista => (marcado ? lista.filter(d => d !== dia) : [...lista, dia]))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marcado }}
                  style={styles.dia}
                >
                  <Caixinha marcada={marcado} />
                  <Text style={styles.diaTexto}>{dia}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
        <Campo rotulo="Abertura" obrigatorio value={loteInicio} onChangeText={t => setLoteInicio(mascaraHora(t))} keyboardType="number-pad" placeholder="--:--" maxLength={5} />
        <Campo rotulo="Fechamento" obrigatorio value={loteFim} onChangeText={t => setLoteFim(mascaraHora(t))} keyboardType="number-pad" placeholder="--:--" maxLength={5} />
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo={ocupado ? 'Salvando...' : 'Salvar horários'} desativado={ocupado} onPress={salvarLote} />
          <BotaoPequeno normal rotulo="Cancelar" desativado={ocupado} onPress={() => setLoteAberto(false)} />
        </View>
      </Folha>

      {/* Fechar um período */}
      <Folha visivel={formAberto} titulo="Fechar um período" onFechar={() => setFormAberto(false)} ocupado={ocupado}>
        {formErro && <Aviso tipo="erro" texto={formErro} style={styles.aviso} />}
        <Campo rotulo="De" obrigatorio value={de} onChangeText={t => setDe(mascaraData(t))} keyboardType="number-pad" placeholder="dd/mm/aaaa" maxLength={10} />
        <Campo rotulo="Até (opcional)" value={ate} onChangeText={t => setAte(mascaraData(t))} keyboardType="number-pad" placeholder="dd/mm/aaaa" maxLength={10} />
        <Pressable onPress={() => setDiaInteiro(v => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: diaInteiro }} style={styles.marcar}>
          <Caixinha marcada={diaInteiro} />
          <Text style={styles.marcarTexto}>Fechado o dia inteiro</Text>
        </Pressable>
        {!diaInteiro && (
          <>
            <Campo rotulo="Das" obrigatorio value={das} onChangeText={t => setDas(mascaraHora(t))} keyboardType="number-pad" placeholder="--:--" maxLength={5} />
            <Campo rotulo="Às" obrigatorio value={as} onChangeText={t => setAs(mascaraHora(t))} keyboardType="number-pad" placeholder="--:--" maxLength={5} />
            <Text style={styles.nota}>Com mais de um dia, o horário vale para cada dia do período.</Text>
          </>
        )}
        <View style={styles.grupo}>
          <Campo rotulo="Motivo" obrigatorio value={motivo} onChangeText={setMotivo} placeholder="Ex.: Feriado de Natal" maxLength={80} />
          <Text style={[styles.nota, styles.notaDoMotivo]}>Aparece para o cliente no calendário de agendamento.</Text>
        </View>
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo={ocupado ? 'Salvando...' : 'Fechar período'} desativado={ocupado} onPress={salvarBloqueio} />
          <BotaoPequeno normal variante="fantasma" rotulo="Cancelar" desativado={ocupado} onPress={() => setFormAberto(false)} />
        </View>
      </Folha>
    </ScreenContainer>
  )
}

// Mensagem de sucesso que some sozinha depois de 3 segundos.
function useAvisoTemporario(): [string | null, (texto: string) => void] {
  const [texto, setTexto] = useState<string | null>(null)
  useEffect(() => {
    if (!texto) return
    const t = setTimeout(() => setTexto(null), 3000)
    return () => clearTimeout(t)
  }, [texto])
  return [texto, setTexto]
}

const TONS = {
  ativo: { fundo: 'rgba(79,70,229,0.12)', borda: 'rgba(79,70,229,0.25)', cor: colors.primary600 },
  apagado: { fundo: colors.surfaceMuted, borda: colors.borderStrong, cor: '#858d99' },
  alerta: { fundo: 'rgba(245,158,11,0.1)', borda: 'rgba(245,158,11,0.3)', cor: colors.warningFg },
}

// A caixinha de 40 à esquerda de cada linha (dia aberto, fechado, período bloqueado).
function CaixaDoIcone({ icone: Icone, tom }: { icone: ComponentType<IconeProps>; tom: keyof typeof TONS }) {
  const t = TONS[tom]
  return (
    <View style={[styles.caixa, { backgroundColor: t.fundo, borderColor: t.borda }]}>
      <Icone size={18} color={t.cor} />
    </View>
  )
}

function Caixinha({ marcada }: { marcada: boolean }) {
  return (
    <View style={[styles.caixinha, marcada && styles.caixinhaMarcada]}>
      {marcada && <IconCheck size={11} color={colors.white} />}
    </View>
  )
}

// Medidas da página do site em 375 de largura.
const styles = StyleSheet.create({
  aviso: { marginBottom: 16 },
  varios: { alignSelf: 'flex-end', marginBottom: 16 },
  pilha: { gap: 12 },
  cartao: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  caixa: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  subLinha: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 },
  sub: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  // `.badge.badge-inativo`
  selo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.border },
  seloTexto: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.48, color: colors.textMuted },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  edicao: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 12 },
  aDireita: { alignSelf: 'flex-end' },
  secao: { marginTop: 32, marginBottom: 16 },
  secaoTitulo: { fontFamily: FONTE_TITULO, fontSize: 18.4, lineHeight: 23, fontWeight: '700', color: colors.text },
  secaoTexto: { fontSize: 14, lineHeight: 20, color: '#858d99', marginTop: 4 },
  fecharPeriodo: { alignSelf: 'flex-start', marginTop: 12 },
  // Aviso de quem ainda está marcado no período (`.alert-warning` em coluna).
  marcados: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.1)', gap: 8 },
  marcadosTexto: { fontSize: 14, lineHeight: 22.4, color: colors.warningFg },
  sublinhado: { textDecorationLine: 'underline' },
  // `.btn-ghost` sem respiro: sobra só o 1 do contorno invisível.
  feriadosBotao: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, alignSelf: 'flex-start', paddingLeft: 1 },
  semEncolher: { flexShrink: 0 },
  feriadosRotulo: { flexShrink: 1, fontSize: 13, lineHeight: 16.9, fontWeight: '600', color: colors.textMuted },
  feriados: { marginTop: 12, gap: 8 },
  feriado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  feriadoTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  forte: { fontWeight: '700' },
  apagado: { color: '#858d99' },
  // Janelas
  explica: { fontSize: 14, lineHeight: 20, color: '#858d99', marginBottom: 16 },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  estrela: { color: colors.dangerFg },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // `.picker-item` com a caixa de marcar, dois por linha.
  dia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Dois por linha (o último fica sozinho, com a mesma largura).
    width: '48.8%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  diaTexto: { fontSize: 14, lineHeight: 17, fontWeight: '600', color: colors.text },
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
  caixinhaMarcada: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  marcar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  marcarTexto: { fontSize: 14, lineHeight: 20, color: colors.text },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  // A nota do motivo fica a 8 do campo (4 do grupo + 4).
  notaDoMotivo: { marginTop: 4 },
  // A Folha deixa 24 no fim; janela com botões no pé (`.modal-footer`) deixa 16.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
