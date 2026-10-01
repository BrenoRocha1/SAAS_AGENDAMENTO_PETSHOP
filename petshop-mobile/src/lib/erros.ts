// As funções do banco levantam mensagens já pensadas pro usuário, com um
// prefixo que diz de onde vêm ("Loja fechada: …", "Editar: …",
// "Pagamento: …", "TaxiDog: …", "Bloqueio: …"). Aqui o prefixo sai e
// sobra o texto pronto pra tela — mesma convenção do painel web.

type ErroBanco = { message?: string; code?: string } | null | undefined

const PREFIXOS = ['Loja fechada', 'Bloqueio', 'Editar', 'Remarcar', 'Pagamento', 'TaxiDog', 'Plano', 'Estoque']

function comPontoFinal(texto: string): string {
  const t = texto.trim()
  const frase = t.charAt(0).toUpperCase() + t.slice(1)
  return /[.!?]$/.test(frase) ? frase : `${frase}.`
}

// A função (ou a tabela) ainda não existe no banco: falta rodar migration.
export function faltaMigration(error: ErroBanco): boolean {
  const msg = error?.message ?? ''
  return error?.code === 'PGRST202' || error?.code === '42883' || /Could not find the function|schema cache|does not exist/i.test(msg)
}

export function mensagemDoBanco(error: ErroBanco, padrao: string): string {
  const msg = error?.message ?? ''
  if (!msg) return padrao
  if (faltaMigration(error)) return 'Esta função ainda não foi ativada no sistema da loja. Avise o responsável.'
  for (const prefixo of PREFIXOS) {
    const m = msg.match(new RegExp(`${prefixo}: ([^\\n]+)`))
    if (m) return prefixo === 'Loja fechada' ? comPontoFinal(`Loja fechada: ${m[1]}`) : comPontoFinal(m[1])
  }
  if (/Failed to fetch|Network request failed|network/i.test(msg)) return 'Sem conexão com a internet. Tente de novo.'
  // Mensagens curtas em português, sem cara de erro técnico, vêm das
  // próprias funções (ex.: "Horário não disponível").
  if (msg.length <= 160 && !/[{}_]|\bERROR\b|violates|permission denied|JWT|syntax/i.test(msg)) return comPontoFinal(msg)
  return padrao
}
