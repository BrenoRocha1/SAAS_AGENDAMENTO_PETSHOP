'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { assinarComSessao } from '@/lib/supabase/realtime'
import { IconAlert, IconChat, IconSettings } from '@/components/icons'
import {
  conectado as integracaoConectada, mensagemDoWhatsApp,
  type Conversa, type FiltroConversas, type ResumoWhatsApp,
} from '@/lib/whatsapp/tipos'
import ListaConversas from './ListaConversas'
import PainelConversa from './PainelConversa'
import DetalhesContato from './DetalhesContato'
import NovaConversaModal from './NovaConversaModal'

interface Props {
  lojistaId: string
  idUsuario: string
  // Dono ou administrador (pode conectar o número).
  gestor: boolean
  podeAgendar: boolean
  podeVerClientes: boolean
  resumoInicial: ResumoWhatsApp
  conversasIniciais: Conversa[]
  // Conversa de ?c=<id>, já aberta ao carregar.
  conversaInicial: Conversa | null
}

const PAGINA = 30

// O que a linha crua da tabela (evento do tempo real) traz de novo para a
// conversa aberta. Nome, foto e pets vêm de outras tabelas: esses a lista
// atualiza quando recarrega.
function camposDaLinha(linha: Record<string, unknown>): Partial<Conversa> {
  const campos: (keyof Conversa)[] = [
    'status', 'id_responsavel', 'nome_responsavel', 'nao_lidas', 'telefone', 'id_cliente', 'id_pet',
    'ultima_mensagem_em', 'ultima_mensagem_texto', 'ultima_mensagem_direcao', 'ultima_entrada_em',
  ]
  const mudanca: Record<string, unknown> = {}
  for (const campo of campos) if (campo in linha) mudanca[campo] = linha[campo]
  return mudanca as Partial<Conversa>
}

