import { useCallback, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Botao } from '@/components/Botao'
import { FolhaPet } from '@/components/FolhaPet'
import { TrocarFoto, acoesFotoPet } from '@/components/TrocarFoto'
import { PlanosDoPet } from '@/components/PlanosDoPet'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { acoesDisponiveis } from '@/lib/acoes'
import { supabase } from '@/lib/supabase'
import { colors, spacing, typography } from '@/theme/theme'

interface PetDetalhe {
  id_pet: string
  nome: string
  raca: string
  sexo: string
  especie: string | null
  porte: string | null
  dt_nasc: string
  peso: number | null
  obs: string | null
  foto_url: string | null
  cliente: { id_cliente: string; nome: string } | null
}

export default function PetDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const [pet, setPet] = useState<PetDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  // Muda quando o pet é editado aqui: recarrega a ficha sem sair dela.
  const [versao, setVersao] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let ativo = true
      async function carregar() {
        if (versao === 0) setLoading(true)
        setErro(null)
        const { data, error } = await supabase
          .from('pet')
          .select(`
            id_pet, nome, raca, sexo, especie, porte, dt_nasc, peso, obs, foto_url,
            cliente:id_cliente ( id_cliente, nome )
          `)
          .eq('id_pet', id)
          .maybeSingle()
        if (!ativo) return
        if (error || !data) {
          setErro('Não foi possível carregar este pet.')
        } else {
          setPet(data as unknown as PetDetalhe)
        }
        setLoading(false)
      }
      carregar()
      return () => {
        ativo = false
      }
    }, [id, versao])
  )

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Pet" />
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary600} />
        </View>
      </ScreenContainer>
    )
  }

  if (erro || !pet) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Pet" />
        <EmptyState icon="alert-circle-outline" ilustracao="nao-encontrado" title="Pet não encontrado" subtitle={erro ?? undefined} />
      </ScreenContainer>
    )
  }

  const nascimento = safeFormatDate(pet.dt_nasc)
  const comSite = acoesDisponiveis()
  // A foto do pet, pela loja, só o responsável pela conta troca (mesma
  // regra da action do painel web).
  const podeTrocarFoto = comSite && contexto?.role === 'lojista'
  const fotoPet = acoesFotoPet(pet.id_pet)

  return (
    <ScreenContainer>
      <DetailHeader title={pet.nome} junto />

      <View style={styles.perfil}>
        {podeTrocarFoto ? (
          <TrocarFoto
            nome={pet.nome}
            fotoUrl={pet.foto_url}
            enviar={fotoPet.enviar}
            remover={fotoPet.remover}
            onMudou={url => setPet({ ...pet, foto_url: url })}
          />
        ) : (
          <Avatar nome={pet.nome} fotoUrl={pet.foto_url} size={72} />
        )}
        <Text style={styles.nome}>{pet.nome}</Text>
        <Text style={styles.subtitulo}>
          {[pet.especie, pet.raca].filter(Boolean).join(' • ')}
        </Text>
      </View>

      <Card style={styles.infoCard}>
        {/* Os mesmos ícones da ficha do pet no site. */}
        <InfoRow icon="people-outline" label="Sexo" valor={pet.sexo} />
        <InfoRow icon="options-outline" label="Porte" valor={pet.porte ?? '—'} />
        <InfoRow icon="calendar-outline" label="Nascimento" valor={nascimento} />
        <InfoRow icon="cube-outline" label="Peso" valor={pet.peso ? `${pet.peso} kg` : '—'} />
      </Card>

      {pet.obs && (
        <Card style={styles.obsCard}>
          <Text style={styles.obsLabel}>Observações</Text>
          <Text style={styles.obsTexto}>{pet.obs}</Text>
        </Card>
      )}

      {comSite && contexto?.acessoTotal && (
        <Botao
          rotulo="Editar dados do pet"
          icone="create-outline"
          variante="secundario"
          style={{ marginBottom: spacing.lg }}
          onPress={() => setEditando(true)}
        />
      )}

      {contexto && (contexto.podeGerenciarAgenda || contexto.acessoTotal) && (
        <PlanosDoPet idPet={pet.id_pet} idLojista={contexto.idLojista} podeVincular={contexto.acessoTotal} />
      )}

      {pet.cliente && (
        <>
          <Text style={styles.secaoTitulo}>Tutor</Text>
          <Card style={styles.tutorCard} onPress={() => router.push(`/clientes/${pet.cliente!.id_cliente}`)}>
            <Avatar nome={pet.cliente.nome} size={40} />
            <Text style={styles.tutorNome}>{pet.cliente.nome}</Text>
            <IconeApp name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        </>
      )}

      {contexto && pet.cliente && (
        <FolhaPet
          visivel={editando}
          idLojista={contexto.idLojista}
          pet={{ ...pet, id_cliente: pet.cliente.id_cliente }}
          podeTrocarFoto={podeTrocarFoto}
          onFoto={url => setPet({ ...pet, foto_url: url })}
          onFechar={() => setEditando(false)}
          onSalvo={() => { setEditando(false); setVersao(v => v + 1) }}
        />
      )}
    </ScreenContainer>
  )
}

function safeFormatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return '—'
  }
}

function InfoRow({ icon, label, valor }: { icon: keyof typeof Ionicons.glyphMap; label: string; valor: string }) {
  return (
    <View style={styles.infoRow}>
      <IconeApp name={icon} size={16} color={colors.textFaint} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor} numberOfLines={1}>
        {valor}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  perfil: { alignItems: 'center', marginBottom: spacing.lg, gap: 4 },
  // `.tela-app-perfil strong` do site: 22 com a altura de linha do texto (1,6).
  nome: { fontSize: 22, lineHeight: 35.2, fontWeight: '700', letterSpacing: -0.2, color: colors.text, textAlign: 'center', marginTop: 4 },
  subtitulo: { ...typography.body.lg, color: colors.textMuted },
  infoCard: { gap: spacing.md, marginBottom: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoLabel: { ...typography.body.sm, color: colors.textMuted, width: 90 },
  infoValor: { ...typography.body.lg, color: colors.text, flex: 1 },
  obsCard: { marginBottom: spacing.lg },
  obsLabel: { ...typography.label.md, color: colors.textDim, marginBottom: spacing.md },
  obsTexto: { ...typography.body.lg, color: colors.text },
  secaoTitulo: { ...typography.heading.sm, color: colors.text, marginBottom: spacing.md },
  tutorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tutorNome: { flex: 1, ...typography.body.lg, fontWeight: '700', color: colors.text },
})
