import { useCallback, useState, type ComponentType } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import {
  IconBell,
  IconCalendar,
  IconCar,
  IconChevronRight,
  IconClock,
  IconMoney,
  IconShield,
  IconStar,
  IconStore,
  type IconeProps,
} from '@/components/IconesDoSite'
import { SemPermissao } from '@/components/SemPermissao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { urlDoSite } from '@/lib/site'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

interface Selo {
  texto: string
  ativo: boolean
}

interface Item {
  icone: ComponentType<IconeProps>
  titulo: string
  descricao: string
  // Tela do app; sem ela, o item abre a página do site (`noSite`).
  rota?: string
  noSite?: string
  selos?: Selo[]
}

// Configurações da loja: o MESMO índice do site
// (petshop-app/src/app/lojista/configuracoes/page.tsx) — mesmos grupos,
// itens, ícones, textos e selos, na mesma ordem. Mudou lá, muda aqui. As
// medidas vêm da página do site em largura de celular. Notificações ainda
// não tem tela no app: abre a do site.
export default function ConfiguracoesScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal

  const [kanban, setKanban] = useState(true)
  const [online, setOnline] = useState(true)
  // null = a loja não tem a tabela do TaxiDog: o selo some, como no site.
  const [taxidog, setTaxidog] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  // Só para os selos (Ativado/Desativado); quem grava é a tela de cada item.
  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const [loja, taxi] = await Promise.all([
      supabase.from('lojista').select('kanban_ativo, aceita_agendamento_online').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('taxidog_config').select('ativo').eq('id_lojista', idLojista).maybeSingle(),
    ])
    const dados = loja.data as { kanban_ativo: boolean | null; aceita_agendamento_online: boolean | null } | null
    setKanban(dados?.kanban_ativo ?? true)
    setOnline(dados?.aceita_agendamento_online ?? true)
    setTaxidog(taxi.error ? null : !!(taxi.data as { ativo: boolean } | null)?.ativo)
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Configurações" />
        <SemPermissao area="mudar as configurações da loja" />
      </ScreenContainer>
    )
  }

  const grupos: { titulo: string; itens: Item[] }[] = [
    {
      titulo: 'Loja',
      itens: [
        { icone: IconStore, titulo: 'Dados da loja', descricao: 'Nome, telefone, endereço e demais informações públicas da loja', rota: '/mais/perfil-loja' },
        { icone: IconClock, titulo: 'Horários de funcionamento', descricao: 'Configure os dias e horários de atendimento', rota: '/mais/horarios' },
        { icone: IconMoney, titulo: 'Formas de pagamentos aceitas', descricao: 'Pix, dinheiro e cartões que a loja aceita nos agendamentos', rota: '/mais/pagamentos' },
        { icone: IconStar, titulo: 'Avaliações', descricao: 'Veja o que seus clientes estão dizendo sobre sua loja.', rota: '/mais/avaliacoes' },
      ],
    },
    {
      titulo: 'Agendamentos',
      itens: [
        {
          icone: IconCalendar,
          titulo: 'Configurações de Agendamentos',
          descricao: 'Kanban de atendimento, quantos agendamentos a loja aceita ao mesmo tempo e agendamento feito pelos próprios clientes',
          rota: '/mais/config-agendamentos',
          selos: [
            { texto: `Kanban ${kanban ? 'Ativado' : 'Desativado'}`, ativo: kanban },
            { texto: `Online ${online ? 'Ativado' : 'Desativado'}`, ativo: online },
          ],
        },
      ],
    },
    {
      titulo: 'Operação',
      itens: [
        { icone: IconShield, titulo: 'Usuários e Permissões', descricao: 'Cadastre membros da equipe e administradores, e gerencie as permissões de cada um', rota: '/mais/funcionarios' },
        {
          icone: IconCar,
          titulo: 'TaxiDog',
          descricao: 'Busca e entrega dos pets: preços, regiões atendidas e quem faz as corridas',
          rota: '/mais/taxidog-config',
          selos: taxidog === null ? undefined : [{ texto: taxidog ? 'Ativado' : 'Desativado', ativo: taxidog }],
        },
      ],
    },
    {
      titulo: 'Sistema',
      itens: [
        { icone: IconBell, titulo: 'Notificações', descricao: 'Configure as notificações do sistema', noSite: '/lojista/configuracoes/notificacoes' },
      ],
    },
  ]

  function abrir(item: Item) {
    if (item.rota) return router.push(item.rota as never)
    const url = item.noSite ? urlDoSite(item.noSite) : null
    if (url) Linking.openURL(url)
  }

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Configurações" />

      <View style={styles.pilha}>
        {grupos.map(grupo => (
          <View key={grupo.titulo} style={styles.cartao}>
            <Text style={styles.grupoTitulo}>{grupo.titulo}</Text>
            {grupo.itens.map((item, i) => {
              const Icone = item.icone
              return (
                <Pressable
                  key={item.titulo}
                  onPress={() => abrir(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.titulo}
                  style={({ pressed }) => [styles.item, i > 0 && styles.itemBorda, pressed && styles.itemPressionado]}
                >
                  <View style={styles.linha}>
                    <View style={styles.icone}>
                      <Icone size={18} color={colors.textDim} />
                    </View>
                    <View style={styles.textos}>
                      <Text style={styles.titulo}>{item.titulo}</Text>
                      <Text style={styles.descricao}>{item.descricao}</Text>
                    </View>
                    <IconChevronRight size={16} color={colors.textFaint} />
                  </View>
                  {item.selos && (
                    <View style={styles.selos}>
                      {item.selos.map(selo => (
                        <View key={selo.texto} style={[styles.selo, selo.ativo ? styles.seloAtivo : styles.seloInativo]}>
                          <Text style={[styles.seloTexto, { color: selo.ativo ? '#065f46' : colors.textMuted }]}>{selo.texto}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  pilha: { gap: 24 },
  cartao: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  grupoTitulo: {
    fontSize: 12.8,
    lineHeight: 20.5,
    fontWeight: '700',
    letterSpacing: 0.77,
    textTransform: 'uppercase',
    color: '#858d99',
    marginBottom: 12,
  },
  item: { padding: 16, gap: 16, borderRadius: 6 },
  itemBorda: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  itemPressionado: { backgroundColor: colors.surfaceMuted },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  descricao: { fontSize: 13, lineHeight: 20.8, color: colors.textMuted, marginTop: 2 },
  // Embaixo do texto, alinhados com ele (40 do ícone + 16 de vão).
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 56 },
  selo: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  seloAtivo: { backgroundColor: 'rgba(167,243,208,0.6)', borderColor: 'rgba(16,185,129,0.35)' },
  seloInativo: { backgroundColor: colors.border, borderColor: colors.borderStrong },
  seloTexto: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', letterSpacing: 0.48, textTransform: 'uppercase' },
})
