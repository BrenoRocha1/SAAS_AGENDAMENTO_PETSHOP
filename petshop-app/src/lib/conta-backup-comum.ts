// O que a tela (navegador) e o servidor usam do backup de contas
// (lib/conta-backup). Sem nada de servidor aqui. Não é 'use server'.

export const BUCKET_BACKUPS = 'backups-contas'
export const FORMATO_BACKUP = 'saip-backup'
export const VERSAO_BACKUP = 1

export type TipoPerfil = 'cliente' | 'lojista'
export type TipoConta = TipoPerfil | 'funcionario' | 'sem'

export interface BackupConta {
  formato: typeof FORMATO_BACKUP
  versao: number
  tipo: TipoPerfil
  gerado_em: string
  origem: { id: string; email: string | null; nome: string }
  // Quantos itens de cada parte (para mostrar antes de importar).
  resumo: Record<string, number>
  dados: Record<string, unknown>
}

const ROTULO_TIPO: Record<TipoConta, string> = {
  cliente: 'cliente', lojista: 'loja', funcionario: 'funcionário de loja', sem: 'sem perfil',
}
export const rotuloTipoConta = (t: TipoConta) => ROTULO_TIPO[t]

// "servicos" → "serviços" para o resumo do arquivo.
export const ROTULO_PARTE: Record<string, string> = {
  pets: 'pets', lojas: 'lojas que usa', servicos: 'serviços', produtos: 'produtos', categorias: 'categorias',
  adicionais: 'serviços adicionais', planos: 'planos', horarios: 'dias de horário', equipe: 'pessoas na equipe',
}

// Confere o formato do arquivo (o servidor confere de novo ao importar).
export function validarBackup(bruto: unknown): BackupConta {
  const b = bruto as Partial<BackupConta> | null
  if (!b || typeof b !== 'object' || b.formato !== FORMATO_BACKUP) throw new Error('Este arquivo não é um backup do SAIP.')
  if (typeof b.versao !== 'number' || b.versao > VERSAO_BACKUP) throw new Error('Backup de uma versão mais nova do SAIP — atualize o sistema antes de importar.')
  if (b.tipo !== 'cliente' && b.tipo !== 'lojista') throw new Error('Backup sem o tipo da conta (cliente ou loja).')
  if (!b.dados || typeof b.dados !== 'object') throw new Error('Backup sem dados.')
  return b as BackupConta
}
