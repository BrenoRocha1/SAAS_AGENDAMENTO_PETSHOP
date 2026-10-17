// Contas no painel interno: converter cliente <-> loja, backup e importação
// (migration 105). Roda só no servidor, com a service_role — quem chama
// (lib/actions-interno) confere antes que é um administrador da plataforma.
// Não é um arquivo 'use server'.
//
// O backup é um JSON com o tipo da conta ("cliente" ou "lojista"): só entra
// numa conta do MESMO tipo. As fotos vão dentro do arquivo (base64), porque
// ao converter as pastas de fotos da conta são apagadas. Os arquivos ficam
// num bucket PRIVADO do Storage (backups-contas): o painel lista, baixa e
// restaura de lá, e também aceita um arquivo enviado.
//
// O que NÃO entra no backup da loja: agendamentos, vendas, clientes e
// assinaturas — são registros que envolvem outras pessoas e não teriam
// como voltar ligados a elas.

import type { createAdminClient } from '@/lib/supabase/admin'
import { gerarEmailInterno } from '@/lib/email-interno'
import { cpfValido } from '@/lib/cadastro-loja'

type Db = NonNullable<ReturnType<typeof createAdminClient>>
type Linha = Record<string, unknown>

import {
  BUCKET_BACKUPS, FORMATO_BACKUP, VERSAO_BACKUP, rotuloTipoConta, validarBackup,
  type BackupConta, type TipoConta, type TipoPerfil,
} from '@/lib/conta-backup-comum'
export { BUCKET_BACKUPS, rotuloTipoConta, validarBackup, type BackupConta, type TipoConta, type TipoPerfil }

export interface Foto { tipo: string; base64: string }


export interface Relatorio { feito: string[]; avisos: string[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMITE_FOTO = 5 * 1024 * 1024
const TIPOS_FOTO: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
}

const erroMsg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e))

// Tira as colunas que não podem ir de uma conta para outra (ids, datas de
// controle, colunas calculadas pelo banco).
function sem(linha: Linha | null | undefined, colunas: string[]): Linha {
  const copia: Linha = { ...(linha ?? {}) }
  for (const c of colunas) delete copia[c]
  return copia
}

// ── Tipo da conta ───────────────────────────────────────────────────────────

export async function tipoDaConta(db: Db, id: string): Promise<{ tipo: TipoConta; nome: string | null }> {
  const [loja, cliente, func] = await Promise.all([
    db.from('lojista').select('nome_loja').eq('id_lojista', id).maybeSingle(),
    db.from('cliente').select('nome').eq('id_cliente', id).maybeSingle(),
    db.from('funcionario').select('nome').eq('id_funcionario', id).maybeSingle(),
  ])
  if (loja.data) return { tipo: 'lojista', nome: loja.data.nome_loja }
  if (cliente.data) return { tipo: 'cliente', nome: cliente.data.nome }
  if (func.data) return { tipo: 'funcionario', nome: func.data.nome }
  return { tipo: 'sem', nome: null }
}

// ── Fotos ───────────────────────────────────────────────────────────────────

