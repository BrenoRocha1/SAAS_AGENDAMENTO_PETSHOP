// Preenche uma loja com dados de demonstração (perfil, endereço, horários,
// serviços, produtos com foto, equipe, clientes, pets, agenda e vendas), para
// mostrar o sistema "vivo". Roda só pelo painel interno, com a service_role.
//
// Pode rodar de novo: cada bloco confere o que já existe (por nome / e-mail)
// e só cria o que falta. Agenda e vendas só são criadas se a loja ainda não
// tem nenhuma. Não é um arquivo 'use server'.

import { gerarEmailInterno } from '@/lib/email-interno'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = NonNullable<ReturnType<typeof createAdminClient>>

export interface ResultadoDemo { feito: string[]; avisos: string[] }

export const SLUG_DEMO = 'loja-exemplo'
export const NOME_DEMO = 'Loja Exemplo'

// ── Imagens (ilustrações em SVG) ────────────────────────────────────────────
// Vão para o Storage do Supabase; se o bucket não aceitar SVG, caem em
// data URI (a CSP do site libera `data:` em imagens).

function fundo(cor: string): string {
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".16"/><stop offset="1" stop-color="${cor}" stop-opacity=".34"/></linearGradient></defs><rect width="400" height="400" rx="40" fill="url(#g)"/>`
}

function svgProduto(tipo: string, cor: string, rotulo: string): string {
  const txt = rotulo.replace(/&/g, 'e').replace(/</g, '')
  let forma = ''
  switch (tipo) {
    case 'saco':
      forma = `<path d="M130 100h140l16 40v170a14 14 0 0 1-14 14H128a14 14 0 0 1-14-14V140z" fill="${cor}"/><rect x="138" y="170" width="124" height="86" rx="12" fill="#fff" opacity=".92"/><circle cx="200" cy="213" r="20" fill="${cor}"/><circle cx="182" cy="190" r="7" fill="${cor}"/><circle cx="218" cy="190" r="7" fill="${cor}"/><path d="M130 100c20-24 120-24 140 0" fill="none" stroke="${cor}" stroke-width="10"/>`
      break
    case 'osso':
      forma = `<g fill="${cor}"><rect x="110" y="178" width="180" height="44" rx="14" transform="rotate(-30 200 200)"/><circle cx="118" cy="140" r="26"/><circle cx="150" cy="116" r="26"/><circle cx="282" cy="260" r="26"/><circle cx="250" cy="284" r="26"/></g>`
      break
    case 'bola':
      forma = `<circle cx="200" cy="190" r="92" fill="${cor}"/><path d="M118 150c60 30 104 30 164 0M118 232c60-30 104-30 164 0" fill="none" stroke="#fff" stroke-width="10" opacity=".85"/>`
      break
    case 'frasco':
      forma = `<rect x="150" y="150" width="100" height="160" rx="22" fill="${cor}"/><rect x="176" y="106" width="48" height="52" rx="10" fill="${cor}"/><rect x="164" y="190" width="72" height="70" rx="12" fill="#fff" opacity=".9"/><path d="M200 208c-14 18-14 34 0 34s14-16 0-34z" fill="${cor}"/>`
      break
    case 'coleira':
      forma = `<circle cx="200" cy="170" r="84" fill="none" stroke="${cor}" stroke-width="28"/><rect x="176" y="236" width="48" height="26" rx="6" fill="${cor}"/><path d="M200 262v28" stroke="${cor}" stroke-width="8"/><circle cx="200" cy="306" r="26" fill="${cor}"/><circle cx="200" cy="306" r="9" fill="#fff" opacity=".9"/>`
      break
    case 'casinha':
      forma = `<path d="M96 200 200 110l104 90z" fill="${cor}"/><rect x="120" y="198" width="160" height="116" rx="8" fill="${cor}" opacity=".85"/><path d="M170 314v-62a30 30 0 0 1 60 0v62z" fill="#fff" opacity=".92"/>`
      break
    default: // petisco
      forma = `<g fill="${cor}"><rect x="112" y="150" width="96" height="96" rx="26" transform="rotate(-14 160 198)"/><rect x="196" y="190" width="96" height="96" rx="26" transform="rotate(12 244 238)"/></g><circle cx="150" cy="186" r="9" fill="#fff" opacity=".8"/><circle cx="246" cy="236" r="9" fill="#fff" opacity=".8"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${fundo(cor)}${forma}<text x="200" y="372" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${cor}">${txt}</text></svg>`
}

