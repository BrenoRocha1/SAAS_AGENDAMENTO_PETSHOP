import * as ImagePicker from 'expo-image-picker'
import { arquivo, type Arquivo } from '@/lib/acoes'

// Escolhe uma imagem (galeria ou câmera), já recortada em quadrado e
// comprimida, pronta pra mandar a uma action de foto (logo da loja, foto
// do pet). O servidor confere de novo o tipo de verdade e o limite de 5 MB.
//
// Devolve `null` se a pessoa desistiu, ou `{ erro }` quando não deu.
const LIMITE_BASE64 = 6_500_000 // ~4,8 MB de arquivo

export type ImagemEscolhida = { arquivo: Arquivo; uri: string } | { erro: string } | null

export async function escolherImagem(origem: 'galeria' | 'camera'): Promise<ImagemEscolhida> {
  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  }

  let resultado: ImagePicker.ImagePickerResult
  try {
    if (origem === 'camera') {
      const permissao = await ImagePicker.requestCameraPermissionsAsync()
      if (!permissao.granted) return { erro: 'Sem permissão para usar a câmera. Libere nas configurações do aparelho.' }
      resultado = await ImagePicker.launchCameraAsync(opcoes)
    } else {
      resultado = await ImagePicker.launchImageLibraryAsync(opcoes)
    }
  } catch {
    return { erro: origem === 'camera' ? 'Não foi possível abrir a câmera.' : 'Não foi possível abrir as fotos.' }
  }
  if (resultado.canceled || !resultado.assets?.[0]) return null

  const asset = resultado.assets[0]
  // Alguns ambientes (navegador) devolvem "data:image/…;base64,XXXX".
  const base64 = (asset.base64 ?? '').replace(/^data:[^;]+;base64,/, '')
  if (!base64) return { erro: 'Não foi possível ler a imagem escolhida.' }
  if (base64.length > LIMITE_BASE64) return { erro: 'Imagem muito grande. Escolha uma menor (até 5 MB).' }

  const tipo = asset.mimeType ?? 'image/jpeg'
  return { arquivo: arquivo(base64, asset.fileName ?? 'imagem.jpg', tipo), uri: asset.uri }
}