// Lê a foto para dentro do backup. Só do nosso Storage (ou data URI): nunca
// busca um endereço qualquer que esteja gravado no banco.
async function baixarFoto(db: Db, url: unknown): Promise<Foto | null> {
  if (typeof url !== 'string' || !url) return null
  try {
    if (url.startsWith('data:')) {
      // "data:image/svg+xml;utf8,…" ou "data:image/png;base64,…".
      const m = url.match(/^data:([^;,]+)((?:;[^;,]*)*),([\s\S]*)$/)
      if (!m || !TIPOS_FOTO[m[1]]) return null
      const base64 = /;base64/i.test(m[2]) ? m[3] : Buffer.from(decodeURIComponent(m[3]), 'utf-8').toString('base64')
      return { tipo: m[1], base64 }
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    const prefixo = base ? `${base.replace(/\/$/, '')}/storage/v1/object/public/` : null
    if (!prefixo || !url.startsWith(prefixo)) return null
    const [bucket, ...partes] = url.slice(prefixo.length).split('?')[0].split('/')
    const caminho = decodeURIComponent(partes.join('/'))
    const { data, error } = await db.storage.from(bucket).download(caminho)
    if (error || !data) return null
    const tipo = data.type && TIPOS_FOTO[data.type] ? data.type : null
    if (!tipo || data.size > LIMITE_FOTO) return null
    return { tipo, base64: Buffer.from(await data.arrayBuffer()).toString('base64') }
  } catch {
    return null
  }
}

function fotoValida(f: unknown): f is Foto {
  return !!f && typeof f === 'object' && typeof (f as Foto).tipo === 'string' && !!TIPOS_FOTO[(f as Foto).tipo]
    && typeof (f as Foto).base64 === 'string' && (f as Foto).base64.length > 0
}

// Grava a foto do backup no Storage e devolve o endereço público.
async function subirFoto(db: Db, bucket: string, caminhoSemExtensao: string, foto: unknown): Promise<string | null> {
  if (!fotoValida(foto)) return null
  const bytes = Buffer.from(foto.base64, 'base64')
  if (bytes.length === 0 || bytes.length > LIMITE_FOTO) return null
  const caminho = `${caminhoSemExtensao}.${TIPOS_FOTO[foto.tipo]}`
  const { error } = await db.storage.from(bucket).upload(caminho, bytes, { contentType: foto.tipo, upsert: true })
  if (error) return null
  return `${db.storage.from(bucket).getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`
}

// Apaga a pasta de uma conta num bucket (fotos de pets, logo, produtos).
async function apagarPasta(db: Db, bucket: string, pasta: string) {
  try {
    const { data } = await db.storage.from(bucket).list(pasta, { limit: 1000 })
    if (data && data.length) await db.storage.from(bucket).remove(data.map(f => `${pasta}/${f.name}`))
  } catch { /* o que sobrar não aparece em lugar nenhum */ }
}

// ── Montar o backup ─────────────────────────────────────────────────────────

const COLUNAS_PERFIL_LOJA = [
  'nome_loja', 'telefone', 'descricao', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep', 'slug',
  'kanban_ativo', 'aceita_agendamento_online', 'agendamento_min_valor', 'agendamento_min_unidade', 'agendamento_max_valor',
  'agendamento_max_unidade', 'som_novo_agendamento_ativo', 'som_novo_agendamento_tipo', 'precos_estimados',
  'agendamentos_simultaneos', 'bloquear_cancelamento_aceito',
]

async function linhas(db: Db, tabela: string, filtro: (q: ReturnType<ReturnType<Db['from']>['select']>) => unknown): Promise<Linha[]> {
  const q = db.from(tabela).select('*')
  const { data, error } = await (filtro(q) as typeof q)
  return error ? [] : ((data ?? []) as Linha[])
}

async function backupCliente(db: Db, id: string): Promise<{ resumo: Record<string, number>; dados: Record<string, unknown>; nome: string }> {
  const { data: c } = await db.from('cliente').select('*').eq('id_cliente', id).maybeSingle()
  if (!c) throw new Error('Esta conta não tem cadastro de cliente.')
  const pets = await linhas(db, 'pet', q => q.eq('id_cliente', id))
  const vinculos = await linhas(db, 'cliente_lojista', q => q.eq('id_cliente', id))
  const idsLojas = vinculos.map(v => v.id_lojista as string)
  const { data: lojas } = idsLojas.length
    ? await db.from('lojista').select('id_lojista, nome_loja').in('id_lojista', idsLojas)
    : { data: [] as { id_lojista: string; nome_loja: string }[] }

  const petsComFoto = []
  for (const p of pets) {
    petsComFoto.push({ ...sem(p, ['id_pet', 'id_cliente', 'created_at', 'updated_at', 'foto_url']), foto: await baixarFoto(db, p.foto_url) })
  }
  return {
    nome: c.nome,
    resumo: { pets: pets.length, lojas: (lojas ?? []).length },
    dados: {
      perfil: { nome: c.nome, cpf: c.cpf, telefone: c.telefone, foto: await baixarFoto(db, c.foto_url) },
      pets: petsComFoto,
      lojas: lojas ?? [],
    },
  }
}

async function backupLoja(db: Db, id: string): Promise<{ resumo: Record<string, number>; dados: Record<string, unknown>; nome: string }> {
  const { data: l } = await db.from('lojista').select('*').eq('id_lojista', id).maybeSingle()
  if (!l) throw new Error('Esta conta não tem cadastro de loja.')
  const hoje = new Date().toISOString().slice(0, 10)
  const perfil: Linha = {}
  for (const c of COLUNAS_PERFIL_LOJA) if (c in l) perfil[c] = (l as Linha)[c]

  const [horarios, bloqueios, pagamento, categorias, produtos, custos, fiscais, servicos, adicionais, adicServ, planos, taxiCfg, faixas, regioes, equipe] = await Promise.all([
    linhas(db, 'horario', q => q.eq('id_lojista', id)),
    linhas(db, 'loja_bloqueio', q => q.eq('id_lojista', id).gte('dt_fim', hoje)),
    linhas(db, 'loja_pagamento', q => q.eq('id_lojista', id)),
    linhas(db, 'categoria_produto', q => q.eq('id_lojista', id)),
    linhas(db, 'produto', q => q.eq('id_lojista', id).is('excluido_em', null)),
    linhas(db, 'produto_custo', q => q.eq('id_lojista', id)),
    linhas(db, 'produto_fiscal', q => q.eq('id_lojista', id)),
    linhas(db, 'servico', q => q.eq('id_lojista', id).is('excluido_em', null)),
    linhas(db, 'servico_adicional', q => q.eq('id_lojista', id).is('excluido_em', null)),
    linhas(db, 'servico_adicional_servico', q => q.eq('id_lojista', id)),
    linhas(db, 'plano', q => q.eq('id_lojista', id).is('excluido_em', null)),
    linhas(db, 'taxidog_config', q => q.eq('id_lojista', id)),
    linhas(db, 'taxidog_faixa', q => q.eq('id_lojista', id)),
    linhas(db, 'taxidog_regiao', q => q.eq('id_lojista', id)),
    linhas(db, 'funcionario', q => q.eq('id_lojista', id)),
  ])
  const idsServicos = servicos.map(s => s.id_servico as string)
  const idsPlanos = planos.map(p => p.id_plano as string)
  const [vars, plServ] = await Promise.all([
    idsServicos.length ? linhas(db, 'servico_variacao', q => q.in('id_servico', idsServicos)) : Promise.resolve([]),
    idsPlanos.length ? linhas(db, 'plano_servico', q => q.in('id_plano', idsPlanos)) : Promise.resolve([]),
  ])
  const custoPor = new Map(custos.map(c => [c.id_produto as string, c.custo_unitario]))
  const fiscalPor = new Map(fiscais.map(f => [f.id_produto as string, sem(f, ['id_produto', 'id_lojista', 'atualizado_por', 'updated_at'])]))

  const produtosComFoto = []
  for (const p of produtos) {
    produtosComFoto.push({
      _id: p.id_produto,
      ...sem(p, ['id_produto', 'id_lojista', 'created_at', 'updated_at', 'excluido_em', 'nome_busca', 'foto_url']),
      foto: await baixarFoto(db, p.foto_url),
      custo: custoPor.get(p.id_produto as string) ?? null,
      fiscal: fiscalPor.get(p.id_produto as string) ?? null,
    })
  }
  const tcfg = taxiCfg[0]

  return {
    nome: l.nome_loja,
    resumo: {
      servicos: servicos.length, produtos: produtos.length, categorias: categorias.length, adicionais: adicionais.length,
      planos: planos.length, horarios: horarios.length, equipe: equipe.length,
    },
    dados: {
      perfil: { ...perfil, documento: l.documento ?? null, logo: await baixarFoto(db, l.logo_url) },
      horarios: horarios.map(h => sem(h, ['id_horario', 'id_lojista', 'created_at', 'updated_at'])),
      bloqueios: bloqueios.map(b => sem(b, ['id_bloqueio', 'id_lojista', 'id_usuario', 'created_at'])),
      pagamento: pagamento[0] ? sem(pagamento[0], ['id_lojista', 'updated_at']) : null,
      categorias: categorias.map(c => ({ _id: c.id_categoria, nome: c.nome })),
      produtos: produtosComFoto,
      servicos: servicos.map(s => ({
        _id: s.id_servico,
        ...sem(s, ['id_servico', 'id_lojista', 'created_at', 'updated_at', 'excluido_em']),
        variacoes: vars.filter(v => v.id_servico === s.id_servico).map(v => sem(v, ['id_variacao', 'id_servico', 'created_at', 'updated_at'])),
      })),
      adicionais: adicionais.map(a => ({
        _id: a.id_adicional,
        ...sem(a, ['id_adicional', 'id_lojista', 'created_at', 'updated_at', 'excluido_em']),
        servicos: adicServ.filter(x => x.id_adicional === a.id_adicional).map(x => x.id_servico),
      })),
      planos: planos.map(p => ({
        _id: p.id_plano,
        ...sem(p, ['id_plano', 'id_lojista', 'created_at', 'updated_at', 'excluido_em']),
        servicos: plServ.filter(x => x.id_plano === p.id_plano).map(x => ({ id_servico: x.id_servico, quantidade: x.quantidade })),
      })),
      taxidog: tcfg ? {
        config: sem(tcfg, ['id_lojista', 'created_at', 'updated_at']),
        faixas: faixas.map(f => sem(f, ['id_faixa', 'id_lojista'])),
        regioes: regioes.map(r => sem(r, ['id_regiao', 'id_lojista', 'created_at'])),
      } : null,
      equipe: equipe.map(f => sem(f, ['id_funcionario', 'id_lojista', 'created_at', 'updated_at'])),
    },
  }
}

export async function montarBackup(db: Db, id: string): Promise<BackupConta> {
  const { tipo } = await tipoDaConta(db, id)
  if (tipo !== 'cliente' && tipo !== 'lojista') throw new Error(`Conta ${rotuloTipoConta(tipo)}: não há dados de cliente ou de loja para guardar.`)
  const { data: login } = await db.auth.admin.getUserById(id)
  const parte = tipo === 'cliente' ? await backupCliente(db, id) : await backupLoja(db, id)
  return {
    formato: FORMATO_BACKUP, versao: VERSAO_BACKUP, tipo, gerado_em: new Date().toISOString(),
    origem: { id, email: login?.user?.email ?? null, nome: parte.nome },
    resumo: parte.resumo, dados: parte.dados,
  }
}

// ── Guardar e ler backups (bucket privado) ──────────────────────────────────

export async function garantirBucket(db: Db) {
  const { data } = await db.storage.getBucket(BUCKET_BACKUPS)
  if (!data) await db.storage.createBucket(BUCKET_BACKUPS, { public: false })
}

export async function guardarBackup(db: Db, backup: BackupConta): Promise<string> {
  await garantirBucket(db)
  const quando = backup.gerado_em.replace(/[:.]/g, '-')
  const caminho = `${backup.origem.id}/${backup.tipo}-${quando}.json`
  const { error } = await db.storage.from(BUCKET_BACKUPS).upload(caminho, Buffer.from(JSON.stringify(backup), 'utf-8'), {
    contentType: 'application/json', upsert: false,
  })
  if (error) throw new Error(`Não foi possível guardar o backup: ${error.message}`)
  return caminho
}

export interface BackupGuardado { caminho: string; nome: string; tipo: TipoPerfil | null; criado: string | null; tamanho: number | null }

export async function listarBackups(db: Db, id: string): Promise<BackupGuardado[]> {
  const { data } = await db.storage.from(BUCKET_BACKUPS).list(id, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  return (data ?? [])
    .filter(f => f.name.endsWith('.json'))
    .map(f => ({
      caminho: `${id}/${f.name}`,
      nome: f.name,
      tipo: f.name.startsWith('cliente-') ? 'cliente' : f.name.startsWith('lojista-') ? 'lojista' : null,
      criado: f.created_at ?? null,
      tamanho: (f.metadata as { size?: number } | null)?.size ?? null,
    }))
}

// Caminho que o painel pode ler: o backup de uma conta ou um arquivo enviado.
export function caminhoDeBackupValido(caminho: string): boolean {
  const partes = caminho.split('/')
  if (partes.length === 2 && UUID_RE.test(partes[0])) return /^(cliente|lojista)-[\w-]+\.json$/.test(partes[1])
  if (partes.length === 3 && partes[0] === 'envios' && UUID_RE.test(partes[1])) return /^[0-9a-f-]{36}\.json$/i.test(partes[2])
  return false
}

export async function lerBackup(db: Db, caminho: string): Promise<BackupConta> {
  if (!caminhoDeBackupValido(caminho)) throw new Error('Arquivo de backup inválido.')
  const { data, error } = await db.storage.from(BUCKET_BACKUPS).download(caminho)
  if (error || !data) throw new Error('Não foi possível ler o arquivo de backup.')
  return validarBackup(JSON.parse(await data.text()))
}


// ── Importar ────────────────────────────────────────────────────────────────

export interface OpcoesImportar {
  // Copiar nome, telefone, endereço etc. do backup para a conta.
  perfil: boolean
  // Loja: recriar os funcionários (com login novo; o código de acesso é
  // gerado de novo na tela da equipe).
  equipe: boolean
}

const lista = (v: unknown): Linha[] => (Array.isArray(v) ? (v.filter(x => x && typeof x === 'object') as Linha[]) : [])
const normal = (t: unknown) => String(t ?? '').trim().toLowerCase()

async function importarCliente(db: Db, idDestino: string, b: BackupConta, op: OpcoesImportar): Promise<Relatorio> {
  const feito: string[] = []
  const avisos: string[] = []
  const d = b.dados as { perfil?: Linha; pets?: unknown; lojas?: unknown }

  if (op.perfil && d.perfil) {
    const p = d.perfil
    const mudar: Linha = {}
    if (typeof p.nome === 'string' && p.nome.trim().length >= 2) mudar.nome = p.nome.trim().slice(0, 120)
    if (typeof p.telefone === 'string' && /^\d{10,11}$/.test(p.telefone)) mudar.telefone = p.telefone
    // CPF é único e é o documento da pessoa: só volta para a MESMA conta.
    if (b.origem.id === idDestino && typeof p.cpf === 'string' && cpfValido(p.cpf)) mudar.cpf = p.cpf
    const foto = await subirFoto(db, 'fotos-pet', `${idDestino}/perfil-${Date.now()}`, p.foto)
    if (foto) mudar.foto_url = foto
    if (Object.keys(mudar).length) {
      const { error } = await db.from('cliente').update(mudar).eq('id_cliente', idDestino)
      if (error) avisos.push(`Perfil: ${/cpf/i.test(error.message) ? 'o CPF do backup já está em outra conta' : error.message}`)
      else feito.push('Dados do perfil (nome, telefone' + (mudar.cpf ? ', CPF' : '') + (foto ? ', foto' : '') + ')')
    }
  }

  const { data: existentes } = await db.from('pet').select('nome').eq('id_cliente', idDestino)
  const jaTem = new Set(((existentes ?? []) as { nome: string }[]).map(p => normal(p.nome)))
  let pets = 0
  for (const p of lista(d.pets)) {
    if (jaTem.has(normal(p.nome))) continue
    const { foto, ...campos } = p
    const { data, error } = await db.from('pet').insert({ ...sem(campos, ['id_pet', 'id_cliente', 'foto_url']), id_cliente: idDestino }).select('id_pet').single()
    if (error || !data) { avisos.push(`Pet ${String(p.nome ?? '')}: ${error?.message ?? 'não entrou'}`); continue }
    const url = await subirFoto(db, 'fotos-pet', `${idDestino}/${data.id_pet}`, foto)
    if (url) await db.from('pet').update({ foto_url: url }).eq('id_pet', data.id_pet)
    jaTem.add(normal(p.nome))
    pets++
  }
  feito.push(`Pets (${pets} novos)`)

  let lojas = 0
  for (const l of lista(d.lojas)) {
    if (typeof l.id_lojista !== 'string' || !UUID_RE.test(l.id_lojista)) continue
    const { data: existe } = await db.from('lojista').select('id_lojista').eq('id_lojista', l.id_lojista).maybeSingle()
    if (!existe) continue
    const { error } = await db.from('cliente_lojista').upsert({ id_cliente: idDestino, id_lojista: l.id_lojista }, { onConflict: 'id_cliente,id_lojista', ignoreDuplicates: true })
    if (!error) lojas++
  }
  if (lista(d.lojas).length) feito.push(`Lojas que a pessoa usa (${lojas} religadas)`)
  return { feito, avisos }
}

async function importarLoja(db: Db, idDestino: string, b: BackupConta, op: OpcoesImportar): Promise<Relatorio> {
  const feito: string[] = []
  const avisos: string[] = []
  const d = b.dados as Record<string, unknown>
  const tentar = async (parte: string, f: () => Promise<void>) => {
    try { await f() } catch (e) { avisos.push(`${parte}: ${erroMsg(e)}`) }
  }

  if (op.perfil && d.perfil && typeof d.perfil === 'object') {
    await tentar('Perfil da loja', async () => {
      const p = d.perfil as Linha
      const mudar: Linha = {}
      for (const c of COLUNAS_PERFIL_LOJA) if (c in p && c !== 'slug') mudar[c] = p[c]
      // O endereço público é único: só volta se estiver livre.
      if (typeof p.slug === 'string' && p.slug) {
        const { data: dona } = await db.from('lojista').select('id_lojista').eq('slug', p.slug).neq('id_lojista', idDestino).limit(1)
        if (dona?.[0]) avisos.push(`Endereço público /${p.slug}: já é de outra loja, ficou de fora.`)
        else mudar.slug = p.slug
      }
      const logo = await subirFoto(db, 'logos-loja', `${idDestino}/logo-${Date.now()}`, p.logo)
      if (logo) mudar.logo_url = logo
      const { error } = await db.from('lojista').update(mudar).eq('id_lojista', idDestino)
      if (error) throw error
      // CPF/CNPJ à parte: se for recusado (inválido ou antifraude), o resto fica.
      if (typeof p.documento === 'string' && p.documento) {
        const { error: ed } = await db.from('lojista').update({ documento: p.documento }).eq('id_lojista', idDestino)
        if (ed) avisos.push(`CPF/CNPJ da loja: ${ed.message}`)
      }
      feito.push('Perfil da loja (nome, contato, endereço, configurações' + (logo ? ', logo' : '') + ')')
    })
  }

  await tentar('Horários', async () => {
    const { data: ex } = await db.from('horario').select('dia_semana').eq('id_lojista', idDestino)
    const tem = new Set(((ex ?? []) as { dia_semana: string }[]).map(h => h.dia_semana))
    const novos = lista(d.horarios).filter(h => !tem.has(String(h.dia_semana))).map(h => ({ ...h, id_lojista: idDestino }))
    if (novos.length) { const { error } = await db.from('horario').insert(novos); if (error) throw error }
    feito.push(`Horários (${novos.length} dias)`)
  })

  await tentar('Dias fechados', async () => {
    const novos = lista(d.bloqueios).map(x => ({ ...x, id_lojista: idDestino }))
    if (novos.length) { const { error } = await db.from('loja_bloqueio').insert(novos); if (error) throw error }
    if (novos.length) feito.push(`Dias e horários fechados (${novos.length})`)
  })

  if (d.pagamento && typeof d.pagamento === 'object') {
    await tentar('Formas de pagamento', async () => {
      const { error } = await db.from('loja_pagamento').upsert({ ...(d.pagamento as Linha), id_lojista: idDestino }, { onConflict: 'id_lojista', ignoreDuplicates: true })
      if (error) throw error
      feito.push('Formas de pagamento')
    })
  }

  // Categorias: pelo nome (a loja nova já nasce com as padrão).
  const categoria = new Map<string, string>()
  await tentar('Categorias', async () => {
    const { data: ex } = await db.from('categoria_produto').select('id_categoria, nome').eq('id_lojista', idDestino)
    const porNome = new Map(((ex ?? []) as { id_categoria: string; nome: string }[]).map(c => [normal(c.nome), c.id_categoria]))
    let novas = 0
    for (const c of lista(d.categorias)) {
      let idNovo = porNome.get(normal(c.nome))
      if (!idNovo) {
        const { data, error } = await db.from('categoria_produto').insert({ id_lojista: idDestino, nome: c.nome }).select('id_categoria').single()
        if (error || !data) { avisos.push(`Categoria ${String(c.nome)}: ${error?.message}`); continue }
        idNovo = data.id_categoria as string
        porNome.set(normal(c.nome), idNovo)
        novas++
      }
      categoria.set(String(c._id), idNovo)
    }
    feito.push(`Categorias de produto (${novas} novas)`)
  })

  await tentar('Produtos', async () => {
    const { data: ex } = await db.from('produto').select('nome').eq('id_lojista', idDestino).is('excluido_em', null)
    const tem = new Set(((ex ?? []) as { nome: string }[]).map(p => normal(p.nome)))
    let novos = 0
    for (const p of lista(d.produtos)) {
      if (tem.has(normal(p.nome))) continue
      const { _id, foto, custo, fiscal, id_categoria, ...campos } = p
      void _id
      const { data, error } = await db.from('produto').insert({
        ...sem(campos, ['id_produto', 'nome_busca', 'foto_url']), id_lojista: idDestino,
        id_categoria: typeof id_categoria === 'string' ? categoria.get(id_categoria) ?? null : null,
      }).select('id_produto').single()
      if (error || !data) { avisos.push(`Produto ${String(p.nome)}: ${error?.message}`); continue }
      const url = await subirFoto(db, 'fotos-produto', `${idDestino}/${data.id_produto}`, foto)
      if (url) await db.from('produto').update({ foto_url: url }).eq('id_produto', data.id_produto)
      if (custo != null) await db.from('produto_custo').insert({ id_produto: data.id_produto, id_lojista: idDestino, custo_unitario: custo })
      if (fiscal && typeof fiscal === 'object') await db.from('produto_fiscal').insert({ ...(fiscal as Linha), id_produto: data.id_produto, id_lojista: idDestino })
      tem.add(normal(p.nome))
      novos++
    }
    feito.push(`Produtos (${novos} novos, com foto, custo e informações fiscais)`)
  })

  // Serviços: guarda id do backup → id novo (adicionais e planos usam).
  const servico = new Map<string, string>()
  await tentar('Serviços', async () => {
    const { data: ex } = await db.from('servico').select('id_servico, nome').eq('id_lojista', idDestino).is('excluido_em', null)
    const porNome = new Map(((ex ?? []) as { id_servico: string; nome: string }[]).map(s => [normal(s.nome), s.id_servico]))
    let novos = 0
    for (const s of lista(d.servicos)) {
      const ja = porNome.get(normal(s.nome))
      if (ja) { servico.set(String(s._id), ja); continue }
      const { _id, variacoes, ...campos } = s
      const { data, error } = await db.from('servico').insert({ ...sem(campos, ['id_servico']), id_lojista: idDestino }).select('id_servico').single()
      if (error || !data) { avisos.push(`Serviço ${String(s.nome)}: ${error?.message}`); continue }
      servico.set(String(_id), data.id_servico as string)
      const vs = lista(variacoes).map(v => ({ ...v, id_servico: data.id_servico }))
      if (vs.length) {
        const { error: ev } = await db.from('servico_variacao').insert(vs)
        if (ev) avisos.push(`Preços por porte/raça de ${String(s.nome)}: ${ev.message}`)
      }
      novos++
    }
    feito.push(`Serviços (${novos} novos, com preços por porte/raça e promoções)`)
  })

  await tentar('Serviços adicionais', async () => {
    const itens = lista(d.adicionais)
    if (!itens.length) return
    const { data: ex } = await db.from('servico_adicional').select('nome').eq('id_lojista', idDestino).is('excluido_em', null)
    const tem = new Set(((ex ?? []) as { nome: string }[]).map(a => normal(a.nome)))
    let novos = 0
    for (const a of itens) {
      if (tem.has(normal(a.nome))) continue
      const { _id, servicos, ...campos } = a
      void _id
      const { data, error } = await db.from('servico_adicional').insert({ ...sem(campos, ['id_adicional']), id_lojista: idDestino }).select('id_adicional').single()
      if (error || !data) { avisos.push(`Adicional ${String(a.nome)}: ${error?.message}`); continue }
      const liga = (Array.isArray(servicos) ? servicos : []).map(s => servico.get(String(s))).filter(Boolean)
        .map(idS => ({ id_adicional: data.id_adicional, id_servico: idS, id_lojista: idDestino }))
      if (liga.length) await db.from('servico_adicional_servico').insert(liga)
      novos++
    }
    feito.push(`Serviços adicionais (${novos} novos)`)
  })

  await tentar('Planos', async () => {
    const itens = lista(d.planos)
    if (!itens.length) return
    const { data: ex } = await db.from('plano').select('nome').eq('id_lojista', idDestino).is('excluido_em', null)
    const tem = new Set(((ex ?? []) as { nome: string }[]).map(p => normal(p.nome)))
    let novos = 0
    for (const p of itens) {
      if (tem.has(normal(p.nome))) continue
      const { _id, servicos, ...campos } = p
      void _id
      const { data, error } = await db.from('plano').insert({ ...sem(campos, ['id_plano']), id_lojista: idDestino }).select('id_plano').single()
      if (error || !data) { avisos.push(`Plano ${String(p.nome)}: ${error?.message}`); continue }
      const liga = lista(servicos)
        .map(x => ({ id_plano: data.id_plano, id_servico: servico.get(String(x.id_servico)), quantidade: x.quantidade }))
        .filter(x => x.id_servico)
      if (liga.length) {
        const { error: el } = await db.from('plano_servico').insert(liga)
        if (el) avisos.push(`Serviços do plano ${String(p.nome)}: ${el.message}`)
      }
      novos++
    }
    feito.push(`Planos (${novos} novos; as assinaturas dos clientes não voltam)`)
  })

  if (d.taxidog && typeof d.taxidog === 'object') {
    await tentar('TaxiDog', async () => {
      const t = d.taxidog as { config?: Linha; faixas?: unknown; regioes?: unknown }
      if (t.config) {
        const { error } = await db.from('taxidog_config').upsert({ ...t.config, id_lojista: idDestino }, { onConflict: 'id_lojista', ignoreDuplicates: true })
        if (error) throw error
      }
      const { data: fx } = await db.from('taxidog_faixa').select('km_ate').eq('id_lojista', idDestino)
      const kms = new Set(((fx ?? []) as { km_ate: number }[]).map(f => Number(f.km_ate)))
      const faixas = lista(t.faixas).filter(f => !kms.has(Number(f.km_ate))).map(f => ({ ...f, id_lojista: idDestino }))
      if (faixas.length) await db.from('taxidog_faixa').insert(faixas)
      const { data: rg } = await db.from('taxidog_regiao').select('bairro, cidade').eq('id_lojista', idDestino)
      const chaves = new Set(((rg ?? []) as { bairro: string | null; cidade: string }[]).map(r => `${normal(r.bairro)}|${normal(r.cidade)}`))
      const regioes = lista(t.regioes).filter(r => !chaves.has(`${normal(r.bairro)}|${normal(r.cidade)}`)).map(r => ({ ...r, id_lojista: idDestino }))
      if (regioes.length) await db.from('taxidog_regiao').insert(regioes)
      feito.push('TaxiDog (configuração, faixas e regiões)')
    })
  }

  if (op.equipe) {
    await tentar('Equipe', async () => {
      const { data: ex } = await db.from('funcionario').select('nome').eq('id_lojista', idDestino)
      const tem = new Set(((ex ?? []) as { nome: string }[]).map(f => normal(f.nome)))
      let novos = 0
      for (const f of lista(d.equipe)) {
        if (tem.has(normal(f.nome))) continue
        const { data: u, error: eu } = await db.auth.admin.createUser({
          email: gerarEmailInterno(), email_confirm: true,
          user_metadata: { role: 'funcionario', nome: f.nome, id_lojista: idDestino },
        })
        if (eu || !u.user) { avisos.push(`Funcionário ${String(f.nome)}: ${eu?.message ?? 'login não criado'}`); continue }
        const { error } = await db.from('funcionario').insert({ ...sem(f, ['id_funcionario']), id_funcionario: u.user.id, id_lojista: idDestino })
        if (error) { await db.auth.admin.deleteUser(u.user.id); avisos.push(`Funcionário ${String(f.nome)}: ${error.message}`); continue }
        novos++
      }
      feito.push(`Equipe (${novos} novos — gere o código de acesso de cada um na tela Equipe)`)
    })
  }

  return { feito, avisos }
}

export async function importarBackup(db: Db, idDestino: string, backup: BackupConta, opcoes: OpcoesImportar): Promise<Relatorio> {
  const { tipo } = await tipoDaConta(db, idDestino)
  if (tipo !== backup.tipo) {
    throw new Error(`Este backup é de ${rotuloTipoConta(backup.tipo)} e esta conta é ${rotuloTipoConta(tipo)}. Os dados só entram numa conta do mesmo tipo.`)
  }
  return backup.tipo === 'cliente'
    ? importarCliente(db, idDestino, backup, opcoes)
    : importarLoja(db, idDestino, backup, opcoes)
}

// ── Converter ───────────────────────────────────────────────────────────────

export interface DadosNovoPerfil {
  // Loja: nome da loja. Cliente: nome da pessoa.
  nome: string
  telefone: string
  // Só cliente (obrigatório).
  cpf?: string
}

// Confere os dados do perfil novo ANTES de apagar qualquer coisa.
export async function conferirNovoPerfil(db: Db, id: string, para: TipoPerfil, d: DadosNovoPerfil, email: string | null): Promise<string | null> {
  const nome = d.nome.trim()
  const telefone = d.telefone.replace(/\D/g, '')
  if (!email) return 'Esta conta não tem e-mail no login.'
  if (para === 'lojista' && (nome.length < 2 || nome.length > 150)) return 'O nome da loja precisa ter de 2 a 150 caracteres.'
  if (para === 'cliente' && (nome.length < 2 || nome.length > 120)) return 'O nome precisa ter de 2 a 120 caracteres.'
  if (!/^\d{10,11}$/.test(telefone)) return 'Telefone com DDD, 10 ou 11 números.'
  const tabela = para === 'lojista' ? 'lojista' : 'cliente'
  const coluna = para === 'lojista' ? 'id_lojista' : 'id_cliente'
  const { data: outroEmail } = await db.from(tabela).select(coluna).ilike('email', email.replace(/[\\%_]/g, c => `\\${c}`)).neq(coluna, id).limit(1)
  if (outroEmail?.[0]) return `O e-mail ${email} já está em outra conta de ${rotuloTipoConta(para)}.`
  if (para === 'cliente') {
    const cpf = (d.cpf ?? '').replace(/\D/g, '')
    if (!cpfValido(cpf)) return 'Informe um CPF válido para a conta de cliente.'
    const { data: outroCpf } = await db.from('cliente').select('id_cliente').eq('cpf', cpf).neq('id_cliente', id).limit(1)
    if (outroCpf?.[0]) return 'Esse CPF já está em outra conta de cliente.'
  }
  return null
}

// Apaga os dados do perfil atual (banco + fotos + logins da equipe).
export async function apagarPerfil(db: Db, id: string, tipo: TipoPerfil): Promise<string[]> {
  const funcao = tipo === 'cliente' ? 'fn_interno_excluir_cliente' : 'fn_interno_excluir_loja'
  const { data, error } = await db.rpc(funcao, { p_id: id })
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function|does not exist/i.test(error.message)) {
      throw new Error('Execute a migration 105_interno_converter_conta.sql para converter contas.')
    }
    const m = error.message.match(/Converter: ([^\n]+)/)
    throw new Error(m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : error.message)
  }
  const r = (data ?? {}) as Record<string, unknown>
  if (tipo === 'cliente') {
    await apagarPasta(db, 'fotos-pet', id)
    return [`Cadastro de cliente apagado: ${r.pets ?? 0} pets, ${r.agendamentos_cancelados ?? 0} agendamentos marcados cancelados`]
  }
  for (const idFunc of (Array.isArray(r.equipe) ? r.equipe : []) as string[]) await db.auth.admin.deleteUser(idFunc)
  await apagarPasta(db, 'logos-loja', id)
  await apagarPasta(db, 'fotos-produto', id)
  return [
    `Loja apagada: ${r.servicos ?? 0} serviços, ${r.produtos ?? 0} produtos, ${r.agendamentos ?? 0} agendamentos, ${r.vendas ?? 0} vendas, ${r.planos ?? 0} planos`,
    `Equipe: ${(Array.isArray(r.equipe) ? r.equipe : []).length} logins de funcionário apagados; ${r.clientes ?? 0} clientes perderam o vínculo com a loja`,
  ]
}

