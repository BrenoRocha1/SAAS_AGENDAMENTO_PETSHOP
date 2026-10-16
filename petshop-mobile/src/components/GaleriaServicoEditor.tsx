import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { GaleriaAmpliada } from '@/components/GaleriaServico'
import { IconCamera, IconChevronLeft, IconChevronRight, IconEye, IconImage, IconTrash } from '@/components/IconesDoSite'
import { Text, TextInput } from '@/components/Texto'
import { chamarAcao, form, type Arquivo } from '@/lib/acoes'
import { COLUNAS_FOTO_SERVICO, GALERIA_DESCRICAO_MAX, GALERIA_MAX_FOTOS, GALERIA_NOME_MAX, problemaDaFoto, type FotoServico } from '@/lib/galeria'
import { escolherImagem } from '@/lib/imagem'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

// Foto escolhida que ainda não subiu: vai junto ao "Salvar Serviço".
export interface FotoPendente {
  chave: string
  arquivo: Arquivo
  uri: string
  nome: string
  descricao: string
}

// Sobe as fotos pendentes (depois de criar ou ao salvar o serviço), pela
// mesma action do site. Para na primeira falha.
export async function enviarFotosPendentes(idServico: string, pendentes: FotoPendente[]): Promise<{ enviadas: number; erro: string | null }> {
  for (const [enviadas, p] of pendentes.entries()) {
    const r = await chamarAcao('adicionarFotoServicoAction', idServico, form({ foto: p.arquivo, nome: p.nome.trim(), descricao: p.descricao.trim() }))
    if (r.error) return { enviadas, erro: `“${p.nome.trim() || 'Foto'}”: ${r.error}` }
  }
  return { enviadas: pendentes.length, erro: null }
}

export function problemaDasPendentes(pendentes: FotoPendente[]): string | null {
  for (const p of pendentes) {
    const problema = problemaDaFoto(p.nome, p.descricao)
    if (problema) return `Fotos de referência: ${problema}`
  }
  return null
}

