import { useCallback, useState, type ComponentType } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import {
  IconBell,
  IconCalendar,
  IconCar,
  IconChevronRight,
  IconClock,
  IconEye,
  IconMoney,
  IconShield,
  IconStar,
  type IconeProps,
} from '@/components/IconesDoSite'
import { SemPermissao } from '@/components/SemPermissao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { formasAtivas, normalizarFormasLoja } from '@/lib/pagamento'
import { resumoAvaliacoes, resumoEquipe, resumoFormas, resumoHorarios, type HorarioResumo } from '@/lib/resumo-config'
import { urlDoSite } from '@/lib/site'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

interface Item {
  icone: ComponentType<IconeProps>
  titulo: string
  // Como está configurado agora, numa linha (ou duas).
  resumo: string
  rota: string
  selo?: { texto: string; ligado: boolean }
}

interface Loja { nome: string; local: string; logo: string | null; slug: string | null }

// Configurações da loja — a MESMA tela do site
// (petshop-app/src/app/lojista/configuracoes/page.tsx): a loja no topo e,
// em grupos, cada configuração com o resumo do que está valendo agora.
// Mudou lá, muda aqui.
export default function ConfiguracoesScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal

  const [loja, setLoja] = useState<Loja | null>(null)
  const [grupos, setGrupos] = useState<{ titulo: string; itens: Item[] }[]>([])
  const [loading, setLoading] = useState(true)

  // Tudo junto e tolerante: o que faltar (migration, permissão) só some do resumo.
  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const [base, extras, horarios, formas, avaliacoes, equipe, taxi] = await Promise.all([
      supabase.from('lojista').select('nome_loja, cidade, estado, logo_url, kanban_ativo, aceita_agendamento_online').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('lojista').select('slug, som_novo_agendamento_ativo, bloquear_cancelamento_aceito').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('horario').select('dia_semana, hr_inicio, hr_fim, ativo').eq('id_lojista', idLojista),
      supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }),
      supabase.rpc('fn_avaliacoes_resumo_publico', { p_id_lojista: idLojista }),
      supabase.from('funcionario').select('id_funcionario', { count: 'exact', head: true }).eq('id_lojista', idLojista).eq('ativo', true),
      supabase.from('taxidog_config').select('ativo').eq('id_lojista', idLojista).maybeSingle(),
    ])
    const l = base.data as { nome_loja: string; cidade: string | null; estado: string | null; logo_url: string | null; kanban_ativo: boolean | null; aceita_agendamento_online: boolean | null } | null
    const x = (extras.error ? null : extras.data) as { slug: string | null; som_novo_agendamento_ativo: boolean | null; bloquear_cancelamento_aceito: boolean | null } | null
    const online = l?.aceita_agendamento_online ?? true
    const kanban = l?.kanban_ativo ?? true
    const aval = (avaliacoes.data ?? null) as { media: number | null; total: number } | null
    const taxiAtivo = !!(taxi.data as { ativo: boolean } | null)?.ativo

    setLoja({
      nome: l?.nome_loja ?? 'Sua loja',
      local: [l?.cidade, l?.estado].filter(Boolean).join(' - ') || 'Endereço não informado',
      logo: l?.logo_url ?? null,
      slug: x?.slug ?? null,
    })
    setGrupos([
      {
        titulo: 'Atendimento',
        itens: [
          { icone: IconClock, titulo: 'Horários de funcionamento', rota: '/mais/horarios', resumo: horarios.error ? 'Dias, horários e dias fechados' : resumoHorarios((horarios.data ?? []) as HorarioResumo[]) },
          {
            icone: IconCalendar,
            titulo: 'Agendamentos',
            rota: '/mais/config-agendamentos',
            resumo: [`Kanban ${kanban ? 'ligado' : 'desligado'}`, x?.bloquear_cancelamento_aceito ? 'sem cancelar depois de aceito' : null].filter(Boolean).join(' · '),
            selo: { texto: online ? 'Online' : 'Só na loja', ligado: online },
          },
          { icone: IconMoney, titulo: 'Formas de pagamento', rota: '/mais/pagamentos', resumo: formas.error ? 'Pix, dinheiro e cartões' : resumoFormas(formasAtivas(normalizarFormasLoja(formas.data))) },
        ],
      },
      {
        titulo: 'Equipe e serviços',
        itens: [
          { icone: IconShield, titulo: 'Usuários e permissões', rota: '/mais/funcionarios', resumo: equipe.error ? 'Equipe, administradores e permissões' : resumoEquipe(equipe.count ?? 0) },
          {
            icone: IconCar,
            titulo: 'TaxiDog',
            rota: '/mais/taxidog-config',
            resumo: 'Busca e entrega dos pets',
            selo: taxi.error ? undefined : { texto: taxiAtivo ? 'Ligado' : 'Desligado', ligado: taxiAtivo },
          },
        ],
      },
      {
        titulo: 'Clientes e avisos',
        itens: [
          { icone: IconStar, titulo: 'Avaliações', rota: '/mais/avaliacoes', resumo: aval ? resumoAvaliacoes(aval.media, Number(aval.total ?? 0)) : 'O que os clientes dizem da loja' },
          { icone: IconBell, titulo: 'Notificações', rota: '/mais/notificacoes', resumo: x ? `Som de novo agendamento ${x.som_novo_agendamento_ativo === false ? 'desligado' : 'ligado'}` : 'Avisos de novos agendamentos' },
        ],
      },
    ])
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

  const urlPagina = loja?.slug ? urlDoSite(`/${loja.slug}`) : null

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Configurações" />

      <View style={styles.pilha}>
        {loja && (
          <View style={styles.loja}>
            <View style={styles.lojaTopo}>
              {loja.logo
                ? <Image source={{ uri: loja.logo }} style={styles.logo} />
                : <View style={[styles.logo, styles.logoInicial]}><Text style={styles.logoLetra}>{loja.nome.trim()[0]?.toUpperCase()}</Text></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lojaNome} numberOfLines={1}>{loja.nome}</Text>
                <Text style={styles.lojaLocal}>{loja.local}</Text>
              </View>
            </View>
            <View style={styles.lojaAcoes}>
              {urlPagina && (
                <View style={{ flex: 1 }}>
                  <BotaoPequeno normal rotulo="Ver página" icone={IconEye} onPress={() => Linking.openURL(urlPagina).catch(() => null)} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <BotaoPequeno normal variante="primario" rotulo="Dados da loja" onPress={() => router.push('/mais/perfil-loja' as never)} />
              </View>
            </View>
          </View>
        )}

        {grupos.map(grupo => (
          <View key={grupo.titulo} style={{ gap: 8 }}>
            <Text style={styles.grupoTitulo}>{grupo.titulo}</Text>
            <View style={styles.lista}>
              {grupo.itens.map((item, i) => {
                const Icone = item.icone
                return (
                  <Pressable
                    key={item.titulo}
                    onPress={() => router.push(item.rota as never)}
                    accessibilityRole="button"
                    accessibilityLabel={item.titulo}
                    style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.bg }]}
                  >
                    {i > 0 && <View style={styles.divisor} />}
                    <View style={styles.icone}><Icone size={18} color={colors.primary600} /></View>
                    <View style={styles.textos}>
                      <Text style={styles.titulo}>{item.titulo}</Text>
                      <Text style={styles.resumo} numberOfLines={2}>{item.resumo}</Text>
                    </View>
                    {item.selo && (
                      <View style={[styles.selo, item.selo.ligado && styles.seloLigado]}>
                        <Text style={[styles.seloTexto, item.selo.ligado && { color: colors.successFg }]}>{item.selo.texto}</Text>
                      </View>
                    )}
                    <IconChevronRight size={16} color="#858d99" />
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
      </View>
    </ScreenContainer>
  )
}

// Medidas de `configuracoes.css` do site em 375 de largura.
const styles = StyleSheet.create({
  pilha: { gap: 20 },
  loja: { gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  lojaTopo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surfaceMuted },
  logoInicial: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  logoLetra: { fontSize: 22, fontWeight: '800', color: colors.primary600 },
  lojaNome: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  lojaLocal: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  lojaAcoes: { flexDirection: 'row', gap: 8 },
  grupoTitulo: { marginLeft: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.72, textTransform: 'uppercase', color: '#858d99' },
  lista: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
  divisor: { position: 'absolute', top: 0, left: 62, right: 0, height: 1, backgroundColor: colors.border },
  icone: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  textos: { flex: 1, minWidth: 0, gap: 1 },
  titulo: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  resumo: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  selo: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  seloLigado: { backgroundColor: colors.successBg },
  seloTexto: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#858d99' },
})
