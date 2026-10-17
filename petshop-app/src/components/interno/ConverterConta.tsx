'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { converterContaAction } from '@/lib/actions-interno'
import { rotuloTipoConta, type TipoPerfil } from '@/lib/conta-backup-comum'
import BotaoConfirmar, { useEstadoBotao } from '@/components/ui/botao-confirmar'

export interface SugestaoPerfil { nome: string; telefone: string; cpf: string }

// Converter a conta entre cliente e loja (ou criar o perfil de quem ainda
// não tem). Os dados do perfil antigo são apagados — `perdas` diz o quê —
// e, marcado, um backup é guardado antes (dá para restaurar depois).
export default function ConverterConta({ id, tipoAtual, sugestao, perdas, ehVoce }: {
  id: string
  tipoAtual: TipoPerfil | 'sem'
  sugestao: SugestaoPerfil
  perdas: string[]
  ehVoce: boolean
}) {
  const router = useRouter()
  const botao = useEstadoBotao()
  const [isPending, startTransition] = useTransition()
  const [para, setPara] = useState<TipoPerfil>(tipoAtual === 'cliente' ? 'lojista' : 'cliente')
  const [nome, setNome] = useState(sugestao.nome)
  const [telefone, setTelefone] = useState(sugestao.telefone)
  const [cpf, setCpf] = useState(sugestao.cpf)
  const [backup, setBackup] = useState(true)
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string[] | null>(null)

  const apaga = tipoAtual !== 'sem'
  const pronto = confirmacao.trim().toUpperCase() === 'CONVERTER'

  function converter(e: React.FormEvent) {
    e.preventDefault()
    if (!pronto) return
    setErro(null)
    setResumo(null)
    startTransition(async () => {
      const r = await converterContaAction(id, para, { nome, telefone, cpf }, { backup: apaga && backup }, confirmacao)
      if (r.error) { setErro(r.error); botao.erro(); router.refresh(); return }
      await botao.sucesso()
      setResumo(r.resumo ?? [])
      setConfirmacao('')
      router.refresh()
    })
  }

  return (
    <form className="card interno-secao" onSubmit={converter}>
      <h2 className="interno-secao-titulo">{apaga ? `Converter em ${rotuloTipoConta(para)}` : 'Criar o perfil da conta'}</h2>
      <p className="text-sm text-muted">
        {apaga
          ? `A conta deixa de ser ${rotuloTipoConta(tipoAtual)} e passa a ser ${rotuloTipoConta(para)}, com o mesmo login (Google).`
          : 'Esta conta entrou no SAIP mas ainda não tem perfil. Escolha o que ela vai ser.'}
      </p>

      {!apaga && (
        <div className="segmentos-app" role="tablist" aria-label="Perfil" style={{ margin: 'var(--space-3) 0' }}>
          {(['lojista', 'cliente'] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={para === t} className={`segmento-app ${para === t ? 'is-ativo' : ''}`} onClick={() => setPara(t)}>
              {t === 'lojista' ? 'Loja' : 'Cliente'}
            </button>
          ))}
        </div>
      )}

      <div className="grid-3 interno-campos">
        <div className="form-group">
          <label className="form-label form-label-required" htmlFor="conv-nome">{para === 'lojista' ? 'Nome da loja' : 'Nome da pessoa'}</label>
          <input id="conv-nome" className="form-input" value={nome} onChange={e => setNome(e.target.value)} maxLength={150} required />
        </div>
        <div className="form-group">
          <label className="form-label form-label-required" htmlFor="conv-tel">Telefone (com DDD)</label>
          <input id="conv-tel" className="form-input" inputMode="tel" value={telefone} onChange={e => setTelefone(e.target.value)} required />
        </div>
        {para === 'cliente' && (
          <div className="form-group">
            <label className="form-label form-label-required" htmlFor="conv-cpf">CPF</label>
            <input id="conv-cpf" className="form-input" inputMode="numeric" value={cpf} onChange={e => setCpf(e.target.value)} required />
          </div>
        )}
      </div>
      <p className="form-hint" style={{ marginTop: 0 }}>
        {para === 'lojista'
          ? 'O resto (CPF/CNPJ, endereço, horários, serviços) a loja completa no Perfil — ou importe um backup de loja depois. A loja começa no período de teste: se quiser, isente de cobrança na página da empresa.'
          : 'O e-mail continua o do login.'}
      </p>

      {apaga && (
        <div className="alert alert-warning interno-perdas" role="note">
          <div>
            <strong>Vai ser apagado de {rotuloTipoConta(tipoAtual)}:</strong>
            <ul>{perdas.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
        </div>
      )}

      {apaga && (
        <label className="interno-check">
          <input type="checkbox" checked={backup} onChange={e => setBackup(e.target.checked)} />
          <span><strong>Guardar um backup antes de converter</strong> (recomendado) — fica na lista de backups abaixo e pode ser restaurado se a pessoa mudar de ideia.</span>
        </label>
      )}
      {ehVoce && (
        <p className="text-sm text-muted" style={{ margin: 'var(--space-2) 0 0' }}>
          Esta é a sua conta: depois de converter, o painel continua aberto e as áreas de cliente e de loja passam a valer o perfil novo.
        </p>
      )}

      <div className="interno-confirmar">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="conv-confirma">Digite <strong>CONVERTER</strong> para confirmar</label>
          <input id="conv-confirma" className="form-input" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} autoComplete="off" style={{ maxWidth: 220 }} />
        </div>
        <BotaoConfirmar
          estado={botao.estadoCom(isPending)}
          disabled={!pronto}
          className={apaga ? 'btn btn-danger' : 'btn btn-primary'}
          rotuloPendente="Convertendo…"
          rotuloSucesso="Conta convertida"
        >
          {apaga ? 'Converter conta' : 'Criar perfil'}
        </BotaoConfirmar>
      </div>

      {erro && <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-3)' }}><span>{erro}</span></div>}
      {resumo && (
        <div className="alert alert-success" role="status" style={{ marginTop: 'var(--space-3)', display: 'block' }}>
          <ul className="interno-demo-lista">{resumo.map(r => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </form>
  )
}
