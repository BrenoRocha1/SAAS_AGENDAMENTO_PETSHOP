// Sons de aviso — os mesmos cinco do site
// (petshop-app/src/lib/sons-notificacao.ts). Lá o navegador toca a receita
// na hora; aqui cada receita é um arquivo curto em assets/sons, gerado por
// scripts/gerar-sons.mjs com a mesma conta, e tocado pelo expo-audio (no
// celular e no navegador).

export type TipoSom = 'sino' | 'notificacao' | 'campainha' | 'alerta_suave' | 'alerta_duplo'

export const SONS_DISPONIVEIS: { valor: TipoSom; rotulo: string }[] = [
  { valor: 'sino', rotulo: 'Sino' },
  { valor: 'notificacao', rotulo: 'Notificação' },
  { valor: 'campainha', rotulo: 'Campainha' },
  { valor: 'alerta_suave', rotulo: 'Alerta suave' },
  { valor: 'alerta_duplo', rotulo: 'Alerta duplo' },
]

const ARQUIVOS: Record<TipoSom, number> = {
  sino: require('../../assets/sons/sino.wav'),
  notificacao: require('../../assets/sons/notificacao.wav'),
  campainha: require('../../assets/sons/campainha.wav'),
  alerta_suave: require('../../assets/sons/alerta_suave.wav'),
  alerta_duplo: require('../../assets/sons/alerta_duplo.wav'),
}

interface Tocador {
  play(): void
  seekTo(segundos: number): Promise<void>
}

// Um tocador por som, criado na primeira vez e reaproveitado.
const tocadores: Partial<Record<TipoSom, Tocador>> = {}

/** Toca um dos cinco sons pelo nome. Em silêncio (não lança erro) se o
 * aparelho não tiver como tocar — por exemplo, um app instalado antes de o
 * áudio existir: o módulo é carregado só aqui, e a falta dele não derruba
 * tela nenhuma. */
export function tocarSom(tipo: string) {
  const som: TipoSom = tipo in ARQUIVOS ? (tipo as TipoSom) : 'sino'
  try {
    let tocador = tocadores[som]
    if (!tocador) {
      const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio')
      tocador = createAudioPlayer(ARQUIVOS[som])
      tocadores[som] = tocador
    }
    // Volta ao começo: o mesmo som pode tocar de novo logo em seguida.
    tocador.seekTo(0).catch(() => {})
    tocador.play()
  } catch {
    // sem áudio neste aparelho
  }
}

// ── Configuração da loja (lojista.som_novo_agendamento_*, migration 036) ──
export interface SomDaLoja {
  ativo: boolean
  tipo: TipoSom
}

export const SOM_PADRAO: SomDaLoja = { ativo: true, tipo: 'sino' }

// A tela de Notificações avisa quando a configuração muda, para o aviso de
// agendamento novo (que fica ligado o tempo todo) já tocar o som escolhido.
const ouvintes = new Set<(som: SomDaLoja) => void>()

export function ouvirSomDaLoja(ouvinte: (som: SomDaLoja) => void): () => void {
  ouvintes.add(ouvinte)
  return () => { ouvintes.delete(ouvinte) }
}

export function avisarSomDaLoja(som: SomDaLoja) {
  for (const ouvinte of ouvintes) ouvinte(som)
}
