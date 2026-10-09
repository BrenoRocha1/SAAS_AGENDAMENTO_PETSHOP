'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  conectarWhatsAppAction, desconectarWhatsAppAction, estadoQrWhatsAppAction, iniciarQrWhatsAppAction, testarWhatsAppAction,
} from '@/lib/actions-whatsapp'
import { IconAlert, IconCheck, IconCopy, IconInfo, IconQrCode, IconSave } from '@/components/icons'
import { Confirmacao, Segmentos } from '@/components/app/PecasApp'
import type { Provedor } from '@/lib/whatsapp/tipos'
import { quandoNaLista, horaDe } from './formatos'

export interface IntegracaoCompleta {
  // Antes da migration 089 não vem: vale a API oficial.
  provedor?: Provedor
  phone_number_id: string | null
  waba_id: string | null
  numero_exibicao: string | null
  nome_verificado: string | null
  status: 'conectado' | 'erro' | 'desconectado' | 'pendente'
  ultimo_erro: string | null
  webhook_em: string | null
  conectado_em: string
}

interface Props {
  integracao: IntegracaoCompleta | null
  // O servidor da conexão por QR code está configurado no SAIP?
  servidorQr: boolean
  // API oficial: o endereço e o código que a loja cadastra na Meta.
  enderecoWebhook: string
  codigoDeVerificacao: string | null
}

type Modo = 'qr' | 'oficial'

const ROTULO_STATUS = { conectado: 'Conectado', erro: 'Conexão com problema', desconectado: 'Não conectado', pendente: 'Aguardando o QR code' } as const

