import { useCallback, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { formatarTelefone } from '@/lib/format'
import { colors, spacing, typography } from '@/theme/theme'

interface ClienteDetalhe {
  id_cliente: string
  nome: string
  telefone: string
  email: string
}

interface PetResumo {
  id_pet: string
  nome: string
  raca: string
  especie: string | null
  foto_url: string | null
}

export default function ClienteDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null)
  const [pets, setPets] = useState<PetResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // Editar nome/telefone (fn_editar_cliente_lojista, migration 019).
  const [painel, setPainel] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let ativo = true
      async function carregar() {
        setLoading(true)
        setErro(null)
        const [clienteRes, petsRes] = await Promise.all([
          supabase.from('cliente').select('id_cliente, nome, telefone, email').eq('id_cliente', id).maybeSingle(),
          supabase
            .from('pet')
            .select('id_pet, nome, raca, especie, foto_url')
            .eq('id_cliente', id)
            .eq('ativo', true)
            .order('nome'),
        ])
        if (!ativo) return
        if (clienteRes.error || !clienteRes.data) {
          setErro('Não foi possível carregar este cliente.')
        } else {
          setCliente(clienteRes.data)
          setPets((petsRes.data ?? []) as PetResumo[])
        }
        setLoading(false)
      }
      carregar()
      return () => {
        ativo = false
      }
    }, [id])
  )

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Cliente" />
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary600} />
        </View>
      </ScreenContainer>
    )
  }

  if (erro || !cliente) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Cliente" />
        <EmptyState icon="alert-circle-outline" ilustracao="nao-encontrado" title="Cliente não encontrado" subtitle={erro ?? undefined} />
      </ScreenContainer>
    )
  }

  const c = cliente
  const comSite = acoesDisponiveis()

  function abrirEdicao() {
    setNome(c.nome)
    setTelefone(mascaraTelefone(c.telefone))
    setErroPainel(null)
    setPainel(true)
  }

  async function salvarEdicao() {
    if (nome.trim().length < 2) return setErroPainel('Informe o nome.')
    const tel = soDigitos(telefone)
    if (tel.length < 10) return setErroPainel('Informe o telefone com DDD.')
    setErroPainel(null)
    setSalvando(true)
    const r = await chamarAcao('editarClienteLojistaAction', c.id_cliente, form({ nome: nome.trim(), telefone: tel }))
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setCliente({ ...c, nome: nome.trim(), telefone: tel })
    setPainel(false)
  }

  return (
    <ScreenContainer>
      <DetailHeader title={cliente.nome} />

      <View style={styles.perfil}>
        <Avatar nome={cliente.nome} size={72} />
        <Text style={styles.nome}>{cliente.nome}</Text>
      </View>

      <View style={styles.acoes}>
        <Pressable style={styles.acaoBotao} onPress={() => Linking.openURL(`tel:${cliente.telefone}`)}>
          <Ionicons name="call-outline" size={18} color={colors.primary600} />
          <Text style={styles.acaoTexto}>Ligar</Text>
        </Pressable>
        <Pressable
          style={styles.acaoBotao}
          onPress={() => Linking.openURL(`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`)}
        >
          <Ionicons name="logo-whatsapp" size={18} color={colors.primary600} />
          <Text style={styles.acaoTexto}>WhatsApp</Text>
        </Pressable>
      </View>

      {contexto?.podeGerenciarAgenda && (
        <Botao
          rotulo="Novo agendamento"
          icone="calendar-outline"
          style={{ marginBottom: spacing.lg }}
          onPress={() => router.push({ pathname: '/agendamentos/novo', params: { cliente: cliente.id_cliente } })}
        />
      )}

      <Card style={styles.infoCard}>
        <InfoRow icon="call-outline" label="Telefone" valor={formatarTelefone(cliente.telefone)} />
        <InfoRow icon="mail-outline" label="E-mail" valor={cliente.email} />
      </Card>

      {comSite && contexto?.acessoTotal && (
        <Botao rotulo="Editar nome e telefone" icone="create-outline" variante="secundario" style={{ marginBottom: spacing.lg }} onPress={abrirEdicao} />
      )}

      <View style={styles.secaoLinha}>
        <Text style={[styles.secaoTitulo, { marginBottom: 0 }]}>Pets ({pets.length})</Text>
        {comSite && contexto?.podeGerenciarAgenda && (
          <Botao
            rotulo="Novo pet"
            icone="add"
            variante="secundario"
            compacto
            onPress={() => router.push({ pathname: '/pets/novo', params: { cliente: c.id_cliente } })}
          />
        )}
      </View>
      {pets.length === 0 ? (
        <EmptyState icon="paw-outline" title="Nenhum pet cadastrado" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {pets.map(pet => (
            <Card key={pet.id_pet} style={styles.petCard} onPress={() => router.push(`/pets/${pet.id_pet}`)}>
              <Avatar nome={pet.nome} fotoUrl={pet.foto_url} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.petNome}>{pet.nome}</Text>
                <Text style={styles.petRaca}>{pet.raca}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Card>
          ))}
        </View>
      )}

      <Folha visivel={painel} titulo="Editar cliente" onFechar={() => setPainel(false)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Nome" value={nome} onChangeText={setNome} maxLength={120} autoCapitalize="words" />
        <Campo rotulo="Telefone" value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" maxLength={15} />
        <Text style={styles.petRaca}>O e-mail é o login do cliente e o CPF é documento — nenhum dos dois muda por aqui.</Text>
        <Botao rotulo="Salvar" onPress={salvarEdicao} carregando={salvando} />
      </Folha>
    </ScreenContainer>
  )
}

function InfoRow({ icon, label, valor }: { icon: keyof typeof Ionicons.glyphMap; label: string; valor: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textFaint} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor} numberOfLines={1}>
        {valor}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  perfil: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  nome: { ...typography.heading.lg, color: colors.text, textAlign: 'center' },
  acoes: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  acaoBotao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary50,
    borderRadius: 12,
    paddingVertical: spacing.md,
  },
  acaoTexto: { ...typography.label.md, color: colors.primary600 },
  infoCard: { gap: spacing.md, marginBottom: spacing['2xl'] },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoLabel: { ...typography.body.sm, color: colors.textMuted, width: 70 },
  infoValor: { ...typography.body.lg, color: colors.text, flex: 1 },
  secaoTitulo: { ...typography.heading.sm, color: colors.text, marginBottom: spacing.md },
  secaoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  petNome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  petRaca: { ...typography.body.sm, color: colors.textMuted },
})
