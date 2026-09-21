'use client'

import { useState, useTransition } from 'react'
import { atualizarSomNotificacaoAction } from '@/lib/actions'
import { tocarSom, SONS_DISPONIVEIS, type TipoSom } from '@/lib/sons-notificacao'
import { IconAlert, IconBell, IconCheck, IconPlay, IconSave } from '@/components/icons'

interface Props {
  somAtivoInicial: boolean
  somTipoInicial: string
  // Só o responsável pela conta ou um administrador pode mudar — mesma
  // regra de qualquer outro toggle de Configurações. Quem não pode só
  // vê o estado atual, sem os controles.
  podeEditar: boolean
  migrationPendente: boolean
}

export default function NotificacaoSomForm({ somAtivoInicial, somTipoInicial, podeEditar, migrationPendente }: Props) {
  const [ativo, setAtivo] = useState(somAtivoInicial)
  const [tipo, setTipo] = useState<TipoSom>(somTipoInicial as TipoSom)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [isPending, startTransition] = useTransition()

  const houveMudanca = ativo !== somAtivoInicial || tipo !== somTipoInicial

  function salvar() {
    setErro(null)
    setSucesso(false)
    const fd = new FormData()
    fd.set('ativo', String(ativo))
    fd.set('tipo', tipo)
    startTransition(async () => {
      const result = await atualizarSomNotificacaoAction(fd)
      if (result?.error) {
        setErro(result.error)
        return
      }
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    })
  }

  return (
    <div className="card" style={{ maxWidth: 700 }}>
      {migrationPendente && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Esta configuração ainda não foi criada no banco. Peça para rodar a migration
            036_som_novo_agendamento.sql — até lá, o som segue no padrão (ativado, Sino).
          </span>
        </div>
      )}

      {sucesso && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-5)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Configuração salva!</span>
        </div>
      )}

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      {/* Novos agendamentos — liga/desliga */}
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="flex items-center gap-3">
          <span className="dash-icon-btn" style={{ cursor: 'default' }}>
            <IconBell style={{ width: 17, height: 17 }} />
          </span>
          <div>
            <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Novos agendamentos</div>
            <div className="text-sm text-muted">
              Receba um alerta sonoro sempre que um novo agendamento for criado — o som toca em
              qualquer tela do painel, para todo mundo com acesso à agenda logado no momento.
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`switch ${ativo ? 'switch-on' : ''}`}
          onClick={() => setAtivo(a => !a)}
          disabled={!podeEditar || isPending}
          role="switch"
          aria-checked={ativo}
          title={ativo ? 'Desativar som de novos agendamentos' : 'Ativar som de novos agendamentos'}
          style={{ flexShrink: 0 }}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      <div className="separator" />

      {/* Escolha do som */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--gray-200)', marginBottom: 'var(--space-3)' }}>
          Escolha o som
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {SONS_DISPONIVEIS.map(som => (
            <label
              key={som.value}
              className="som-notificacao-opcao"
              style={{ opacity: podeEditar ? 1 : 0.7, cursor: podeEditar ? 'pointer' : 'default' }}
            >
              <input
                type="radio"
                name="som-tipo"
                value={som.value}
                checked={tipo === som.value}
                onChange={() => setTipo(som.value)}
                disabled={!podeEditar || isPending}
                style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
              />
              <span style={{ flex: 1, fontWeight: 500, color: 'var(--gray-100)' }}>{som.label}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => tocarSom(som.value)}
              >
                <IconPlay style={{ width: 11, height: 11 }} /> Ouvir
              </button>
            </label>
          ))}
        </div>
      </div>

      {podeEditar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)' }}>
          <button
            type="button"
            className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
            onClick={salvar}
            disabled={isPending || !houveMudanca}
          >
            {isPending ? 'Salvando...' : (<><IconSave style={{ width: 15, height: 15 }} /> Salvar alterações</>)}
          </button>
        </div>
      )}
    </div>
  )
}