// Cria o perfil novo e acerta o papel da conta (metadados do login e
// perfil_usuario, que o auth_role() usa).
export async function criarPerfil(db: Db, id: string, para: TipoPerfil, d: DadosNovoPerfil, email: string): Promise<void> {
  const nome = d.nome.trim()
  const telefone = d.telefone.replace(/\D/g, '')
  if (para === 'lojista') {
    const { error } = await db.rpc('fn_registrar_lojista', { p_id_lojista: id, p_nome_loja: nome, p_email: email, p_telefone: telefone })
    if (error) throw new Error(/email_already_exists/.test(error.message) ? 'Esse e-mail já está em outra loja.' : error.message)
  } else {
    const { error } = await db.from('cliente').insert({ id_cliente: id, nome, cpf: (d.cpf ?? '').replace(/\D/g, ''), email, telefone })
    if (error) throw new Error(error.message)
  }
  const { data: login } = await db.auth.admin.getUserById(id)
  const meta = { ...(login?.user?.user_metadata ?? {}) } as Linha
  delete meta.nome_loja
  await db.auth.admin.updateUserById(id, {
    user_metadata: { ...meta, role: para, ...(para === 'lojista' ? { nome_loja: nome } : { nome }) },
  })
  await db.from('perfil_usuario').upsert({ id, role: para }, { onConflict: 'id' })
}
