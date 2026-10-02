import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao } from '@/lib/acoes'
import { mensagemDoBanco } from '@/lib/erros'
import { mascaraCpf, mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { colors, spacing, typography } from '@/theme/theme'

// Perfil do cliente: nome e telefone são editáveis; o e-mail é o login e o
// CPF é documento — nenhum dos dois muda por aqui. Embaixo, a exclusão da
// conta (LGPD), pela mesma action do site.
export default function PerfilClienteScreen() {
  const { user, signOut } = useAuth()
  const idCliente = user?.id
  const [carregado, setCarregado] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Excluir conta.
  const [excluindoAberto, setExcluindoAberto] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  useEffect(() => {
    if (!idCliente) return
    let cancelado = false
    supabase.from('cliente').select('nome, telefone, cpf, email').eq('id_cliente', idCliente).maybeSingle().then(({ data }) => {
      if (cancelado) return
      const c = data as { nome: string; telefone: string; cpf: string; email: string } | null
      setNome(c?.nome ?? '')
      setTelefone(mascaraTelefone(c?.telefone ?? ''))
      setCpf(c?.cpf ?? '')
      setEmail(c?.email ?? '')
      setCarregado(true)
    })
    return () => { cancelado = true }
  }, [idCliente])

  async function salvar() {
    if (!idCliente) return
    if (nome.trim().length < 2) return setErro('Informe o seu nome.')
    const tel = soDigitos(telefone)
    if (tel.length < 10) return setErro('Informe o telefone com DDD.')
    setErro(null)
    setSalvo(false)
    setSalvando(true)
    const { data, error } = await supabase.from('cliente').update({ nome: nome.trim(), telefone: tel }).eq('id_cliente', idCliente).select('id_cliente')
    setSalvando(false)
    if (error || !data || data.length === 0) return setErro(error ? mensagemDoBanco(error, 'Erro ao atualizar o perfil.') : 'Não foi possível salvar o perfil.')
    setSalvo(true)
  }

  async function excluirConta() {
    setErroExcluir(null)
    setExcluindo(true)
    const r = await chamarAcao('excluirMinhaContaAction', confirmacao)
    if (r.error) {
      setExcluindo(false)
      return setErroExcluir(r.error)
    }
    // A conta não existe mais: tira a sessão deste aparelho.
    await signOut()
  }

  if (!carregado) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Meu perfil" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary600} /></View>
      </ScreenContainer>
    )
  }

  const confirmado = confirmacao.trim().toUpperCase() === 'EXCLUIR'

  return (
    <ScreenContainer>
      <DetailHeader title="Meu perfil" />

      <View style={{ gap: spacing.md }}>
        <Campo rotulo="Nome" value={nome} onChangeText={t => { setNome(t); setSalvo(false) }} maxLength={120} autoCapitalize="words" />
        <Campo rotulo="Telefone / WhatsApp" value={telefone} onChangeText={t => { setTelefone(mascaraTelefone(t)); setSalvo(false) }} keyboardType="phone-pad" maxLength={15} />
        <Card style={{ gap: 4 }}>
          <Text style={styles.textoPequeno}>E-mail (login)</Text>
          <Text style={styles.valor}>{email || user?.email}</Text>
          <Text style={[styles.textoPequeno, { marginTop: spacing.sm }]}>CPF</Text>
          <Text style={styles.valor}>{cpf ? mascaraCpf(cpf) : '—'}</Text>
        </Card>
        {erro && <Aviso tipo="erro" texto={erro} />}
        {salvo && <Aviso tipo="sucesso" texto="Perfil atualizado." />}
        <Botao rotulo="Salvar" onPress={salvar} carregando={salvando} />
      </View>

      <Card style={styles.excluir}>
        <Text style={styles.excluirTitulo}>Excluir minha conta</Text>
        <Text style={styles.texto}>Apaga seus dados pessoais de vez (direito previsto na LGPD). Não dá para desfazer.</Text>

        {!excluindoAberto ? (
          <Botao rotulo="Quero excluir minha conta" icone="trash-outline" variante="perigo" compacto onPress={() => setExcluindoAberto(true)} />
        ) : (
          <>
            <Text style={styles.texto}>
              O que acontece:{'\n'}
              • Seu cadastro (nome, CPF, e-mail e telefone), seus pets e fotos e suas avaliações são apagados.{'\n'}
              • Agendamentos que ainda estavam marcados são cancelados, e planos ativos param de cobrar.{'\n'}
              • As lojas mantêm só o registro dos atendimentos e pagamentos já feitos, sem seu nome, endereço ou observações (exigência fiscal).{'\n'}
              • Você sai do app e não consegue mais entrar com esta conta.
            </Text>
            {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} />}
            {erroExcluir && <Aviso tipo="erro" texto={erroExcluir} />}
            <Campo rotulo="Digite EXCLUIR para confirmar" value={confirmacao} onChangeText={setConfirmacao} autoCapitalize="characters" autoCorrect={false} editable={!excluindo} />
            <Botao rotulo="Excluir minha conta" variante="perigo" onPress={excluirConta} carregando={excluindo} desativado={!confirmado} />
            <Botao rotulo="Voltar" variante="secundario" onPress={() => { setExcluindoAberto(false); setConfirmacao(''); setErroExcluir(null) }} desativado={excluindo} />
          </>
        )}
      </Card>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  texto: { ...typography.body.md, color: colors.textDim },
  textoPequeno: { ...typography.body.sm, color: colors.textMuted },
  valor: { ...typography.body.lg, color: colors.text },
  excluir: { marginTop: spacing['3xl'], gap: spacing.md, borderColor: '#fecaca' },
  excluirTitulo: { ...typography.heading.sm, color: colors.dangerFg },
})
