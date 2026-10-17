'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { apagarBackupAction, baixarBackupAction, gerarBackupAction, importarBackupAction } from '@/lib/actions-interno'
import { rotuloTipoConta, type TipoConta, type TipoPerfil } from '@/lib/conta-backup-comum'
import BotaoConfirmar, { useEstadoBotao } from '@/components/ui/botao-confirmar'

export interface BackupListado { caminho: string; nome: string; tipo: TipoPerfil | null; criado: string | null; tamanho: number | null }
interface Relatorio { feito: string[]; avisos: string[] }

const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const tamanho = (b: number | null) => (b == null ? '—' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)

// Backups guardados da conta (bucket privado): gerar agora, baixar o
// arquivo, restaurar nesta conta (só se for do mesmo tipo) e apagar.
export default function BackupsConta({ id, tipoAtual, backups }: { id: string; tipoAtual: TipoConta; backups: BackupListado[] }) {
  const router = useRouter()
  const botao = useEstadoBotao()
  const [isPending, startTransition] = useTransition()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const temPerfil = tipoAtual === 'cliente' || tipoAtual === 'lojista'

  const baixar = (url: string) => window.location.assign(url)

  function gerar() {
    setErro(null)
    startTransition(async () => {
      const r = await gerarBackupAction(id)
      if (r.error) { setErro(r.error); botao.erro(); return }
      await botao.sucesso()
      if (r.url) baixar(r.url)
      router.refresh()
    })
  }

  async function acao(caminho: string, f: () => Promise<void>) {
    setErro(null)
    setOcupado(caminho)
    try { await f() } finally { setOcupado(null) }
  }

  const baixarArquivo = (b: BackupListado) => acao(b.caminho, async () => {
    const r = await baixarBackupAction(b.caminho)
    if (r.error || !r.url) setErro(r.error ?? 'Não foi possível baixar.')
    else baixar(r.url)
  })

  const restaurar = (b: BackupListado) => {
    if (!window.confirm('Restaurar este backup nesta conta? Entra o que estiver faltando (nada é apagado) e os dados do perfil são atualizados.')) return
    void acao(b.caminho, async () => {
      setRelatorio(null)
      const r = await importarBackupAction(id, b.caminho, { perfil: true, equipe: false })
      if (r.error) setErro(r.error)
      else { setRelatorio(r.relatorio ?? null); router.refresh() }
    })
  }

  const apagar = (b: BackupListado) => {
    if (!window.confirm('Apagar este backup de vez? Não tem como recuperar.')) return
    void acao(b.caminho, async () => {
      const r = await apagarBackupAction(b.caminho)
      if (r.error) setErro(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="card interno-secao">
      <div className="interno-secao-topo">
        <div>
          <h2 className="interno-secao-titulo">Backups guardados</h2>
          <p className="text-sm text-muted">
            Arquivos com os dados de {temPerfil ? rotuloTipoConta(tipoAtual) : 'cliente ou de loja'} desta conta, guardados num lugar privado do SAIP.
            Um backup de cliente só volta para uma conta de cliente; um de loja, só para uma loja.
          </p>
        </div>
        {temPerfil && (
          <BotaoConfirmar type="button" onClick={gerar} estado={botao.estadoCom(isPending)} className="btn btn-secondary btn-sm" rotuloPendente="Gerando…" rotuloSucesso="Backup guardado">
            Gerar backup agora
          </BotaoConfirmar>
        )}
      </div>

      {backups.length === 0 ? (
        <p className="text-sm text-muted" style={{ margin: 0 }}>Nenhum backup guardado desta conta.</p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Backup</th><th>Tamanho</th><th /></tr></thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.caminho}>
                  <td>
                    <span className={`badge ${b.tipo === 'lojista' ? 'badge-ativo' : 'badge-aceito'}`}>{b.tipo ? rotuloTipoConta(b.tipo) : '—'}</span>{' '}
                    <span className="text-sm">{b.criado ? fmtData.format(new Date(b.criado)) : b.nome}</span>
                  </td>
                  <td className="text-sm text-muted">{tamanho(b.tamanho)}</td>
                  <td>
                    <div className="interno-acoes">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!!ocupado} onClick={() => baixarArquivo(b)}>Baixar</button>
                      {b.tipo === tipoAtual && (
                        <button type="button" className="btn btn-primary btn-sm" disabled={!!ocupado} onClick={() => restaurar(b)}>
                          {ocupado === b.caminho ? 'Aguarde…' : 'Restaurar nesta conta'}
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado} onClick={() => apagar(b)}>Apagar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {temPerfil && backups.some(b => b.tipo && b.tipo !== tipoAtual) && (
        <p className="form-hint" style={{ marginBottom: 0 }}>
          Os backups de {rotuloTipoConta(tipoAtual === 'cliente' ? 'lojista' : 'cliente')} só podem ser restaurados se a conta voltar a ser {rotuloTipoConta(tipoAtual === 'cliente' ? 'lojista' : 'cliente')}.
        </p>
      )}

      {erro && <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-3)' }}><span>{erro}</span></div>}
      {relatorio && <RelatorioImportacao relatorio={relatorio} />}
    </div>
  )
}

export function RelatorioImportacao({ relatorio }: { relatorio: Relatorio }) {
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <div className="alert alert-success" role="status" style={{ display: 'block' }}>
        <strong>Importado:</strong>
        <ul className="interno-demo-lista">{relatorio.feito.map(f => <li key={f}>{f}</li>)}</ul>
      </div>
      {relatorio.avisos.length > 0 && (
        <div className="alert alert-warning" role="status" style={{ display: 'block', marginTop: 'var(--space-2)' }}>
          <strong>Alguns itens não entraram:</strong>
          <ul className="interno-demo-lista">{relatorio.avisos.map(a => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
