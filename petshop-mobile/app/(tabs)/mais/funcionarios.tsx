import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Linking, StyleSheet, Switch, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { formatarTelefone, linkWhatsApp } from '@/lib/format'
import { mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Funcionario {
  id_funcionario: string
  nome: string
  email: string
  telefone: string
  cargo: string | null
  ativo: boolean
  pode_gerenciar_agenda: boolean
  pode_gerenciar_servicos: boolean
  // Colunas de migrations posteriores — ausentes antes delas.
  pode_gerenciar_produtos?: boolean
  pode_gerenciar_clientes_pets?: boolean
  acesso_total?: boolean
  pode_taxidog?: boolean
}

interface Permissoes {
  agenda: boolean
  servicos: boolean
  produtos: boolean
  clientesPets: boolean
  acessoTotal: boolean
  taxidog: boolean
}

const PERMISSOES_NOVAS: Permissoes = { agenda: true, servicos: false, produtos: false, clientesPets: false, acessoTotal: false, taxidog: false }

function tagsDe(f: Funcionario): string[] {
  if (f.acesso_total) return ['Administrador']
  return [
    f.pode_gerenciar_agenda && 'Agenda',
    f.pode_gerenciar_clientes_pets && 'Clientes e pets',
    f.pode_gerenciar_servicos && 'Serviços',
    f.pode_gerenciar_produtos && 'Produtos',
  ].filter(Boolean) as string[]
}

// Equipe da loja (tabela `funcionario`, a mesma da tela Equipe do painel
// web): convidar, mudar permissões, ativar/desativar e excluir — pelas
// mesmas actions do painel (o convite por e-mail sai do servidor).
export default function FuncionariosScreen() {
  const { contexto, session } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  // Só o responsável pela conta cria ou remove administrador.
  const ehDono = contexto?.role === 'lojista'
  const [equipe, setEquipe] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [alterando, setAlterando] = useState<string | null>(null)

  // Painel de convidar/editar. `editando` null = convite novo.
  const [painel, setPainel] = useState(false)
  const [editando, setEditando] = useState<Funcionario | null>(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cargo, setCargo] = useState('')
  const [perm, setPerm] = useState<Permissoes>(PERMISSOES_NOVAS)
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const { data, error } = await supabase
      .from('funcionario')
      .select('*')
      .eq('id_lojista', idLojista)
      .order('ativo', { ascending: false })
      .order('nome')
    if (error) setErro('Não foi possível carregar a equipe.')
    else {
      setErro(null)
      setEquipe((data ?? []) as Funcionario[])
    }
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Funcionários" />
        <SemPermissao area="ver a equipe" />
      </ScreenContainer>
    )
  }

  function abrir(f: Funcionario | null) {
    setEditando(f)
    setNome(f?.nome ?? '')
    setEmail(f?.email ?? '')
    setTelefone(f ? mascaraTelefone(f.telefone) : '')
    setCargo(f?.cargo ?? '')
    setPerm(f
      ? {
          agenda: f.pode_gerenciar_agenda,
          servicos: f.pode_gerenciar_servicos,
          produtos: !!f.pode_gerenciar_produtos,
          clientesPets: !!f.pode_gerenciar_clientes_pets,
          acessoTotal: !!f.acesso_total,
          taxidog: !!f.pode_taxidog,
        }
      : PERMISSOES_NOVAS)
    setErroPainel(null)
    setPainel(true)
  }

  async function salvar() {
    if (nome.trim().length < 2) return setErroPainel('Informe o nome.')
    if (!editando && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErroPainel('Informe um e-mail válido.')
    const tel = soDigitos(telefone)
    if (tel.length < 10) return setErroPainel('Informe o telefone com DDD.')
    setErroPainel(null)
    setSalvando(true)
    const campos = {
      nome: nome.trim(),
      telefone: tel,
      cargo: cargo.trim(),
      pode_gerenciar_agenda: perm.agenda,
      pode_gerenciar_servicos: perm.servicos,
      pode_gerenciar_produtos: perm.produtos,
      pode_gerenciar_clientes_pets: perm.clientesPets,
      acesso_total: perm.acessoTotal,
      pode_taxidog: perm.taxidog,
    }
    const r = editando
      ? await chamarAcao('editarFuncionarioAction', editando.id_funcionario, form(campos))
      : await chamarAcao('cadastrarFuncionarioAction', form({ ...campos, email: email.trim().toLowerCase() }))
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setPainel(false)
    if (!editando) setInfo(`Convite enviado para ${email.trim().toLowerCase()} — a pessoa cria a própria senha pelo link do e-mail.`)
    carregar()
  }

  async function alternar(f: Funcionario, ativo: boolean) {
    setErro(null)
    setAlterando(f.id_funcionario)
    const r = await chamarAcao('toggleFuncionarioAction', f.id_funcionario, ativo)
    setAlterando(null)
    if (r.error) return setErro(r.error)
    setEquipe(lista => lista.map(x => (x.id_funcionario === f.id_funcionario ? { ...x, ativo } : x)))
  }

  function pedirAlternar(f: Funcionario, ativo: boolean) {
    if (ativo) return void alternar(f, true)
    dialogo('Desativar acesso', `${f.nome} deixa de conseguir entrar no painel e no app. Dá para reativar depois.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Desativar', style: 'destructive', onPress: () => alternar(f, false) },
    ])
  }

  function pedirExclusao(f: Funcionario) {
    dialogo('Excluir da equipe', `Excluir ${f.nome}? A conta é apagada de vez. Os atendimentos que fez continuam no histórico, sem o nome.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setSalvando(true)
          const r = await chamarAcao('excluirFuncionarioAction', f.id_funcionario)
          setSalvando(false)
          if (r.error) return setErroPainel(r.error)
          setPainel(false)
          carregar()
        },
      },
    ])
  }

  const marcar = (chave: keyof Permissoes) => (v: boolean) => setPerm(p => ({ ...p, [chave]: v }))
  // Administrador de outra pessoa só o dono edita; e ninguém se edita aqui.
  const podeEditar = (f: Funcionario) => f.id_funcionario !== session?.user.id && (ehDono || !f.acesso_total)

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Funcionários" />

      {!acoesDisponiveis() && <Aviso tipo="alerta" texto={`Só consulta: ${MSG_SEM_SITE}`} style={{ marginBottom: spacing.md }} />}
      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}
      {info && <Aviso tipo="sucesso" texto={info} style={{ marginBottom: spacing.md }} />}

      <Botao rotulo="Convidar funcionário" icone="person-add-outline" onPress={() => abrir(null)} style={{ marginBottom: spacing.lg }} />

      {!loading && equipe.length === 0 && !erro ? (
        <EmptyState icon="people-circle-outline" title="Nenhum funcionário cadastrado" subtitle="Convide a equipe — cada pessoa recebe um e-mail para criar a própria senha." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {equipe.map(f => {
            const tags = tagsDe(f)
            const whatsapp = linkWhatsApp(f.telefone)
            return (
              <Card key={f.id_funcionario} style={{ gap: spacing.md }}>
                <View style={styles.topo}>
                  <Avatar nome={f.nome} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.nome, !f.ativo && styles.apagado]} numberOfLines={1}>{f.nome}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{f.cargo || 'Equipe'}{f.ativo ? '' : ' · Desativado'}</Text>
                  </View>
                  {podeEditar(f) && (
                    <Switch
                      value={f.ativo}
                      disabled={alterando === f.id_funcionario}
                      onValueChange={v => pedirAlternar(f, v)}
                      trackColor={{ true: colors.primary500, false: colors.borderStrong }}
                      thumbColor={colors.white}
                      accessibilityLabel={`Acesso de ${f.nome}`}
                    />
                  )}
                </View>

                <View style={styles.tags}>
                  {tags.length === 0 && !f.pode_taxidog && <Text style={styles.sub}>Sem permissões de gestão</Text>}
                  {tags.map(t => (
                    <View key={t} style={styles.tag}><Text style={styles.tagTexto}>{t}</Text></View>
                  ))}
                  {f.pode_taxidog && (
                    <View style={[styles.tag, styles.tagTaxi]}><Text style={[styles.tagTexto, styles.tagTaxiTexto]}>TaxiDog</Text></View>
                  )}
                </View>

                <Text style={styles.sub} numberOfLines={1}>{f.email}</Text>
                <View style={styles.acoes}>
                  <Botao rotulo={formatarTelefone(f.telefone)} icone="call-outline" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${f.telefone}`)} />
                  {whatsapp && (
                    <Botao rotulo="WhatsApp" icone="logo-whatsapp" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Linking.openURL(whatsapp)} />
                  )}
                </View>
                {podeEditar(f) && (
                  <Botao rotulo="Editar dados e permissões" icone="create-outline" variante="secundario" compacto onPress={() => abrir(f)} />
                )}
              </Card>
            )
          })}
        </View>
      )}

      <Folha visivel={painel} titulo={editando ? 'Editar funcionário' : 'Convidar funcionário'} onFechar={() => setPainel(false)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Nome" value={nome} onChangeText={setNome} maxLength={120} autoCapitalize="words" />
        {editando ? (
          <Text style={styles.sub}>E-mail (login): {editando.email}</Text>
        ) : (
          <Campo
            rotulo="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            ajuda="A pessoa recebe um convite e cria a própria senha."
          />
        )}
        <Campo rotulo="Telefone" value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(11) 98765-4321" maxLength={15} />
        <Campo rotulo="Cargo (opcional)" value={cargo} onChangeText={setCargo} placeholder="Ex.: Tosador" maxLength={100} />

        <Text style={styles.secao}>O que pode fazer</Text>
        {ehDono && (
          <LinhaSwitch titulo="Administrador" detalhe="Acesso igual ao seu em tudo: relatórios, equipe, configurações." valor={perm.acessoTotal} onChange={marcar('acessoTotal')} />
        )}
        {!perm.acessoTotal && (
          <>
            <LinhaSwitch titulo="Agenda" detalhe="Ver e mexer nos agendamentos." valor={perm.agenda} onChange={marcar('agenda')} />
            <LinhaSwitch titulo="Clientes e pets" detalhe="Consultar clientes e pets." valor={perm.clientesPets} onChange={marcar('clientesPets')} />
            <LinhaSwitch titulo="Serviços" detalhe="Cadastrar e alterar serviços e preços." valor={perm.servicos} onChange={marcar('servicos')} />
            <LinhaSwitch titulo="Produtos" detalhe="Catálogo e estoque." valor={perm.produtos} onChange={marcar('produtos')} />
          </>
        )}
        <LinhaSwitch titulo="TaxiDog" detalhe="Recebe corridas e rotas no app." valor={perm.taxidog} onChange={marcar('taxidog')} />

        <Botao rotulo={editando ? 'Salvar' : 'Enviar convite'} onPress={salvar} carregando={salvando} />
        {editando && <Botao rotulo="Excluir da equipe" icone="trash-outline" variante="perigo" onPress={() => pedirExclusao(editando)} desativado={salvando} />}
      </Folha>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { backgroundColor: colors.primary50, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  tagTexto: { ...typography.label.md, color: colors.primary700, fontSize: 12 },
  tagTaxi: { backgroundColor: colors.warningBg },
  tagTaxiTexto: { color: colors.warningFg },
  acoes: { flexDirection: 'row', gap: spacing.md },
})
