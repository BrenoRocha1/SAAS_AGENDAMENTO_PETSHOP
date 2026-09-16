// ============================================================
// Otimização de imagem NO NAVEGADOR, antes do upload — sem nenhuma
// biblioteca: usa a Canvas API (nativa) pra redimensionar e recomprimir.
// A maior parte do ganho de tamanho já vem só do redimensionamento (uma
// foto de celular pode chegar com 4000×3000px; reduzir a maior borda pra
// no máximo `maxLado` já derruba o peso antes mesmo de trocar formato).
// ============================================================

export interface ImagemOtimizada {
  blob: Blob
  extensao: 'webp' | 'png'
}

export async function otimizarImagemParaUpload(
  arquivo: File,
  maxLado = 800,
  qualidade = 0.85
): Promise<ImagemOtimizada> {
  const bitmap = await createImageBitmap(arquivo)
  try {
    // Nunca aumenta uma imagem pequena — só reduz quando é maior que o limite.
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
    const largura = Math.max(1, Math.round(bitmap.width * escala))
    const altura = Math.max(1, Math.round(bitmap.height * escala))

    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível processar a imagem neste navegador.')
    ctx.drawImage(bitmap, 0, 0, largura, altura)

    // Tenta WEBP primeiro (bem mais leve, preserva transparência). Se o
    // navegador não souber exportar nesse formato, toBlob devolve outro
    // tipo silenciosamente — por isso a checagem de blob.type antes de
    // decidir a extensão, em vez de confiar cegamente que deu certo.
    const blobWebp = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', qualidade))
    if (blobWebp && blobWebp.type === 'image/webp') {
      return { blob: blobWebp, extensao: 'webp' }
    }

    // Fallback: PNG (sem perda, mantém transparência) — já bem menor que
    // o original graças ao redimensionamento, mesmo sem compressão com perda.
    const blobPng = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blobPng) throw new Error('Não foi possível gerar a imagem otimizada.')
    return { blob: blobPng, extensao: 'png' }
  } finally {
    bitmap.close()
  }
}
