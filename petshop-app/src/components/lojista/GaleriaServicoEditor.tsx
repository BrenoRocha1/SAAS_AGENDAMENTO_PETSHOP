'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adicionarFotoServicoAction, editarFotoServicoAction, removerFotoServicoAction, reordenarFotosServicoAction } from '@/lib/actions-galeria'
import { otimizarImagemParaUpload } from '@/lib/imagem'
import {
  COLUNAS_FOTO_SERVICO, GALERIA_DESCRICAO_MAX, GALERIA_LADO_GRANDE, GALERIA_LADO_MINI, GALERIA_MAX_FOTOS, GALERIA_NOME_MAX,
  problemaDaFoto, type FotoServico,
} from '@/lib/galeria'
import { IconAlert, IconChevronLeft, IconChevronRight, IconEye, IconImage, IconPlus, IconTrash } from '@/components/icons'
import { GaleriaAmpliada } from '@/components/servicos/GaleriaServico'
import './galeria-servico-editor.css'

// Foto escolhida que ainda não subiu: vai junto ao "Salvar serviço".
export interface FotoPendente {
  key: string
  arquivo: File
  preview: string
  nome: string
  descricao: string
}

const TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const MAX_ORIGINAL = 15 * 1024 * 1024 // antes de reduzir no navegador

// Sobe as fotos pendentes de um serviço (depois de criar ou ao salvar).
// Reduz cada uma no navegador (grande + miniatura) antes de enviar.
// Para na primeira falha: devolve quantas subiram e o erro (ou null).
export async function enviarFotosPendentes(idServico: string, pendentes: FotoPendente[]): Promise<{ enviadas: number; erro: string | null }> {
  for (const [enviadas, p] of pendentes.entries()) {
    try {
      const [grande, mini] = await Promise.all([
        otimizarImagemParaUpload(p.arquivo, GALERIA_LADO_GRANDE, 0.85),
        otimizarImagemParaUpload(p.arquivo, GALERIA_LADO_MINI, 0.8),
      ])
      const fd = new FormData()
      fd.set('foto', new File([grande.blob], `foto.${grande.extensao}`, { type: grande.blob.type }))
      fd.set('mini', new File([mini.blob], `mini.${mini.extensao}`, { type: mini.blob.type }))
      fd.set('nome', p.nome.trim())
      fd.set('descricao', p.descricao.trim())
      const r = await adicionarFotoServicoAction(idServico, fd)
      if ('error' in r) return { enviadas, erro: `“${p.nome.trim() || 'Foto'}”: ${r.error}` }
      URL.revokeObjectURL(p.preview)
    } catch {
      return { enviadas, erro: `Não foi possível preparar a foto “${p.nome.trim() || p.arquivo.name}”. Tente outra imagem.` }
    }
  }
  return { enviadas: pendentes.length, erro: null }
}

// O que falta nas pendentes antes de salvar o serviço (ou null).
export function problemaDasPendentes(pendentes: FotoPendente[]): string | null {
  for (const p of pendentes) {
    const problema = problemaDaFoto(p.nome, p.descricao)
    if (problema) return `Fotos de referência: ${problema}`
  }
  return null
}

