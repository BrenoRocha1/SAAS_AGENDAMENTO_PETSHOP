import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdmin } from '@/lib/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { dataHoraBR, telefoneBR } from '@/lib/interno-util'
import { listarBackups, rotuloTipoConta, tipoDaConta } from '@/lib/conta-backup'
import ConverterConta, { type SugestaoPerfil } from '@/components/interno/ConverterConta'
import BackupsConta from '@/components/interno/BackupsConta'
import ImportarBackup from '@/components/interno/ImportarBackup'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Conta — Interno' }
export const dynamic = 'force-dynamic'
// Converter, gerar backup e importar rodam daqui e podem levar um minuto.
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BADGE = { cliente: 'badge-aceito', lojista: 'badge-ativo', funcionario: 'badge-inativo', sem: 'badge-pendente' } as const

// Uma conta (login): o que ela é hoje, converter entre cliente e loja,
// backups guardados e importar dados de um arquivo (migration 105).
export default async function InternoConta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>

  const { data: login } = await db.auth.admin.getUserById(id)
  if (!login?.user) notFound()
  const usuario = login.user
  const meta = (usuario.user_metadata ?? {}) as Record<string, unknown>

  const [{ tipo, nome }, admin, eu, backups] = await Promise.all([
    tipoDaConta(db, id),
    db.from('admin_usuario').select('ativo').eq('id', id).maybeSingle(),
    getPlatformAdmin(),
    listarBackups(db, id),
  ])
  // Quantos registros da conta; `ativos`: sem os excluídos (excluido_em).
  const contar = async (tabela: string, coluna: string, ativos = false) => {
    let q = db.from(tabela).select('*', { count: 'exact', head: true }).eq(coluna, id)
    if (ativos) q = q.is('excluido_em', null)
    const { count } = await q
    return count ?? 0
  }

  // O que existe hoje (para mostrar e para o aviso do que vai ser apagado).
  let numeros: { rotulo: string; valor: string | number }[] = []
  let perdas: string[] = []
  const sugestao: SugestaoPerfil = {
    nome: String(meta.full_name ?? meta.name ?? meta.nome ?? ''),
    telefone: '',
    cpf: '',
  }
  if (tipo === 'cliente') {
    const [{ data: c }, pets, agend, lojas] = await Promise.all([
      db.from('cliente').select('nome, cpf, telefone').eq('id_cliente', id).maybeSingle(),
      contar('pet', 'id_cliente'),
      contar('agendamento', 'id_cliente'),
      contar('cliente_lojista', 'id_cliente'),
    ])
    numeros = [
      { rotulo: 'Pets', valor: pets }, { rotulo: 'Agendamentos', valor: agend }, { rotulo: 'Lojas que usa', valor: lojas },
      { rotulo: 'Telefone', valor: telefoneBR(c?.telefone) },
    ]
    perdas = [
      'Cadastro de cliente (nome, CPF, telefone, foto)',
      `${pets} ${pets === 1 ? 'pet' : 'pets'}, com fotos e informações`,
      'Agendamentos ainda marcados são cancelados; os já feitos ficam com as lojas, sem o nome da pessoa',
      'Avaliações escritas e o vínculo com as lojas',
    ]
    // Virando loja: nome e telefone do cliente como ponto de partida.
    sugestao.nome = c?.nome ? `${c.nome}` : sugestao.nome
    sugestao.telefone = c?.telefone ?? ''
  } else if (tipo === 'lojista') {
    const [{ data: l }, servicos, produtos, agend, vendas, equipe, clientes] = await Promise.all([
      db.from('lojista').select('nome_loja, telefone, documento, slug, ativo').eq('id_lojista', id).maybeSingle(),
      contar('servico', 'id_lojista', true),
      contar('produto', 'id_lojista', true),
      contar('agendamento', 'id_lojista'),
      contar('venda', 'id_lojista'),
      contar('funcionario', 'id_lojista'),
      contar('cliente_lojista', 'id_lojista'),
    ])
    numeros = [
      { rotulo: 'Serviços', valor: servicos }, { rotulo: 'Produtos', valor: produtos }, { rotulo: 'Agendamentos', valor: agend },
      { rotulo: 'Vendas no PDV', valor: vendas }, { rotulo: 'Equipe', valor: equipe }, { rotulo: 'Clientes', valor: clientes },
    ]
    perdas = [
      'A loja inteira: perfil, logo, horários, configurações e o endereço público' + (l?.slug ? ` /${l.slug}` : ''),
      `${servicos} serviços, ${produtos} produtos, planos e serviços adicionais`,
      `${agend} agendamentos e ${vendas} vendas do PDV — o histórico também some para os clientes`,
      `${equipe} ${equipe === 1 ? 'pessoa da equipe' : 'pessoas da equipe'} (os logins delas também)`,
      `Os ${clientes} clientes continuam com as contas deles, só sem esta loja`,
    ]
    sugestao.telefone = l?.telefone ?? ''
    if (l?.documento && l.documento.length === 11) sugestao.cpf = l.documento
    if (!sugestao.nome) sugestao.nome = l?.nome_loja ?? ''
  }

  const ehVoce = eu?.id === id

  return (
    <>
      <div className="page-header">
        <Link href={`${ROTA_INTERNA}/contas`} className="text-sm text-muted">← Contas</Link>
        <h1 className="page-title">
          {nome ?? String(meta.full_name ?? usuario.email ?? 'Conta')}{' '}
          <span className={`badge ${BADGE[tipo]}`} style={{ verticalAlign: 'middle' }}>{rotuloTipoConta(tipo)}</span>
          {admin.data?.ativo && <span className="badge badge-em-andamento" style={{ verticalAlign: 'middle', marginLeft: 6 }}>Administrador</span>}
          {ehVoce && <span className="badge badge-pendente" style={{ verticalAlign: 'middle', marginLeft: 6 }}>Você</span>}
        </h1>
        <p className="page-subtitle">
          {usuario.email ?? 'sem e-mail'} · conta criada em {dataHoraBR(usuario.created_at)}
          {usuario.last_sign_in_at ? ` · último acesso em ${dataHoraBR(usuario.last_sign_in_at)}` : ''}
          {tipo === 'lojista' && <> · <Link href={`${ROTA_INTERNA}/empresas/${id}`}>ver a empresa</Link></>}
        </p>
      </div>

      {numeros.length > 0 && (
        <div className="grid-4" style={{ marginBottom: 'var(--space-6)' }}>
          {numeros.map(n => (
            <div className="stat-card" key={n.rotulo}>
              <div className="stat-card-value">{n.valor}</div>
              <div className="stat-card-label">{n.rotulo}</div>
            </div>
          ))}
        </div>
      )}

      {tipo === 'funcionario' ? (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-6)' }}>
          <span>Esta conta é de um funcionário de loja. Ela pertence à loja e não é convertida por aqui — a loja gerencia na tela Equipe.</span>
        </div>
      ) : (
        <ConverterConta id={id} tipoAtual={tipo} sugestao={sugestao} perdas={perdas} ehVoce={ehVoce} />
      )}

      <BackupsConta id={id} tipoAtual={tipo} backups={backups} />
      <ImportarBackup id={id} tipoAtual={tipo} />
    </>
  )
}
