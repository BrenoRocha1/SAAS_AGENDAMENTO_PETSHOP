'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { importarBackupAction, urlEnvioBackupAction } from '@/lib/actions-interno'
import { BUCKET_BACKUPS, ROTULO_PARTE, rotuloTipoConta, validarBackup, type BackupConta, type TipoConta } from '@/lib/conta-backup-comum'
import BotaoConfirmar, { useEstadoBotao } from '@/components/ui/botao-confirmar'
import { RelatorioImportacao } from './BackupsConta'

interface Relatorio { feito: string[]; avisos: string[] }

const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Importar um arquivo de backup (do computador) para esta conta. O arquivo
// é conferido aqui (formato e tipo) e vai direto para o bucket privado — pode
// ser grande demais para passar pelo servidor —; aí o servidor importa.
export default function ImportarBackup({ id, tipoAtual }: { id: string; tipoAtual: TipoConta }) {
  const router = useRouter()
  const botao = useEstadoBotao()
  const [isPending, startTransition] = useTransition()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [backup, setBackup] = useState<BackupConta | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [perfil, setPerfil] = useState(true)
  const [equipe, setEquipe] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)

  const temPerfil = tipoAtual === 'cliente' || tipoAtual === 'lojista'

  async function escolher(f: File | null) {
    setArquivo(f)
    setBackup(null)
    setProblema(null)
    setErro(null)
    setRelatorio(null)
    if (!f) return
    try {
      const b = validarBackup(JSON.parse(await f.text()))
      setBackup(b)
      if (b.tipo !== tipoAtual) {
        setProblema(`Este arquivo é um backup de ${rotuloTipoConta(b.tipo)} e esta conta é ${rotuloTipoConta(tipoAtual)}. Os dados só entram numa conta do mesmo tipo.`)
      }
    } catch (e) {
      setProblema(e instanceof SyntaxError ? 'Este arquivo não é um backup do SAIP (não é um JSON válido).' : (e as Error).message)
    }
  }

  function importar() {
    if (!arquivo || !backup || problema) return
    setErro(null)
    setRelatorio(null)
    startTransition(async () => {
      const envio = await urlEnvioBackupAction(id)
      if (envio.error || !envio.caminho || !envio.token) { setErro(envio.error ?? 'Não foi possível enviar o arquivo.'); botao.erro(); return }
      const { error: erroEnvio } = await createClient().storage.from(BUCKET_BACKUPS)
        .uploadToSignedUrl(envio.caminho, envio.token, arquivo, { contentType: 'application/json' })
      if (erroEnvio) { setErro(`Não foi possível enviar o arquivo: ${erroEnvio.message}`); botao.erro(); return }
      const r = await importarBackupAction(id, envio.caminho, { perfil, equipe })
      if (r.error) { setErro(r.error); botao.erro(); return }
      await botao.sucesso()
      setRelatorio(r.relatorio ?? null)
      router.refresh()
    })
  }

  return (
    <div className="card interno-secao">
      <h2 className="interno-secao-titulo">Importar dados de um arquivo</h2>
      {!temPerfil ? (
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Esta conta ainda não é cliente nem loja. Crie o perfil acima e depois importe o backup do mesmo tipo.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Escolha um backup do SAIP de <strong>{rotuloTipoConta(tipoAtual)}</strong> (pode ser de outra conta). Entra só o que estiver faltando: nada é apagado nem duplicado.
          </p>
          <input type="file" accept="application/json,.json" className="form-input interno-arquivo" onChange={e => void escolher(e.target.files?.[0] ?? null)} disabled={isPending} />

          {backup && (
            <div className={`interno-backup-resumo ${problema ? 'is-erro' : ''}`}>
              <div>
                <span className={`badge ${backup.tipo === 'lojista' ? 'badge-ativo' : 'badge-aceito'}`}>{rotuloTipoConta(backup.tipo)}</span>{' '}
                <strong>{backup.origem.nome}</strong>
                <span className="text-sm text-muted"> · {backup.origem.email ?? 'sem e-mail'} · gerado em {fmtData.format(new Date(backup.gerado_em))}</span>
              </div>
              <div className="text-sm text-muted">
                {Object.entries(backup.resumo ?? {}).map(([k, n]) => `${n} ${ROTULO_PARTE[k] ?? k}`).join(' · ')}
              </div>
            </div>
          )}
          {problema && <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-3)' }}><span>{problema}</span></div>}

          {backup && !problema && (
            <>
              <label className="interno-check">
                <input type="checkbox" checked={perfil} onChange={e => setPerfil(e.target.checked)} />
                <span>
                  <strong>Copiar os dados do perfil</strong> —{' '}
                  {tipoAtual === 'lojista' ? 'nome da loja, contato, endereço, logo e configurações' : 'nome, telefone e foto (o CPF só volta para a mesma conta)'}
                </span>
              </label>
              {tipoAtual === 'lojista' && (
                <label className="interno-check">
                  <input type="checkbox" checked={equipe} onChange={e => setEquipe(e.target.checked)} />
                  <span><strong>Recriar a equipe</strong> — cada funcionário ganha um login novo; o código de acesso é gerado de novo na tela Equipe.</span>
                </label>
              )}
              <div style={{ marginTop: 'var(--space-3)' }}>
                <BotaoConfirmar type="button" onClick={importar} estado={botao.estadoCom(isPending)} rotuloPendente="Importando…" rotuloSucesso="Importado">
                  Importar nesta conta
                </BotaoConfirmar>
                {isPending && <p className="text-sm text-muted" style={{ marginTop: 'var(--space-2)' }}>Isso pode levar até um minuto — não feche a página.</p>}
              </div>
            </>
          )}
        </>
      )}

      {erro && <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-3)' }}><span>{erro}</span></div>}
      {relatorio && <RelatorioImportacao relatorio={relatorio} />}
    </div>
  )
}
