'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { conectarWhatsAppAction, desconectarWhatsAppAction, testarWhatsAppAction } from '@/lib/actions-whatsapp'
import { IconAlert, IconCheck, IconCopy, IconSave } from '@/components/icons'
import { Confirmacao } from '@/components/app/PecasApp'
import { quandoNaLista, horaDe } from './formatos'

export interface IntegracaoCompleta {
  phone_number_id: string
  waba_id: string | null
  numero_exibicao: string | null
  nome_verificado: string | null
  status: 'conectado' | 'erro' | 'desconectado'
  ultimo_erro: string | null
  webhook_em: string | null
  conectado_em: string
}

interface Props {
  integracao: IntegracaoCompleta | null
  // O endereço que a loja cadastra na Meta para receber as mensagens.
  enderecoWebhook: string
  codigoDeVerificacao: string | null
}

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem acesso à área de transferência: a pessoa seleciona e copia */ }
  }
  return (
    <div className="form-group">
      <span className="form-label">{rotulo}</span>
      <div className="wa-config-copia">
        <code>{valor}</code>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copiar}>
          {copiado ? <><IconCheck style={{ width: 14, height: 14 }} /> Copiado</> : <><IconCopy style={{ width: 14, height: 14 }} /> Copiar</>}
        </button>
      </div>
    </div>
  )
}

