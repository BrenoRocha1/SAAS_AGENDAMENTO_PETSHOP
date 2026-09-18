'use client'

import { useState } from 'react'
import { IconStar } from '@/components/icons'

const ROTULO_NOTA: Record<number, string> = {
  1: '1 estrela',
  2: '2 estrelas',
  3: '3 estrelas',
  4: '4 estrelas',
  5: '5 estrelas',
}

// Escolha da nota no formulário. Passar o mouse mostra a prévia; clicar
// fixa. Cada estrela é um botão de verdade (teclado/leitor de tela), e o
// rótulo embaixo diz em texto qual nota está sendo escolhida.
export default function EstrelasInput({
  valor,
  onChange,
  desabilitado,
}: {
  valor: number
  onChange: (nota: number) => void
  desabilitado?: boolean
}) {
  const [hover, setHover] = useState(0)
  const exibida = hover || valor

  return (
    <div>
      <div className="estrelas estrelas-input" role="radiogroup" aria-label="Nota" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            aria-label={ROTULO_NOTA[n]}
            disabled={desabilitado}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
          >
            <IconStar
              className={n <= exibida ? 'estrela-cheia' : 'estrela-vazia'}
              fill={n <= exibida ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>
      <div className="estrelas-rotulo">{exibida ? ROTULO_NOTA[exibida] : 'Toque nas estrelas para dar sua nota'}</div>
    </div>
  )
}