// A central: conversas à esquerda, a conversa aberta no meio e, quando
// pedido, as informações do contato à direita. No celular é uma tela por
// vez (lista → conversa → informações).
export default function CentralWhatsApp({
  lojistaId, idUsuario, gestor, podeAgendar, podeVerClientes, resumoInicial, conversasIniciais, conversaInicial,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [resumo, setResumo] = useState(resumoInicial)
  const [filtro, setFiltro] = useState<FiltroConversas>('abertas')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [conversas, setConversas] = useState(conversasIniciais)
  const [temMais, setTemMais] = useState(conversasIniciais.length === PAGINA)
  const [carregando, setCarregando] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [aberta, setAberta] = useState<Conversa | null>(conversaInicial)
  const [detalhes, setDetalhes] = useState(false)
  const [novaConversa, setNovaConversa] = useState(false)

  const raiz = useRef<HTMLDivElement>(null)
  // Pedido mais recente da lista: resposta de pedido antigo é descartada.
  const pedido = useRef(0)
  // O que está na tela agora, para o tempo real recarregar o mesmo recorte.
  const recorte = useRef({ filtro, busca: buscaAplicada, quantidade: conversasIniciais.length })
  useEffect(() => {
    recorte.current = { filtro, busca: buscaAplicada, quantidade: conversas.length }
  }, [filtro, buscaAplicada, conversas.length])

  const conectado = integracaoConectada(resumo.integracao)

  // ---------- Lista
  const carregar = useCallback(async (opcoes: { filtro: FiltroConversas; busca: string; quantidade?: number; silencioso?: boolean }) => {
    const meu = ++pedido.current
    if (!opcoes.silencioso) setCarregando(true)
    const limite = Math.min(Math.max(opcoes.quantidade ?? PAGINA, PAGINA), 100)
    const [lista, novoResumo] = await Promise.all([
      supabase.rpc('fn_whatsapp_conversas', { p_filtro: opcoes.filtro, p_busca: opcoes.busca.trim() || null, p_limite: limite }),
      supabase.rpc('fn_whatsapp_resumo'),
    ])
    if (meu !== pedido.current) return
    setCarregando(false)
    if (lista.error) {
      if (!opcoes.silencioso) setErroLista(mensagemDoWhatsApp(lista.error, 'Não foi possível carregar as conversas.'))
      return
    }
    const linhas = (lista.data ?? []) as Conversa[]
    setErroLista(null)
    setConversas(linhas)
    setTemMais(linhas.length === limite)
    if (!novoResumo.error && novoResumo.data) setResumo(novoResumo.data as ResumoWhatsApp)
    // Nome, foto e pets da conversa aberta acompanham a lista.
    setAberta(atual => {
      const nova = atual && linhas.find(l => l.id_conversa === atual.id_conversa)
      return nova ? { ...atual, ...nova } : atual
    })
  }, [supabase])

  async function carregarMais() {
    const ultima = conversas[conversas.length - 1]
    if (!ultima || carregandoMais) return
    setCarregandoMais(true)
    const meu = pedido.current
    const { data, error } = await supabase.rpc('fn_whatsapp_conversas', {
      p_filtro: filtro, p_busca: buscaAplicada.trim() || null, p_limite: PAGINA, p_antes: ultima.ordem,
    })
    setCarregandoMais(false)
    if (error || meu !== pedido.current) return
    const linhas = (data ?? []) as Conversa[]
    setConversas(atuais => [...atuais, ...linhas.filter(l => !atuais.some(a => a.id_conversa === l.id_conversa))])
    setTemMais(linhas.length === PAGINA)
  }

  function trocarFiltro(novo: FiltroConversas) {
    if (novo === filtro) return
    setFiltro(novo)
    void carregar({ filtro: novo, busca: buscaAplicada })
  }

  // Busca: espera a pessoa parar de digitar.
  useEffect(() => {
    if (busca === buscaAplicada) return
    const relogio = setTimeout(() => {
      setBuscaAplicada(busca)
      void carregar({ filtro, busca })
    }, 300)
    return () => clearTimeout(relogio)
  }, [busca, buscaAplicada, filtro, carregar])

  // ---------- Tempo real: qualquer mudança nas conversas da loja (mensagem
  // nova, status, não lidas) recarrega o recorte que está na tela. Vários
  // eventos seguidos viram um pedido só.
  useEffect(() => {
    let relogio: ReturnType<typeof setTimeout> | null = null
    const canal = supabase
      .channel(`whatsapp-conversas-${lojistaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversa', filter: `id_lojista=eq.${lojistaId}` },
        payload => {
          const linha = payload.new as Record<string, unknown> | null
          if (linha && typeof linha.id_conversa === 'string') {
            const mudanca = camposDaLinha(linha)
            setAberta(atual => (atual && atual.id_conversa === linha.id_conversa ? { ...atual, ...mudanca } : atual))
          }
          if (relogio) clearTimeout(relogio)
          relogio = setTimeout(() => {
            void carregar({ ...recorte.current, silencioso: true })
          }, 350)
        }
      )
    const desfazer = assinarComSessao(supabase, canal)
    return () => {
      if (relogio) clearTimeout(relogio)
      desfazer()
    }
  }, [supabase, lojistaId, carregar])

  // ---------- Conversa aberta. O endereço guarda qual é (?c=): no celular,
  // o "voltar" do aparelho fecha a conversa e mostra a lista.
  const idAberta = useRef<string | null>(conversaInicial?.id_conversa ?? null)
  useEffect(() => { idAberta.current = aberta?.id_conversa ?? null }, [aberta])

  const abrir = useCallback((conversa: Conversa) => {
    const url = new URL(window.location.href)
    url.searchParams.set('c', conversa.id_conversa)
    // Da lista para a conversa entra no histórico; trocar de conversa, não.
    if (idAberta.current) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    idAberta.current = conversa.id_conversa
    setAberta(conversa)
  }, [])

  const fechar = useCallback(() => {
    setDetalhes(false)
    setAberta(null)
    const url = new URL(window.location.href)
    if (url.searchParams.has('c')) {
      url.searchParams.delete('c')
      window.history.replaceState(null, '', url)
    }
  }, [])

  const abrirPorId = useCallback(async (idConversa: string) => {
    const { data } = await supabase.rpc('fn_whatsapp_conversas', { p_id: idConversa, p_limite: 1 })
    const conversa = ((data ?? []) as Conversa[])[0]
    if (conversa) abrir(conversa)
  }, [supabase, abrir])

  useEffect(() => {
    const aoNavegar = () => {
      const idConversa = new URL(window.location.href).searchParams.get('c')
      if (!idConversa) {
        setDetalhes(false)
        setAberta(null)
        return
      }
      if (idAberta.current !== idConversa) void abrirPorId(idConversa)
    }
    window.addEventListener('popstate', aoNavegar)
    return () => window.removeEventListener('popstate', aoNavegar)
  }, [abrirPorId])

  // O painel da conversa avisa o que mudou: vale na hora, sem esperar o
  // tempo real.
  const aoMudar = useCallback((idConversa: string, mudanca: Partial<Conversa>) => {
    setAberta(atual => (atual && atual.id_conversa === idConversa ? { ...atual, ...mudanca } : atual))
    setConversas(atuais => atuais.map(c => (c.id_conversa === idConversa ? { ...c, ...mudanca } : c)))
  }, [])

  // ---------- Altura: a central ocupa o que sobra da tela abaixo do
  // cabeçalho da página (rolam a lista e as mensagens, não a página).
  useEffect(() => {
    const medir = () => {
      const el = raiz.current
      if (!el) return
      const topo = el.getBoundingClientRect().top + window.scrollY
      el.style.setProperty('--wa-topo', `${Math.round(topo)}px`)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [conectado, resumo.integracao?.status])

  return (
    <>
      {!conectado && (
        <div className={`alert ${resumo.integracao?.status === 'erro' ? 'alert-error' : 'alert-warning'} wa-conexao`} role="status">
          <IconAlert style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1 }} />
          <span>
            {resumo.integracao?.status === 'erro'
              ? <>O WhatsApp parou de responder: {resumo.integracao.ultimo_erro || 'a conexão com a Meta falhou.'}</>
              : 'Conecte seu WhatsApp para começar a receber e enviar mensagens pelo SAIP.'}
            {!gestor && ' Peça ao responsável pela loja.'}
          </span>
          {gestor && (
            <Link href="/lojista/configuracoes/whatsapp" className="btn btn-primary btn-sm">
              <IconSettings style={{ width: 14, height: 14 }} /> {resumo.integracao?.status === 'erro' ? 'Reconectar' : 'Conectar WhatsApp'}
            </Link>
          )}
        </div>
      )}

      <div ref={raiz} className={`wa ${aberta ? 'tem-conversa' : ''} ${aberta && detalhes ? 'tem-detalhes' : ''}`}>
        <ListaConversas
          contadores={resumo.contadores}
          filtro={filtro}
          onFiltro={trocarFiltro}
          busca={busca}
          onBusca={setBusca}
          conversas={conversas}
          idAberta={aberta?.id_conversa ?? null}
          carregando={carregando}
          erro={erroLista}
          temMais={temMais}
          carregandoMais={carregandoMais}
          onMais={carregarMais}
          onAbrir={abrir}
          onAtualizar={() => void carregar({ filtro, busca: buscaAplicada })}
          onNova={() => setNovaConversa(true)}
          gestor={gestor}
        />

        <section className="wa-painel" aria-label="Conversa">
          {aberta ? (
            <PainelConversa
              key={aberta.id_conversa}
              conversa={aberta}
              idUsuario={idUsuario}
              conectado={conectado}
              gestor={gestor}
              podeAgendar={podeAgendar}
              podeVerClientes={podeVerClientes}
              detalhesAbertos={detalhes}
              onDetalhes={() => setDetalhes(v => !v)}
              onVoltar={fechar}
              onMudou={aoMudar}
            />
          ) : (
            <div className="wa-vazio">
              <span className="wa-vazio-icone"><IconChat style={{ width: 30, height: 30 }} /></span>
              <h2>Selecione uma conversa</h2>
              <p>Escolha uma conversa da lista para começar o atendimento.</p>
            </div>
          )}
        </section>

        {aberta && detalhes && (
          <DetalhesContato
            key={aberta.id_conversa}
            conversa={aberta}
            podeAgendar={podeAgendar}
            podeVerClientes={podeVerClientes}
            onFechar={() => setDetalhes(false)}
            onMudou={aoMudar}
          />
        )}
      </div>

      {novaConversa && (
        <NovaConversaModal
          conectado={conectado}
          onFechar={() => setNovaConversa(false)}
          onAberta={idConversa => {
            setNovaConversa(false)
            void abrirPorId(idConversa)
            void carregar({ filtro, busca: buscaAplicada, silencioso: true })
          }}
        />
      )}
    </>
  )
}
