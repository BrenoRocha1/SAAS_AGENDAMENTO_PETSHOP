'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { assinarComSessao } from '@/lib/supabase/realtime'
import { enviarAnexoWhatsAppAction, enviarMensagemWhatsAppAction, reenviarMensagemWhatsAppAction } from '@/lib/actions-whatsapp'
import {
  IconAlert, IconCalendar, IconCheck, IconCheckDouble, IconChevronLeft, IconClock, IconClose, IconDog, IconFile,
  IconInfo, IconMapPin, IconMore, IconPaperclip, IconRepeat, IconSend, IconSettings, IconUser,
} from '@/components/icons'
import { Confirmacao, Folha, Opcao } from '@/components/app/PecasApp'
import {
  COLUNAS_MENSAGEM, ROTULO_STATUS_CONVERSA, formatarTelefoneWhatsApp, janelaAberta, mensagemDoWhatsApp,
  type Conversa, type Mensagem,
} from '@/lib/whatsapp/tipos'
import { AvatarContato, nomeDaConversa } from './ListaConversas'
import { chaveDoDia, horaDe, rotuloDoDia } from './formatos'

interface Props {
  conversa: Conversa
  idUsuario: string
  // O WhatsApp da loja está conectado (dá para enviar)?
  conectado: boolean
  gestor: boolean
  podeAgendar: boolean
  podeVerClientes: boolean
  detalhesAbertos: boolean
  onDetalhes: () => void
  onVoltar: () => void
  // Avisa a tela de fora do que mudou nesta conversa (lista e contadores).
  onMudou: (idConversa: string, mudanca: Partial<Conversa>) => void
}

// Mensagem ainda sem resposta do servidor (aparece na hora, como "enviando").
type MensagemLocal = Mensagem & { provisoria?: boolean }

const PAGINA = 40
const ANEXO_MAXIMO = 10 * 1024 * 1024
const TIPOS_ANEXO = ['image/jpeg', 'image/png', 'application/pdf']

const porData = (a: Mensagem, b: Mensagem) => a.enviada_em.localeCompare(b.enviada_em)

// Junta uma mensagem que chegou (do servidor ou do tempo real) às que já
// estão na tela, sem repetir.
function juntar(atuais: MensagemLocal[], m: Mensagem): MensagemLocal[] {
  const i = atuais.findIndex(x => x.id_mensagem === m.id_mensagem)
  if (i >= 0) {
    const copia = atuais.slice()
    copia[i] = { ...atuais[i], ...m, provisoria: undefined }
    return copia
  }
  // A que eu acabei de mandar pode chegar pelo tempo real antes de a
  // resposta do envio voltar: sai a provisória, entra a de verdade.
  let base = atuais
  if (m.direcao === 'saida') {
    const j = atuais.findIndex(x => x.provisoria && x.texto === m.texto)
    if (j >= 0) base = atuais.filter((_, k) => k !== j)
  }
  return [...base, m].sort(porData)
}