// Configurações → WhatsApp: a loja conecta o número de um de dois jeitos —
// escaneando um QR code com o WhatsApp do celular, ou pela API oficial da
// Meta. O estado da conexão fica em cima; embaixo, o jeito escolhido.
export default function ConexaoWhatsAppForm({ integracao, servidorQr, enderecoWebhook, codigoDeVerificacao }: Props) {
  const router = useRouter()
  const provedor: Provedor = integracao?.provedor ?? 'cloud_api'
  const ligado = !!integracao && integracao.status !== 'desconectado'
  const [modo, setModo] = useState<Modo>(ligado ? (provedor === 'evolution' ? 'qr' : 'oficial') : 'qr')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [testando, iniciarTeste] = useTransition()
  const [desconectando, iniciarDesconectar] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const ocupado = testando || desconectando

  // Estável: a parte do QR code depende dela enquanto espera o celular.
  const avisar = useCallback((mensagem: string | null, falha: string | null = null) => {
    setAviso(mensagem)
    setErro(falha)
  }, [])

  function testar() {
    avisar(null)
    iniciarTeste(async () => {
      const r = await testarWhatsAppAction()
      if (r.error !== undefined) avisar(null, r.error)
      else avisar(`A conexão está funcionando${r.numero ? ` (${r.numero})` : ''}.`)
      router.refresh()
    })
  }

  function desconectar() {
    avisar(null)
    iniciarDesconectar(async () => {
      const r = await desconectarWhatsAppAction()
      setConfirmando(false)
      if (r.error !== undefined) return avisar(null, r.error)
      avisar('WhatsApp desconectado. As conversas continuam guardadas.')
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
            <strong>{ROTULO_STATUS[ligado ? integracao!.status : 'desconectado']}</strong>
            <div>
              <span>
                {!ligado
                  ? 'Nenhum número de WhatsApp ligado a esta loja.'
                  : integracao!.status === 'pendente'
                    ? 'Escaneie o QR code abaixo com o WhatsApp do celular da loja.'
                    : <>
                        {[integracao!.numero_exibicao, integracao!.nome_verificado].filter(Boolean).join(' · ') || 'Número da loja'}
                        {' · '}{provedor === 'evolution' ? 'por QR code' : 'pela API oficial da Meta'}
                      </>}
              </span>
            </div>
            {ligado && integracao!.status === 'erro' && integracao!.ultimo_erro && (
              <div><span style={{ color: 'var(--danger-400)' }}>{integracao!.ultimo_erro}</span></div>
            )}
            {ligado && integracao!.status !== 'pendente' && (
              <div>
                <span>
                  {integracao!.webhook_em
                    ? `Último aviso recebido do WhatsApp: ${quandoNaLista(integracao!.webhook_em)}${quandoNaLista(integracao!.webhook_em).includes(':') ? '' : ` às ${horaDe(integracao!.webhook_em)}`}`
                    : provedor === 'evolution'
                      ? 'Ainda não chegou nenhuma mensagem por esta conexão.'
                      : 'A Meta ainda não chamou o webhook desta loja — as mensagens só chegam depois de ele ser cadastrado lá.'}
                </span>
              </div>
            )}
          </div>
          {ligado && (
            <div className="wa-config-acoes">
              {integracao!.status !== 'pendente' && (
                <button type="button" className={`btn btn-secondary btn-sm ${testando ? 'btn-loading' : ''}`} onClick={testar} disabled={ocupado}>
                  {testando ? 'Testando...' : 'Testar conexão'}
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmando(true)} disabled={ocupado}>
                Desconectar
              </button>
            </div>
          )}
        </div>
      </div>

      <Segmentos<Modo>
        opcoes={[{ valor: 'qr', rotulo: 'QR code' }, { valor: 'oficial', rotulo: 'API oficial da Meta' }]}
        valor={modo}
        onChange={m => { setModo(m); avisar(null) }}
      />

      {modo === 'qr' ? (
        <ConexaoQr
          disponivel={servidorQr}
          conectado={ligado && provedor === 'evolution' && integracao!.status === 'conectado'}
          emOutroProvedor={ligado && provedor === 'cloud_api'}
          onAviso={avisar}
        />
      ) : (
        <ConexaoOficial
          integracao={ligado && provedor === 'cloud_api' ? integracao : null}
          emOutroProvedor={ligado && provedor === 'evolution'}
          enderecoWebhook={enderecoWebhook}
          codigoDeVerificacao={provedor === 'cloud_api' ? codigoDeVerificacao : null}
          onAviso={avisar}
        />
      )}

      {confirmando && (
        <Confirmacao
          titulo="Desconectar o WhatsApp"
          mensagem="A loja para de receber e enviar mensagens pelo SAIP. As conversas continuam aqui."
          confirmar={desconectando ? 'Desconectando...' : 'Desconectar'}
          ocupado={desconectando}
          onConfirmar={desconectar}
          onFechar={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------
// QR code
// ------------------------------------------------------------
const INTERVALO_MS = 4000

function ConexaoQr({ disponivel, conectado, emOutroProvedor, onAviso }: {
  disponivel: boolean
  conectado: boolean
  emOutroProvedor: boolean
  onAviso: (mensagem: string | null, falha?: string | null) => void
}) {
  const router = useRouter()
  const [qr, setQr] = useState<string | null>(null)
  // Com o QR code na tela, a página pergunta ao servidor se já foi escaneado.
  const [aguardando, setAguardando] = useState(false)
  const [gerando, iniciarGerar] = useTransition()

  function gerar() {
    onAviso(null)
    iniciarGerar(async () => {
      const r = await iniciarQrWhatsAppAction()
      if (r.error !== undefined) return onAviso(null, r.error)
      if (r.conectado) {
        onAviso('O WhatsApp já está conectado.')
        router.refresh()
        return
      }
      setQr(r.qr)
      setAguardando(true)
      router.refresh()
    })
  }

  useEffect(() => {
    if (!aguardando) return
    let cancelado = false
    let relogio: ReturnType<typeof setTimeout>
    const perguntar = async () => {
      const r = await estadoQrWhatsAppAction()
      if (cancelado) return
      if (r.error !== undefined) {
        onAviso(null, r.error)
        setAguardando(false)
        return
      }
      if (r.conectado) {
        setAguardando(false)
        setQr(null)
        onAviso(`WhatsApp conectado${r.numero ? ` (${r.numero})` : ''}. As mensagens já chegam na central.`)
        router.refresh()
        return
      }
      if (r.qr) setQr(r.qr)
      relogio = setTimeout(perguntar, INTERVALO_MS)
    }
    relogio = setTimeout(perguntar, INTERVALO_MS)
    return () => { cancelado = true; clearTimeout(relogio) }
  }, [aguardando, onAviso, router])

  if (!disponivel) {
    return (
      <div className="alert alert-info">
        <IconInfo style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
        <span>A conexão por QR code ainda não foi ativada no SAIP: falta configurar o servidor que mantém a sessão do WhatsApp aberta (variáveis EVOLUTION_API_URL e EVOLUTION_API_KEY).</span>
      </div>
    )
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>Conectar escaneando um QR code</h3>
        <p className="text-sm text-muted">
          Funciona como o WhatsApp Web: a loja usa o número que já tem, e as conversas passam a aparecer na central do SAIP. O celular precisa continuar com internet.
        </p>
      </div>

      <div className="alert alert-warning">
        <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
        <span>Esta não é a conexão oficial da Meta. O WhatsApp pode restringir números que usam esse tipo de acesso — use para atender seus clientes, sem disparos em massa.</span>
      </div>

      {emOutroProvedor && !aguardando && (
        <p className="text-sm text-muted">A loja está conectada pela API oficial. Ao gerar o QR code, a conexão passa a ser por ele.</p>
      )}

      {aguardando && qr ? (
        <div className="wa-qr">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do QR code gerada na hora (data:), não é um arquivo do site */}
          <img src={qr} alt="QR code para conectar o WhatsApp" width={264} height={264} />
          <ol className="wa-config-passos">
            <li>Abra o <strong>WhatsApp</strong> no celular da loja.</li>
            <li>Toque em <strong>Mais opções</strong> (ou <strong>Configurações</strong>) → <strong>Aparelhos conectados</strong>.</li>
            <li>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para este código.</li>
          </ol>
          <p className="text-xs text-muted">O código se renova sozinho. Esta tela avisa assim que o celular conectar.</p>
        </div>
      ) : aguardando ? (
        <p className="text-sm text-muted">Preparando o QR code...</p>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className={`btn btn-primary ${gerando ? 'btn-loading' : ''}`} onClick={gerar} disabled={gerando}>
            {gerando ? 'Preparando...' : <><IconQrCode style={{ width: 15, height: 15 }} /> {conectado ? 'Conectar outro número' : 'Gerar QR code'}</>}
          </button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// API oficial da Meta
// ------------------------------------------------------------
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

// Os dados sensíveis (token e segredo do app) saem daqui direto para o
// servidor e nunca voltam: depois de salvos, os campos aparecem vazios.
function ConexaoOficial({ integracao, emOutroProvedor, enderecoWebhook, codigoDeVerificacao, onAviso }: {
  // Só vem quando a loja está conectada pela API oficial.
  integracao: IntegracaoCompleta | null
  emOutroProvedor: boolean
  enderecoWebhook: string
  codigoDeVerificacao: string | null
  onAviso: (mensagem: string | null, falha?: string | null) => void
}) {
  const router = useRouter()
  const formulario = useRef<HTMLFormElement>(null)
  const [salvando, iniciarSalvar] = useTransition()

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onAviso(null)
    const dados = new FormData(e.currentTarget)
    iniciarSalvar(async () => {
      const r = await conectarWhatsAppAction(dados)
      if (r.error !== undefined) return onAviso(null, r.error)
      formulario.current?.reset()
      onAviso(`Conectado${r.numero ? ` ao número ${r.numero}` : ''}. Agora cadastre o webhook na Meta com os dados abaixo.`)
      router.refresh()
    })
  }

  return (
    <>
      {integracao && codigoDeVerificacao && (
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
          <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>{integracao ? 'Trocar os dados da conexão' : 'Conectar pela API oficial'}</h3>
          <p className="text-sm text-muted">
            A WhatsApp Business Platform é a API oficial da Meta: sem risco para o número, mas a loja precisa criar um app em developers.facebook.com, e só responde livremente até 24 horas depois da última mensagem do cliente.
          </p>
        </div>

        {emOutroProvedor && (
          <p className="text-sm text-muted">A loja está conectada por QR code. Ao salvar os dados abaixo, a conexão passa a ser pela API oficial.</p>
        )}

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
                defaultValue={integracao?.phone_number_id ?? ''} placeholder="Ex.: 123456789012345"
              />
            </div>
            <div className="form-group">
              <label htmlFor="wa-waba-id" className="form-label">Conta do WhatsApp Business (WABA ID)</label>
              <input id="wa-waba-id" name="waba_id" className="form-input" inputMode="numeric" defaultValue={integracao?.waba_id ?? ''} placeholder="Opcional" />
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
            <button type="submit" className={`btn btn-primary ${salvando ? 'btn-loading' : ''}`} disabled={salvando}>
              {salvando ? 'Conferindo com a Meta...' : <><IconSave style={{ width: 15, height: 15 }} /> {integracao ? 'Salvar e reconectar' : 'Conectar pela API oficial'}</>}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
