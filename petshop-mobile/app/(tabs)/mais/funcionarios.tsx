import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { StyleSheet, View } from 'react-native'
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
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Funcionario {
  id_funcionario: string
  nome: string
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
// web): cadastrar, mudar permissões, ativar/desativar, excluir e gerar o
// código de acesso rápido — pelas mesmas actions do painel. O funcionário
// é cadastrado só com o nome: não tem e-mail, senha nem telefone, entra
// pelo código.
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

  // Painel de cadastrar/editar. `editando` null = cadastro novo.
  const [painel, setPainel] = useState(false)
  const [editando, setEditando] = useState<Funcionario | null>(null)
  const [nome, setNome] = useState('')
  const [cargo, setCargo] = useState('')
  const [perm, setPerm] = useState<Permissoes>(PERMISSOES_NOVAS)
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Código de acesso rápido (6 dígitos, 1 minuto, uso único) de um
  // funcionário. Enquanto o painel fica aberto, gera outro quando vence.
  const [codigoDe, setCodigoDe] = useState<Funcionario | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [expiraEm, setExpiraEm] = useState<number | null>(null)
  const [agora, setAgora] = useState(0)
  const [gerando, setGerando] = useState(false)
  const [erroCodigo, setErroCodigo] = useState<string | null>(null)
  // Qual código foi copiado — quando ele renova, o botão volta sozinho
  // pra "Copiar código".
  const [copiado, setCopiado] = useState<string | null>(null)

  const gerarCodigo = useCallback(async (idFuncionario: string) => {
    setGerando(true)
    setErroCodigo(null)
    const r = await chamarAcao<{ codigo: string; expiracao: string }>('gerarCodigoAcessoFuncionarioAction', idFuncionario)
    if (r.error || !r.codigo || !r.expiracao) {
      setErroCodigo(r.error ?? 'Não foi possível gerar o código.')
      setCodigo(null)
      setExpiraEm(null)
    } else {
      const fim = new Date(r.expiracao).getTime()
      const t = Date.now()
      setCodigo(r.codigo)
      setAgora(t)
      // Já vencido pelo relógio deste aparelho: não renova sozinho, senão
      // geraria um código novo a cada segundo.
      setExpiraEm(fim > t ? fim : null)
    }
    setGerando(false)
  }, [])

  // A contagem sai do horário de expiração (não de um contador que desconta
  // 1 por segundo, que atrasa com o app em segundo plano).
  useEffect(() => {
    if (!expiraEm || !codigoDe) return
    const idFuncionario = codigoDe.id_funcionario
    const timer = setInterval(() => {
      const t = Date.now()
      setAgora(t)
      if (t >= expiraEm) {
        clearInterval(timer)
        setExpiraEm(null)
        gerarCodigo(idFuncionario)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [expiraEm, codigoDe, gerarCodigo])

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
    setErroPainel(null)
    setSalvando(true)
    const campos = {
      nome: nome.trim(),
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
      : await chamarAcao('cadastrarFuncionarioAction', form(campos))
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setPainel(false)
    if (!editando) setInfo(`${nome.trim()} cadastrado. Para entrar, gere o código em "Código de acesso".`)
    carregar()
  }

  function abrirCodigo(f: Funcionario) {
    setCodigoDe(f)
    setCodigo(null)
    setExpiraEm(null)
    gerarCodigo(f.id_funcionario)
  }

  function fecharCodigo() {
    setCodigoDe(null)
    setCodigo(null)
    setExpiraEm(null)
    setErroCodigo(null)
    setCopiado(null)
  }

  // O botão confirma por 2s (o mesmo "Copiado" do painel web).
  async function copiarCodigo() {
    if (!codigo) return
    const copiou = await Clipboard.setStringAsync(codigo).catch(() => false)
    if (!copiou) return setErroCodigo('Não foi possível copiar. Anote o código.')
    const valor = codigo
    setCopiado(valor)
    setTimeout(() => setCopiado(atual => (atual === valor ? null : atual)), 2000)
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
  const tempoRestante = expiraEm ? Math.max(0, Math.ceil((expiraEm - agora) / 1000)) : 0

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Funcionários" />

      {!acoesDisponiveis() && <Aviso tipo="alerta" texto={`Só consulta: ${MSG_SEM_SITE}`} style={{ marginBottom: spacing.md }} />}
      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}
      {info && <Aviso tipo="sucesso" texto={info} style={{ marginBottom: spacing.md }} />}

      <Botao rotulo="Cadastrar funcionário" icone="person-add-outline" onPress={() => abrir(null)} style={{ marginBottom: spacing.lg }} />

      {!loading && equipe.length === 0 && !erro ? (
        <EmptyState icon="people-circle-outline" ilustracao="equipe" title="Nenhum funcionário cadastrado" subtitle="Cadastre a equipe só com o nome — cada pessoa entra com o código de acesso rápido que você gera." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {equipe.map(f => {
            const tags = tagsDe(f)
            return (
              <Card key={f.id_funcionario} style={{ gap: spacing.md }}>
                <View style={styles.topo}>
                  <Avatar nome={f.nome} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.nome, !f.ativo && styles.apagado]} numberOfLines={1}>{f.nome}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{f.cargo || 'Equipe'}{f.ativo ? '' : ' · Desativado'}</Text>
                  </View>
                  {podeEditar(f) && (
                    <Interruptor
                      value={f.ativo}
                      disabled={alterando === f.id_funcionario}
                      onValueChange={v => pedirAlternar(f, v)}
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

                {/* O titular gera pra qualquer um; um administrador, só pra
                    funcionário comum (a mesma regra do painel e do banco). */}
                {podeEditar(f) && f.ativo && (
                  <Botao rotulo="Código de acesso" icone="keypad-outline" variante="secundario" compacto onPress={() => abrirCodigo(f)} />
                )}
                {podeEditar(f) && (
                  <Botao rotulo="Editar dados e permissões" icone="create-outline" variante="secundario" compacto onPress={() => abrir(f)} />
                )}
              </Card>
            )
          })}
        </View>
      )}

      <Folha visivel={painel} titulo={editando ? 'Editar funcionário' : 'Cadastrar funcionário'} onFechar={() => setPainel(false)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo
          rotulo="Nome"
          value={nome}
          onChangeText={setNome}
          maxLength={120}
          autoCapitalize="words"
          ajuda={editando ? undefined : 'Só o nome basta: a pessoa entra com o código de acesso rápido que você gera.'}
        />
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

        <Botao rotulo={editando ? 'Salvar' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
        {editando && <Botao rotulo="Excluir da equipe" icone="trash-outline" variante="perigo" onPress={() => pedirExclusao(editando)} desativado={salvando} />}
      </Folha>

      <Folha visivel={!!codigoDe} titulo="Código de acesso rápido" onFechar={fecharCodigo}>
        <Text style={styles.sub}>
          Código de <Text style={styles.forte}>{codigoDe?.nome}</Text>. Na tela de entrar, em &quot;Código de acesso rápido&quot;, basta digitar estes 6 números — não precisa de e-mail nem senha.
        </Text>
        {erroCodigo && <Aviso tipo="erro" texto={erroCodigo} />}
        {codigo ? (
          <View style={styles.codigoCaixa}>
            <Text style={styles.codigo} selectable>{codigo}</Text>
            <Text style={styles.sub}>
              {gerando ? 'Gerando um novo...' : `Vale por mais ${tempoRestante}s · uso único`}
            </Text>
          </View>
        ) : gerando ? (
          <View style={styles.codigoCaixa}><Text style={styles.sub}>Gerando código...</Text></View>
        ) : (
          <Botao rotulo="Tentar de novo" onPress={() => codigoDe && gerarCodigo(codigoDe.id_funcionario)} />
        )}
        {!!codigo && (
          <Botao
            rotulo={copiado === codigo ? 'Copiado' : 'Copiar código'}
            icone={copiado === codigo ? 'checkmark' : 'copy-outline'}
            onPress={copiarCodigo}
            desativado={gerando}
          />
        )}
        <Botao rotulo="Fechar" variante="secundario" onPress={fecharCodigo} />
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
  forte: { fontWeight: '700', color: colors.text },
  codigoCaixa: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  codigo: { fontSize: 40, fontWeight: '800', letterSpacing: 10, color: colors.primary600, fontVariant: ['tabular-nums'] },
})
