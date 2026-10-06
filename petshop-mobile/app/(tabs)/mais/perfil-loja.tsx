import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { FolhaConfirmar } from '@/components/FolhaConfirmar'
import { IconImage, IconPencil, IconPlus, IconSave, IconSettings, IconTrash } from '@/components/IconesDoSite'
import { acoesLogoLoja } from '@/components/TrocarFoto'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { acoesDisponiveis, chamarAcao, form, type Arquivo } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { formatarEnderecoLoja, formatarTelefone } from '@/lib/format'
import { escolherImagem } from '@/lib/imagem'
import { mascaraCep, mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, spacing, typography } from '@/theme/theme'
import type { LojistaInfo } from '@/types/database'

type Loja = LojistaInfo & { descricao?: string | null; cep?: string | null }

// Dados da loja (tabela `lojista`, a mesma do dashboard). Dono e
// administrador editam — pela mesma action do painel web
// (atualizarPerfilLojistaAction); os demais só consultam.
export default function PerfilLojaScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const podeEditar = !!contexto?.acessoTotal && acoesDisponiveis()
  const [loja, setLoja] = useState<Loja | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const router = useRouter()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [descricao, setDescricao] = useState('')
  const [cep, setCep] = useState('')
  const [endereco, setEndereco] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState<string | null>(null)
  // Imagem da loja: a escolhida fica em prévia até "Salvar imagem".
  const [pendente, setPendente] = useState<{ arquivo: Arquivo; uri: string } | null>(null)
  const [erroLogo, setErroLogo] = useState<string | null>(null)
  const [avisoLogo, setAvisoLogo] = useState<string | null>(null)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
  // O formulário é preenchido uma vez, quando os dados chegam.
  const preenchido = useRef(false)

  const carregar = useCallback(async () => {
    if (!idLojista) return
    const { data, error } = await supabase
      .from('lojista')
      // '*' de propósito: número/complemento/bairro (migration 045)
      // vêm quando existem, sem quebrar a tela antes da migration.
      .select('*')
      .eq('id_lojista', idLojista)
      .maybeSingle()
    if (error || !data) setErroCarga('Não foi possível carregar os dados da loja.')
    else {
      setErroCarga(null)
      setLoja(data as Loja)
    }
    setLoading(false)
  }, [idLojista])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  useEffect(() => {
    if (!loja || preenchido.current) return
    preenchido.current = true
    setNome(loja.nome_loja)
    setTelefone(mascaraTelefone(loja.telefone ?? ''))
    setDescricao(loja.descricao ?? '')
    setCep(mascaraCep(loja.cep ?? ''))
    setEndereco(loja.endereco ?? '')
    setNumero(loja.numero ?? '')
    setComplemento(loja.complemento ?? '')
    setBairro(loja.bairro ?? '')
    setCidade(loja.cidade ?? '')
    setEstado(loja.estado ?? '')
  }, [loja])

  // "Perfil atualizado com sucesso!" e os avisos da imagem somem em 3 segundos.
  useEffect(() => {
    if (!salvo && !avisoLogo) return
    const t = setTimeout(() => { setSalvo(false); setAvisoLogo(null) }, 3000)
    return () => clearTimeout(t)
  }, [salvo, avisoLogo])

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Dados da loja" />
        <View style={styles.centro}><ActivityIndicator color={colors.primary600} /></View>
      </ScreenContainer>
    )
  }

  if (erroCarga || !loja) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Dados da loja" />
        <EmptyState icon="alert-circle-outline" ilustracao="erro" title="Não foi possível carregar" subtitle={erroCarga ?? undefined} />
      </ScreenContainer>
    )
  }

  const l = loja

  // CEP completo: preenche rua, bairro, cidade e UF (ViaCEP), como no painel.
  async function aoMudarCep(texto: string) {
    const mascarado = mascaraCep(texto)
    setCep(mascarado)
    setErroCep(null)
    const digitos = soDigitos(mascarado)
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const d = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (d.erro) {
        setErroCep('CEP não encontrado. Preencha o endereço manualmente.')
      } else {
        if (d.logradouro) setEndereco(d.logradouro)
        if (d.bairro) setBairro(d.bairro)
        if (d.localidade) setCidade(d.localidade)
        if (d.uf) setEstado(d.uf)
      }
    } catch {
      setErroCep('Não foi possível buscar o CEP. Preencha o endereço manualmente.')
    }
    setBuscandoCep(false)
  }

  async function salvar() {
    setSalvo(false)
    if (nome.trim().length < 2) return setErro('Informe o nome da loja.')
    if (soDigitos(telefone).length < 10) return setErro('Informe o telefone com DDD.')
    if (endereco.trim() && !numero.trim()) return setErro('Informe o número da loja no campo Número (use S/N se não tiver).')
    setErro(null)
    setSalvando(true)
    const r = await chamarAcao('atualizarPerfilLojistaAction', form({
      nome_loja: nome.trim(),
      telefone: soDigitos(telefone),
      descricao: descricao.trim(),
      cep: soDigitos(cep),
      endereco: endereco.trim(),
      numero: numero.trim(),
      complemento: complemento.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      estado: estado.trim().toUpperCase(),
    }))
    setSalvando(false)
    if (r.error) return setErro(r.error)
    setSalvo(true)
    carregar()
  }

  // ── Imagem da loja ──
  async function escolher(origem: 'galeria' | 'camera') {
    setErroLogo(null)
    setAvisoLogo(null)
    const escolhida = await escolherImagem(origem)
    if (!escolhida) return
    if ('erro' in escolhida) return setErroLogo(escolhida.erro)
    setPendente(escolhida)
  }

  function pedirImagem() {
    // No navegador só existe o seletor de arquivos.
    if (Platform.OS === 'web') return void escolher('galeria')
    dialogo('Imagem da loja', 'De onde vem a imagem?', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Tirar foto', onPress: () => escolher('camera') },
      { text: 'Escolher das fotos', onPress: () => escolher('galeria') },
    ])
  }

  async function salvarImagem() {
    if (!pendente) return
    setErroLogo(null)
    setEnviandoLogo(true)
    const r = await acoesLogoLoja.enviar(pendente.arquivo)
    setEnviandoLogo(false)
    if (r.error) return setErroLogo(r.error)
    setPendente(null)
    setLoja({ ...l, logo_url: r.url ?? null })
    setAvisoLogo('Imagem da loja atualizada com sucesso!')
  }

  async function removerImagem() {
    setErroLogo(null)
    setEnviandoLogo(true)
    const r = await acoesLogoLoja.remover()
    setEnviandoLogo(false)
    setConfirmandoRemocao(false)
    if (r.error) return setErroLogo(r.error)
    setLoja({ ...l, logo_url: null })
    setAvisoLogo('Imagem removida.')
  }

  // Loja antiga (antes da migration 045) costuma ter o número colado na rua.
  const numeroNaRua = !numero.trim() && /\d/.test(endereco)
  const imagem = pendente?.uri ?? l.logo_url ?? null

  // Quem edita vê a página "Perfil da Loja" do site: o cartão da imagem e o formulário.
  if (podeEditar) {
    return (
      <ScreenContainer>
        <DetailHeader title="Dados da loja" />
        <Text style={styles.dica}>
          Procurando o Kanban ou o agendamento online? Isso agora fica em{' '}
          <Text style={styles.dicaLink} onPress={() => router.push('/mais/configuracoes')}>
            <IconSettings size={13} color={colors.primary600} /> Configurações
          </Text>.
        </Text>

        <View style={styles.pilha}>
          <View style={styles.cartao}>
            <Text style={styles.secaoTitulo}>Identidade Visual</Text>
            {erroLogo && <Aviso tipo="erro" texto={erroLogo} style={styles.avisoDaImagem} />}
            {avisoLogo && <Aviso tipo="sucesso" texto={avisoLogo} style={styles.avisoDaImagem} />}
            <View style={styles.imagemLinha}>
              <View style={styles.imagemCaixa}>
                {imagem ? <Image source={{ uri: imagem }} style={styles.imagem} /> : <IconImage size={28} color={colors.textFaint} />}
              </View>
              <View style={styles.imagemLado}>
                {!imagem && <Text style={styles.imagemTexto}>Adicione uma imagem para representar sua loja.</Text>}
                {pendente ? (
                  <View style={styles.imagemBotoes}>
                    <BotaoPequeno variante="primario" rotulo={enviandoLogo ? 'Enviando...' : 'Salvar imagem'} desativado={enviandoLogo} onPress={salvarImagem} />
                    <BotaoPequeno variante="fantasma" rotulo="Cancelar" desativado={enviandoLogo} onPress={() => setPendente(null)} />
                  </View>
                ) : (
                  <View style={styles.imagemBotoes}>
                    <BotaoPequeno rotulo={l.logo_url ? 'Alterar imagem' : 'Adicionar imagem'} icone={l.logo_url ? IconPencil : IconPlus} desativado={enviandoLogo} onPress={pedirImagem} />
                    {l.logo_url && <BotaoPequeno variante="fantasma" rotulo="Remover imagem" icone={IconTrash} desativado={enviandoLogo} onPress={() => setConfirmandoRemocao(true)} />}
                  </View>
                )}
                <Text style={styles.nota}>JPG, PNG ou WEBP · até 5 MB</Text>
              </View>
            </View>
          </View>

          <View style={styles.cartao}>
            {erro && <Aviso tipo="erro" texto={erro} style={styles.avisoDoForm} />}
            {salvo && <Aviso tipo="sucesso" texto="Perfil atualizado com sucesso!" style={styles.avisoDoForm} />}

            <Text style={styles.secaoTitulo}>Identificação</Text>
            <View style={styles.campos}>
              <Campo rotulo="Nome da Loja" obrigatorio value={nome} onChangeText={setNome} maxLength={150} />
              <Campo rotulo="Telefone" obrigatorio value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(11) 99999-9999" maxLength={15} />
              <Campo
                rotulo="Descrição"
                value={descricao}
                onChangeText={setDescricao}
                maxLength={500}
                multiline
                placeholder="Fale sobre seu petshop, especialidades, diferenciais..."
                ajuda="Máximo 500 caracteres"
                style={styles.descricaoCampo}
              />
            </View>

            <View style={styles.enderecoSecao}>
              <Text style={styles.secaoTitulo}>Endereço</Text>
              <View style={styles.campos}>
                <View style={styles.cep}>
                  <Campo rotulo="CEP" value={cep} onChangeText={aoMudarCep} keyboardType="number-pad" placeholder="00000-000" maxLength={9} />
                  <Text style={[styles.ajuda, erroCep ? styles.erroTexto : null]}>
                    {buscandoCep ? 'Buscando CEP...' : erroCep ?? 'Preenche a rua, o bairro e a cidade'}
                  </Text>
                </View>
                <View style={styles.duas}>
                  <View style={styles.cresce}>
                    <Campo rotulo="Rua" value={endereco} onChangeText={setEndereco} placeholder="Rua das Flores" maxLength={200} />
                  </View>
                  <View style={styles.numero}>
                    <Campo rotulo="Número" value={numero} onChangeText={setNumero} placeholder="123" maxLength={20} />
                  </View>
                </View>
                {numeroNaRua && (
                  <Text style={[styles.ajuda, styles.numeroNaRua]}>Parece que o número está junto da rua — tire ele de lá e coloque no campo Número.</Text>
                )}
                <Campo rotulo="Complemento" opcional value={complemento} onChangeText={setComplemento} placeholder="Loja 2, sala 3..." maxLength={80} />
                <Campo rotulo="Bairro" value={bairro} onChangeText={setBairro} maxLength={80} />
                <View style={styles.duas}>
                  <View style={styles.cresce}>
                    <Campo rotulo="Cidade" value={cidade} onChangeText={setCidade} maxLength={100} />
                  </View>
                  <View style={styles.uf}>
                    <Campo rotulo="UF" value={estado} onChangeText={t => setEstado(t.toUpperCase())} autoCapitalize="characters" placeholder="SP" maxLength={2} />
                  </View>
                </View>
              </View>
            </View>

            <BotaoPequeno normal variante="primario" icone={salvando ? undefined : IconSave} rotulo={salvando ? 'Salvando...' : 'Salvar alterações'} desativado={salvando} style={styles.salvar} onPress={salvar} />
          </View>
        </View>

        <FolhaConfirmar
          visivel={confirmandoRemocao}
          titulo="Remover imagem"
          pergunta="Tem certeza que deseja remover a imagem da loja?"
          rotulo="Remover"
          rotuloOcupado="Removendo..."
          ocupado={enviandoLogo}
          onConfirmar={removerImagem}
          onFechar={() => setConfirmandoRemocao(false)}
        />
      </ScreenContainer>
    )
  }

  const localizacao = formatarEnderecoLoja(l)

  return (
    <ScreenContainer>
      <DetailHeader title="Dados da loja" />

      <View style={styles.perfil}>
        <Avatar nome={l.nome_loja} fotoUrl={l.logo_url} size={84} />
        <Text style={styles.nome}>{l.nome_loja}</Text>
        {l.descricao ? <Text style={styles.descricao}>{l.descricao}</Text> : null}
      </View>

      <Card style={styles.infoCard}>
        <InfoRow icon="call-outline" label="Telefone" valor={formatarTelefone(l.telefone)} />
        <InfoRow icon="mail-outline" label="E-mail" valor={l.email} />
        <InfoRow icon="location-outline" label="Endereço" valor={localizacao || '—'} />
      </Card>

      <Aviso
        tipo="info"
        style={{ marginTop: spacing.lg }}
        texto={contexto?.acessoTotal ? 'Para editar os dados da loja pelo app, configure o endereço do site (EXPO_PUBLIC_SITE_URL).' : 'Só o responsável pela conta ou um administrador edita os dados da loja.'}
      />
    </ScreenContainer>
  )
}

