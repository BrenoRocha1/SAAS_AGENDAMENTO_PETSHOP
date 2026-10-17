import Link from 'next/link'
import type { ReactNode } from 'react'
import LogoSaip from '@/components/LogoSaip'
import { EMPRESA } from '@/lib/empresa'
import './documento-legal.css'

export interface SecaoLegal {
  id: string
  titulo: string
  conteudo: ReactNode
}

// Termos de Uso e Política de Privacidade: o mesmo layout, numa coluna de
// leitura, com índice no topo e um link para o outro documento no fim.
export default function DocumentoLegal({ titulo, resumo, secoes, outro }: {
  titulo: string
  resumo: ReactNode
  secoes: SecaoLegal[]
  outro: { href: string; rotulo: string }
}) {
  return (
    <div className="dl">
      <header className="dl-topo">
        <Link href="/" aria-label="Página inicial do SAIP"><LogoSaip altura={22} /></Link>
      </header>

      <main className="dl-corpo">
        <h1 className="dl-titulo">{titulo}</h1>
        <p className="dl-data">Última atualização: {EMPRESA.atualizadoEm}</p>
        <div className="dl-resumo">{resumo}</div>

        <nav className="dl-indice" aria-label="Índice">
          <span className="dl-indice-titulo">Nesta página</span>
          <ol>
            {secoes.map((s, i) => (
              <li key={s.id}><a href={`#${s.id}`}>{i + 1}. {s.titulo}</a></li>
            ))}
          </ol>
        </nav>

        {secoes.map((s, i) => (
          <section key={s.id} id={s.id} className="dl-secao">
            <h2>{i + 1}. {s.titulo}</h2>
            {s.conteudo}
          </section>
        ))}

        <footer className="dl-rodape">
          <Link href={outro.href}>{outro.rotulo}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/">Voltar ao início</Link>
        </footer>
      </main>
    </div>
  )
}
