'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconClose, IconImage } from '@/components/icons'
import { AVISO_GALERIA, type FotoServico } from '@/lib/galeria'
import './galeria-servico.css'

// Fotos de referência de um serviço para o cliente (migration 101): uma
// fileira de miniaturas com "Ver modelos" e, ao tocar, a galeria ampliada.
// Sem foto, não mostra nada. Abrir a galeria nunca escolhe o serviço:
// o clique para aqui (stopPropagation) para não marcar o card de seleção.
export default function GaleriaServico({ fotos, nomeServico, variante = 'completa' }: {
  fotos: FotoServico[] | undefined
  nomeServico: string
  // completa: miniaturas + "Ver N modelos" (página da loja);
  // icone: só um botãozinho com o ícone e a quantidade (cartões apertados,
  // como os do agendamento online no celular).
  variante?: 'completa' | 'icone'
}) {
  const [aberta, setAberta] = useState<number | null>(null)
  if (!fotos || fotos.length === 0) return null

  const abrir = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setAberta(i)
  }
  const visiveis = fotos.slice(0, 4)
  const resto = fotos.length - visiveis.length
  const rotulo = fotos.length === 1 ? 'Ver o modelo' : `Ver ${fotos.length} modelos`
  const ampliada = aberta !== null && (
    <GaleriaAmpliada fotos={fotos} inicial={aberta} titulo={nomeServico} onFechar={() => setAberta(null)} />
  )

  if (variante === 'icone') {
    return (
      <>
        <button type="button" className="gs-icone" onClick={abrir(0)} aria-label={`${rotulo} de ${nomeServico}`} title={rotulo}>
          <IconImage /> {fotos.length}
        </button>
        {ampliada}
      </>
    )
  }

  return (
    <>
      <div className="gs-faixa">
        {visiveis.map((f, i) => (
          <button key={f.id_foto} type="button" className="gs-mini" onClick={abrir(i)} aria-label={`Ver o modelo ${f.nome}`}>
            <MiniaturaFoto url={f.url_mini} />
          </button>
        ))}
        <button type="button" className="gs-ver" onClick={abrir(0)}>
          <IconImage /> {rotulo}
          {resto > 0 && <span className="gs-mais">+{resto}</span>}
        </button>
      </div>
      {ampliada}
    </>
  )
}

// Miniatura que não quebra a tela se a imagem falhar.
function MiniaturaFoto({ url }: { url: string }) {
  const [falhou, setFalhou] = useState(false)
  if (falhou) return <span className="gs-falhou" aria-hidden="true"><IconImage /></span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)} />
}

// A galeria em tela cheia: foto grande, nome, descrição, setas, contador e
// as miniaturas embaixo. Esc fecha, setas do teclado trocam.
export function GaleriaAmpliada({ fotos, inicial, titulo, onFechar }: {
  fotos: FotoServico[]
  inicial: number
  titulo: string
  onFechar: () => void
}) {
  const [i, setI] = useState(Math.min(Math.max(0, inicial), fotos.length - 1))
  const [falhou, setFalhou] = useState<Record<string, boolean>>({})
  const ir = useCallback((passo: number) => setI(atual => (atual + passo + fotos.length) % fotos.length), [fotos.length])

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
      else if (e.key === 'ArrowRight') ir(1)
      else if (e.key === 'ArrowLeft') ir(-1)
    }
    window.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = overflow }
  }, [ir, onFechar])

  const foto = fotos[i]
  if (!foto) return null
  const varias = fotos.length > 1

  return (
    <div className="gs-tela" role="dialog" aria-modal="true" aria-label={`Modelos de ${titulo}`} onClick={e => { e.stopPropagation(); onFechar() }}>
      <div className="gs-caixa" onClick={e => e.stopPropagation()}>
        <header className="gs-topo">
          <span className="gs-titulo">{titulo}</span>
          {varias && <span className="gs-contador">{i + 1} de {fotos.length}</span>}
          <button type="button" className="gs-fechar" onClick={onFechar} aria-label="Fechar"><IconClose /></button>
        </header>

        <div className="gs-palco">
          {falhou[foto.id_foto] ? (
            <div className="gs-erro"><IconImage /> Não foi possível carregar esta foto.</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={foto.id_foto} src={foto.url} alt={foto.nome} decoding="async"
              onError={() => setFalhou(f => ({ ...f, [foto.id_foto]: true }))} />
          )}
          {varias && (
            <>
              <button type="button" className="gs-seta is-esq" onClick={() => ir(-1)} aria-label="Foto anterior"><IconChevronLeft /></button>
              <button type="button" className="gs-seta is-dir" onClick={() => ir(1)} aria-label="Próxima foto"><IconChevronRight /></button>
            </>
          )}
        </div>

        <div className="gs-info">
          <strong className="gs-nome">{foto.nome}</strong>
          {foto.descricao && <p className="gs-desc">{foto.descricao}</p>}
          <p className="gs-aviso">{AVISO_GALERIA}</p>
        </div>

        {varias && (
          <div className="gs-tira" role="tablist" aria-label="Escolher foto">
            {fotos.map((f, j) => (
              <button key={f.id_foto} type="button" role="tab" aria-selected={j === i} aria-label={f.nome}
                className={`gs-tira-item ${j === i ? 'is-ativa' : ''}`} onClick={() => setI(j)}>
                <MiniaturaFoto url={f.url_mini} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
