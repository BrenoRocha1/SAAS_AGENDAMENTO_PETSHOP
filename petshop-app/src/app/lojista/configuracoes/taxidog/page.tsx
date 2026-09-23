import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { obterContextoLojista } from '@/lib/lojista-context'
import TaxiDogConfigForm, { type TaxiDogConfigInicial } from '@/components/lojista/TaxiDogConfigForm'
import { IconAlert, IconChevronLeft, IconLock } from '@/components/icons'

export const metadata: Metadata = { title: 'TaxiDog — Configurações' }

export default async function ConfiguracaoTaxiDogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  const voltar = (
    <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
      <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
    </Link>
  )

  if (contexto.role === 'funcionario' && !contexto.acessoTotal) {
    return (
      <>
        {voltar}
        <div className="empty-state card">
          <IconLock style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para configurar o TaxiDog</div>
          <p>Apenas o responsável pela loja ou um administrador pode alterar essas regras.</p>
        </div>
      </>
    )
  }

  const idLojista = contexto.idLojista
  const [configRes, faixasRes, regioesRes, { data: taxidogs }] = await Promise.all([
    supabase.from('taxidog_config').select('*').eq('id_lojista', idLojista).maybeSingle(),
    supabase.from('taxidog_faixa').select('km_ate, valor_trecho, valor_ida_volta').eq('id_lojista', idLojista).order('km_ate'),
    supabase.from('taxidog_regiao').select('bairro, cidade, uf, valor_trecho, valor_ida_volta, ativo').eq('id_lojista', idLojista).order('cidade').order('bairro'),
    supabase.from('funcionario').select('nome').eq('id_lojista', idLojista).eq('ativo', true).eq('pode_taxidog', true).order('nome'),
  ])

  const erro = configRes.error ?? faixasRes.error ?? regioesRes.error

  const cfg = configRes.data
  const inicial: TaxiDogConfigInicial = {
    ativo: cfg?.ativo ?? false,
    disponivel_online: cfg?.disponivel_online ?? true,
    modo_cobranca: cfg?.modo_cobranca ?? 'fixo',
    // NUMERIC chega como string via PostgREST.
    valor_buscar: Number(cfg?.valor_buscar ?? 0),
    valor_entregar: Number(cfg?.valor_entregar ?? 0),
    valor_buscar_entregar: Number(cfg?.valor_buscar_entregar ?? 0),
    distancia_max_km: cfg?.distancia_max_km == null ? null : Number(cfg.distancia_max_km),
    valor_minimo: cfg?.valor_minimo == null ? null : Number(cfg.valor_minimo),
    origem_endereco: cfg?.origem_endereco ?? null,
    tem_origem: cfg?.origem_lat != null && cfg?.origem_lng != null,
    faixas: (faixasRes.data ?? []).map(f => ({
      km_ate: Number(f.km_ate),
      valor_trecho: Number(f.valor_trecho),
      valor_ida_volta: f.valor_ida_volta == null ? null : Number(f.valor_ida_volta),
    })),
    regioes: (regioesRes.data ?? []).map(r => ({
      bairro: r.bairro,
      cidade: r.cidade,
      uf: r.uf?.trim() ?? null,
      valor_trecho: Number(r.valor_trecho),
      valor_ida_volta: r.valor_ida_volta == null ? null : Number(r.valor_ida_volta),
      ativo: r.ativo,
    })),
  }

  return (
    <>
      {voltar}

      <div className="page-header">
        <h1 className="page-title">TaxiDog</h1>
        <p className="page-subtitle">Busca e entrega dos pets: quando oferecer, quanto cobrar e onde atender.</p>
      </div>

      {erro ? (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar o TaxiDog. Execute a migration 042_taxidog.sql se ainda não rodou.
            {process.env.NODE_ENV !== 'production' && ` [DEV: ${erro.message}]`}
          </span>
        </div>
      ) : (
        <TaxiDogConfigForm inicial={inicial} taxidogs={(taxidogs ?? []).map(t => t.nome)} />
      )}
    </>
  )
}