// "Fotos de referência" no cadastro do serviço. Opcional: serviço sem
// foto continua igual. Fotos já salvas mudam na hora (nome, ordem,
// remover); as novas ficam pendentes até o "Salvar serviço".
export default function GaleriaServicoEditor({ idServico, nomeServico, pendentes, onPendentesChange, desativado }: {
  idServico: string | null
  nomeServico: string
  pendentes: FotoPendente[]
  onPendentesChange: (p: FotoPendente[]) => void
  desativado?: boolean
}) {
  const [fotos, setFotos] = useState<FotoServico[]>([])
  const [carregando, setCarregando] = useState(!!idServico)
  const [semMigration, setSemMigration] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Record<string, { nome: string; descricao: string }>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmarRemover, setConfirmarRemover] = useState<string | null>(null)
  const [vendo, setVendo] = useState(false)

  useEffect(() => {
    if (!idServico) return
    let vivo = true
    createClient().from('servico_foto').select(COLUNAS_FOTO_SERVICO).eq('id_servico', idServico).order('ordem')
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setSemMigration(true)
        else setFotos((data ?? []) as FotoServico[])
        setCarregando(false)
      })
    return () => { vivo = false }
  }, [idServico])

  // Libera as prévias da memória quando saem da tela.
  useEffect(() => () => { pendentes.forEach(p => URL.revokeObjectURL(p.preview)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = fotos.length + pendentes.length
  const vagas = GALERIA_MAX_FOTOS - total

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    setErro(null)
    const recusadas: string[] = []
    const novas: FotoPendente[] = []
    for (const arquivo of arquivos) {
      if (!TIPOS.includes(arquivo.type)) { recusadas.push(`${arquivo.name} (use JPG, PNG ou WEBP)`); continue }
      if (arquivo.size > MAX_ORIGINAL) { recusadas.push(`${arquivo.name} (maior que 15 MB)`); continue }
      if (novas.length >= vagas) { recusadas.push(`${arquivo.name} (limite de ${GALERIA_MAX_FOTOS} fotos)`); continue }
      novas.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        arquivo,
        preview: URL.createObjectURL(arquivo),
        nome: '',
        descricao: '',
      })
    }
    if (novas.length) onPendentesChange([...pendentes, ...novas])
    if (recusadas.length) setErro(`Não foram adicionadas: ${recusadas.join('; ')}.`)
  }

  function mudarPendente(key: string, parte: Partial<FotoPendente>) {
    onPendentesChange(pendentes.map(p => (p.key === key ? { ...p, ...parte } : p)))
  }
  function tirarPendente(key: string) {
    const p = pendentes.find(x => x.key === key)
    if (p) URL.revokeObjectURL(p.preview)
    onPendentesChange(pendentes.filter(x => x.key !== key))
  }

  const valor = (f: FotoServico) => edicao[f.id_foto] ?? { nome: f.nome, descricao: f.descricao ?? '' }
  const mudou = (f: FotoServico) => {
    const v = edicao[f.id_foto]
    return !!v && (v.nome !== f.nome || v.descricao !== (f.descricao ?? ''))
  }

  async function salvarTexto(f: FotoServico) {
    const v = valor(f)
    const problema = problemaDaFoto(v.nome, v.descricao)
    if (problema) return setErro(problema)
    setErro(null)
    setOcupado(f.id_foto)
    const r = await editarFotoServicoAction(f.id_foto, v)
    setOcupado(null)
    if ('error' in r) return setErro(r.error)
    setFotos(lista => lista.map(x => (x.id_foto === f.id_foto ? r.foto : x)))
    setEdicao(({ [f.id_foto]: _, ...resto }) => resto)
  }

  async function mover(indice: number, passo: number) {
    const alvo = indice + passo
    if (alvo < 0 || alvo >= fotos.length) return
    const anterior = fotos
    const nova = [...fotos]
    ;[nova[indice], nova[alvo]] = [nova[alvo], nova[indice]]
    setFotos(nova)
    setErro(null)
    setOcupado('ordem')
    const r = await reordenarFotosServicoAction(idServico!, nova.map(f => f.id_foto))
    setOcupado(null)
    if ('error' in r) { setFotos(anterior); setErro(r.error) }
  }

  async function remover(f: FotoServico) {
    setErro(null)
    setOcupado(f.id_foto)
    const r = await removerFotoServicoAction(f.id_foto)
    setOcupado(null)
    setConfirmarRemover(null)
    if ('error' in r) return setErro(r.error)
    setFotos(lista => lista.filter(x => x.id_foto !== f.id_foto))
  }

  // O que o cliente vai ver: as salvas e as novas, nessa ordem.
  const previa: FotoServico[] = useMemo(() => [
    ...fotos.map(f => ({ ...f, ...valor(f), descricao: valor(f).descricao || null })),
    ...pendentes.map((p, i) => ({
      id_foto: p.key, id_servico: idServico ?? '', nome: p.nome.trim() || `Modelo ${fotos.length + i + 1}`,
      descricao: p.descricao.trim() || null, url: p.preview, url_mini: p.preview, ordem: fotos.length + i,
    })),
  ], [fotos, pendentes, edicao, idServico]) // eslint-disable-line react-hooks/exhaustive-deps

  if (semMigration) {
    return (
      <div className="gse">
        <div className="gse-cabeca"><span className="gse-titulo">Fotos de referência</span></div>
        <div className="alert alert-warning"><IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>Execute a migration 101_galeria_servico.sql para usar a galeria de fotos.</span></div>
      </div>
    )
  }

  return (
    <div className="gse">
      <div className="gse-cabeca">
        <span className="gse-titulo">Fotos de referência</span>
        <span className="gse-opcional">Opcional</span>
        <span className="gse-conta">{total}/{GALERIA_MAX_FOTOS}</span>
      </div>
      <p className="gse-sub">
        Modelos do serviço, como tipos de tosa ou acabamentos. O cliente vê na página da loja e no agendamento online, sem precisar abrir para agendar.
      </p>

      {erro && <div className="alert alert-error"><IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span></div>}
      {carregando && <p className="gse-sub">Carregando fotos…</p>}

      {(fotos.length > 0 || pendentes.length > 0) && (
        <div className="gse-lista">
          {fotos.map((f, i) => {
            const v = valor(f)
            const removendo = confirmarRemover === f.id_foto
            return (
              <div key={f.id_foto} className="gse-item">
                <div className="gse-foto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url_mini} alt={f.nome} loading="lazy" />
                  <span className="gse-pos">{i + 1}</span>
                </div>
                <div className="gse-campos">
                  <input className="form-input" value={v.nome} maxLength={GALERIA_NOME_MAX} placeholder="Nome do modelo (ex.: Tosa bebê)" aria-label="Nome do modelo"
                    disabled={desativado} onChange={e => setEdicao(m => ({ ...m, [f.id_foto]: { ...v, nome: e.target.value } }))} />
                  <textarea className="form-input gse-desc" value={v.descricao} maxLength={GALERIA_DESCRICAO_MAX} rows={2} placeholder="Descrição (opcional)" aria-label="Descrição do modelo"
                    disabled={desativado} onChange={e => setEdicao(m => ({ ...m, [f.id_foto]: { ...v, descricao: e.target.value } }))} />
                  <div className="gse-acoes">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => mover(i, -1)} disabled={i === 0 || !!ocupado || desativado} aria-label="Mover para antes">
                      <IconChevronLeft style={{ width: 14, height: 14 }} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1 || !!ocupado || desativado} aria-label="Mover para depois">
                      <IconChevronRight style={{ width: 14, height: 14 }} />
                    </button>
                    {mudou(f) && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => salvarTexto(f)} disabled={!!ocupado || desativado}>
                        {ocupado === f.id_foto ? 'Salvando…' : 'Salvar'}
                      </button>
                    )}
                    <span className="gse-espaco" />
                    {removendo ? (
                      <span className="gse-confirma">
                        Remover?
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => remover(f)} disabled={!!ocupado}>{ocupado === f.id_foto ? 'Removendo…' : 'Sim'}</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmarRemover(null)} disabled={!!ocupado}>Não</button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm gse-remover" onClick={() => setConfirmarRemover(f.id_foto)} disabled={!!ocupado || desativado}>
                        <IconTrash style={{ width: 13, height: 13 }} /> Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {pendentes.map(p => (
            <div key={p.key} className="gse-item is-nova">
              <div className="gse-foto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" />
                <span className="gse-selo">Nova</span>
              </div>
              <div className="gse-campos">
                <input className="form-input" value={p.nome} maxLength={GALERIA_NOME_MAX} placeholder="Nome do modelo (ex.: Tosa bebê)" aria-label="Nome do modelo"
                  disabled={desativado} onChange={e => mudarPendente(p.key, { nome: e.target.value })} />
                <textarea className="form-input gse-desc" value={p.descricao} maxLength={GALERIA_DESCRICAO_MAX} rows={2} placeholder="Descrição (opcional)" aria-label="Descrição do modelo"
                  disabled={desativado} onChange={e => mudarPendente(p.key, { descricao: e.target.value })} />
                <div className="gse-acoes">
                  <span className="gse-dica">Será enviada ao salvar o serviço.</span>
                  <span className="gse-espaco" />
                  <button type="button" className="btn btn-ghost btn-sm gse-remover" onClick={() => tirarPendente(p.key)} disabled={desativado}>
                    <IconTrash style={{ width: 13, height: 13 }} /> Tirar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="gse-rodape">
        {vagas > 0 && (
          <label className={`btn btn-secondary btn-sm gse-adicionar ${desativado ? 'is-desativado' : ''}`}>
            <IconPlus style={{ width: 14, height: 14 }} /> {total === 0 ? 'Adicionar fotos' : 'Adicionar mais'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={escolher} disabled={desativado} />
          </label>
        )}
        {previa.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVendo(true)}>
            <IconEye style={{ width: 14, height: 14 }} /> Ver como o cliente vê
          </button>
        )}
        {total === 0 && !carregando && <span className="gse-dica"><IconImage style={{ width: 13, height: 13 }} /> JPG, PNG ou WEBP. As fotos são reduzidas antes de enviar.</span>}
      </div>

      {vendo && <GaleriaAmpliada fotos={previa} inicial={0} titulo={nomeServico || 'Serviço'} onFechar={() => setVendo(false)} />}
    </div>
  )
}
