import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { IconSave, IconTrash } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao } from '@/lib/acoes'
import { mensagemDoBanco } from '@/lib/erros'
import { mascaraCpf, mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

// O que a exclusão da conta faz — a mesma lista do site.
const O_QUE_ACONTECE = [
  'Seu cadastro (nome, CPF, e-mail e telefone), seus pets e fotos e suas avaliações são apagados.',
  'Agendamentos que ainda estavam marcados são cancelados, e planos ativos param de cobrar.',
  'As lojas mantêm só o registro dos atendimentos e pagamentos já feitos, sem seu nome, endereço ou observações (exigência fiscal).',
  'Você sai do sistema e não consegue mais entrar com esta conta.',
]

// Perfil do cliente — a mesma página do site (/cliente/perfil): nome e
// telefone são editáveis; o e-mail é o login e o CPF é documento, nenhum dos
// dois muda por aqui. Embaixo, a exclusão da conta (LGPD), pela mesma action
// do site.
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
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current) }, [])

  async function salvar() {
    if (!idCliente) return
    if (nome.trim().length < 2) return setErro('Nome muito curto')
    const tel = soDigitos(telefone)
    if (tel.length < 10) return setErro('Telefone inválido')
    setErro(null)
    setSalvo(false)
    setSalvando(true)
    const { data, error } = await supabase.from('cliente').update({ nome: nome.trim(), telefone: tel }).eq('id_cliente', idCliente).select('id_cliente')
    setSalvando(false)
    if (error || !data || data.length === 0) return setErro(error ? mensagemDoBanco(error, 'Erro ao atualizar o perfil.') : 'Não foi possível salvar o perfil.')
    setSalvo(true)
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = setTimeout(() => setSalvo(false), 3000)
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

      <View style={styles.cartao}>
        {erro && <Aviso tipo="erro" texto={erro} style={styles.aviso} />}
        {salvo && <Aviso tipo="sucesso" texto="Perfil atualizado com sucesso!" style={styles.aviso} />}

        <View style={styles.formulario}>
          <Campo rotulo="Nome" obrigatorio value={nome} onChangeText={setNome} maxLength={120} autoCapitalize="words" />
          <Campo
            rotulo="Telefone"
            obrigatorio
            value={telefone}
            onChangeText={t => setTelefone(mascaraTelefone(t))}
            placeholder="(11) 99999-9999"
            keyboardType="phone-pad"
            maxLength={15}
          />
          <View style={styles.fixos}>
            <Campo rotulo="E-mail" value={email || user?.email || ''} editable={false} ajuda="O e-mail não pode ser alterado" />
            <Campo rotulo="CPF" value={cpf ? mascaraCpf(cpf) : ''} editable={false} />
          </View>
          <View style={styles.rodape}>
            <BotaoPequeno
              normal
              variante="primario"
              rotulo={salvando ? 'Salvando...' : 'Salvar alterações'}
              icone={salvando ? undefined : IconSave}
              desativado={salvando}
              onPress={salvar}
            />
          </View>
        </View>
      </View>

      <View style={[styles.cartao, styles.excluir]}>
        <Text style={styles.excluirTitulo}>Excluir minha conta</Text>
        <Text style={styles.excluirTexto}>Apaga seus dados pessoais de vez (direito previsto na LGPD). Não dá para desfazer.</Text>

        {!excluindoAberto ? (
          <BotaoPequeno
            variante="fantasmaPerigo"
            rotulo="Quero excluir minha conta"
            icone={IconTrash}
            onPress={() => setExcluindoAberto(true)}
            style={styles.querExcluir}
          />
        ) : (
          <View style={styles.aberto}>
            <View>
              <Text style={styles.oQueAcontece}>O que acontece:</Text>
              <View style={styles.lista}>
                {O_QUE_ACONTECE.map(item => (
                  <View key={item} style={styles.item}>
                    <View style={styles.marca} />
                    <Text style={styles.itemTexto}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} />}
            {erroExcluir && <Aviso tipo="erro" texto={erroExcluir} />}

            <Campo
              rotulo="Digite EXCLUIR para confirmar"
              value={confirmacao}
              onChangeText={setConfirmacao}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!excluindo}
            />
            <View style={styles.botoes}>
              <BotaoPequeno
                variante="perigo"
                rotulo={excluindo ? 'Excluindo...' : 'Excluir minha conta'}
                desativado={!confirmado || excluindo}
                onPress={excluirConta}
                // Desativado, o `.btn` do site fica a 50%.
                style={(!confirmado || excluindo) && styles.parado}
              />
              <BotaoPequeno
                variante="fantasma"
                rotulo="Voltar"
                desativado={excluindo}
                onPress={() => { setExcluindoAberto(false); setConfirmacao(''); setErroExcluir(null) }}
              />
            </View>
          </View>
        )}
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  cartao: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  aviso: { marginBottom: 20 },
  formulario: { gap: 16 },
  // E-mail e CPF (o `.form-grid-2` do site, que no celular vira uma coluna).
  fixos: { gap: 12 },
  rodape: { alignItems: 'flex-end' },
  // `.excluir-conta`: 32 abaixo do cartão do perfil.
  excluir: { marginTop: 32 },
  excluirTitulo: { fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 20, fontWeight: '700', color: colors.dangerFg },
  excluirTexto: { fontSize: 14, lineHeight: 20, color: '#858d99', marginTop: 8 },
  querExcluir: { alignSelf: 'flex-start', marginTop: 12 },
  aberto: { marginTop: 16, gap: 12 },
  oQueAcontece: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#4b5563' },
  lista: { marginTop: 4 },
  // Item de lista: a bolinha na margem de 20, como o `<li>` do navegador.
  item: { flexDirection: 'row' },
  marca: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4b5563', marginLeft: 7, marginRight: 8, marginTop: 7.5 },
  itemTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: '#4b5563' },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  parado: { opacity: 0.5 },
})
