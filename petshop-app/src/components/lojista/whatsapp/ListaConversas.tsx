'use client'

import Link from 'next/link'
import { IconAlert, IconChat, IconPlus, IconRefresh, IconSearch, IconSettings, IconUser } from '@/components/icons'
import { iniciais } from '@/lib/format'
import { formatarTelefoneWhatsApp, type Contadores, type Conversa, type FiltroConversas } from '@/lib/whatsapp/tipos'
import { quandoNaLista } from './formatos'

interface Props {
  contadores: Contadores
  filtro: FiltroConversas
  onFiltro: (filtro: FiltroConversas) => void
  busca: string
  onBusca: (texto: string) => void
  conversas: Conversa[]
  idAberta: string | null
  carregando: boolean
  erro: string | null
  temMais: boolean
  carregandoMais: boolean
  onMais: () => void
  onAbrir: (conversa: Conversa) => void
  onAtualizar: () => void
  onNova: () => void
  // Dono ou administrador: vê o atalho para Configurações → WhatsApp.
  gestor: boolean
}

// As quatro abas de cima, cada uma com o seu contador.
const ABAS: { filtro: FiltroConversas; rotulo: string; contador: keyof Contadores; aviso?: boolean }[] = [
  { filtro: 'abertas', rotulo: 'Todas', contador: 'abertas' },
  // Quem está esperando é o que pede atenção: contador em destaque.
  { filtro: 'espera', rotulo: 'Espera', contador: 'espera', aviso: true },
  { filtro: 'ativas', rotulo: 'Ativas', contador: 'ativas' },
  { filtro: 'minhas', rotulo: 'Minhas', contador: 'minhas' },
]

const SEM_RESULTADO: Record<FiltroConversas, string> = {
  abertas: 'Você ainda não possui conversas.',
  espera: 'Ninguém aguardando atendimento.',
  ativas: 'Nenhuma conversa em atendimento.',
  minhas: 'Você não está atendendo nenhuma conversa.',
  nao_lidas: 'Nenhuma conversa com mensagem não lida.',
  encerradas: 'Nenhuma conversa encerrada.',
}

export function nomeDaConversa(c: Pick<Conversa, 'nome' | 'telefone'>): string {
  return c.nome?.trim() || formatarTelefoneWhatsApp(c.telefone)
}

export function AvatarContato({ nome, fotoUrl, tamanho = 44 }: { nome: string; fotoUrl?: string | null; tamanho?: number }) {
  const letras = /^[+(\d]/.test(nome) ? '' : iniciais(nome)
  return (
    <span className="wa-avatar" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) }}>
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
        <img src={fotoUrl} alt="" />
      ) : letras || <IconUser style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} />}
    </span>
  )
}

