// Gera os sons de aviso do app (assets/sons/*.wav) a partir das mesmas
// receitas do site (petshop-app/src/lib/sons-notificacao.ts). Lá o som é
// tocado na hora pelo navegador (Web Audio); no celular não existe isso,
// então cada receita vira um arquivo curto, calculado aqui com a mesma
// conta — mesmas notas, mesmo volume, mesma subida e descida.
//
// Mudou uma receita no site? Copie para cá e rode: node scripts/gerar-sons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RECEITAS = {
  sino: [
    { freq: 1046.5, inicio: 0, duracao: 0.9, volume: 0.22 },
    { freq: 2093, inicio: 0, duracao: 0.5, volume: 0.07 },
  ],
  notificacao: [
    { freq: 659.25, inicio: 0, duracao: 0.14, volume: 0.22 },
    { freq: 987.77, inicio: 0.12, duracao: 0.3, volume: 0.22 },
  ],
  campainha: [
    { freq: 783.99, inicio: 0, duracao: 0.32, volume: 0.22 },
    { freq: 587.33, inicio: 0.3, duracao: 0.5, volume: 0.22 },
  ],
  alerta_suave: [
    { freq: 523.25, inicio: 0, duracao: 0.6, volume: 0.14 },
  ],
  alerta_duplo: [
    { freq: 698.46, inicio: 0, duracao: 0.16, volume: 0.22 },
    { freq: 698.46, inicio: 0.24, duracao: 0.16, volume: 0.22 },
  ],
}

const TAXA = 44100
const ATAQUE = 0.015
const SILENCIO = 0.0001
const SOBRA = 0.05

// O volume de um tom no instante `t` (segundos desde o começo dele): sobe
// reto em 15 ms e desce em curva até quase zero no fim — como o site faz
// com linearRampToValueAtTime + exponentialRampToValueAtTime.
function volumeEm(t, tom) {
  if (t < 0 || t > tom.duracao + SOBRA) return 0
  if (t < ATAQUE) return (tom.volume * t) / ATAQUE
  if (t >= tom.duracao) return SILENCIO
  return tom.volume * Math.pow(SILENCIO / tom.volume, (t - ATAQUE) / (tom.duracao - ATAQUE))
}

function gerar(receita) {
  const fim = Math.max(...receita.map(tom => tom.inicio + tom.duracao + SOBRA))
  const amostras = Math.ceil(fim * TAXA)
  const dados = Buffer.alloc(amostras * 2)
  for (let i = 0; i < amostras; i++) {
    const t = i / TAXA
    let valor = 0
    for (const tom of receita) {
      const local = t - tom.inicio
      valor += volumeEm(local, tom) * Math.sin(2 * Math.PI * tom.freq * local)
    }
    dados.writeInt16LE(Math.round(Math.max(-1, Math.min(1, valor)) * 32767), i * 2)
  }
  // Cabeçalho WAV: PCM, mono, 16 bits.
  const cabecalho = Buffer.alloc(44)
  cabecalho.write('RIFF', 0)
  cabecalho.writeUInt32LE(36 + dados.length, 4)
  cabecalho.write('WAVE', 8)
  cabecalho.write('fmt ', 12)
  cabecalho.writeUInt32LE(16, 16)
  cabecalho.writeUInt16LE(1, 20)
  cabecalho.writeUInt16LE(1, 22)
  cabecalho.writeUInt32LE(TAXA, 24)
  cabecalho.writeUInt32LE(TAXA * 2, 28)
  cabecalho.writeUInt16LE(2, 32)
  cabecalho.writeUInt16LE(16, 34)
  cabecalho.write('data', 36)
  cabecalho.writeUInt32LE(dados.length, 40)
  return Buffer.concat([cabecalho, dados])
}

const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sons')
mkdirSync(pasta, { recursive: true })
for (const [nome, receita] of Object.entries(RECEITAS)) {
  const arquivo = gerar(receita)
  writeFileSync(join(pasta, `${nome}.wav`), arquivo)
  console.log(`${nome}.wav — ${(arquivo.length / 1024).toFixed(0)} KB`)
}