function svgPet(especie: 'Cão' | 'Gato', cor: string, pelo: string): string {
  const rosto = especie === 'Gato'
    ? `<path d="M110 150l22-70 58 40zM290 150l-22-70-58 40z" fill="${pelo}"/><ellipse cx="200" cy="215" rx="98" ry="88" fill="${pelo}"/><path d="M140 206q14-16 28 0M232 206q14-16 28 0" fill="none" stroke="#1f2937" stroke-width="8" stroke-linecap="round"/><path d="M190 236h20l-10 12z" fill="#f472b6"/><path d="M200 248q-14 18-30 8M200 248q14 18 30 8M120 236l-44-6M120 250l-44 10M280 236l44-6M280 250l44 10" fill="none" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/>`
    : `<ellipse cx="116" cy="170" rx="34" ry="62" fill="${pelo}" opacity=".8" transform="rotate(14 116 170)"/><ellipse cx="284" cy="170" rx="34" ry="62" fill="${pelo}" opacity=".8" transform="rotate(-14 284 170)"/><ellipse cx="200" cy="205" rx="92" ry="90" fill="${pelo}"/><ellipse cx="200" cy="248" rx="46" ry="34" fill="#fff" opacity=".85"/><circle cx="160" cy="190" r="12" fill="#1f2937"/><circle cx="240" cy="190" r="12" fill="#1f2937"/><ellipse cx="200" cy="232" rx="17" ry="12" fill="#1f2937"/><path d="M200 244v14M184 262q16 10 32 0" fill="none" stroke="#1f2937" stroke-width="6" stroke-linecap="round"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${fundo(cor)}${rosto}</svg>`
}

function svgLogo(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" rx="80" fill="#4343e0"/><g fill="#fff" transform="translate(50 106) scale(.84)"><path d="M14 6C100 5 150 25 185 70C215 110 225 150 212 200C208 220 206 232 202 241Q199 246 192 246C120 246 55 195 28 120C16 85 9 50 9 14Q9 6 14 6Z"/><path d="M366 62Q372 62 372 70C372 130 345 185 290 225C275 236 262 242 252 245Q246 247 244 240C238 215 236 185 245 155C258 108 300 72 360 62Z"/></g></svg>`
}

function dataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

async function subirImagem(db: Db, bucket: string, caminho: string, svg: string): Promise<string> {
  try {
    const { error } = await db.storage.from(bucket).upload(caminho, Buffer.from(svg, 'utf-8'), { contentType: 'image/svg+xml', upsert: true })
    if (!error) return db.storage.from(bucket).getPublicUrl(caminho).data.publicUrl
  } catch { /* cai no data URI */ }
  return dataUri(svg)
}

// ── Datas ───────────────────────────────────────────────────────────────────
const DIA_MS = 86_400_000
function isoDia(offsetDias: number): string {
  // Horário de Brasília (UTC-3), para o "hoje" da loja.
  const d = new Date(Date.now() - 3 * 3_600_000 + offsetDias * DIA_MS)
  return d.toISOString().slice(0, 10)
}
function emDia(offsetDias: number, hora: number, min = 0): string {
  return new Date(`${isoDia(offsetDias)}T${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-03:00`).toISOString()
}

// ── Dados ───────────────────────────────────────────────────────────────────
const HORARIOS = [
  { dia: 'Segunda', ini: '08:00', fim: '18:00' }, { dia: 'Terça', ini: '08:00', fim: '18:00' },
  { dia: 'Quarta', ini: '08:00', fim: '18:00' }, { dia: 'Quinta', ini: '08:00', fim: '18:00' },
  { dia: 'Sexta', ini: '08:00', fim: '19:00' }, { dia: 'Sábado', ini: '09:00', fim: '15:00' },
]

