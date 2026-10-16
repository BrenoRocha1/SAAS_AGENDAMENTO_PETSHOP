'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  criarServicoAction,
  editarServicoAction,
  excluirServicoAction,
  alternarStatusServicoAction,
  adicionarVariacaoServicoAction,
  removerVariacaoServicoAction,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { IconAlert, IconClose, IconPencil, IconPlus, IconSliders, IconTrash } from '@/components/icons'
import { formatarReais } from '@/lib/taxidog'
import Ilustracao from '@/components/Ilustracao'
import PromocaoServicoModal, { FORM_PROMOCAO_VAZIO, PromocaoServicoCampos, agoraBrasilPromocao, dadosDoFormPromocao, formDaPromocao, type FormPromocao } from '@/components/lojista/PromocaoServico'
import { ROTULO_STATUS_PROMOCAO, periodoPromoServico, precoPromocionalServico, seloDesconto, statusPromocaoServico, type StatusPromocao } from '@/lib/promocao'
import BotaoConfirmar, { useEstadoBotao } from '@/components/ui/botao-confirmar'
import GaleriaServicoEditor, { enviarFotosPendentes, problemaDasPendentes, type FotoPendente } from '@/components/lojista/GaleriaServicoEditor'

interface Servico {
  id_servico: string
  nome: string
  descricao?: string
  preco: number
  duracao: number
  status: string
  // Promoção (migrations 095 e 096)
  promo_percentual?: number | null
  promo_inicio?: string | null
  promo_fim?: string | null
  promo_preco?: number | null
  promo_hora_inicio?: string | null
  promo_hora_fim?: string | null
  promo_ativa?: boolean | null
  promo_exibir_online?: boolean | null
}

// O botão de promoção da lista: mostra o desconto quando ela vale agora e,
// fora disso, em que pé está (programada, desativada, encerrada).
const CLASSE_BOTAO_PROMO: Record<StatusPromocao, string> = {
  sem: '', ativa: 'is-ativa', programada: 'is-agendada', pausada: 'is-parada', encerrada: 'is-parada',
}
const ROTULO_CURTO_PROMO: Record<StatusPromocao, string> = {
  sem: '% Promo', ativa: '', programada: 'Programada', pausada: 'Desativada', encerrada: 'Encerrada',
}

interface Variacao {
  id_variacao: string
  tipo: 'porte' | 'raca'
  especie: 'Cão' | 'Gato'
  porte: 'Pequeno' | 'Médio' | 'Grande' | null
  raca: string | null
  preco: number
}

// Variação ainda não salva — usada enquanto o serviço está sendo criado
// (não existe id_servico até o "Criar serviço" ser confirmado).
interface VariacaoDraft {
  key: string
  tipo: 'porte' | 'raca'
  especie: 'Cão' | 'Gato'
  porte: 'Pequeno' | 'Médio' | 'Grande' | ''
  raca: string
  preco: number
}

interface Props {
  servicos: Servico[]
}