// Painel da direita: cabeçalho do contato, mensagens e o campo de envio.
export default function PainelConversa({
  conversa, idUsuario, conectado, gestor, podeAgendar, podeVerClientes, detalhesAbertos, onDetalhes, onVoltar, onMudou,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const id = conversa.id_conversa
  const nome = nomeDaConversa(conversa)

  const [mensagens, setMensagens] = useState<MensagemLocal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [temAntigas, setTemAntigas] = useState(false)
  const [buscandoAntigas, setBuscandoAntigas] = useState(false)
  const [novas, setNovas] = useState(false)

  const [texto, setTexto] = useState('')
  const [anexo, setAnexo] = useState<File | null>(null)
  const [enviandoAnexo, setEnviandoAnexo] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [reenviando, setReenviando] = useState<string | null>(null)

  const [menu, setMenu] = useState(false)
  const [transferindo, setTransferindo] = useState(false)
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  // Relógio da janela de 24 horas (atualiza sozinho com a tela aberta).
  const [agora, setAgora] = useState<number | null>(null)

  const rolagem = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const noFim = useRef(true)
  const irParaOFim = useRef(false)
  // Altura da lista antes de entrarem mensagens antigas no topo.
  const alturaAntes = useRef<number | null>(null)

  // ---------- Não lidas: quem abre a conversa (com a aba à vista) leu.
  const marcarLida = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    supabase.rpc('fn_whatsapp_marcar_lida', { p_id_conversa: id }).then(({ error }) => {
      if (!error) onMudou(id, { nao_lidas: 0 })
    })
  }, [supabase, id, onMudou])

  // ---------- Mensagens mais recentes
  useEffect(() => {
    let cancelado = false
    supabase
      .from('whatsapp_mensagem')
      .select(COLUNAS_MENSAGEM)
      .eq('id_conversa', id)
      .order('enviada_em', { ascending: false })
      .limit(PAGINA)
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          setErro(mensagemDoWhatsApp(error, 'Não foi possível carregar as mensagens.'))
          setCarregando(false)
          return
        }
        const linhas = ((data ?? []) as unknown as Mensagem[]).slice().reverse()
        irParaOFim.current = true
        setMensagens(linhas)
        setTemAntigas(linhas.length === PAGINA)
        setErro(null)
        setCarregando(false)
      })
    return () => { cancelado = true }
  }, [supabase, id, tentativa])

  // ---------- Tempo real: mensagem nova e mudança de status
  const receber = useCallback((m: Mensagem, nova: boolean) => {
    if (nova) {
      if (noFim.current || m.direcao === 'saida') irParaOFim.current = true
      else setNovas(true)
    }
    setMensagens(atuais => juntar(atuais, m))
    if (nova && m.direcao === 'entrada') marcarLida()
  }, [marcarLida])

  useEffect(() => {
    const canal = supabase
      .channel(`whatsapp-mensagens-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_mensagem', filter: `id_conversa=eq.${id}` },
        p => receber(p.new as Mensagem, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_mensagem', filter: `id_conversa=eq.${id}` },
        p => receber(p.new as Mensagem, false))
    return assinarComSessao(supabase, canal)
  }, [supabase, id, receber])

  // Abriu com não lidas, ou voltou para a aba: marca como lida.
  const temNaoLidas = conversa.nao_lidas > 0
  useEffect(() => {
    if (temNaoLidas) marcarLida()
    const aoVoltar = () => { if (temNaoLidas) marcarLida() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [temNaoLidas, marcarLida])

  useEffect(() => {
    const atualizar = () => setAgora(Date.now())
    const primeiro = setTimeout(atualizar, 0)
    const relogio = setInterval(atualizar, 30_000)
    return () => { clearTimeout(primeiro); clearInterval(relogio) }
  }, [])

  // ---------- Rolagem: fica no fim quando chega mensagem; segura a posição
  // quando entram as antigas em cima.
  useLayoutEffect(() => {
    const el = rolagem.current
    if (!el) return
    if (alturaAntes.current !== null) {
      el.scrollTop += el.scrollHeight - alturaAntes.current
      alturaAntes.current = null
    } else if (irParaOFim.current) {
      el.scrollTop = el.scrollHeight
      irParaOFim.current = false
      noFim.current = true
    }
  }, [mensagens])

  async function carregarAntigas() {
    const primeira = mensagens.find(m => !m.provisoria)
    if (!primeira || buscandoAntigas) return
    setBuscandoAntigas(true)
    const { data, error } = await supabase
      .from('whatsapp_mensagem')
      .select(COLUNAS_MENSAGEM)
      .eq('id_conversa', id)
      .lt('enviada_em', primeira.enviada_em)
      .order('enviada_em', { ascending: false })
      .limit(PAGINA)
    setBuscandoAntigas(false)
    if (error) return
    const antigas = ((data ?? []) as unknown as Mensagem[]).slice().reverse()
    alturaAntes.current = rolagem.current?.scrollHeight ?? null
    setMensagens(atuais => [...antigas.filter(a => !atuais.some(x => x.id_mensagem === a.id_mensagem)), ...atuais])
    setTemAntigas(antigas.length === PAGINA)
  }

  function aoRolar() {
    const el = rolagem.current
    if (!el) return
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (noFim.current && novas) setNovas(false)
    if (el.scrollTop < 60 && temAntigas && !buscandoAntigas && !carregando) void carregarAntigas()
  }

  function descerTudo() {
    const el = rolagem.current
    if (el) el.scrollTop = el.scrollHeight
    setNovas(false)
  }

  // Imagem que termina de carregar empurra a conversa: se estava no fim, continua.
  function aoCarregarMidia() {
    const el = rolagem.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
  }

  // ---------- Envio
  function ajustarAltura() {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  async function enviarTexto() {
    const corpo = texto.trim()
    if (!corpo) return
    setErroEnvio(null)
    const provisoria: MensagemLocal = {
      id_mensagem: `local-${crypto.randomUUID()}`,
      id_conversa: id,
      direcao: 'saida',
      tipo: 'texto',
      texto: corpo,
      midia: null,
      dados: null,
      status: 'enviando',
      erro: null,
      nome_autor: null,
      enviada_em: new Date().toISOString(),
      provisoria: true,
    }
    irParaOFim.current = true
    setMensagens(atuais => [...atuais, provisoria])
    setTexto('')
    if (campo.current) campo.current.style.height = 'auto'

    const r = await enviarMensagemWhatsAppAction(id, corpo)
    if (r.error !== undefined) {
      // Não saiu daqui: tira a provisória e devolve o texto ao campo.
      setMensagens(atuais => atuais.filter(x => x.id_mensagem !== provisoria.id_mensagem))
      setErroEnvio(r.error)
      setTexto(atual => atual || corpo)
      return
    }
    irParaOFim.current = true
    setMensagens(atuais => juntar(atuais.filter(x => x.id_mensagem !== provisoria.id_mensagem), r.mensagem))
  }

  async function enviarAnexo() {
    if (!anexo || enviandoAnexo) return
    setErroEnvio(null)
    setEnviandoAnexo(true)
    const dados = new FormData()
    dados.set('arquivo', anexo)
    dados.set('legenda', texto.trim())
    const r = await enviarAnexoWhatsAppAction(id, dados)
    setEnviandoAnexo(false)
    if (r.error !== undefined) return setErroEnvio(r.error)
    irParaOFim.current = true
    setMensagens(atuais => juntar(atuais, r.mensagem))
    setAnexo(null)
    setTexto('')
    if (campo.current) campo.current.style.height = 'auto'
  }

  function enviar() {
    if (anexo) void enviarAnexo()
    else void enviarTexto()
  }

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0]
    e.target.value = ''
    if (!escolhido) return
    setErroEnvio(null)
    if (!TIPOS_ANEXO.includes(escolhido.type)) return setErroEnvio('Formato não aceito. Envie imagem JPG ou PNG, ou um PDF.')
    if (escolhido.size > ANEXO_MAXIMO) return setErroEnvio('Arquivo muito grande. O limite é 10 MB.')
    setAnexo(escolhido)
    campo.current?.focus()
  }

  async function reenviar(idMensagem: string) {
    setReenviando(idMensagem)
    setErroEnvio(null)
    const r = await reenviarMensagemWhatsAppAction(idMensagem)
    setReenviando(null)
    if (r.error !== undefined) return setErroEnvio(r.error)
    setMensagens(atuais => juntar(atuais, r.mensagem))
  }

  // ---------- Atendimento
  async function assumir() {
    setOcupado(true)
    setErroAcao(null)
    const { error } = await supabase.rpc('fn_whatsapp_assumir', { p_id_conversa: id })
    setOcupado(false)
    if (error) return setErroAcao(mensagemDoWhatsApp(error, 'Não foi possível assumir a conversa.'))
    onMudou(id, { status: 'ativa', id_responsavel: idUsuario })
  }

  async function encerrar() {
    setOcupado(true)
    setErroAcao(null)
    const { error } = await supabase.rpc('fn_whatsapp_encerrar', { p_id_conversa: id })
    setOcupado(false)
    setConfirmandoEncerrar(false)
    if (error) return setErroAcao(mensagemDoWhatsApp(error, 'Não foi possível encerrar a conversa.'))
    onMudou(id, { status: 'encerrada', nao_lidas: 0 })
  }

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menu) return
    const fechar = () => setMenu(false)
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('click', fechar)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('click', fechar)
      document.removeEventListener('keydown', tecla)
    }
  }, [menu])

  const meu = conversa.status === 'ativa' && conversa.id_responsavel === idUsuario
  const podeAssumir = conversa.status !== 'ativa' || !meu
  // Antes de o relógio começar (primeira pintura), vale a hora da mensagem
  // mais nova já carregada — o campo não pisca.
  const janela = janelaAberta(conversa.ultima_entrada_em, agora ?? undefined)
  const linkAgendar = conversa.id_cliente
    ? `/lojista/agendamentos?novoAgendamentoTutor=${conversa.id_cliente}${conversa.id_pet ? `&novoAgendamentoPet=${conversa.id_pet}` : ''}`
    : null

  return (
    <>
      <header className="wa-conversa-topo">
        <button type="button" className="wa-botao-icone wa-voltar" onClick={onVoltar} aria-label="Voltar para as conversas">
          <IconChevronLeft style={{ width: 20, height: 20 }} />
        </button>
        <button type="button" className="wa-conversa-quem" onClick={onDetalhes} title="Ver informações do contato">
          <AvatarContato nome={nome} fotoUrl={conversa.foto_url} tamanho={42} />
          <span className="wa-conversa-dados">
            <strong>{nome}</strong>
            <span>
              {conversa.nome?.trim() ? formatarTelefoneWhatsApp(conversa.telefone) : 'Contato sem cadastro'}
              {conversa.pets && <> · {conversa.pets}</>}
            </span>
          </span>
        </button>

        <span className={`wa-status is-${conversa.status}`}>
          {conversa.status === 'ativa' && conversa.nome_responsavel
            ? <>Em atendimento · {meu ? 'você' : conversa.nome_responsavel}</>
            : ROTULO_STATUS_CONVERSA[conversa.status]}
        </span>

        <div className="wa-conversa-acoes">
          {conversa.status !== 'ativa' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={assumir} disabled={ocupado}>
              {conversa.status === 'encerrada' ? 'Reabrir' : 'Assumir'}
            </button>
          )}
          <button
            type="button"
            className={`wa-botao-icone ${detalhesAbertos ? 'is-ligado' : ''}`}
            onClick={onDetalhes}
            aria-label="Informações do contato"
            aria-pressed={detalhesAbertos}
            title="Informações do contato"
          >
            <IconInfo style={{ width: 18, height: 18 }} />
          </button>
          <div className="wa-menu-caixa">
            <button
              type="button"
              className="wa-botao-icone"
              onClick={e => { e.stopPropagation(); setMenu(v => !v) }}
              aria-label="Mais ações"
              aria-haspopup="menu"
              aria-expanded={menu}
              title="Mais ações"
            >
              <IconMore style={{ width: 18, height: 18 }} />
            </button>
            {menu && (
              <div className="wa-menu" role="menu">
                {linkAgendar && podeAgendar && (
                  <Link href={linkAgendar} role="menuitem"><IconCalendar style={{ width: 16, height: 16 }} /> Criar agendamento</Link>
                )}
                {conversa.id_cliente && podeVerClientes && (
                  <Link href={`/lojista/clientes/${conversa.id_cliente}`} role="menuitem"><IconUser style={{ width: 16, height: 16 }} /> Ver cliente</Link>
                )}
                {conversa.id_pet && podeVerClientes && (
                  <Link href={`/lojista/pets/${conversa.id_pet}`} role="menuitem"><IconDog style={{ width: 16, height: 16 }} /> Ver pet</Link>
                )}
                {conversa.status === 'ativa' && podeAssumir && (
                  <button type="button" role="menuitem" onClick={assumir} disabled={ocupado}><IconUser style={{ width: 16, height: 16 }} /> Assumir atendimento</button>
                )}
                <button type="button" role="menuitem" onClick={() => setTransferindo(true)}><IconRepeat style={{ width: 16, height: 16 }} /> Transferir atendimento</button>
                {conversa.status !== 'encerrada' && (
                  <button type="button" role="menuitem" className="is-perigo" onClick={() => setConfirmandoEncerrar(true)}>
                    <IconClose style={{ width: 16, height: 16 }} /> Encerrar conversa
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {erroAcao && (
        <div className="alert alert-error wa-faixa">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erroAcao}</span>
        </div>
      )}

      <div className="wa-mensagens" ref={rolagem} onScroll={aoRolar}>
        {carregando ? (
          <div className="wa-mensagens-centro">Carregando mensagens...</div>
        ) : erro ? (
          <div className="wa-mensagens-centro">
            <IconAlert style={{ width: 22, height: 22, color: 'var(--danger-400)' }} />
            <p>{erro}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setCarregando(true); setTentativa(t => t + 1) }}>Tentar novamente</button>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="wa-mensagens-centro">
            <p>Esta conversa ainda não tem mensagens.</p>
          </div>
        ) : (
          <>
            {buscandoAntigas && <div className="wa-dia"><span>Carregando mensagens anteriores...</span></div>}
            {mensagens.map((m, i) => {
              const dia = chaveDoDia(m.enviada_em)
              const novoDia = i === 0 || chaveDoDia(mensagens[i - 1].enviada_em) !== dia
              return (
                <div key={m.id_mensagem} className="wa-linha-mensagem">
                  {novoDia && <div className="wa-dia"><span>{rotuloDoDia(m.enviada_em)}</span></div>}
                  <Bolha
                    m={m}
                    reenviando={reenviando === m.id_mensagem}
                    onReenviar={() => reenviar(m.id_mensagem)}
                    onMidia={aoCarregarMidia}
                  />
                </div>
              )
            })}
          </>
        )}
      </div>

      {novas && (
        <button type="button" className="wa-novas" onClick={descerTudo}>Novas mensagens</button>
      )}

      <footer className="wa-envio">
        {erroEnvio && (
          <div className="alert alert-error wa-envio-erro" role="alert">
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>{erroEnvio}</span>
            <button type="button" onClick={() => setErroEnvio(null)} aria-label="Fechar aviso"><IconClose style={{ width: 14, height: 14 }} /></button>
          </div>
        )}

        {!conectado ? (
          <div className="wa-envio-aviso">
            <IconAlert style={{ width: 18, height: 18, flexShrink: 0 }} />
            <span>O WhatsApp da loja não está conectado. Não dá para enviar mensagens por enquanto.</span>
            {gestor && (
              <Link href="/lojista/configuracoes/whatsapp" className="btn btn-secondary btn-sm">
                <IconSettings style={{ width: 14, height: 14 }} /> Conectar
              </Link>
            )}
          </div>
        ) : !janela ? (
          <div className="wa-envio-aviso">
            <IconClock style={{ width: 18, height: 18, flexShrink: 0 }} />
            <span>
              {conversa.ultima_entrada_em
                ? 'Passaram mais de 24 horas desde a última mensagem do cliente. O WhatsApp só deixa a loja responder livremente dentro desse prazo — quando ele escrever de novo, o campo volta.'
                : 'O cliente ainda não escreveu nesta conversa. O WhatsApp só deixa a loja escrever livremente depois da primeira mensagem dele (e por 24 horas a partir dela).'}
            </span>
          </div>
        ) : (
          <>
            {anexo && (
              <div className="wa-anexo">
                <IconFile style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span>{anexo.name}</span>
                <button type="button" onClick={() => setAnexo(null)} disabled={enviandoAnexo} aria-label="Tirar o anexo"><IconClose style={{ width: 14, height: 14 }} /></button>
              </div>
            )}
            <div className="wa-envio-linha">
              <input ref={arquivo} type="file" accept={TIPOS_ANEXO.join(',')} onChange={escolherArquivo} hidden />
              <button
                type="button"
                className="wa-botao-icone"
                onClick={() => arquivo.current?.click()}
                disabled={enviandoAnexo}
                aria-label="Anexar imagem ou PDF"
                title="Anexar imagem ou PDF"
              >
                <IconPaperclip style={{ width: 19, height: 19 }} />
              </button>
              <textarea
                ref={campo}
                rows={1}
                value={texto}
                onChange={e => { setTexto(e.target.value); ajustarAltura() }}
                onKeyDown={e => {
                  // Enter envia; Shift + Enter quebra a linha.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                placeholder={anexo ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
                aria-label="Mensagem"
                maxLength={4096}
                disabled={enviandoAnexo}
              />
              <button
                type="button"
                className="wa-enviar"
                onClick={enviar}
                disabled={enviandoAnexo || (!anexo && texto.trim() === '')}
                aria-label="Enviar"
                title="Enviar"
              >
                <IconSend style={{ width: 18, height: 18 }} />
              </button>
            </div>
            {enviandoAnexo && <p className="wa-envio-nota">Enviando o arquivo...</p>}
          </>
        )}
      </footer>

      {transferindo && (
        <Transferir
          idConversa={id}
          idResponsavel={conversa.status === 'ativa' ? conversa.id_responsavel : null}
          onFechar={() => setTransferindo(false)}
          onTransferida={(idPara, nomePara) => {
            setTransferindo(false)
            onMudou(id, { status: 'ativa', id_responsavel: idPara, nome_responsavel: nomePara })
          }}
        />
      )}

      {confirmandoEncerrar && (
        <Confirmacao
          titulo="Encerrar conversa"
          mensagem="A conversa sai da lista de abertas. Se o cliente escrever de novo, ela volta para a espera."
          confirmar={ocupado ? 'Encerrando...' : 'Encerrar'}
          ocupado={ocupado}
          onConfirmar={encerrar}
          onFechar={() => setConfirmandoEncerrar(false)}
        />
      )}
    </>
  )
}

// ------------------------------------------------------------
// Uma mensagem
// ------------------------------------------------------------
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"])/g

// Texto com os endereços clicáveis; quebras de linha ficam por conta do CSS.
function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(URL_RE)
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1
          ? <a key={i} href={parte} target="_blank" rel="noopener noreferrer">{parte}</a>
          : <span key={i}>{parte}</span>
      )}
    </>
  )
}

function IconeDoStatus({ status }: { status: Mensagem['status'] }) {
  const estilo = { width: 15, height: 15 }
  if (status === 'enviando') return <IconClock style={estilo} aria-label="Enviando" />
  if (status === 'enviada') return <IconCheck style={estilo} aria-label="Enviada" />
  if (status === 'entregue') return <IconCheckDouble style={estilo} aria-label="Entregue" />
  if (status === 'lida') return <IconCheckDouble style={{ ...estilo, color: 'var(--primary-600)' }} aria-label="Lida" />
  if (status === 'erro') return <IconAlert style={{ ...estilo, color: 'var(--danger-400)' }} aria-label="Não enviada" />
  return null
}

function Bolha({ m, reenviando, onReenviar, onMidia }: {
  m: MensagemLocal
  reenviando: boolean
  onReenviar: () => void
  onMidia: () => void
}) {
  // O arquivo fica na Meta por tempo limitado: se não vier, a mensagem
  // avisa em vez de mostrar uma imagem quebrada.
  const [semArquivo, setSemArquivo] = useState(false)

  if (m.tipo === 'sistema') {
    return <div className="wa-sistema"><span>{m.texto}</span></div>
  }

  const arquivo = m.midia && !m.provisoria ? `/api/whatsapp/midia/${m.id_mensagem}` : null
  const local = m.dados as { latitude?: number | null; longitude?: number | null } | null
  const temMapa = m.tipo === 'localizacao' && typeof local?.latitude === 'number' && typeof local?.longitude === 'number'

  return (
    <div className={`wa-bolha is-${m.direcao} ${m.status === 'erro' ? 'is-erro' : ''}`} title={m.direcao === 'saida' && m.nome_autor ? `Enviada por ${m.nome_autor}` : undefined}>
      {m.tipo === 'imagem' && arquivo && !semArquivo && (
        <a href={arquivo} target="_blank" rel="noopener noreferrer" className="wa-imagem">
          {/* eslint-disable-next-line @next/next/no-img-element -- arquivo da conversa, entregue pela rota do próprio site */}
          <img src={arquivo} alt="Imagem" loading="lazy" onLoad={onMidia} onError={() => setSemArquivo(true)} />
        </a>
      )}
      {m.tipo === 'figurinha' && arquivo && !semArquivo && (
        // eslint-disable-next-line @next/next/no-img-element -- arquivo da conversa, entregue pela rota do próprio site
        <img src={arquivo} alt="Figurinha" className="wa-figurinha" loading="lazy" onLoad={onMidia} onError={() => setSemArquivo(true)} />
      )}
      {semArquivo && <p className="wa-texto-apagado">{m.tipo === 'figurinha' ? 'Figurinha' : 'Imagem'} não disponível no momento.</p>}
      {m.tipo === 'audio' && arquivo && <audio controls preload="none" src={arquivo} />}
      {m.tipo === 'video' && arquivo && <video controls preload="none" src={arquivo} className="wa-video" />}
      {m.tipo === 'documento' && arquivo && (
        <a href={arquivo} target="_blank" rel="noopener noreferrer" className="wa-documento">
          <IconFile style={{ width: 22, height: 22, flexShrink: 0 }} />
          <span>{m.midia?.nome || 'Documento'}</span>
        </a>
      )}
      {temMapa && (
        <a href={`https://www.google.com/maps?q=${local!.latitude},${local!.longitude}`} target="_blank" rel="noopener noreferrer" className="wa-documento">
          <IconMapPin style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span>Abrir a localização no mapa</span>
        </a>
      )}
      {m.tipo === 'contato' && <p className="wa-texto-apagado">Contato compartilhado:</p>}
      {m.tipo === 'outro' && <p className="wa-texto-apagado">Mensagem de um tipo que o SAIP ainda não mostra. Veja no celular da loja.</p>}

      {m.texto && <p className="wa-texto"><TextoComLinks texto={m.texto} /></p>}

      <span className="wa-bolha-rodape">
        {horaDe(m.enviada_em)}
        {m.direcao === 'saida' && <IconeDoStatus status={m.status} />}
      </span>

      {m.status === 'erro' && (
        <div className="wa-bolha-erro">
          <span>{m.erro || 'A mensagem não foi enviada.'}</span>
          {m.tipo === 'texto' && !m.provisoria && (
            <button type="button" onClick={onReenviar} disabled={reenviando}>{reenviando ? 'Enviando...' : 'Tentar de novo'}</button>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Transferir o atendimento para outra pessoa da equipe
// ------------------------------------------------------------
function Transferir({ idConversa, idResponsavel, onFechar, onTransferida }: {
  idConversa: string
  idResponsavel: string | null
  onFechar: () => void
  onTransferida: (idPara: string, nomePara: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [equipe, setEquipe] = useState<{ id: string; nome: string }[] | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let cancelado = false
    supabase.rpc('fn_whatsapp_equipe').then(({ data, error }) => {
      if (cancelado) return
      if (error) return setErro(mensagemDoWhatsApp(error, 'Não foi possível carregar a equipe.'))
      setEquipe(((data ?? []) as { id: string; nome: string }[]).filter(p => p.id !== idResponsavel))
    })
    return () => { cancelado = true }
  }, [supabase, idResponsavel])

  async function transferir() {
    const para = equipe?.find(p => p.id === escolhida)
    if (!para) return
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.rpc('fn_whatsapp_transferir', { p_id_conversa: idConversa, p_id_para: para.id })
    setSalvando(false)
    if (error) return setErro(mensagemDoWhatsApp(error, 'Não foi possível transferir a conversa.'))
    onTransferida(para.id, para.nome)
  }

  return (
    <Folha titulo="Transferir atendimento" onFechar={onFechar} ocupado={salvando}>
      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}
      {equipe === null && !erro ? (
        <p className="text-sm text-muted">Carregando a equipe...</p>
      ) : equipe && equipe.length === 0 ? (
        <p className="text-sm text-muted">Não há outra pessoa da equipe com acesso ao WhatsApp. Libere a permissão “WhatsApp” em Equipe.</p>
      ) : (
        <div role="radiogroup" aria-label="Para quem transferir" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {equipe?.map(p => (
            <Opcao key={p.id} titulo={p.nome} selecionada={escolhida === p.id} onClick={() => setEscolhida(p.id)} desativada={salvando} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-secondary" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button type="button" className={`btn btn-primary ${salvando ? 'btn-loading' : ''}`} onClick={transferir} disabled={!escolhida || salvando}>
          {salvando ? 'Transferindo...' : 'Transferir'}
        </button>
      </div>
    </Folha>
  )
}
