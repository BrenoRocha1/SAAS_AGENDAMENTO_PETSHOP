import { IconStar } from '@/components/icons'

// Sem 'use client' de propósito: isto é só exibição (nenhum hook), então
// serve tanto Server Component (perfil do cliente no painel) quanto
// Client Component (modal público, lista do cliente). O seletor
// interativo mora em EstrelasInput.tsx, esse sim client.

// Só exibição (avaliação já dada, média da loja...). `nota` pode ser
// fracionária (média 4,7): arredonda pro inteiro mais próximo pra saber
// quantas estrelas pintar — o número exato aparece ao lado, em texto.
export function Estrelas({ nota, tamanho = 16 }: { nota: number; tamanho?: number }) {
  const cheias = Math.round(nota)
  return (
    <span className="estrelas" role="img" aria-label={`${formatarMedia(nota)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(n => (
        <IconStar
          key={n}
          className={n <= cheias ? 'estrela-cheia' : 'estrela-vazia'}
          fill={n <= cheias ? 'currentColor' : 'none'}
          style={{ width: tamanho, height: tamanho }}
        />
      ))}
    </span>
  )
}

// 4.666 → "4,7" (padrão brasileiro de exibição de nota).
export function formatarMedia(media: number) {
  return media.toFixed(1).replace('.', ',')
}