// Coluna da esquerda: título com o total, abas, busca e a lista.
export default function ListaConversas({
  contadores, filtro, onFiltro, busca, onBusca, conversas, idAberta, carregando, erro,
  temMais, carregandoMais, onMais, onAbrir, onAtualizar, onNova, gestor,
}: Props) {
  const buscando = busca.trim() !== ''

  return (
    <aside className="wa-lista" aria-label="Conversas">
      <header className="wa-lista-topo">
        <div className="wa-lista-titulo">
          <IconChat style={{ width: 20, height: 20 }} />
          <h2>Conversas</h2>
          <span className="wa-contador" title="Conversas abertas">{contadores.abertas}</span>
        </div>
        <div className="wa-lista-acoes">
          {gestor && (
            <Link href="/lojista/configuracoes/whatsapp" className="wa-botao-icone" aria-label="Configurações do WhatsApp" title="Configurações do WhatsApp">
              <IconSettings style={{ width: 18, height: 18 }} />
            </Link>
          )}
          <button type="button" className={`wa-botao-icone ${carregando ? 'is-girando' : ''}`} onClick={onAtualizar} aria-label="Atualizar" title="Atualizar">
            <IconRefresh style={{ width: 18, height: 18 }} />
          </button>
          <button type="button" className="wa-botao-icone is-principal" onClick={onNova} aria-label="Nova conversa" title="Nova conversa">
            <IconPlus style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </header>

      <div className="wa-abas" role="tablist" aria-label="Filtrar conversas">
        {ABAS.map(aba => (
          <button
            key={aba.filtro}
            type="button"
            role="tab"
            aria-selected={filtro === aba.filtro}
            className={`wa-aba ${filtro === aba.filtro ? 'is-ativa' : ''}`}
            onClick={() => onFiltro(aba.filtro)}
          >
            {aba.rotulo}
            <span className={`wa-aba-numero ${aba.aviso && contadores[aba.contador] > 0 ? 'is-aviso' : ''}`}>{contadores[aba.contador]}</span>
          </button>
        ))}
      </div>

      <div className="wa-filtros">
        <button
          type="button"
          className={`wa-filtro ${filtro === 'nao_lidas' ? 'is-ativo' : ''}`}
          aria-pressed={filtro === 'nao_lidas'}
          onClick={() => onFiltro(filtro === 'nao_lidas' ? 'abertas' : 'nao_lidas')}
        >
          Não lidas
          <span className={`wa-aba-numero ${contadores.nao_lidas > 0 ? 'is-destaque' : ''}`}>{contadores.nao_lidas}</span>
        </button>
        <button
          type="button"
          className={`wa-filtro ${filtro === 'encerradas' ? 'is-ativo' : ''}`}
          aria-pressed={filtro === 'encerradas'}
          onClick={() => onFiltro(filtro === 'encerradas' ? 'abertas' : 'encerradas')}
        >
          Encerradas
          <span className="wa-aba-numero">{contadores.encerradas}</span>
        </button>
      </div>

      <label className="wa-busca">
        <IconSearch style={{ width: 17, height: 17 }} />
        <input
          type="search"
          value={busca}
          onChange={e => onBusca(e.target.value)}
          placeholder="Buscar por cliente, pet ou telefone..."
          aria-label="Buscar por cliente, pet ou telefone"
        />
      </label>

      <div className="wa-itens">
        {erro ? (
          <div className="wa-lista-aviso">
            <IconAlert style={{ width: 22, height: 22, color: 'var(--danger-400)' }} />
            <p>{erro}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onAtualizar}>Tentar novamente</button>
          </div>
        ) : conversas.length === 0 ? (
          carregando ? (
            <div className="wa-esqueletos" aria-hidden="true">
              {[0, 1, 2, 3].map(i => <div key={i} className="wa-esqueleto" />)}
            </div>
          ) : (
            <div className="wa-lista-aviso">
              <p>{buscando ? 'Nenhuma conversa encontrada.' : SEM_RESULTADO[filtro]}</p>
              {!buscando && filtro === 'abertas' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={onNova}>
                  <IconPlus style={{ width: 14, height: 14 }} /> Nova conversa
                </button>
              )}
            </div>
          )
        ) : (
          <>
            {conversas.map(c => {
              const nome = nomeDaConversa(c)
              return (
                <button
                  key={c.id_conversa}
                  type="button"
                  className={`wa-item ${idAberta === c.id_conversa ? 'is-aberta' : ''} ${c.nao_lidas > 0 ? 'tem-nao-lidas' : ''}`}
                  onClick={() => onAbrir(c)}
                  aria-current={idAberta === c.id_conversa ? 'true' : undefined}
                >
                  <AvatarContato nome={nome} fotoUrl={c.foto_url} />
                  <span className="wa-item-corpo">
                    <span className="wa-item-linha">
                      <span className="wa-item-nome">{nome} <span className="wa-item-numero">#{c.numero}</span></span>
                      <span className="wa-item-hora">{quandoNaLista(c.ultima_mensagem_em)}</span>
                    </span>
                    {c.pets && <span className="wa-item-pets">{c.pets}</span>}
                    <span className="wa-item-etiquetas">
                      {c.status === 'espera' && <span className="wa-etiqueta is-espera">Aguardando</span>}
                      {c.status === 'encerrada' && <span className="wa-etiqueta">Encerrada</span>}
                      {c.status === 'ativa' && c.nome_responsavel && (
                        <span className="wa-etiqueta is-responsavel" title={`Em atendimento com ${c.nome_responsavel}`}>
                          <IconUser style={{ width: 11, height: 11 }} /> {c.nome_responsavel}
                        </span>
                      )}
                    </span>
                    <span className="wa-item-linha">
                      <span className="wa-item-previa">
                        {c.ultima_mensagem_texto
                          ? <>{c.ultima_mensagem_direcao === 'saida' && 'Você: '}{c.ultima_mensagem_texto}</>
                          : 'Sem mensagens'}
                      </span>
                      {c.nao_lidas > 0 && (
                        <span className="wa-nao-lidas" aria-label={`${c.nao_lidas} mensagens não lidas`}>{c.nao_lidas > 99 ? '99+' : c.nao_lidas}</span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
            {temMais && (
              <button type="button" className="wa-mais" onClick={onMais} disabled={carregandoMais}>
                {carregandoMais ? 'Carregando...' : 'Carregar mais conversas'}
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
