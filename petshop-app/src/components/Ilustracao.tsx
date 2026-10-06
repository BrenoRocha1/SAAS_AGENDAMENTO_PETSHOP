import type { CSSProperties } from 'react'

// Ilustrações já na cor da marca, em public/ilustracoes — as mesmas do app
// (petshop-mobile/assets/ilustracoes). As primeiras são do unDraw (undraw.co
// — uso livre, sem crédito); as de tema próprio (tudo-em-dia, taxidog, loja,
// servicos, relatorios, planos, produtos, sem-permissao) foram desenhadas
// aqui, com o cachorro de pets.svg e formas simples na mesma paleta. Entram só onde a tela está vazia ou é uma porta de
// entrada (login, código, cadastro, 404); nunca no meio de uma lista com
// conteúdo, nem no resultado de uma busca. Para acrescentar uma: salvar o
// SVG ali com o roxo do unDraw (#6c63ff) trocado por #4f46e5, sem texto
// dentro do desenho.
export type NomeIlustracao =
  | 'erro'
  | 'nao-encontrado'
  | 'agendar'
  | 'login'
  | 'codigo'
  | 'boas-vindas'
  | 'pets'
  | 'clientes'
  | 'equipe'
  | 'tudo-em-dia'
  | 'taxidog'
  | 'loja'
  | 'servicos'
  | 'relatorios'
  | 'planos'
  | 'produtos'
  | 'sem-permissao'

interface Props {
  nome: NomeIlustracao
  altura?: number
  style?: CSSProperties
}

// Decorativa: alt vazio, o leitor de tela pula (o texto da tela já diz o
// que importa).
export default function Ilustracao({ nome, altura = 130, style }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG local e pequeno; o next/image não otimiza SVG
    <img
      src={`/ilustracoes/${nome}.svg`}
      alt=""
      aria-hidden="true"
      style={{ display: 'block', height: altura, width: 'auto', maxWidth: '100%', margin: '0 auto var(--space-4)', ...style }}
    />
  )
}