function InfoRow({ icon, label, valor }: { icon: keyof typeof Ionicons.glyphMap; label: string; valor: string }) {
  return (
    <View style={styles.infoRow}>
      <IconeApp name={icon} size={16} color={colors.textFaint} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  perfil: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  // `.tela-app-perfil strong` do site: 22 com a altura de linha do texto (1,6).
  nome: { fontSize: 22, lineHeight: 35.2, fontWeight: '700', letterSpacing: -0.2, color: colors.text, textAlign: 'center', marginTop: 4 },
  descricao: { ...typography.body.md, color: colors.textMuted, textAlign: 'center' },
  // Página "Perfil da Loja" do site, em 375 de largura.
  // No site a engrenagem dentro da frase deixa o parágrafo 1,5 mais alto.
  dica: { fontSize: 14, lineHeight: 20, color: '#858d99', marginBottom: 21.5 },
  dicaLink: { color: colors.primary600 },
  pilha: { gap: 24 },
  cartao: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  secaoTitulo: { fontFamily: FONTE_TITULO, fontSize: 14, lineHeight: 17.5, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textDim, marginBottom: 16 },
  avisoDaImagem: { marginBottom: 16 },
  avisoDoForm: { marginBottom: 20 },
  imagemLinha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  imagemCaixa: {
    width: 96,
    height: 96,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagem: { width: '100%', height: '100%' },
  imagemLado: { flexGrow: 1, flexBasis: 200, minWidth: 200 },
  imagemTexto: { fontSize: 14, lineHeight: 20, color: '#858d99', marginBottom: 12 },
  imagemBotoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99', marginTop: 8 },
  campos: { gap: 12 },
  descricaoCampo: { minHeight: 90 },
  enderecoSecao: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.border },
  cep: { width: 220, gap: 4 },
  ajuda: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  erroTexto: { color: colors.dangerFg },
  numeroNaRua: { marginTop: -8 },
  duas: { flexDirection: 'row', gap: 16 },
  cresce: { flex: 1, minWidth: 0 },
  numero: { width: 130 },
  uf: { width: 110 },
  salvar: { alignSelf: 'flex-end', marginTop: 24 },
  infoCard: { gap: spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  infoLabel: { ...typography.body.sm, color: colors.textMuted, width: 76, marginTop: 2 },
  infoValor: { ...typography.body.lg, color: colors.text, flex: 1 },
})