export default function ServicosList({ servicos: inicial }: Props) {
  const supabase = createClient()
  const [servicos, setServicos] = useState<Servico[]>(inicial)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Servico | null>(null)
  const [draftVariacoes, setDraftVariacoes] = useState<VariacaoDraft[]>([])
  // Fotos de referência escolhidas e ainda não enviadas (migration 101).
  const [fotosPendentes, setFotosPendentes] = useState<FotoPendente[]>([])
  const [error, setError] = useState<string | null>(null)
  const [excluirErro, setExcluirErro] = useState<string | null>(null)
  const [confirmarExclusao, setConfirmarExclusao] = useState<Servico | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [alternandoId, setAlternandoId] = useState<string | null>(null)
  const [alternarErro, setAlternarErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const botao = useEstadoBotao()
  const [promoAlvo, setPromoAlvo] = useState<Servico | null>(null)
  const agora = agoraBrasilPromocao()
  // Seção "Promoção" do cadastro: o preço digitado no formulário (a conta do
  // desconto usa ele) e se a loja mexeu na seção — só aí ela é gravada.
  const [precoForm, setPrecoForm] = useState('')
  const [nomeForm, setNomeForm] = useState('')
  const [promoForm, setPromoForm] = useState<FormPromocao>(FORM_PROMOCAO_VAZIO)
  const [promoTocada, setPromoTocada] = useState(false)

  const statusPromo = (s: Servico) => statusPromocaoServico(s, agora)
  const precoComPromo = (s: Servico) => precoPromocionalServico(Number(s.preco), Number(s.preco), s)

  async function recarregar() {
    const { data } = await supabase.from('servico').select('*').is('excluido_em', null).order('created_at', { ascending: false })
    setServicos(data ?? [])
  }

  function handleAlternarStatus(s: Servico) {
    setAlternarErro(null)
    const novoStatus = s.status === 'Ativo' ? 'Inativo' : 'Ativo'
    setAlternandoId(s.id_servico)
    startTransition(async () => {
      const result = await alternarStatusServicoAction(s.id_servico, novoStatus === 'Ativo')
      setAlternandoId(null)
      if (result?.error) {
        setAlternarErro(result.error)
        return
      }
      setServicos(prev => prev.map(x => x.id_servico === s.id_servico ? { ...x, status: novoStatus } : x))
    })
  }

  function handleExcluir(s: Servico) {
    setExcluirErro(null)
    setConfirmarExclusao(s)
  }

  function confirmarExclusaoDoServico() {
    if (!confirmarExclusao) return
    const s = confirmarExclusao
    setExcluindoId(s.id_servico)
    startTransition(async () => {
      const result = await excluirServicoAction(s.id_servico)
      setExcluindoId(null)
      setConfirmarExclusao(null)
      if (result?.error) {
        setExcluirErro(result.error)
      } else {
        setServicos(prev => prev.filter(x => x.id_servico !== s.id_servico))
      }
    })
  }

  function limparFotosPendentes() {
    fotosPendentes.forEach(p => URL.revokeObjectURL(p.preview))
    setFotosPendentes([])
  }

  function abrirNovo() {
    setEditando(null)
    setDraftVariacoes([])
    limparFotosPendentes()
    setError(null)
    setPrecoForm('')
    setNomeForm('')
    setPromoForm(FORM_PROMOCAO_VAZIO)
    setPromoTocada(false)
    setShowModal(true)
  }

  function abrirEditar(s: Servico) {
    setEditando(s)
    limparFotosPendentes()
    setError(null)
    setPrecoForm(String(s.preco))
    setNomeForm(s.nome)
    setPromoForm(formDaPromocao(s, Number(s.preco)))
    setPromoTocada(false)
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const problemaFotos = problemaDasPendentes(fotosPendentes)
    if (problemaFotos) {
      setError(problemaFotos)
      return
    }
    // Ao criar um serviço novo, as variações ainda não salvas vão junto
    // no mesmo submit (ver criarServicoAction) — não existe id_servico
    // antes disso pra salvar elas separadamente.
    startTransition(async () => {
      const formData = new FormData(form)
      if (!editando && draftVariacoes.length > 0) {
        formData.set('variacoes', JSON.stringify(draftVariacoes.map(v => ({ tipo: v.tipo, especie: v.especie, porte: v.porte, raca: v.raca, preco: v.preco }))))
      }
      // Promoção: vai junto só se a loja mexeu na seção (ver actions).
      if (promoTocada) formData.set('promocao', JSON.stringify(dadosDoFormPromocao(promoForm)))
      const result = editando
        ? await editarServicoAction(editando.id_servico, formData)
        : await criarServicoAction(formData)
      if (result?.error) {
        setError(result.error)
        botao.erro()
        return
      }
      // Fotos de referência novas: sobem depois do serviço salvo (o serviço
      // novo só tem id agora).
      const idServico = editando?.id_servico ?? (result as { id_servico?: string } | undefined)?.id_servico
      if (idServico && fotosPendentes.length > 0) {
        const envio = await enviarFotosPendentes(idServico, fotosPendentes)
        if (envio.erro) {
          // O serviço já está salvo: a tela passa a editar ele (salvar de
          // novo não cria outro) e ficam só as fotos que não subiram.
          setFotosPendentes(fotosPendentes.slice(envio.enviadas))
          setError(`Serviço salvo, mas uma foto não foi enviada — ${envio.erro}`)
          botao.erro()
          if (!editando) {
            const { data: novo } = await supabase.from('servico').select('*').eq('id_servico', idServico).maybeSingle()
            if (novo) setEditando(novo as Servico)
          }
          await recarregar()
          return
        }
        setFotosPendentes([])
      }
      await botao.sucesso()
      setShowModal(false)
      setDraftVariacoes([])
      await recarregar()
    })
  }

  return (
    <>
      {/* Celular (até 768px): a mesma tela Serviços do app. */}
      <div className="so-celular">
        <button type="button" className="dash-app-botao" onClick={abrirNovo}>
          <IconPlus style={{ width: 18, height: 18 }} /> Novo serviço
        </button>
      </div>

      <div className="flex justify-end so-desktop" style={{ marginBottom: 'var(--space-5)' }}>
        <button className="btn btn-primary" onClick={abrirNovo} id="btn-novo-servico">
          <IconPlus style={{ width: 16, height: 16 }} /> Novo Serviço
        </button>
      </div>

      {excluirErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{excluirErro}</span>
        </div>
      )}

      {alternarErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{alternarErro}</span>
        </div>
      )}

      <div className="so-celular">
        {servicos.length === 0 ? (
          <div className="dash-app-vazio">
            <Ilustracao nome="servicos" altura={110} style={{ marginBottom: 0 }} />
            <strong>Nenhum serviço cadastrado</strong>
            <span>Cadastre o primeiro serviço para a loja poder receber agendamentos.</span>
          </div>
        ) : (
          <div className="dash-app-lista">
            {servicos.map(s => (
              <div
                key={s.id_servico}
                className="dash-app-linha"
                role="button"
                tabIndex={0}
                onClick={() => abrirEditar(s)}
                onKeyDown={e => { if (e.key === 'Enter') abrirEditar(s) }}
              >
                <span className="dash-app-linha-info">
                  <span className={`dash-app-linha-pet ${s.status === 'Ativo' ? '' : 'is-apagado'}`}>{s.nome}</span>
                  <span className="dash-app-linha-sub is-media">
                    {statusPromo(s) === 'ativa'
                      ? <><s>{formatarReais(s.preco)}</s> {formatarReais(precoComPromo(s))}</>
                      : formatarReais(s.preco)} · {s.duracao} min{s.status === 'Ativo' ? '' : ' · Inativo'}
                  </span>
                </span>
                <button
                  type="button"
                  className={`promo-chip ${CLASSE_BOTAO_PROMO[statusPromo(s)]}`}
                  onClick={e => { e.stopPropagation(); setPromoAlvo(s) }}
                  aria-label={`Promoção de ${s.nome}: ${ROTULO_STATUS_PROMOCAO[statusPromo(s)]}`}
                >
                  {statusPromo(s) === 'ativa' ? `-${seloDesconto(Number(s.preco), precoComPromo(s))}%` : ROTULO_CURTO_PROMO[statusPromo(s)]}
                </button>
                <button
                  type="button"
                  className={`switch ${s.status === 'Ativo' ? 'switch-on' : ''}`}
                  onClick={e => { e.stopPropagation(); handleAlternarStatus(s) }}
                  disabled={alternandoId === s.id_servico}
                  role="switch"
                  aria-checked={s.status === 'Ativo'}
                  aria-label={`${s.nome} ativo`}
                >
                  <span className="switch-thumb" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="so-desktop">
      {servicos.length === 0 ? (
        <div className="empty-state card">
          <Ilustracao nome="servicos" />
          <div className="empty-state-title">Nenhum serviço cadastrado</div>
          <p style={{ marginBottom: 'var(--space-4)' }}>Cadastre seus serviços para que os clientes possam agendar</p>
          <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar primeiro serviço</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Preço</th>
                <th>Duração</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map(s => (
                <tr key={s.id_servico}>
                  <td>
                    <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                    {s.descricao && <div className="text-sm text-muted">{s.descricao}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {statusPromo(s) === 'ativa' ? (
                      <>
                        <div className="text-xs text-muted"><s>{formatarReais(s.preco)}</s></div>
                        <div className="text-success font-semibold">{formatarReais(precoComPromo(s))}</div>
                      </>
                    ) : <span className="text-success font-semibold">{formatarReais(s.preco)}</span>}
                  </td>
                  <td>{s.duracao} min</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`switch ${s.status === 'Ativo' ? 'switch-on' : ''}`}
                        onClick={() => handleAlternarStatus(s)}
                        disabled={alternandoId === s.id_servico}
                        role="switch"
                        aria-checked={s.status === 'Ativo'}
                        title={s.status === 'Ativo' ? 'Desativar serviço' : 'Ativar serviço'}
                      >
                        <span className="switch-thumb" />
                      </button>
                      {alternandoId === s.id_servico && <span className="text-xs text-muted">Salvando...</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => abrirEditar(s)}
                      >
                        <IconPencil style={{ width: 14, height: 14 }} /> Editar
                      </button>
                      <button
                        type="button"
                        className={`promo-chip ${CLASSE_BOTAO_PROMO[statusPromo(s)]}`}
                        onClick={() => setPromoAlvo(s)}
                        title={statusPromo(s) === 'sem' ? 'Colocar em promoção' : `${ROTULO_STATUS_PROMOCAO[statusPromo(s)]} · ${periodoPromoServico(s)}`}
                      >
                        {statusPromo(s) === 'sem' ? '% Promoção'
                          : statusPromo(s) === 'ativa' ? `Em promoção -${seloDesconto(Number(s.preco), precoComPromo(s))}%`
                          : ROTULO_STATUS_PROMOCAO[statusPromo(s)]}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleExcluir(s)}
                        disabled={excluindoId === s.id_servico}
                        title="Excluir serviço"
                      >
                        <IconTrash style={{ width: 14, height: 14 }} />
                        {excluindoId === s.id_servico ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {promoAlvo && (
        <PromocaoServicoModal
          id={promoAlvo.id_servico}
          nome={promoAlvo.nome}
          preco={Number(promoAlvo.preco)}
          atual={promoAlvo}
          onFechar={() => setPromoAlvo(null)}
          onSalvo={async () => {
            await recarregar()
            setPromoAlvo(null)
          }}
        />
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editando ? 'Editar Serviço' : 'Novo Serviço'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-error">
                    <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="nome" className="form-label form-label-required">Nome do Serviço</label>
                  <input
                    id="nome"
                    name="nome"
                    type="text"
                    className="form-input"
                    defaultValue={editando?.nome}
                    onChange={e => setNomeForm(e.target.value)}
                    placeholder="Ex: Banho e Tosa"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="descricao" className="form-label">Descrição</label>
                  <textarea
                    id="descricao"
                    name="descricao"
                    className="form-textarea"
                    defaultValue={editando?.descricao}
                    placeholder="Descreva o serviço..."
                    rows={2}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="preco" className="form-label form-label-required">Preço (R$)</label>
                    <input
                      id="preco"
                      name="preco"
                      type="number"
                      className="form-input"
                      defaultValue={editando?.preco}
                      onChange={e => setPrecoForm(e.target.value)}
                      placeholder="45.00"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="duracao" className="form-label form-label-required">Duração (min)</label>
                    <input
                      id="duracao"
                      name="duracao"
                      type="number"
                      className="form-input"
                      defaultValue={editando?.duracao}
                      placeholder="60"
                      min="15"
                      max="480"
                      required
                    />
                  </div>
                </div>

                <PrecosVariacoes
                  idServico={editando?.id_servico ?? null}
                  draft={draftVariacoes}
                  onDraftChange={setDraftVariacoes}
                />

                <GaleriaServicoEditor
                  key={editando?.id_servico ?? 'novo'}
                  idServico={editando?.id_servico ?? null}
                  nomeServico={nomeForm}
                  pendentes={fotosPendentes}
                  onPendentesChange={setFotosPendentes}
                  desativado={isPending}
                />

                <PromocaoServicoCampos
                  nome={nomeForm}
                  preco={Number(precoForm.replace(',', '.')) || 0}
                  valor={promoForm}
                  onChange={novo => { setPromoForm(novo); setPromoTocada(true) }}
                  desativado={isPending}
                />
              </div>

              <div className="modal-footer">
                {editando && (
                  <span className="so-celular">
                    <button
                      type="button"
                      className="btn btn-full tela-app-perigo"
                      onClick={() => { setShowModal(false); handleExcluir(editando) }}
                    >
                      <IconTrash style={{ width: 15, height: 15 }} /> Excluir serviço
                    </button>
                  </span>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <BotaoConfirmar estado={botao.estadoCom(isPending)} id="btn-salvar-servico" rotuloPendente="Salvando…" rotuloSucesso={editando ? 'Salvo' : 'Serviço cadastrado'}>Salvar serviço</BotaoConfirmar>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmarExclusao && (
        <div className="modal-overlay" onClick={() => !isPending && setConfirmarExclusao(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Excluir serviço</h3>
              <button className="modal-close" onClick={() => setConfirmarExclusao(null)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-full)', flexShrink: 0,
                  background: 'rgba(239,68,68,0.1)', color: 'var(--danger-400)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <IconAlert style={{ width: 18, height: 18 }} />
                </span>
                <p style={{ color: 'var(--gray-200)' }}>
                  Tem certeza que deseja excluir <strong style={{ color: 'var(--gray-100)' }}>&quot;{confirmarExclusao.nome}&quot;</strong>?
                  Ele sai da lista e não pode mais ser agendado. Os atendimentos já feitos continuam no relatório de
                  vendas, e o que já está marcado com ele continua valendo. Essa ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmarExclusao(null)} disabled={isPending}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn btn-danger ${isPending ? 'btn-loading' : ''}`}
                onClick={confirmarExclusaoDoServico}
                disabled={isPending}
              >
                {isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// Preços e Variações — cobrar diferente por porte ou por raça
// específica. Ver migration 010 (servico_variacao) e
// fn_calcular_preco_servico.
//
// Dois modos:
//  - idServico != null (editando um serviço já salvo): adicionar/remover
//    grava direto no banco (adicionarVariacaoServicoAction /
//    removerVariacaoServicoAction).
//  - idServico == null (criando um serviço novo): ainda não existe
//    id_servico pra amarrar a variação, então ela fica só no estado do
//    componente pai (draft) e é enviada junto no mesmo submit que cria
//    o serviço — ver criarServicoAction.
// ============================================================
function PrecosVariacoes({
  idServico,
  draft,
  onDraftChange,
}: {
  idServico: string | null
  draft: VariacaoDraft[]
  onDraftChange: (v: VariacaoDraft[]) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [aberto, setAberto] = useState(false)
  const [variacoesSalvas, setVariacoesSalvas] = useState<Variacao[] | null>(null)
  const [tipo, setTipo] = useState<'porte' | 'raca'>('porte')
  const [especie, setEspecie] = useState<'Cão' | 'Gato'>('Cão')
  const [porte, setPorte] = useState('')
  const [raca, setRaca] = useState('')
  const [preco, setPreco] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!aberto || !idServico || variacoesSalvas !== null) return
    let cancelado = false
    supabase
      .from('servico_variacao')
      .select('*')
      .eq('id_servico', idServico)
      .order('created_at')
      .then(({ data }) => {
        if (!cancelado) setVariacoesSalvas((data as Variacao[]) ?? [])
      })
    return () => { cancelado = true }
  }, [aberto, idServico]) // eslint-disable-line react-hooks/exhaustive-deps

  function jaExiste(especieAlvo: string, valor: string) {
    const bate = (v: { tipo: string; especie: string; porte: string | null; raca: string | null }) => {
      if (v.tipo !== tipo || v.especie !== especieAlvo) return false
      return tipo === 'raca'
        ? (v.raca ?? '').toLowerCase() === valor.toLowerCase()
        : v.porte === valor
    }
    return idServico ? (variacoesSalvas ?? []).some(bate) : draft.some(bate)
  }

  function adicionar() {
    setErro(null)
    if (tipo === 'porte' && !porte) { setErro('Selecione o porte'); return }
    if (tipo === 'raca' && !raca.trim()) { setErro('Informe a raça'); return }
    if (!preco || Number(preco) < 0) { setErro('Informe o preço'); return }

    const chave = tipo === 'porte' ? porte : raca.trim()
    if (jaExiste(especie, chave)) {
      setErro('Já existe uma faixa de preço cadastrada para essa combinação.')
      return
    }

    if (idServico) {
      const fd = new FormData()
      fd.set('tipo', tipo)
      fd.set('especie', especie)
      if (tipo === 'porte') fd.set('porte', porte)
      else fd.set('raca', raca.trim())
      fd.set('preco', preco)

      startTransition(async () => {
        const result = await adicionarVariacaoServicoAction(idServico, fd)
        if (result?.error) { setErro(result.error); return }
        setPorte(''); setRaca(''); setPreco('')
        setVariacoesSalvas(null)
      })
    } else {
      onDraftChange([
        ...draft,
        {
          key: crypto.randomUUID(),
          tipo,
          especie,
          porte: tipo === 'porte' ? (porte as VariacaoDraft['porte']) : '',
          raca: tipo === 'raca' ? raca.trim() : '',
          preco: Number(preco),
        },
      ])
      setPorte(''); setRaca(''); setPreco('')
    }
  }

  function remover(alvo: Variacao | VariacaoDraft) {
    if (idServico && 'id_variacao' in alvo) {
      startTransition(async () => {
        await removerVariacaoServicoAction(alvo.id_variacao)
        setVariacoesSalvas(null)
      })
    } else if ('key' in alvo) {
      onDraftChange(draft.filter(v => v.key !== alvo.key))
    }
  }

  const listaExibida: Array<Variacao | VariacaoDraft> = idServico ? (variacoesSalvas ?? []) : draft

  return (
    <div className="form-group">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="picker-item"
        style={{ width: '100%' }}
      >
        <span className="dash-icon-btn" style={{ width: 32, height: 32, cursor: 'default' }}>
          <IconSliders style={{ width: 15, height: 15 }} />
        </span>
        <div className="picker-item-main">
          <div className="picker-item-title">Preços e Variações</div>
          <div className="picker-item-sub">Cobrar diferente por porte, espécie ou raça</div>
        </div>
      </button>

      {aberto && (
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p className="text-xs text-muted">
            Prioridade de cálculo: <strong>raça específica</strong> &gt; <strong>porte + espécie</strong> &gt; preço base.
            {!idServico && ' As faixas abaixo só são salvas quando você clicar em "Salvar Serviço".'}
          </p>

          {erro && (
            <div className="alert alert-error">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>{erro}</span>
            </div>
          )}

          {idServico && variacoesSalvas === null ? (
            <p className="text-sm text-muted">Carregando...</p>
          ) : listaExibida.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {listaExibida.map(v => (
                <div key={'id_variacao' in v ? v.id_variacao : v.key} className="flex items-center justify-between" style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--gray-850)',
                  border: '1px solid var(--gray-800)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <span className="text-sm">
                    {v.especie} · {v.tipo === 'raca' ? v.raca : v.porte}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-success">{formatarReais(v.preco)}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => remover(v)} disabled={isPending} aria-label="Remover">
                      <IconTrash style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className={`btn btn-sm ${tipo === 'porte' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('porte')}>
              Por porte
            </button>
            <button type="button" className={`btn btn-sm ${tipo === 'raca' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('raca')}>
              Por raça
            </button>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Espécie</label>
              <select className="form-select" value={especie} onChange={e => setEspecie(e.target.value as 'Cão' | 'Gato')}>
                <option value="Cão">Cão</option>
                <option value="Gato">Gato</option>
              </select>
            </div>
            {tipo === 'porte' ? (
              <div className="form-group">
                <label className="form-label">Porte</label>
                <select className="form-select" value={porte} onChange={e => setPorte(e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Pequeno">Pequeno</option>
                  <option value="Médio">Médio</option>
                  <option value="Grande">Grande</option>
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Raça</label>
                <input className="form-input" value={raca} onChange={e => setRaca(e.target.value)} placeholder="Ex: Poodle" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Preço (R$)</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={preco}
                onChange={e => setPreco(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={adicionar} disabled={isPending} style={{ alignSelf: 'flex-start' }}>
            <IconPlus style={{ width: 14, height: 14 }} /> {isPending ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      )}
    </div>
  )
}
