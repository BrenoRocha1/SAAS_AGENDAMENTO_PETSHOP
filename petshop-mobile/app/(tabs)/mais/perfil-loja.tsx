import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { TrocarFoto, acoesLogoLoja } from '@/components/TrocarFoto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { formatarEnderecoLoja, formatarTelefone } from '@/lib/format'
import { mascaraCep, mascaraTelefone, soDigitos } from '@/lib/mascaras'
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

  const [editando, setEditando] = useState(false)
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
        <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erroCarga ?? undefined} />
      </ScreenContainer>
    )
  }

  const l = loja

  function abrirEdicao() {
    setNome(l.nome_loja)
    setTelefone(mascaraTelefone(l.telefone ?? ''))
    setDescricao(l.descricao ?? '')
    setCep(mascaraCep(l.cep ?? ''))
    setEndereco(l.endereco ?? '')
    setNumero(l.numero ?? '')
    setComplemento(l.complemento ?? '')
    setBairro(l.bairro ?? '')
    setCidade(l.cidade ?? '')
    setEstado(l.estado ?? '')
    setErro(null)
    setSalvo(false)
    setEditando(true)
  }

  // CEP completo: preenche rua, bairro, cidade e UF (ViaCEP), como no painel.
  async function aoMudarCep(texto: string) {
    const mascarado = mascaraCep(texto)
    setCep(mascarado)
    const digitos = soDigitos(mascarado)
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const d = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (!d.erro) {
        if (d.logradouro) setEndereco(d.logradouro)
        if (d.bairro) setBairro(d.bairro)
        if (d.localidade) setCidade(d.localidade)
        if (d.uf) setEstado(d.uf)
      }
    } catch {
      // sem internet ou CEP fora do ar: a pessoa preenche à mão
    }
    setBuscandoCep(false)
  }

  async function salvar() {
    if (nome.trim().length < 2) return setErro('Informe o nome da loja.')
    if (soDigitos(telefone).length < 10) return setErro('Informe o telefone com DDD.')
    if (endereco.trim() && !numero.trim()) return setErro('Informe o número da loja (use S/N se não tiver).')
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
    setEditando(false)
    carregar()
  }

  if (editando) {
    return (
      <ScreenContainer>
        <DetailHeader title="Editar dados da loja" />
        <View style={{ gap: spacing.md }}>
          <Campo rotulo="Nome da loja" value={nome} onChangeText={setNome} maxLength={120} />
          <Campo rotulo="Telefone / WhatsApp" value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" maxLength={15} />
          <Campo rotulo="Descrição (opcional)" value={descricao} onChangeText={setDescricao} maxLength={500} multiline ajuda="Aparece para o cliente na página da loja." />

          <Text style={styles.secao}>Endereço</Text>
          <Campo
            rotulo="CEP"
            value={cep}
            onChangeText={aoMudarCep}
            keyboardType="number-pad"
            maxLength={9}
            ajuda={buscandoCep ? 'Buscando o endereço…' : 'Com o CEP completo, rua, bairro e cidade são preenchidos.'}
          />
          <Campo rotulo="Rua" value={endereco} onChangeText={setEndereco} maxLength={150} />
          <View style={styles.duas}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Número" value={numero} onChangeText={setNumero} maxLength={20} placeholder="S/N" />
            </View>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Complemento" value={complemento} onChangeText={setComplemento} maxLength={80} />
            </View>
          </View>
          <Campo rotulo="Bairro" value={bairro} onChangeText={setBairro} maxLength={80} />
          <View style={styles.duas}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Cidade" value={cidade} onChangeText={setCidade} maxLength={80} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="UF" value={estado} onChangeText={t => setEstado(t.toUpperCase())} autoCapitalize="characters" maxLength={2} />
            </View>
          </View>

          {erro && <Aviso tipo="erro" texto={erro} />}
          <Botao rotulo="Salvar" onPress={salvar} carregando={salvando} />
          <Botao rotulo="Voltar sem salvar" variante="secundario" onPress={() => setEditando(false)} desativado={salvando} />
        </View>
      </ScreenContainer>
    )
  }

  const localizacao = formatarEnderecoLoja(l)

  return (
    <ScreenContainer>
      <DetailHeader title="Dados da loja" />

      <View style={styles.perfil}>
        {podeEditar ? (
          <TrocarFoto
            nome={l.nome_loja}
            fotoUrl={l.logo_url}
            rotulo="logo"
            enviar={acoesLogoLoja.enviar}
            remover={acoesLogoLoja.remover}
            onMudou={url => setLoja({ ...l, logo_url: url })}
          />
        ) : (
          <Avatar nome={l.nome_loja} fotoUrl={l.logo_url} size={84} />
        )}
        <Text style={styles.nome}>{l.nome_loja}</Text>
        {l.descricao ? <Text style={styles.descricao}>{l.descricao}</Text> : null}
      </View>

      {salvo && <Aviso tipo="sucesso" texto="Dados da loja salvos." style={{ marginBottom: spacing.md }} />}

      <Card style={styles.infoCard}>
        <InfoRow icon="call-outline" label="Telefone" valor={formatarTelefone(l.telefone)} />
        <InfoRow icon="mail-outline" label="E-mail" valor={l.email} />
        <InfoRow icon="location-outline" label="Endereço" valor={localizacao || '—'} />
      </Card>

      {podeEditar ? (
        <Botao rotulo="Editar dados" icone="create-outline" style={{ marginTop: spacing.lg }} onPress={abrirEdicao} />
      ) : (
        <Aviso
          tipo="info"
          style={{ marginTop: spacing.lg }}
          texto={contexto?.acessoTotal ? 'Para editar os dados da loja pelo app, configure o endereço do site (EXPO_PUBLIC_SITE_URL).' : 'Só o responsável pela conta ou um administrador edita os dados da loja.'}
        />
      )}
    </ScreenContainer>
  )
}

function InfoRow({ icon, label, valor }: { icon: keyof typeof Ionicons.glyphMap; label: string; valor: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textFaint} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  perfil: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  nome: { ...typography.heading.lg, color: colors.text, textAlign: 'center' },
  descricao: { ...typography.body.md, color: colors.textMuted, textAlign: 'center' },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.sm },
  duas: { flexDirection: 'row', gap: spacing.md },
  infoCard: { gap: spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  infoLabel: { ...typography.body.sm, color: colors.textMuted, width: 76, marginTop: 2 },
  infoValor: { ...typography.body.lg, color: colors.text, flex: 1 },
})