const SERVICOS = [
  { nome: 'Banho', descricao: 'Banho com shampoo neutro, secagem e perfume.', preco: 60, duracao: 60, por: { Pequeno: 50, Médio: 65, Grande: 90 } },
  { nome: 'Tosa higiênica', descricao: 'Tosa nas áreas íntimas, patas e barriga.', preco: 40, duracao: 30, por: { Pequeno: 35, Médio: 45, Grande: 60 } },
  { nome: 'Banho e tosa', descricao: 'Banho completo com tosa na máquina ou na tesoura.', preco: 100, duracao: 120, por: { Pequeno: 85, Médio: 110, Grande: 150 } },
  { nome: 'Hidratação de pelo', descricao: 'Máscara de hidratação profunda para pelos macios e brilhantes.', preco: 45, duracao: 45, por: null },
  { nome: 'Corte de unhas', descricao: 'Corte e lixa das unhas com cuidado.', preco: 25, duracao: 20, por: null },
  { nome: 'Escovação de dentes', descricao: 'Higiene bucal com pasta própria para pets.', preco: 30, duracao: 20, por: null },
]

const CATEGORIAS = ['Rações', 'Petiscos', 'Higiene', 'Brinquedos', 'Acessórios']

interface ProdutoDemo {
  nome: string; cat: string; tipoEnum: 'Ração' | 'Brinquedos' | 'Higiene' | 'Acessórios' | 'Outros'
  un: 'unidade' | 'kg' | 'pacote'; preco: number; custo: number; estoque: number; minimo: number
  img: string; cor: string; online?: boolean
}
const PRODUTOS: ProdutoDemo[] = [
  { nome: 'Ração Premium Cães Adultos 15kg', cat: 'Rações', tipoEnum: 'Ração', un: 'unidade', preco: 189.9, custo: 128, estoque: 14, minimo: 4, img: 'saco', cor: '#4f46e5' },
  { nome: 'Ração Filhotes 10kg', cat: 'Rações', tipoEnum: 'Ração', un: 'unidade', preco: 159.9, custo: 106, estoque: 9, minimo: 3, img: 'saco', cor: '#0ea5e9' },
  { nome: 'Ração Gatos Castrados 3kg', cat: 'Rações', tipoEnum: 'Ração', un: 'unidade', preco: 94.9, custo: 63, estoque: 3, minimo: 4, img: 'saco', cor: '#f59e0b' },
  { nome: 'Ração a granel Cães (kg)', cat: 'Rações', tipoEnum: 'Ração', un: 'kg', preco: 14.5, custo: 9.2, estoque: 42.5, minimo: 10, img: 'saco', cor: '#10b981' },
  { nome: 'Bifinho de Carne 500g', cat: 'Petiscos', tipoEnum: 'Outros', un: 'pacote', preco: 24.9, custo: 14.5, estoque: 25, minimo: 6, img: 'petisco', cor: '#ef4444', online: true },
  { nome: 'Osso Nó Natural', cat: 'Petiscos', tipoEnum: 'Outros', un: 'unidade', preco: 12.9, custo: 6.8, estoque: 40, minimo: 10, img: 'osso', cor: '#d97706', online: true },
  { nome: 'Biscoito Dental', cat: 'Petiscos', tipoEnum: 'Outros', un: 'pacote', preco: 19.9, custo: 11.2, estoque: 18, minimo: 5, img: 'petisco', cor: '#a855f7' },
  { nome: 'Shampoo Neutro 500ml', cat: 'Higiene', tipoEnum: 'Higiene', un: 'unidade', preco: 32.9, custo: 17.5, estoque: 22, minimo: 6, img: 'frasco', cor: '#06b6d4', online: true },
  { nome: 'Condicionador Pelos Longos 500ml', cat: 'Higiene', tipoEnum: 'Higiene', un: 'unidade', preco: 36.9, custo: 20, estoque: 15, minimo: 5, img: 'frasco', cor: '#ec4899' },
  { nome: 'Perfume Pet 120ml', cat: 'Higiene', tipoEnum: 'Higiene', un: 'unidade', preco: 29.9, custo: 15.9, estoque: 2, minimo: 5, img: 'frasco', cor: '#8b5cf6' },
  { nome: 'Bolinha Maciça', cat: 'Brinquedos', tipoEnum: 'Brinquedos', un: 'unidade', preco: 14.9, custo: 6.5, estoque: 35, minimo: 8, img: 'bola', cor: '#22c55e', online: true },
  { nome: 'Mordedor Corda', cat: 'Brinquedos', tipoEnum: 'Brinquedos', un: 'unidade', preco: 21.9, custo: 10.4, estoque: 28, minimo: 8, img: 'osso', cor: '#f97316' },
  { nome: 'Coleira Ajustável M', cat: 'Acessórios', tipoEnum: 'Acessórios', un: 'unidade', preco: 39.9, custo: 19.9, estoque: 20, minimo: 5, img: 'coleira', cor: '#3b82f6' },
  { nome: 'Cama Redonda Pet', cat: 'Acessórios', tipoEnum: 'Acessórios', un: 'unidade', preco: 119.9, custo: 68, estoque: 6, minimo: 2, img: 'casinha', cor: '#14b8a6' },
]

