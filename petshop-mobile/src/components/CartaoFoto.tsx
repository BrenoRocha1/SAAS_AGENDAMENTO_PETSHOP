import { useEffect, useRef, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { FolhaConfirmar } from '@/components/FolhaConfirmar'
import { IconCamera, IconPencil, IconPlus, IconTrash } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import type { Arquivo } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { escolherImagem } from '@/lib/imagem'
import { colors } from '@/theme/theme'

interface Props {
  // "Foto do pet", "Foto do perfil" — o título do cartão.
  titulo: string
  // "do pet", "do perfil": completa os rótulos e a pergunta de remover.
  deQuem: string
  fotoUrl: string | null
  // Frase que aparece enquanto ainda não há foto.
  convite: string
  mensagemSalva: string
  enviar: (arquivo: Arquivo) => Promise<{ error?: string; url?: string }>
  remover: () => Promise<{ error?: string }>
  onMudou: (url: string | null) => void
}

// O cartão de foto das telas do cliente no site (FotoUpload: foto do pet,
// foto do perfil), com as medidas dele em largura de celular: o círculo da
// foto (que também abre a escolha da imagem), os botões e a letra miúda.
// Como lá, a imagem escolhida aparece primeiro como prévia — só vai para o
// servidor em "Salvar foto".
export function CartaoFoto({ titulo, deQuem, fotoUrl, convite, mensagemSalva, enviar, remover: removerFoto, onMudou }: Props) {
  const [pendente, setPendente] = useState<{ arquivo: Arquivo; uri: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ocupado = enviando || removendo

  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current) }, [])

  function avisar(texto: string) {
    setSucesso(texto)
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = setTimeout(() => setSucesso(null), 3000)
  }

  async function escolher(origem: 'galeria' | 'camera') {
    setErro(null)
    setSucesso(null)
    const escolhida = await escolherImagem(origem)
    if (!escolhida) return
    if ('erro' in escolhida) return setErro(escolhida.erro)
    setPendente(escolhida)
  }

  function pedirOrigem() {
    // No navegador só existe o seletor de arquivos.
    if (Platform.OS === 'web') return void escolher('galeria')
    dialogo(fotoUrl ? 'Alterar foto' : 'Adicionar foto', 'De onde vem a imagem?', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Tirar foto', onPress: () => escolher('camera') },
      { text: 'Escolher das fotos', onPress: () => escolher('galeria') },
    ])
  }

  async function salvar() {
    if (!pendente) return
    setErro(null)
    setEnviando(true)
    const r = await enviar(pendente.arquivo)
    setEnviando(false)
    if (r.error) return setErro(r.error)
    setPendente(null)
    onMudou(r.url ?? null)
    avisar(mensagemSalva)
  }

  async function remover() {
    setErro(null)
    setRemovendo(true)
    const r = await removerFoto()
    setRemovendo(false)
    setConfirmando(false)
    if (r.error) return setErro(r.error)
    onMudou(null)
    avisar('Foto removida.')
  }

  const imagem = pendente?.uri ?? fotoUrl

  return (
    <View style={styles.cartao}>
      <Text style={styles.titulo}>{titulo}</Text>

      {erro && <Aviso tipo="erro" texto={erro} style={styles.aviso} />}
      {sucesso && <Aviso tipo="sucesso" texto={sucesso} style={styles.aviso} />}

      <View style={styles.linha}>
        {/* O círculo da foto também abre a escolha da imagem. */}
        <Pressable
          onPress={pedirOrigem}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel={imagem ? `Alterar foto ${deQuem}` : `Adicionar foto ${deQuem}`}
        >
          <View style={styles.circulo}>
            {imagem ? (
              <Image source={{ uri: imagem }} style={styles.foto} accessibilityLabel={pendente ? 'Prévia da nova foto' : `Foto ${deQuem}`} />
            ) : (
              <IconCamera size={26} color={colors.textFaint} />
            )}
          </View>
          {/* Selo de câmera quando já há foto: avisa que dá para tocar e trocar. */}
          {imagem && (
            <View style={styles.selo}>
              <IconCamera size={15} color={colors.white} />
            </View>
          )}
        </Pressable>

        <View style={styles.lado}>
          {!imagem && <Text style={styles.convite}>{convite}</Text>}

          {pendente ? (
            <View style={styles.botoes}>
              <BotaoPequeno variante="primario" rotulo={enviando ? 'Enviando...' : 'Salvar foto'} desativado={ocupado} onPress={salvar} />
              <BotaoPequeno variante="fantasma" rotulo="Cancelar" desativado={ocupado} onPress={() => setPendente(null)} />
            </View>
          ) : (
            <View style={styles.botoes}>
              <BotaoPequeno
                rotulo={fotoUrl ? 'Alterar foto' : 'Adicionar foto'}
                icone={fotoUrl ? IconPencil : IconPlus}
                desativado={ocupado}
                onPress={pedirOrigem}
              />
              {fotoUrl && <BotaoPequeno variante="fantasma" rotulo="Remover foto" icone={IconTrash} desativado={ocupado} onPress={() => setConfirmando(true)} />}
            </View>
          )}

          <Text style={styles.miuda}>JPG, PNG ou WEBP · até 5 MB</Text>
        </View>
      </View>

      <FolhaConfirmar
        visivel={confirmando}
        titulo="Remover foto"
        pergunta={`Tem certeza que deseja remover a foto ${deQuem}?`}
        rotulo="Remover"
        rotuloOcupado="Removendo..."
        ocupado={removendo}
        onConfirmar={remover}
        onFechar={() => setConfirmando(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  cartao: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  titulo: { fontSize: 14, lineHeight: 17.5, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textDim, marginBottom: 16 },
  aviso: { marginBottom: 16 },
  // Com a tela estreita, o bloco dos botões desce para baixo da foto.
  linha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  circulo: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  foto: { width: '100%', height: '100%' },
  selo: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.primary600, alignItems: 'center', justifyContent: 'center' },
  lado: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 200 },
  convite: { fontSize: 14, lineHeight: 20, color: '#858d99', marginBottom: 12 },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miuda: { fontSize: 12, lineHeight: 16, color: '#858d99', marginTop: 8 },
})
