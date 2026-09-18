'use client'

// ============================================================
// Sons de notificação — Web Audio API, sem nenhum arquivo de áudio.
// Cada som é uma receita curta de tons (osciladores com envelope de
// volume), então não existe licença pra verificar nem asset pra
// baixar/hospedar: é só matemática tocada na hora, em qualquer navegador.
// ============================================================

export type TipoSom = 'sino' | 'notificacao' | 'campainha' | 'alerta_suave' | 'alerta_duplo'

export const SONS_DISPONIVEIS: { value: TipoSom; label: string }[] = [
  { value: 'sino', label: 'Sino' },
  { value: 'notificacao', label: 'Notificação' },
  { value: 'campainha', label: 'Campainha' },
  { value: 'alerta_suave', label: 'Alerta suave' },
  { value: 'alerta_duplo', label: 'Alerta duplo' },
]

interface Tom {
  freq: number
  inicio: number // segundos, relativo ao instante em que tocarSom() foi chamado
  duracao: number
  volume?: number
  tipoOnda?: OscillatorType
}

// Cada nota é uma nota musical curta (nomes em comentário só de referência
// — o que importa é a combinação soar diferente das outras 4 opções).
const RECEITAS: Record<TipoSom, Tom[]> = {
  sino: [
    { freq: 1046.5, inicio: 0, duracao: 0.9, volume: 0.22 }, // C6 — tom principal, decaimento longo
    { freq: 2093, inicio: 0, duracao: 0.5, volume: 0.07 }, // oitava acima, mais fraco — dá o "brilho" de sino
  ],
  notificacao: [
    { freq: 659.25, inicio: 0, duracao: 0.14, volume: 0.22 }, // E5
    { freq: 987.77, inicio: 0.12, duracao: 0.3, volume: 0.22 }, // B5 — sobe, como um "ding-ding!"
  ],
  campainha: [
    { freq: 783.99, inicio: 0, duracao: 0.32, volume: 0.22 }, // G5
    { freq: 587.33, inicio: 0.3, duracao: 0.5, volume: 0.22 }, // D5 — desce, "dong-dong" clássico
  ],
  alerta_suave: [
    { freq: 523.25, inicio: 0, duracao: 0.6, volume: 0.14, tipoOnda: 'sine' }, // C5, único, bem discreto
  ],
  alerta_duplo: [
    { freq: 698.46, inicio: 0, duracao: 0.16, volume: 0.22 },
    { freq: 698.46, inicio: 0.24, duracao: 0.16, volume: 0.22 }, // mesma nota duas vezes — "bip-bip"
  ],
}

let audioCtx: AudioContext | null = null

function obterAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    audioCtx = new AudioContextClass()
  }
  return audioCtx
}

// Autoplay: navegadores só deixam o JS iniciar áudio depois de alguma
// interação real da pessoa na página (clique, tecla...) — e o som da
// notificação precisa disparar sozinho, sem ninguém clicar bem naquele
// instante. Por isso "destravamos" o AudioContext no primeiro clique ou
// tecla em QUALQUER lugar da tela; feito isso uma vez, ele fica liberado
// pelo resto da sessão (é exatamente o que já acontece antes de chegar
// o primeiro agendamento novo — a recepção não fica parada sem tocar em
// nada o dia inteiro).
if (typeof window !== 'undefined') {
  const destravar = () => {
    const ctx = obterAudioContext()
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  }
  window.addEventListener('pointerdown', destravar)
  window.addEventListener('keydown', destravar)
}

function agendarTom(ctx: AudioContext, referencia: number, tom: Tom) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = tom.tipoOnda ?? 'sine'
  osc.frequency.value = tom.freq

  const t0 = referencia + tom.inicio
  const t1 = t0 + tom.duracao
  const volume = tom.volume ?? 0.2

  // Ataque rápido (evita "clique" no começo) + decaimento exponencial
  // (soa mais natural que cortar o volume seco no fim).
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t1)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t1 + 0.05)
}

/** Toca um dos 5 sons pelo nome. Silencioso (não lança erro) se o
 * navegador não suportar Web Audio ou o áudio ainda estiver travado. */
export function tocarSom(tipo: string) {
  const ctx = obterAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const receita = RECEITAS[tipo as TipoSom] ?? RECEITAS.sino
  const agora = ctx.currentTime
  for (const tom of receita) agendarTom(ctx, agora, tom)
}