const EQUIPE = [
  { nome: 'Camila Duarte', cargo: 'Banhista e tosadora', agenda: true, servicos: false, produtos: false, clientes: true, taxi: false },
  { nome: 'Rafael Mendes', cargo: 'Atendente e caixa', agenda: true, servicos: false, produtos: true, clientes: true, taxi: false },
  { nome: 'Bruno Lima', cargo: 'Motorista TaxiDog', agenda: false, servicos: false, produtos: false, clientes: false, taxi: true },
]

const CLIENTES = [
  { nome: 'Ana Beatriz Souza', cpf: '52998224725', tel: '11981234501' },
  { nome: 'Carlos Eduardo Lima', cpf: '11144477735', tel: '11982345602' },
  { nome: 'Fernanda Oliveira', cpf: '39053344705', tel: '11983456703' },
  { nome: 'Marcos Vinícius Rocha', cpf: '86288366757', tel: '11984567804' },
  { nome: 'Juliana Prado', cpf: '12345678909', tel: '11985678905' },
  { nome: 'Ricardo Almeida', cpf: '74853165390', tel: '11986789006' },
]

const PETS: { dono: number; nome: string; especie: 'Cão' | 'Gato'; raca: string; sexo: 'Macho' | 'Fêmea'; porte: 'Pequeno' | 'Médio' | 'Grande'; peso: number; anos: number; cor: string; pelo: string; obs: string }[] = [
  { dono: 0, nome: 'Thor', especie: 'Cão', raca: 'Golden Retriever', sexo: 'Macho', porte: 'Grande', peso: 31, anos: 4, cor: '#f59e0b', pelo: '#e0a458', obs: 'Dócil, adora água.' },
  { dono: 0, nome: 'Mel', especie: 'Cão', raca: 'Shih Tzu', sexo: 'Fêmea', porte: 'Pequeno', peso: 6.2, anos: 3, cor: '#ec4899', pelo: '#f5e6d3', obs: 'Tem medo de secador.' },
  { dono: 1, nome: 'Bolt', especie: 'Cão', raca: 'Border Collie', sexo: 'Macho', porte: 'Médio', peso: 19, anos: 2, cor: '#0ea5e9', pelo: '#4b5563', obs: 'Muito agitado.' },
  { dono: 2, nome: 'Luna', especie: 'Gato', raca: 'Siamês', sexo: 'Fêmea', porte: 'Pequeno', peso: 4.1, anos: 5, cor: '#8b5cf6', pelo: '#d6c7b0', obs: 'Prefere ambiente calmo.' },
  { dono: 3, nome: 'Max', especie: 'Cão', raca: 'Labrador', sexo: 'Macho', porte: 'Grande', peso: 33, anos: 6, cor: '#10b981', pelo: '#c9a66b', obs: '' },
  { dono: 4, nome: 'Princesa', especie: 'Cão', raca: 'Poodle', sexo: 'Fêmea', porte: 'Pequeno', peso: 5.4, anos: 7, cor: '#ef4444', pelo: '#f8fafc', obs: 'Alergia a perfume forte.' },
  { dono: 5, nome: 'Rex', especie: 'Cão', raca: 'Pastor Alemão', sexo: 'Macho', porte: 'Grande', peso: 36, anos: 5, cor: '#14b8a6', pelo: '#8a6a4a', obs: 'Usar focinheira.' },
  { dono: 3, nome: 'Nina', especie: 'Gato', raca: 'SRD', sexo: 'Fêmea', porte: 'Pequeno', peso: 3.8, anos: 2, cor: '#f97316', pelo: '#f59e0b', obs: '' },
]

