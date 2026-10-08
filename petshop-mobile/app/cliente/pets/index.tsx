import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { differenceInDays, differenceInMonths, differenceInYears } from 'date-fns'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { EmptyState } from '@/components/EmptyState'
import { PetCartao } from '@/components/PetCartao'
import { Aviso } from '@/components/Aviso'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Pet {
  id_pet: string
  nome: string
  raca: string
  especie: string | null
  porte: string | null
  foto_url: string | null
  sexo: string | null
  dt_nasc: string | null
}

// "3 anos", "1 ano", "5 meses", "20 dias" — a idade a partir do nascimento
// (curta, para caber na linha do card; a mesma conta do site).
function idadeDoPet(nascimento: string | null): string | null {
  if (!nascimento) return null
  const n = new Date(`${nascimento.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(n.getTime())) return null
  const hoje = new Date()
  const anos = differenceInYears(hoje, n)
  if (anos >= 1) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  const meses = differenceInMonths(hoje, n)
  if (meses >= 1) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const dias = differenceInDays(hoje, n)
  return dias < 1 ? 'recém-nascido' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

// Pets do cliente (tabela `pet`, só os dele e ativos).
export default function PetsClienteScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const idCliente = user?.id
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idCliente) return
    const { data, error } = await supabase
      .from('pet')
      .select('id_pet, nome, raca, especie, porte, foto_url, sexo, dt_nasc')
      .eq('id_cliente', idCliente)
      .eq('ativo', true)
      .order('nome')
    setErro(error ? 'Não foi possível carregar os seus pets.' : null)
    setPets((data ?? []) as Pet[])
    setLoading(false)
  }, [idCliente])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  return (
    <ScreenContainer
      refreshing={loading}
      onRefresh={carregar}
      topo={<BarraTopo rotuloMenu="Menu" onMenu={() => router.push('/cliente/menu' as never)} />}
    >
      <View style={styles.cabecalho}>
        <Text style={styles.h1}>Meus pets</Text>
        <Pressable
          onPress={() => router.push('/cliente/pets/novo' as never)}
          accessibilityRole="button"
          accessibilityLabel="Novo pet"
          style={({ pressed }) => [styles.novo, pressed && { opacity: 0.8 }]}
        >
          <IconeApp name="add" size={18} color={colors.white} />
          <Text style={styles.novoTexto}>Novo</Text>
        </Pressable>
      </View>

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {!loading && pets.length === 0 && !erro ? (
        <EmptyState icon="paw-outline" ilustracao="pets" title="Nenhum pet cadastrado" subtitle="Cadastre o seu pet para poder agendar." />
      ) : (
        // Os pets em cards com a foto em cima, dois por linha (a mesma grade
        // do site): cada caixa tem 50% e 6 de respiro em volta (12 de vão).
        <View style={styles.grade}>
          {pets.map(p => (
            <View key={p.id_pet} style={styles.caixa}>
              <PetCartao
                pet={p}
                detalhe={[p.sexo, idadeDoPet(p.dt_nasc)].filter(Boolean).join(' · ') || null}
                onPress={() => router.push(`/cliente/pets/${p.id_pet}` as never)}
              />
            </View>
          ))}
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  // `.tela-app-titulo` do site: 12 até o que vem embaixo.
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  h1: { ...typography.heading.xl, color: colors.text },
  novo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary600,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  novoTexto: { ...typography.label.md, color: colors.white },
  grade: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  caixa: { width: '50%', padding: 6 },
})