// "Fotos de referência" no cadastro do serviço — o mesmo do site
// (GaleriaServicoEditor): opcional; as salvas mudam na hora (nome, ordem,
// remover), as novas sobem ao salvar o serviço.
export function GaleriaServicoEditor({ idServico, nomeServico, pendentes, onPendentesChange, desativado }: {
  idServico: string | null
  nomeServico: string
  pendentes: FotoPendente[]
  onPendentesChange: (p: FotoPendente[]) => void
  desativado?: boolean
}) {
  const [fotos, setFotos] = useState<FotoServico[]>([])
  const [semMigration, setSemMigration] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Record<string, { nome: string; descricao: string }>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [vendo, setVendo] = useState(false)

  useEffect(() => {
    if (!idServico) return
    let vivo = true
    supabase.from('servico_foto').select(COLUNAS_FOTO_SERVICO).eq('id_servico', idServico).order('ordem')
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setSemMigration(true)
        else setFotos((data ?? []) as FotoServico[])
      })
    return () => { vivo = false }
  }, [idServico])

  const total = fotos.length + pendentes.length

  async function adicionar(origem: 'galeria' | 'camera') {
    setErro(null)
    if (total >= GALERIA_MAX_FOTOS) return setErro(`Cada serviço pode ter no máximo ${GALERIA_MAX_FOTOS} fotos.`)
    const r = await escolherImagem(origem)
    if (!r) return
    if ('erro' in r) return setErro(r.erro)
    onPendentesChange([...pendentes, { chave: `${Date.now()}-${Math.random().toString(36).slice(2)}`, arquivo: r.arquivo, uri: r.uri, nome: '', descricao: '' }])
  }

  const mudarPendente = (chave: string, parte: Partial<FotoPendente>) => onPendentesChange(pendentes.map(p => (p.chave === chave ? { ...p, ...parte } : p)))
  const valor = (f: FotoServico) => edicao[f.id_foto] ?? { nome: f.nome, descricao: f.descricao ?? '' }
  const mudou = (f: FotoServico) => { const v = edicao[f.id_foto]; return !!v && (v.nome !== f.nome || v.descricao !== (f.descricao ?? '')) }

  async function salvarTexto(f: FotoServico) {
    const v = valor(f)
    const problema = problemaDaFoto(v.nome, v.descricao)
    if (problema) return setErro(problema)
    setErro(null)
    setOcupado(f.id_foto)
    const r = await chamarAcao<{ foto: FotoServico }>('editarFotoServicoAction', f.id_foto, v)
    setOcupado(null)
    if (r.error || !r.foto) return setErro(r.error ?? 'Não foi possível salvar.')
    const nova = r.foto
    setFotos(lista => lista.map(x => (x.id_foto === f.id_foto ? nova : x)))
    setEdicao(({ [f.id_foto]: _, ...resto }) => resto)
  }

  async function mover(indice: number, passo: number) {
    const alvo = indice + passo
    if (!idServico || alvo < 0 || alvo >= fotos.length) return
    const anterior = fotos
    const nova = [...fotos]
    ;[nova[indice], nova[alvo]] = [nova[alvo], nova[indice]]
    setFotos(nova)
    setErro(null)
    setOcupado('ordem')
    const r = await chamarAcao('reordenarFotosServicoAction', idServico, nova.map(f => f.id_foto))
    setOcupado(null)
    if (r.error) { setFotos(anterior); setErro(r.error) }
  }

  async function remover(f: FotoServico) {
    setErro(null)
    setOcupado(f.id_foto)
    const r = await chamarAcao('removerFotoServicoAction', f.id_foto)
    setOcupado(null)
    setConfirmar(null)
    if (r.error) return setErro(r.error)
    setFotos(lista => lista.filter(x => x.id_foto !== f.id_foto))
  }

  const previa: FotoServico[] = [
    ...fotos.map(f => ({ ...f, nome: valor(f).nome, descricao: valor(f).descricao || null })),
    ...pendentes.map((p, i) => ({
      id_foto: p.chave, id_servico: idServico ?? '', nome: p.nome.trim() || `Modelo ${fotos.length + i + 1}`,
      descricao: p.descricao.trim() || null, url: p.uri, url_mini: p.uri, ordem: fotos.length + i,
    })),
  ]

  if (semMigration) {
    return (
      <View style={styles.secao}>
        <Text style={styles.titulo}>Fotos de referência</Text>
        <Aviso tipo="alerta" texto="Execute a migration 101_galeria_servico.sql para usar a galeria de fotos." />
      </View>
    )
  }

  return (
    <View style={styles.secao}>
      <View style={styles.cabeca}>
        <Text style={styles.titulo}>Fotos de referência</Text>
        <View style={styles.opcional}><Text style={styles.opcionalTexto}>Opcional</Text></View>
        <Text style={styles.conta}>{total}/{GALERIA_MAX_FOTOS}</Text>
      </View>
      <Text style={styles.sub}>Modelos do serviço, como tipos de tosa ou acabamentos. O cliente vê na página da loja e no agendamento online, sem precisar abrir para agendar.</Text>

      {erro && <Aviso tipo="erro" texto={erro} />}

      {fotos.map((f, i) => {
        const v = valor(f)
        return (
          <View key={f.id_foto} style={styles.item}>
            <View style={styles.fotoCaixa}>
              <Image source={{ uri: f.url_mini }} style={styles.foto} accessibilityLabel={f.nome} />
              <View style={styles.selo}><Text style={styles.seloTexto}>{i + 1}</Text></View>
            </View>
            <View style={styles.campos}>
              <TextInput style={styles.input} value={v.nome} maxLength={GALERIA_NOME_MAX} placeholder="Nome do modelo (ex.: Tosa bebê)" placeholderTextColor={colors.textFaint}
                editable={!desativado} onChangeText={t => setEdicao(m => ({ ...m, [f.id_foto]: { ...v, nome: t } }))} accessibilityLabel="Nome do modelo" />
              <TextInput style={[styles.input, styles.desc]} value={v.descricao} maxLength={GALERIA_DESCRICAO_MAX} multiline placeholder="Descrição (opcional)" placeholderTextColor={colors.textFaint}
                editable={!desativado} onChangeText={t => setEdicao(m => ({ ...m, [f.id_foto]: { ...v, descricao: t } }))} accessibilityLabel="Descrição do modelo" />
              <View style={styles.acoes}>
                <Pressable onPress={() => mover(i, -1)} disabled={i === 0 || !!ocupado || desativado} hitSlop={6} accessibilityRole="button" accessibilityLabel="Mover para antes" style={[styles.seta, i === 0 && styles.apagado]}>
                  <IconChevronLeft size={16} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => mover(i, 1)} disabled={i === fotos.length - 1 || !!ocupado || desativado} hitSlop={6} accessibilityRole="button" accessibilityLabel="Mover para depois" style={[styles.seta, i === fotos.length - 1 && styles.apagado]}>
                  <IconChevronRight size={16} color={colors.text} />
                </Pressable>
                {mudou(f) && <BotaoPequeno variante="primario" rotulo={ocupado === f.id_foto ? 'Salvando…' : 'Salvar'} desativado={!!ocupado} onPress={() => salvarTexto(f)} />}
                <View style={{ flex: 1 }} />
                {confirmar === f.id_foto ? (
                  <View style={styles.confirma}>
                    <Text style={styles.confirmaTexto}>Remover?</Text>
                    <BotaoPequeno variante="perigoClaro" rotulo={ocupado === f.id_foto ? 'Removendo…' : 'Sim'} desativado={!!ocupado} onPress={() => remover(f)} />
                    <BotaoPequeno rotulo="Não" desativado={!!ocupado} onPress={() => setConfirmar(null)} />
                  </View>
                ) : (
                  <BotaoPequeno variante="perigoClaro" icone={IconTrash} rotulo="Remover" desativado={!!ocupado || desativado} onPress={() => setConfirmar(f.id_foto)} />
                )}
              </View>
            </View>
          </View>
        )
      })}

      {pendentes.map(p => (
        <View key={p.chave} style={[styles.item, styles.itemNovo]}>
          <View style={styles.fotoCaixa}>
            <Image source={{ uri: p.uri }} style={styles.foto} />
            <View style={[styles.selo, styles.seloNova]}><Text style={styles.seloTexto}>Nova</Text></View>
          </View>
          <View style={styles.campos}>
            <TextInput style={styles.input} value={p.nome} maxLength={GALERIA_NOME_MAX} placeholder="Nome do modelo (ex.: Tosa bebê)" placeholderTextColor={colors.textFaint}
              editable={!desativado} onChangeText={t => mudarPendente(p.chave, { nome: t })} accessibilityLabel="Nome do modelo" />
            <TextInput style={[styles.input, styles.desc]} value={p.descricao} maxLength={GALERIA_DESCRICAO_MAX} multiline placeholder="Descrição (opcional)" placeholderTextColor={colors.textFaint}
              editable={!desativado} onChangeText={t => mudarPendente(p.chave, { descricao: t })} accessibilityLabel="Descrição do modelo" />
            <View style={styles.acoes}>
              <Text style={styles.dica}>Será enviada ao salvar o serviço.</Text>
              <View style={{ flex: 1 }} />
              <BotaoPequeno variante="perigoClaro" icone={IconTrash} rotulo="Tirar" desativado={desativado} onPress={() => onPendentesChange(pendentes.filter(x => x.chave !== p.chave))} />
            </View>
          </View>
        </View>
      ))}

      <View style={styles.rodape}>
        {total < GALERIA_MAX_FOTOS && (
          <>
            <BotaoPequeno icone={IconImage} rotulo={total === 0 ? 'Adicionar foto' : 'Adicionar mais'} desativado={desativado} onPress={() => adicionar('galeria')} />
            <BotaoPequeno icone={IconCamera} rotulo="Tirar foto" desativado={desativado} onPress={() => adicionar('camera')} />
          </>
        )}
        {previa.length > 0 && <BotaoPequeno icone={IconEye} rotulo="Ver como o cliente vê" onPress={() => setVendo(true)} />}
      </View>

      <GaleriaAmpliada visivel={vendo} fotos={previa} titulo={nomeServico || 'Serviço'} onFechar={() => setVendo(false)} />
    </View>
  )
}

// Medidas de `galeria-servico-editor.css` do site em 375 de largura.
const styles = StyleSheet.create({
  secao: { gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  opcional: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  opcionalTexto: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: colors.textMuted },
  conta: { marginLeft: 'auto', fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#858d99' },
  sub: { fontSize: 13, lineHeight: 19.5, color: colors.textMuted },
  item: { gap: 12, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  itemNovo: { borderStyle: 'dashed', borderColor: colors.primary600 },
  fotoCaixa: { width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  foto: { width: '100%', height: '100%' },
  selo: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.72)' },
  seloNova: { backgroundColor: colors.primary600 },
  seloTexto: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.white },
  campos: { gap: 6 },
  input: { height: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  desc: { height: 64, paddingTop: 8, textAlignVertical: 'top' },
  acoes: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  seta: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  apagado: { opacity: 0.4 },
  confirma: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmaTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textMuted },
  dica: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  rodape: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