// Conexão do número da loja com a WhatsApp Business Platform (Cloud API da
// Meta). Os dados sensíveis (token e segredo do app) saem daqui direto para
// o servidor e nunca voltam: depois de salvos, os campos aparecem vazios.
export default function ConexaoWhatsAppForm({ integracao, enderecoWebhook, codigoDeVerificacao }: Props) {
  const router = useRouter()
  const formulario = useRef<HTMLFormElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, iniciarSalvar] = useTransition()
  const [testando, iniciarTeste] = useTransition()
  const [desconectando, iniciarDesconectar] = useTransition()
  const [confirmando, setConfirmando] = useState(false)

  const ligado = !!integracao && integracao.status !== 'desconectado'
  const ocupado = salvando || testando || desconectando

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    const dados = new FormData(e.currentTarget)
    iniciarSalvar(async () => {
      const r = await conectarWhatsAppAction(dados)
      if (r.error !== undefined) return setErro(r.error)
      formulario.current?.reset()
      setAviso(`Conectado${r.numero ? ` ao número ${r.numero}` : ''}. Agora cadastre o webhook na Meta com os dados abaixo.`)
      router.refresh()
    })
  }

  function testar() {
    setErro(null)
    setAviso(null)
    iniciarTeste(async () => {
      const r = await testarWhatsAppAction()
      if (r.error !== undefined) setErro(r.error)
      else setAviso(`A Meta respondeu: o número ${r.numero ?? ''} está acessível.`)
      router.refresh()
    })
  }

  function desconectar() {
    setErro(null)
    setAviso(null)
    iniciarDesconectar(async () => {
      const r = await desconectarWhatsAppAction()
      setConfirmando(false)
      if (r.error !== undefined) return setErro(r.error)
      setAviso('WhatsApp desconectado. As conversas continuam guardadas.')
      router.refresh()
    })
  }

  return (
    <div className="wa-config">
      {erro && (
        <div className="alert alert-error" role="alert">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}
      {aviso && (
        <div className="alert alert-success" role="status">
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{aviso}</span>
        </div>
      )}

      <div className="card">
        <div className="wa-config-estado">
          <span className={`wa-config-bolinha ${ligado ? `is-${integracao!.status}` : ''}`} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>
              {!ligado ? 'Não conectado' : integracao!.status === 'erro' ? 'Conexão com problema' : 'Conectado'}
            </strong>
            <div>
              <span>
                {!ligado
                  ? 'Nenhum número de WhatsApp ligado a esta loja.'
                  : [integracao!.numero_exibicao, integracao!.nome_verificado].filter(Boolean).join(' · ') || `Número ${integracao!.phone_number_id}`}
              </span>
            </div>
            {ligado && integracao!.status === 'erro' && integracao!.ultimo_erro && (
              <div><span style={{ color: 'var(--danger-400)' }}>{integracao!.ultimo_erro}</span></div>
            )}
            {ligado && (
              <div>
                <span>
                  {integracao!.webhook_em
                    ? `Último aviso recebido da Meta: ${quandoNaLista(integracao!.webhook_em)}${quandoNaLista(integracao!.webhook_em).includes(':') ? '' : ` às ${horaDe(integracao!.webhook_em)}`}`
                    : 'A Meta ainda não chamou o webhook desta loja — as mensagens só chegam depois de ele ser cadastrado lá.'}
                </span>
              </div>
            )}
          </div>
          {ligado && (
            <div className="wa-config-acoes">
              <button type="button" className={`btn btn-secondary btn-sm ${testando ? 'btn-loading' : ''}`} onClick={testar} disabled={ocupado}>
                {testando ? 'Testando...' : 'Testar conexão'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmando(true)} disabled={ocupado}>
                Desconectar
              </button>
            </div>
          )}
        </div>
      </div>

      {ligado && codigoDeVerificacao && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>Webhook (receber mensagens)</h3>
            <p className="text-sm text-muted">
              No app da Meta, em WhatsApp → Configuração → Webhook, cole o endereço e o código abaixo e assine o campo <strong>messages</strong>.
            </p>
          </div>
          <Copiavel rotulo="Endereço de retorno (Callback URL)" valor={enderecoWebhook} />
          <Copiavel rotulo="Código de verificação (Verify token)" valor={codigoDeVerificacao} />
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>{ligado ? 'Trocar os dados da conexão' : 'Conectar o número da loja'}</h3>
          <p className="text-sm text-muted">
            O SAIP usa a WhatsApp Business Platform, a API oficial da Meta. Os dados abaixo vêm do app da loja em developers.facebook.com.
          </p>
        </div>

        <ol className="wa-config-passos">
          <li>Na Meta for Developers, crie um app do tipo <strong>Empresa</strong> e adicione o produto <strong>WhatsApp</strong>.</li>
          <li>Em WhatsApp → Configuração da API, copie o <strong>identificador do número de telefone</strong> e o da <strong>conta do WhatsApp Business</strong>.</li>
          <li>Gere um <strong>token permanente</strong> (usuário do sistema) com as permissões <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.</li>
          <li>Em Configurações do app → Básico, copie a <strong>chave secreta do app</strong>.</li>
          <li>Preencha os campos e salve. Depois, cadastre o webhook com o endereço e o código que aparecem nesta tela.</li>
        </ol>

        <form ref={formulario} onSubmit={salvar} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="wa-phone-number-id" className="form-label form-label-required">Identificador do número (Phone number ID)</label>
              <input
                id="wa-phone-number-id" name="phone_number_id" className="form-input" inputMode="numeric" required
                defaultValue={ligado ? integracao!.phone_number_id : ''} placeholder="Ex.: 123456789012345"
              />
            </div>
            <div className="form-group">
              <label htmlFor="wa-waba-id" className="form-label">Conta do WhatsApp Business (WABA ID)</label>
              <input
                id="wa-waba-id" name="waba_id" className="form-input" inputMode="numeric"
                defaultValue={ligado ? integracao!.waba_id ?? '' : ''} placeholder="Opcional"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="wa-access-token" className="form-label form-label-required">Token de acesso</label>
            <input id="wa-access-token" name="access_token" type="password" className="form-input" required autoComplete="off" spellCheck={false} placeholder="Cole o token permanente do app" />
            <span className="form-hint">Fica guardado só no servidor. Depois de salvo, não aparece mais em nenhuma tela.</span>
          </div>
          <div className="form-group">
            <label htmlFor="wa-app-secret" className="form-label form-label-required">Chave secreta do app (App Secret)</label>
            <input id="wa-app-secret" name="app_secret" type="password" className="form-input" required autoComplete="off" spellCheck={false} placeholder="Cole a chave secreta do app" />
            <span className="form-hint">É com ela que o SAIP confere que cada mensagem recebida veio mesmo da Meta.</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className={`btn btn-primary ${salvando ? 'btn-loading' : ''}`} disabled={ocupado}>
              {salvando ? 'Conferindo com a Meta...' : <><IconSave style={{ width: 15, height: 15 }} /> {ligado ? 'Salvar e reconectar' : 'Conectar WhatsApp'}</>}
            </button>
          </div>
        </form>
      </div>

      {confirmando && (
        <Confirmacao
          titulo="Desconectar o WhatsApp"
          mensagem="A loja para de receber e enviar mensagens pelo SAIP, e o token guardado é apagado. As conversas continuam aqui."
          confirmar={desconectando ? 'Desconectando...' : 'Desconectar'}
          ocupado={desconectando}
          onConfirmar={desconectar}
          onFechar={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}
