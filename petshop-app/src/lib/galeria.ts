// Galeria de fotos de referência do serviço (migration 101): modelos de
// tosa, estilos de acabamento etc. — só ilustração do serviço, sem preço
// nem agendamento próprio. O app tem uma cópia deste arquivo
// (petshop-mobile/src/lib/galeria.ts) — se mudar aqui, muda lá.

export interface FotoServico {
  id_foto: string
  id_servico: string
  nome: string
  descricao: string | null
  url: string
  url_mini: string
  ordem: number
}

export const COLUNAS_FOTO_SERVICO = 'id_foto, id_servico, nome, descricao, url, url_mini, ordem'

export const GALERIA_MAX_FOTOS = 12
export const GALERIA_MAX_BYTES = 5 * 1024 * 1024
export const GALERIA_NOME_MAX = 60
export const GALERIA_DESCRICAO_MAX = 300
// Lados máximos gerados no navegador antes do envio (lib/imagem.ts).
export const GALERIA_LADO_GRANDE = 1600
export const GALERIA_LADO_MINI = 480

// Aviso discreto que acompanha a galeria para o cliente.
export const AVISO_GALERIA = 'As fotos são referências. O resultado pode variar conforme a pelagem, a raça e as condições do pet.'

// Linhas do banco → fotos por serviço, na ordem da loja.
export function agruparFotosPorServico(linhas: unknown): Record<string, FotoServico[]> {
  const mapa: Record<string, FotoServico[]> = {}
  for (const f of (Array.isArray(linhas) ? linhas : []) as FotoServico[]) {
    ;(mapa[f.id_servico] ??= []).push(f)
  }
  for (const lista of Object.values(mapa)) lista.sort((a, b) => a.ordem - b.ordem)
  return mapa
}

// O que falta no nome/descrição (ou null).
export function problemaDaFoto(nome: string, descricao: string): string | null {
  const n = nome.trim()
  if (!n) return 'Dê um nome ao modelo (ex.: Tosa bebê).'
  if (n.length > GALERIA_NOME_MAX) return `O nome pode ter até ${GALERIA_NOME_MAX} letras.`
  if (descricao.trim().length > GALERIA_DESCRICAO_MAX) return `A descrição pode ter até ${GALERIA_DESCRICAO_MAX} letras.`
  return null
}
