'use client'

import { useState } from 'react'
import { atualizarSomNotificacaoAction } from '@/lib/actions'
import { tocarSom, SONS_DISPONIVEIS, type TipoSom } from '@/lib/sons-notificacao'
import { IconAlert, IconBell, IconPlay } from '@/components/icons'
import { IndicadorSalvo, useSalvarSozinho } from '@/components/ui/salvo-sozinho'

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
  // Salva sozinho a cada mudança.
  const auto = useSalvarSozinho({
    valores: { ativo, tipo },
    pronto: podeEditar,
    espera: 300,
    salvar: v => {
      const fd = new FormData()
      fd.set('ativo', String(v.ativo))
      fd.set('tipo', v.tipo)
      return atualizarSomNotificacaoAction(fd)
    },
  })

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

      {auto.estado === 'erro' && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{auto.erro}</span>
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
          disabled={!podeEditar}
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
                disabled={!podeEditar}
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)', minHeight: 24 }}>
          <IndicadorSalvo estado={auto.estado} />
        </div>
      )}
    </div>
  )
}
