import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Linking, Pressable, Share, StyleSheet, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Segmentos } from '@/components/Opcao'
import { SeletorDia } from '@/components/SeletorDia'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { dataBR, dataExtensaISO, hojeBrasilISO } from '@/lib/agenda'
import { dialogo } from '@/lib/dialogo'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { horaValida, mascaraHora, soDigitos } from '@/lib/mascaras'
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

type Unidade = 'horas' | 'dias'
interface Janela { minValor: string; minUnidade: Unidade; maxValor: string; maxUnidade: Unidade }

const ORDEM_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

function periodoDoBloqueio(b: Bloqueio): string {
  const dias = b.dt_inicio === b.dt_fim ? dataBR(b.dt_inicio) : `${dataBR(b.dt_inicio)} a ${dataBR(b.dt_fim)}`
  return b.hr_inicio && b.hr_fim ? `${dias}, das ${b.hr_inicio} às ${b.hr_fim}` : `${dias} — dia inteiro`
}

export type ParteDaConfig = 'agendamentos' | 'horarios'

// Mesmos nomes dos itens da tela Configurações (e do site).
const TITULOS: Record<ParteDaConfig, string> = {
  agendamentos: 'Configurações de Agendamentos',
  horarios: 'Horários de funcionamento',
}

// As duas telas de dentro de Configurações que mexem na agenda da loja:
// "Configurações de Agendamentos" (agendamento online: liga/desliga, link,
// antecedência) e "Horários de funcionamento" (dias da semana e dias
// fechados). Uma tela por item, como no site; o carregamento é o mesmo.
// Gravar passa pelas mesmas actions do painel web — é lá que o
// administrador (funcionário com acesso total) tem permissão de escrita;
// sem o site configurado, só o dono da conta consegue mudar os
// interruptores (RLS).
export function TelaConfigLoja({ parte }: { parte: ParteDaConfig }) {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const ehDono = contexto?.role === 'lojista'
  const comSite = acoesDisponiveis()
  const podeGravar = comSite || ehDono
  const hoje = hojeBrasilISO()

  const [online, setOnline] = useState<boolean | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela | null>(null)
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Painéis (um por vez).
  const [painel, setPainel] = useState<'bloqueio' | 'horario' | 'link' | 'janela' | null>(null)
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Fechar um dia
  const [dtInicio, setDtInicio] = useState(hoje)
  const [dtFim, setDtFim] = useState(hoje)
  const [variosDias, setVariosDias] = useState(false)
  const [soHoras, setSoHoras] = useState(false)
  const [hrIni, setHrIni] = useState('')
  const [hrFim, setHrFim] = useState('')
  const [motivo, setMotivo] = useState('')
  // Horário de um dia
  const [dia, setDia] = useState('')
  const [abre, setAbre] = useState('')
  const [fecha, setFecha] = useState('')
  // Link e antecedência
  const [slugNovo, setSlugNovo] = useState('')
  const [janelaNova, setJanelaNova] = useState<Janela>({ minValor: '0', minUnidade: 'horas', maxValor: '30', maxUnidade: 'dias' })

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    // Cada grupo de colunas é de uma migration diferente: consultas
    // separadas e tolerantes, como no painel web.
    const [loja, slugRow, janelaRow, hrs, blq] = await Promise.all([
      supabase.from('lojista').select('aceita_agendamento_online').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('lojista').select('slug').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('lojista').select('agendamento_min_valor, agendamento_min_unidade, agendamento_max_valor, agendamento_max_unidade').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('horario').select('id_horario, dia_semana, hr_inicio, hr_fim, ativo').eq('id_lojista', idLojista),
      supabase.rpc('fn_bloqueios_da_loja', { p_id_lojista: idLojista }),
    ])
    setOnline(loja.error ? null : ((loja.data as { aceita_agendamento_online: boolean } | null)?.aceita_agendamento_online ?? null))
    setSlug(slugRow.error ? null : ((slugRow.data as { slug: string | null } | null)?.slug ?? null))
    const j = janelaRow.error ? null : (janelaRow.data as { agendamento_min_valor: number; agendamento_min_unidade: Unidade; agendamento_max_valor: number; agendamento_max_unidade: Unidade } | null)
    setJanela(j ? { minValor: String(j.agendamento_min_valor), minUnidade: j.agendamento_min_unidade, maxValor: String(j.agendamento_max_valor), maxUnidade: j.agendamento_max_unidade } : null)
    setHorarios(((hrs.data ?? []) as Horario[]).sort((a, b) => ORDEM_DIAS.indexOf(a.dia_semana) - ORDEM_DIAS.indexOf(b.dia_semana)))
    setBloqueios(blq.error ? null : ((blq.data ?? []) as Bloqueio[]))
    setErro(hrs.error ? 'Não foi possível carregar os horários.' : null)
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title={TITULOS[parte]} />
        <SemPermissao area="mudar as configurações da loja" />
      </ScreenContainer>
    )
  }

  const link = urlDoSite(`/agendamento/${slug ?? idLojista ?? ''}`)

  async function alternarOnline(ativo: boolean) {
    if (!idLojista) return
    setErro(null)
    setOcupado('online')
    let falha: string | undefined
    if (comSite) {
      falha = (await chamarAcao('alternarAgendamentoOnlineAction', ativo)).error
    } else {
      const { data, error } = await supabase.from('lojista').update({ aceita_agendamento_online: ativo }).eq('id_lojista', idLojista).select('id_lojista')
      if (error || !data || data.length === 0) falha = 'Não foi possível mudar o agendamento online.'
    }
    setOcupado(null)
    if (falha) return setErro(falha)
    setOnline(ativo)
  }

  async function alternarHorario(h: Horario, ativo: boolean) {
    if (!idLojista) return
    setErro(null)
    setOcupado(h.id_horario)
    let falha: string | undefined
    if (comSite) {
      falha = (await chamarAcao('toggleHorarioAction', h.id_horario, ativo)).error
    } else {
      const { data, error } = await supabase.from('horario').update({ ativo }).eq('id_horario', h.id_horario).eq('id_lojista', idLojista).select('id_horario')
      if (error || !data || data.length === 0) falha = 'Não foi possível mudar esse dia.'
    }
    setOcupado(null)
    if (falha) return setErro(falha)
    setHorarios(lista => lista.map(x => (x.id_horario === h.id_horario ? { ...x, ativo } : x)))
  }

  function abrirHorario(diaSemana: string, h?: Horario) {
    setDia(diaSemana)
    setAbre(h ? h.hr_inicio.slice(0, 5) : '08:00')
    setFecha(h ? h.hr_fim.slice(0, 5) : '18:00')
    setErroPainel(null)
    setPainel('horario')
  }

  async function salvarHorario() {
    if (!horaValida(abre) || !horaValida(fecha)) return setErroPainel('Informe os horários no formato 08:00.')
    if (fecha <= abre) return setErroPainel('O horário de fechar precisa ser depois do de abrir.')
    setErroPainel(null)
    setSalvando(true)
    const r = await chamarAcao('salvarHorarioAction', form({ dia_semana: dia, hr_inicio: abre, hr_fim: fecha }))
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setPainel(null)
    carregar()
  }

  function abrirBloqueio() {
    setDtInicio(hoje)
    setDtFim(hoje)
    setVariosDias(false)
    setSoHoras(false)
    setHrIni('')
    setHrFim('')
    setMotivo('')
    setErroPainel(null)
    setPainel('bloqueio')
  }

  async function fecharPeriodo() {
    if (!idLojista) return
    const texto = motivo.trim()
    if (!texto) return setErroPainel('Informe o motivo (ex.: Feriado de Natal).')
    const fim = variosDias ? (dtFim < dtInicio ? dtInicio : dtFim) : dtInicio
    if (soHoras) {
      if (!horaValida(hrIni) || !horaValida(hrFim)) return setErroPainel('Informe o horário de início e de fim (ex.: 12:00).')
      if (hrFim <= hrIni) return setErroPainel('O horário final precisa ser depois do inicial.')
    }
    setErroPainel(null)
    setSalvando(true)
    const { error } = await supabase.rpc('fn_salvar_bloqueio', {
      p_id_lojista: idLojista,
      p_dt_inicio: dtInicio,
      p_dt_fim: fim,
      p_hr_inicio: soHoras ? hrIni : null,
      p_hr_fim: soHoras ? hrFim : null,
      p_motivo: texto,
    })
    setSalvando(false)
    if (error) {
      return setErroPainel(faltaMigration(error) ? 'Fechar dias ainda não foi ativado no sistema da loja.' : mensagemDoBanco(error, 'Não foi possível fechar esse período.'))
    }
    setPainel(null)
    carregar()
  }

  function pedirReabrir(b: Bloqueio) {
    dialogo('Reabrir', `${periodoDoBloqueio(b)} (${b.motivo}) volta a aceitar agendamentos. Continuar?`, [
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

  async function salvarSlug() {
    const valor = slugNovo.trim().toLowerCase()
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(valor) || valor.length < 3) {
      return setErroPainel('Use só letras minúsculas, números e hífen (mínimo 3 letras) — sem espaços nem acentos.')
    }
    setErroPainel(null)
    setSalvando(true)
    const r = await chamarAcao('atualizarSlugLojistaAction', form({ slug: valor }))
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setSlug(valor)
    setPainel(null)
    setInfo('Link de agendamento atualizado.')
  }

  async function salvarJanela() {
    const min = Number(soDigitos(janelaNova.minValor) || '0')
    const max = Number(soDigitos(janelaNova.maxValor) || '0')
    if (max < 1) return setErroPainel('O prazo máximo precisa ser pelo menos 1.')
    setErroPainel(null)
    setSalvando(true)
    const r = await chamarAcao('atualizarJanelaAgendamentoAction', form({ minValor: min, minUnidade: janelaNova.minUnidade, maxValor: max, maxUnidade: janelaNova.maxUnidade }))
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setPainel(null)
    setInfo('Antecedência do agendamento online atualizada.')
    carregar()
  }

  const semHorario = ORDEM_DIAS.filter(d => !horarios.some(h => h.dia_semana === d))
  const UNIDADES: { valor: Unidade; rotulo: string }[] = [{ valor: 'horas', rotulo: 'horas' }, { valor: 'dias', rotulo: 'dias' }]

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title={TITULOS[parte]} />

      {erro && <Aviso tipo="erro" texto={erro} style={styles.aviso} />}
      {info && <Aviso tipo="sucesso" texto={info} style={styles.aviso} />}
      {!podeGravar && (
        <Aviso tipo="info" style={styles.aviso} texto="Sem o endereço do site configurado no app, só o responsável pela conta muda estas opções. Fechar dias você também pode." />
      )}

      {parte === 'agendamentos' && (
        <>
          {/* Agendamento online */}
          <Text style={styles.secaoPrimeira}>Agendamento online</Text>
          <Card style={{ gap: spacing.md }}>
            {online !== null && (
              <View style={styles.linha}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.titulo}>Aceitar agendamento pelo site</Text>
                  <Text style={styles.sub}>{online ? 'Clientes podem agendar sozinhos.' : 'Desligado — só a loja cria agendamentos.'}</Text>
                </View>
                <Interruptor
                  value={online}
                  disabled={!podeGravar || ocupado === 'online'}
                  onValueChange={alternarOnline}
                  accessibilityLabel="Aceitar agendamento pelo site"
                />
              </View>
            )}
            {link && (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sub}>Link para divulgar:</Text>
                <Text style={styles.link} selectable>{link}</Text>
                <View style={styles.duas}>
                  <Botao rotulo="Compartilhar" icone="share-social-outline" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Share.share({ message: link })} />
                  {comSite && (
                    <Botao rotulo="Mudar o link" icone="create-outline" variante="secundario" compacto style={{ flex: 1 }} onPress={() => { setSlugNovo(slug ?? ''); setErroPainel(null); setPainel('link') }} />
                  )}
                </View>
              </View>
            )}
            {janela && (
              <View style={styles.linha}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.titulo}>Antecedência</Text>
                  <Text style={styles.sub}>
                    De {janela.minValor} {janela.minUnidade} até {janela.maxValor} {janela.maxUnidade} antes do horário.
                  </Text>
                </View>
                {comSite && <Botao rotulo="Mudar" variante="secundario" compacto onPress={() => { setJanelaNova(janela); setErroPainel(null); setPainel('janela') }} />}
              </View>
            )}
          </Card>
          {urlDoSite('/lojista/configuracoes/agendamentos') && (
            <Botao
              rotulo="Abrir o painel web"
              icone="open-outline"
              variante="secundario"
              style={{ marginTop: spacing.md }}
              onPress={() => Linking.openURL(urlDoSite('/lojista/configuracoes/agendamentos')!)}
            />
          )}
        </>
      )}

      {parte === 'horarios' && (
        <>
          {/* Horários */}
          <Text style={styles.secaoPrimeira}>Horário de funcionamento</Text>
          <Card style={{ gap: spacing.md }}>
            {horarios.map(h => (
              <View key={h.id_horario} style={styles.linha}>
                <Pressable
                  style={{ flex: 1, gap: 2 }}
                  disabled={!comSite}
                  onPress={() => abrirHorario(h.dia_semana, h)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mudar horário de ${h.dia_semana}`}
                >
                  <Text style={[styles.titulo, !h.ativo && styles.apagado]}>{h.dia_semana}</Text>
                  <Text style={styles.sub}>
                    {h.ativo ? `${h.hr_inicio.slice(0, 5)} às ${h.hr_fim.slice(0, 5)}` : 'Fechado'}
                    {comSite ? ' · tocar para mudar' : ''}
                  </Text>
                </Pressable>
                <Interruptor
                  value={h.ativo}
                  disabled={!podeGravar || ocupado === h.id_horario}
                  onValueChange={v => alternarHorario(h, v)}
                  accessibilityLabel={`${h.dia_semana} aberto`}
                />
              </View>
            ))}
            {comSite && semHorario.map(d => (
              <View key={d} style={styles.linha}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.titulo, styles.apagado]}>{d}</Text>
                  <Text style={styles.sub}>Sem horário definido</Text>
                </View>
                <Botao rotulo="Definir" variante="secundario" compacto onPress={() => abrirHorario(d)} />
              </View>
            ))}
            {horarios.length === 0 && !comSite && !loading && <Text style={styles.sub}>Nenhum horário de funcionamento cadastrado.</Text>}
          </Card>

          {/* Dias fechados */}
          <Text style={styles.secao}>Dias fechados</Text>
          {bloqueios === null ? (
            <Aviso tipo="alerta" texto="Fechar dias (feriado, folga) ainda não foi ativado no sistema da loja." />
          ) : (
            <View style={{ gap: spacing.md }}>
              {bloqueios.length === 0 && <Text style={styles.sub}>Nenhum dia fechado daqui pra frente.</Text>}
              {bloqueios.map(b => (
                <Card key={b.id_bloqueio} style={styles.linha}>
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
                    <IconeApp name="trash-outline" size={20} color={colors.dangerFg} />
                  </Pressable>
                </Card>
              ))}
              <Botao rotulo="Fechar um dia ou horário" icone="add" variante="secundario" onPress={abrirBloqueio} />
            </View>
          )}
        </>
      )}

      {/* Horário de um dia */}
      <Folha visivel={painel === 'horario'} titulo={`Horário — ${dia}`} onFechar={() => setPainel(null)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <View style={styles.duas}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Abre às" value={abre} onChangeText={t => setAbre(mascaraHora(t))} keyboardType="number-pad" placeholder="08:00" maxLength={5} />
          </View>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Fecha às" value={fecha} onChangeText={t => setFecha(mascaraHora(t))} keyboardType="number-pad" placeholder="18:00" maxLength={5} />
          </View>
        </View>
        <Botao rotulo="Salvar horário" onPress={salvarHorario} carregando={salvando} />
      </Folha>

      {/* Fechar um dia */}
      <Folha visivel={painel === 'bloqueio'} titulo="Fechar um dia ou horário" onFechar={() => setPainel(null)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Ex.: Feriado de Natal" maxLength={80} />

        <Text style={styles.rotulo}>{variosDias ? 'Primeiro dia' : 'Dia'}</Text>
        <SeletorDia inicio={hoje} dias={180} valor={dtInicio} onChange={d => { setDtInicio(d); if (dtFim < d) setDtFim(d) }} />
        <Text style={styles.sub}>{dataExtensaISO(dtInicio)}</Text>

        <LinhaSwitch titulo="Vários dias seguidos" valor={variosDias} onChange={v => { setVariosDias(v); if (v && dtFim < dtInicio) setDtFim(dtInicio) }} />
        {variosDias && (
          <>
            <Text style={styles.rotulo}>Último dia</Text>
            <SeletorDia inicio={dtInicio} dias={90} valor={dtFim < dtInicio ? dtInicio : dtFim} onChange={setDtFim} />
            <Text style={styles.sub}>{dataExtensaISO(dtFim < dtInicio ? dtInicio : dtFim)}</Text>
          </>
        )}

        <LinhaSwitch titulo="Só algumas horas" detalhe="Desligado, fecha o dia inteiro." valor={soHoras} onChange={setSoHoras} />
        {soHoras && (
          <View style={styles.duas}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Das" value={hrIni} onChangeText={t => setHrIni(mascaraHora(t))} keyboardType="number-pad" placeholder="12:00" maxLength={5} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Até" value={hrFim} onChangeText={t => setHrFim(mascaraHora(t))} keyboardType="number-pad" placeholder="14:00" maxLength={5} />
            </View>
          </View>
        )}
        <Botao rotulo="Fechar" onPress={fecharPeriodo} carregando={salvando} />
      </Folha>

      {/* Link */}
      <Folha visivel={painel === 'link'} titulo="Link de agendamento" onFechar={() => setPainel(null)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo
          rotulo="Nome no link"
          value={slugNovo}
          onChangeText={t => setSlugNovo(t.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="meu-petshop"
          maxLength={60}
          ajuda={`Fica assim: ${urlDoSite(`/agendamento/${slugNovo.trim() || 'meu-petshop'}`) ?? ''}`}
        />
        <Text style={styles.sub}>Quem já tem o link antigo salvo precisa receber o novo.</Text>
        <Botao rotulo="Salvar link" onPress={salvarSlug} carregando={salvando} />
      </Folha>

      {/* Antecedência */}
      <Folha visivel={painel === 'janela'} titulo="Antecedência do agendamento online" onFechar={() => setPainel(null)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Text style={styles.sub}>Vale só para o que o cliente agenda sozinho. A loja agenda para qualquer dia.</Text>
        <Campo
          rotulo="Mínimo antes do horário"
          value={janelaNova.minValor}
          onChangeText={t => setJanelaNova(j => ({ ...j, minValor: soDigitos(t) }))}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Segmentos valor={janelaNova.minUnidade} onChange={v => setJanelaNova(j => ({ ...j, minUnidade: v }))} opcoes={UNIDADES} />
        <Campo
          rotulo="Máximo antes do horário"
          value={janelaNova.maxValor}
          onChangeText={t => setJanelaNova(j => ({ ...j, maxValor: soDigitos(t) }))}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Segmentos valor={janelaNova.maxUnidade} onChange={v => setJanelaNova(j => ({ ...j, maxUnidade: v }))} opcoes={UNIDADES} />
        <Botao rotulo="Salvar" onPress={salvarJanela} carregando={salvando} />
      </Folha>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  aviso: { marginBottom: spacing.md },
  secaoPrimeira: { ...typography.heading.sm, color: colors.text, marginBottom: spacing.md },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  duas: { flexDirection: 'row', gap: spacing.md },
  titulo: { ...typography.body.lg, fontWeight: '600', color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  link: { ...typography.body.md, color: colors.primary700 },
  rotulo: { ...typography.label.md, color: colors.textDim },
  alerta: { ...typography.body.sm, color: colors.warningFg, marginTop: 2 },
  lixeira: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