// ── Execução ────────────────────────────────────────────────────────────────
export async function popularLojaDemo(db: Db, idLojista: string): Promise<ResultadoDemo> {
  const feito: string[] = []
  const avisos: string[] = []
  const falha = (parte: string, e: unknown) => avisos.push(`${parte}: ${e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e)}`)

  // 1) Perfil da loja
  try {
    const logo = await subirImagem(db, 'logos-loja', `${idLojista}/logo-demo.svg`, svgLogo())
    const base = {
      nome_loja: NOME_DEMO, slug: SLUG_DEMO,
      descricao: 'Banho, tosa e tudo para o seu melhor amigo. Atendimento carinhoso, produtos selecionados e TaxiDog para buscar e levar o seu pet.',
      telefone: '11987654321', endereco: 'Rua das Acácias', numero: '482', complemento: 'Loja 2', bairro: 'Jardim Paulista',
      cidade: 'São Paulo', estado: 'SP', cep: '01310100',
      aceita_agendamento_online: true, acesso_livre: true, logo_url: logo,
    }
    let { error } = await db.from('lojista').update(base).eq('id_lojista', idLojista)
    if (error) { // alguma coluna opcional pode não existir: tenta o essencial
      const { complemento: _c, acesso_livre: _a, ...essencial } = base
      void _c; void _a
      ;({ error } = await db.from('lojista').update(essencial).eq('id_lojista', idLojista))
    }
    if (error) throw error
    feito.push('Perfil da loja, endereço, logo e endereço público /loja-exemplo')
  } catch (e) { falha('Perfil da loja', e) }

  // 2) Horários
  try {
    const { data: ex } = await db.from('horario').select('dia_semana').eq('id_lojista', idLojista)
    const tem = new Set((ex ?? []).map((h: { dia_semana: string }) => h.dia_semana))
    const novos = HORARIOS.filter(h => !tem.has(h.dia)).map(h => ({ id_lojista: idLojista, dia_semana: h.dia, hr_inicio: h.ini, hr_fim: h.fim, ativo: true }))
    if (novos.length) { const { error } = await db.from('horario').insert(novos); if (error) throw error }
    feito.push('Horários de funcionamento (segunda a sábado)')
  } catch (e) { falha('Horários', e) }

  // 3) Serviços (+ preço por porte)
  const servicoPorNome = new Map<string, { id: string; preco: number }>()
  try {
    const { data: ex } = await db.from('servico').select('id_servico, nome, preco').eq('id_lojista', idLojista).is('excluido_em', null)
    for (const s of ex ?? []) servicoPorNome.set(s.nome, { id: s.id_servico, preco: Number(s.preco) })
    let criados = 0
    for (const s of SERVICOS) {
      if (servicoPorNome.has(s.nome)) continue
      const { data, error } = await db.from('servico')
        .insert({ id_lojista: idLojista, nome: s.nome, descricao: s.descricao, preco: s.preco, duracao: s.duracao, status: 'Ativo' })
        .select('id_servico').single()
      if (error) throw error
      servicoPorNome.set(s.nome, { id: data.id_servico, preco: s.preco })
      criados++
      if (s.por) {
        const linhas = (['Cão', 'Gato'] as const).flatMap(especie =>
          (Object.entries(s.por!) as ['Pequeno' | 'Médio' | 'Grande', number][]).map(([porte, preco]) => ({
            id_servico: data.id_servico, tipo: 'porte', especie, porte, preco: especie === 'Gato' ? Math.round(preco * 0.9) : preco,
          })))
        const { error: ev } = await db.from('servico_variacao').insert(linhas)
        if (ev) avisos.push(`Preço por porte de ${s.nome}: ${ev.message}`)
      }
    }
    feito.push(`Serviços (${criados} novos, com preço por porte)`)
  } catch (e) { falha('Serviços', e) }

  // 4) Categorias, produtos com foto, custo e estoque
  const produtoPorNome = new Map<string, { id: string; preco: number }>()
  try {
    const idCat = new Map<string, string>()
    for (const nome of CATEGORIAS) {
      const { data: ex } = await db.from('categoria_produto').select('id_categoria').eq('id_lojista', idLojista).eq('nome', nome).maybeSingle()
      if (ex) { idCat.set(nome, ex.id_categoria); continue }
      const { data, error } = await db.from('categoria_produto').insert({ id_lojista: idLojista, nome }).select('id_categoria').single()
      if (error) throw error
      idCat.set(nome, data.id_categoria)
    }
    const { data: exP } = await db.from('produto').select('id_produto, nome, preco_venda').eq('id_lojista', idLojista).is('excluido_em', null)
    for (const p of exP ?? []) produtoPorNome.set(p.nome, { id: p.id_produto, preco: Number(p.preco_venda) })

    let criados = 0
    for (const p of PRODUTOS) {
      if (produtoPorNome.has(p.nome)) continue
      const base = {
        id_lojista: idLojista, nome: p.nome, categoria: p.tipoEnum, unidade_venda: p.un, preco_venda: p.preco,
        estoque_atual: p.estoque, estoque_minimo: p.minimo, status: 'Ativo', id_categoria: idCat.get(p.cat) ?? null,
        disponivel_agendamento_online: !!p.online,
      }
      const { data, error } = await db.from('produto').insert(base).select('id_produto').single()
      if (error) throw error
      const foto = await subirImagem(db, 'fotos-produto', `${idLojista}/${data.id_produto}.svg`, svgProduto(p.img, p.cor, p.cat))
      await db.from('produto').update({ foto_url: foto }).eq('id_produto', data.id_produto)
      const { error: ec } = await db.from('produto_custo').insert({ id_produto: data.id_produto, id_lojista: idLojista, custo_unitario: p.custo })
      if (ec) avisos.push(`Custo de ${p.nome}: ${ec.message}`)
      produtoPorNome.set(p.nome, { id: data.id_produto, preco: p.preco })
      criados++
    }
    feito.push(`Categorias e produtos (${criados} novos, com foto, custo e estoque; alguns em estoque baixo)`)
  } catch (e) { falha('Produtos', e) }

  // 5) Equipe (entram pelo código de acesso rápido)
  const idsEquipe: string[] = []
  try {
    const { data: ex } = await db.from('funcionario').select('id_funcionario, nome').eq('id_lojista', idLojista)
    const porNome = new Map<string, string>((ex ?? []).map((f: { id_funcionario: string; nome: string }): [string, string] => [f.nome, f.id_funcionario]))
    let criados = 0
    for (const f of EQUIPE) {
      const ja = porNome.get(f.nome)
      if (ja) { if (!f.taxi) idsEquipe.push(ja); continue }
      const { data: u, error: eu } = await db.auth.admin.createUser({
        email: gerarEmailInterno(), email_confirm: true,
        user_metadata: { role: 'funcionario', nome: f.nome, id_lojista: idLojista },
      })
      if (eu || !u.user) throw eu ?? new Error('createUser sem usuário')
      const { error } = await db.from('funcionario').insert({
        id_funcionario: u.user.id, id_lojista: idLojista, nome: f.nome, cargo: f.cargo,
        pode_gerenciar_agenda: f.agenda, pode_gerenciar_servicos: f.servicos, pode_gerenciar_produtos: f.produtos,
        pode_gerenciar_clientes_pets: f.clientes, acesso_total: false, pode_taxidog: f.taxi,
      })
      if (error) { await db.auth.admin.deleteUser(u.user.id); throw error }
      if (!f.taxi) idsEquipe.push(u.user.id)
      criados++
    }
    feito.push(`Equipe (${criados} novos: banhista, atendente e motorista TaxiDog)`)
  } catch (e) { falha('Equipe', e) }

  // 6) Clientes + pets (com foto)
  const idsClientes: string[] = []
  const petsCriados: { id: string; dono: number; porte: string; especie: string }[] = []
  try {
    for (let i = 0; i < CLIENTES.length; i++) {
      const c = CLIENTES[i]
      const email = `cliente${i + 1}.${SLUG_DEMO}@demo.invalid`
      let id: string | undefined
      const { data: ex } = await db.from('cliente').select('id_cliente').eq('email', email).maybeSingle()
      if (ex) id = ex.id_cliente
      else {
        const { data: u, error: eu } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: 'cliente', nome: c.nome } })
        if (eu || !u.user) { avisos.push(`Cliente ${c.nome}: ${eu?.message ?? 'não criado'}`); idsClientes.push(''); continue }
        id = u.user.id
        const { error } = await db.from('cliente').insert({ id_cliente: id, nome: c.nome, cpf: c.cpf, email, telefone: c.tel })
        if (error) { await db.auth.admin.deleteUser(id); avisos.push(`Cliente ${c.nome}: ${error.message}`); idsClientes.push(''); continue }
      }
      await db.from('cliente_lojista').upsert({ id_cliente: id, id_lojista: idLojista }, { onConflict: 'id_cliente,id_lojista', ignoreDuplicates: true })
      idsClientes.push(id!)
    }
    for (const p of PETS) {
      const dono = idsClientes[p.dono]
      if (!dono) continue
      const { data: ex } = await db.from('pet').select('id_pet').eq('id_cliente', dono).eq('nome', p.nome).maybeSingle()
      if (ex) { petsCriados.push({ id: ex.id_pet, dono: p.dono, porte: p.porte, especie: p.especie }); continue }
      const nasc = isoDia(-Math.round(p.anos * 365))
      const { data, error } = await db.from('pet').insert({
        id_cliente: dono, nome: p.nome, raca: p.raca, sexo: p.sexo, dt_nasc: nasc, peso: p.peso, obs: p.obs || null,
        especie: p.especie, porte: p.porte,
      }).select('id_pet').single()
      if (error) { avisos.push(`Pet ${p.nome}: ${error.message}`); continue }
      const foto = await subirImagem(db, 'fotos-pet', `${dono}/${data.id_pet}.svg`, svgPet(p.especie, p.cor, p.pelo))
      await db.from('pet').update({ foto_url: foto }).eq('id_pet', data.id_pet)
      petsCriados.push({ id: data.id_pet, dono: p.dono, porte: p.porte, especie: p.especie })
    }
    feito.push(`Clientes e pets (${idsClientes.filter(Boolean).length} clientes, ${petsCriados.length} pets com foto)`)
  } catch (e) { falha('Clientes e pets', e) }

  // 7) Agenda (só se a loja ainda não tem nenhum agendamento)
  try {
    const { count } = await db.from('agendamento').select('*', { count: 'exact', head: true }).eq('id_lojista', idLojista)
    if (!count && petsCriados.length && servicoPorNome.size) {
      const servs = [...servicoPorNome.entries()]
      const plano: { dia: number; hora: string; status: 'Concluído' | 'Confirmado' | 'Pendente' | 'Cancelado' }[] = [
        { dia: -14, hora: '09:00', status: 'Concluído' }, { dia: -12, hora: '10:30', status: 'Concluído' },
        { dia: -10, hora: '14:00', status: 'Concluído' }, { dia: -8, hora: '09:30', status: 'Concluído' },
        { dia: -7, hora: '11:00', status: 'Concluído' }, { dia: -5, hora: '15:00', status: 'Concluído' },
        { dia: -4, hora: '10:00', status: 'Cancelado' }, { dia: -3, hora: '16:00', status: 'Concluído' },
        { dia: -2, hora: '09:00', status: 'Concluído' }, { dia: -1, hora: '13:30', status: 'Concluído' },
        { dia: 1, hora: '09:30', status: 'Confirmado' }, { dia: 1, hora: '14:00', status: 'Confirmado' },
        { dia: 2, hora: '10:00', status: 'Pendente' }, { dia: 3, hora: '15:30', status: 'Confirmado' },
        { dia: 4, hora: '11:00', status: 'Pendente' },
      ]
      const formas = ['pix', 'cartao_credito', 'dinheiro', 'cartao_debito']
      let criados = 0
      for (let i = 0; i < plano.length; i++) {
        const a = plano[i]
        const pet = petsCriados[i % petsCriados.length]
        const [, srv] = servs[i % servs.length]
        const dono = idsClientes[pet.dono]
        // O banco só aceita INSERT de data futura: cria no futuro e depois move para a data certa.
        const { data, error } = await db.from('agendamento').insert({
          id_pet: pet.id, id_servico: srv.id, id_cliente: dono, id_lojista: idLojista,
          dt_agendamento: isoDia(30 + i), hr_agendamento: a.hora, valor: srv.preco, status: 'Pendente',
          obs: i % 4 === 0 ? 'Cliente pediu laço no final.' : null, origem: i % 3 === 0 ? 'online' : 'loja',
          id_funcionario: idsEquipe.length ? idsEquipe[i % idsEquipe.length] : null,
        }).select('id_agendamento').single()
        if (error) { avisos.push(`Agendamento ${i + 1}: ${error.message}`); continue }
        const atualiza: Record<string, unknown> = { dt_agendamento: isoDia(a.dia), status: a.status }
        if (a.status === 'Concluído') { atualiza.forma_pagamento = formas[i % formas.length]; atualiza.status_pagamento = 'pago'; atualiza.pago_em = emDia(a.dia, 17) }
        if (a.status === 'Cancelado') { atualiza.cancelado_por = 'cliente'; atualiza.motivo_cancelamento = 'Imprevisto de última hora.' }
        const { error: eu } = await db.from('agendamento').update(atualiza).eq('id_agendamento', data.id_agendamento)
        if (eu) avisos.push(`Agendamento ${i + 1} (ajuste): ${eu.message}`)
        criados++
      }
      feito.push(`Agenda (${criados} agendamentos: concluídos, de hoje em diante e um cancelado)`)
    } else if (count) feito.push('Agenda: a loja já tinha agendamentos, não mexi')
  } catch (e) { falha('Agenda', e) }

  // 8) Vendas no PDV (só se a loja ainda não tem nenhuma)
  try {
    const { count } = await db.from('venda').select('*', { count: 'exact', head: true }).eq('id_lojista', idLojista)
    const prods = [...produtoPorNome.entries()]
    if (!count && prods.length >= 6) {
      const formas = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito']
      let criadas = 0
      for (let n = 1; n <= 12; n++) {
        const itens = [prods[(n * 2) % prods.length], prods[(n * 3 + 1) % prods.length]].filter((v, i, a) => a.findIndex(x => x[0] === v[0]) === i)
        const linhas = itens.map(([nome, p], i) => ({ nome, preco: p.preco, id: p.id, qtd: i === 0 ? 1 : 2 }))
        const subtotal = Math.round(linhas.reduce((s, l) => s + l.preco * l.qtd, 0) * 100) / 100
        const desconto = n % 5 === 0 ? Math.round(subtotal * 0.1 * 100) / 100 : 0
        const total = Math.round((subtotal - desconto) * 100) / 100
        const forma = formas[n % formas.length]
        const clienteIdx = n % 3 === 0 ? (n / 3) % idsClientes.length : -1
        const { data: v, error } = await db.from('venda').insert({
          id_lojista: idLojista, numero: n, id_cliente: clienteIdx >= 0 && idsClientes[clienteIdx] ? idsClientes[clienteIdx] : null,
          cliente_nome: clienteIdx >= 0 ? CLIENTES[clienteIdx].nome : null, subtotal, desconto, total, forma_pagamento: forma,
          valor_recebido: forma === 'dinheiro' ? Math.ceil(total / 10) * 10 : null, troco: forma === 'dinheiro' ? Math.ceil(total / 10) * 10 - total : null,
          status: 'concluida', operador_nome: 'Rafael Mendes', created_at: emDia(-(15 - n), 10 + (n % 7), (n * 7) % 60),
        }).select('id_venda').single()
        if (error) { avisos.push(`Venda ${n}: ${error.message}`); continue }
        await db.from('venda_item').insert(linhas.map(l => ({
          id_venda: v.id_venda, id_lojista: idLojista, id_produto: l.id, produto_nome: l.nome, unidade_venda: 'unidade',
          quantidade: l.qtd, preco_unitario: l.preco, subtotal: Math.round(l.preco * l.qtd * 100) / 100,
        })))
        criadas++
      }
      feito.push(`Vendas no PDV (${criadas} vendas dos últimos dias)`)
    } else if (count) feito.push('PDV: a loja já tinha vendas, não mexi')
  } catch (e) { falha('Vendas', e) }

  return { feito, avisos }
}
