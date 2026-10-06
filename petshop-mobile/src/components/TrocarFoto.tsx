import { useState } from 'react'
import { IconeApp } from '@/components/IconeApp'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Avatar } from './Avatar'
import { Botao } from './Botao'
import { Aviso } from './Aviso'
import { chamarAcao, type Arquivo, type ResultadoAcao } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { escolherImagem } from '@/lib/imagem'
import { colors, spacing, typography } from '@/theme/theme'

interface Props {
  nome: string
  fotoUrl: string | null
  // Monta a chamada da action de envio com o arquivo escolhido.
  enviar: (arquivo: Arquivo) => Promise<ResultadoAcao<{ url: string }>>
  // Action de remover (sem argumento além dos que quem usa já amarra).
  remover: () => Promise<ResultadoAcao>
  onMudou: (url: string | null) => void
  rotulo?: string
}

// Foto com "trocar" e "remover" (logo da loja, foto do pet) — o envio
// passa pelas mesmas actions do painel web, que conferem o arquivo.
export function TrocarFoto({ nome, fotoUrl, enviar, remover, onMudou, rotulo = 'foto' }: Props) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function escolher(origem: 'galeria' | 'camera') {
    setErro(null)
    const escolhida = await escolherImagem(origem)
    if (!escolhida) return
    if ('erro' in escolhida) return setErro(escolhida.erro)
    setOcupado(true)
    const r = await enviar(escolhida.arquivo)
    setOcupado(false)
    if (r.error) return setErro(r.error)
    onMudou(r.url ?? null)
  }

  function pedirOrigem() {
    // No navegador só existe o seletor de arquivos.
    if (Platform.OS === 'web') return void escolher('galeria')
    dialogo(`Trocar ${rotulo}`, 'De onde vem a imagem?', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Tirar foto', onPress: () => escolher('camera') },
      { text: 'Escolher das fotos', onPress: () => escolher('galeria') },
    ])
  }

  function pedirRemover() {
    dialogo(`Remover ${rotulo}`, `Tirar a ${rotulo} atual?`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setErro(null)
          setOcupado(true)
          const r = await remover()
          setOcupado(false)
          if (r.error) return setErro(r.error)
          onMudou(null)
        },
      },
    ])
  }

  return (
    <View style={styles.caixa}>
      {/* A foto também abre a troca — é nela que a pessoa toca primeiro. */}
      <Pressable
        onPress={pedirOrigem}
        disabled={ocupado}
        accessibilityRole="button"
        accessibilityLabel={fotoUrl ? `Trocar ${rotulo}` : `Adicionar ${rotulo}`}
        style={({ pressed }) => [pressed && styles.pressionada]}
      >
        <Avatar nome={nome} fotoUrl={fotoUrl} size={84} />
        <View style={styles.selo}>
          <IconeApp name="camera" size={14} color={colors.white} />
        </View>
      </Pressable>
      <View style={styles.botoes}>
        <Botao rotulo={fotoUrl ? `Trocar ${rotulo}` : `Adicionar ${rotulo}`} icone="camera-outline" variante="secundario" compacto onPress={pedirOrigem} carregando={ocupado} />
        {fotoUrl && <Botao rotulo="Remover" variante="perigo" compacto onPress={pedirRemover} desativado={ocupado} />}
      </View>
      {erro && <Aviso tipo="erro" texto={erro} style={{ alignSelf: 'stretch' }} />}
      <Text style={styles.ajuda}>JPG, PNG ou WEBP, até 5 MB.</Text>
    </View>
  )
}

// Atalhos pras duas fotos que o app troca.
export const acoesFotoPet = (idPet: string) => ({
  enviar: (arq: Arquivo) => chamarAcao<{ url: string }>('atualizarFotoPetAction', idPet, { $form: { foto: arq } }),
  remover: () => chamarAcao('removerFotoPetAction', idPet),
})

export const acoesLogoLoja = {
  enviar: (arq: Arquivo) => chamarAcao<{ url: string }>('atualizarLogoLojistaAction', { $form: { logo: arq } }),
  remover: () => chamarAcao('removerLogoLojistaAction'),
}

const styles = StyleSheet.create({
  caixa: { alignItems: 'center', gap: spacing.md },
  pressionada: { opacity: 0.8 },
  selo: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary600,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoes: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  ajuda: { ...typography.body.sm, color: colors.textMuted },
})
