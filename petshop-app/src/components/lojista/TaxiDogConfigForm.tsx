'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { salvarTaxiDogConfigAction } from '@/lib/actions-taxidog'
import { ROTULO_MODO_COBRANCA, formatarReais, type ModoCobrancaTaxiDog } from '@/lib/taxidog'
import { IconAlert, IconCar, IconCheck, IconMapPin, IconPlus, IconTrash, IconUsers } from '@/components/icons'

export interface TaxiDogConfigInicial {
  ativo: boolean
  disponivel_online: boolean
  modo_cobranca: ModoCobrancaTaxiDog
  valor_buscar: number
  valor_entregar: number
  valor_buscar_entregar: number
  distancia_max_km: number | null
  valor_minimo: number | null
  origem_endereco: string | null
  tem_origem: boolean
  faixas: { km_ate: number; valor_trecho: number; valor_ida_volta: number | null }[]
  regioes: { bairro: string | null; cidade: string; uf: string | null; valor_trecho: number; valor_ida_volta: number | null; ativo: boolean }[]
}

// Números ficam como texto enquanto o lojista digita ("15," no meio da
// digitação não pode virar NaN e apagar o campo); só viram número no salvar.
interface FaixaForm { km_ate: string; valor_trecho: string; valor_ida_volta: string }
interface RegiaoForm { bairro: string; cidade: string; uf: string; valor_trecho: string; valor_ida_volta: string; ativo: boolean }

const MODOS: { valor: ModoCobrancaTaxiDog; titulo: string; descricao: string }[] = [
  { valor: 'fixo', titulo: 'Valor fixo', descricao: 'O mesmo preço para qualquer endereço.' },
  { valor: 'distancia', titulo: 'Por distância', descricao: 'O preço muda conforme a distância até a loja.' },
  { valor: 'regiao', titulo: 'Por região', descricao: 'Um preço para cada bairro ou cidade que você atende.' },
  { valor: 'personalizado', titulo: 'Região + distância', descricao: 'Usa o preço do bairro/cidade cadastrado; nos outros endereços, a distância.' },
]

const txt = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const num = (s: string) => Number(s.replace(',', '.').trim())
const numOuNull = (s: string) => (s.trim() === '' ? null : num(s))
const valido = (s: string) => s.trim() !== '' && Number.isFinite(num(s)) && num(s) >= 0

export default function TaxiDogConfigForm({ inicial, taxidogs }: { inicial: TaxiDogConfigInicial; taxidogs: string[] }) {
  const [ativo, setAtivo] = useState(inicial.ativo)
  const [online, setOnline] = useState(inicial.disponivel_online)
  const [modo, setModo] = useState<ModoCobrancaTaxiDog>(inicial.modo_cobranca)
  const [valorBuscar, setValorBuscar] = useState(txt(inicial.valor_buscar))
  const [valorEntregar, setValorEntregar] = useState(txt(inicial.valor_entregar))
  const [valorAmbos, setValorAmbos] = useState(txt(inicial.valor_buscar_entregar))
  const [distMax, setDistMax] = useState(txt(inicial.distancia_max_km))
  const [valorMinimo, setValorMinimo] = useState(txt(inicial.valor_minimo))
  const [faixas, setFaixas] = useState<FaixaForm[]>(
    inicial.faixas.map(f => ({ km_ate: txt(f.km_ate), valor_trecho: txt(f.valor_trecho), valor_ida_volta: txt(f.valor_ida_volta) }))
  )
  const [regioes, setRegioes] = useState<RegiaoForm[]>(
    inicial.regioes.map(r => ({
      bairro: r.bairro ?? '', cidade: r.cidade, uf: r.uf ?? '',
      valor_trecho: txt(r.valor_trecho), valor_ida_volta: txt(r.valor_ida_volta), ativo: r.ativo,
    }))
  )
  const [origemEndereco, setOrigemEndereco] = useState(inicial.origem_endereco)
  const [temOrigem, setTemOrigem] = useState(inicial.tem_origem)

  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [isPending, startTransition] = useTransition()

  const usaDistancia = modo === 'distancia' || modo === 'personalizado'
  const usaRegiao = modo === 'regiao' || modo === 'personalizado'

  function marcarAlterado() {
    setSalvo(false)
  }

  function adicionarFaixa() {
    const ultima = faixas[faixas.length - 1]
    const km = ultima && valido(ultima.km_ate) ? num(ultima.km_ate) + 5 : 3
    const valor = ultima && valido(ultima.valor_trecho) ? num(ultima.valor_trecho) + 5 : 10
    setFaixas(prev => [...prev, { km_ate: txt(km), valor_trecho: txt(valor), valor_ida_volta: '' }])
    marcarAlterado()
  }

  function atualizarFaixa(i: number, campo: keyof FaixaForm, valor: string) {
    setFaixas(prev => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)))
    marcarAlterado()
  }

  function adicionarRegiao() {
    const ultima = regioes[regioes.length - 1]
    setRegioes(prev => [...prev, { bairro: '', cidade: ultima?.cidade ?? '', uf: ultima?.uf ?? '', valor_trecho: '', valor_ida_volta: '', ativo: true }])
    marcarAlterado()
  }

  function atualizarRegiao<K extends keyof RegiaoForm>(i: number, campo: K, valor: RegiaoForm[K]) {
    setRegioes(prev => prev.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)))
    marcarAlterado()
  }

  // Checagem amigável antes de mandar pro servidor (que valida de novo).
  function validarLocalmente(): string | null {
    if (modo === 'fixo' && (!valido(valorBuscar) || !valido(valorEntregar) || !valido(valorAmbos))) {
      return 'Preencha os três valores fixos (use 0 se não cobrar).'
    }
    if (usaDistancia) {
      if (ativo && faixas.length === 0) return 'Adicione ao menos uma faixa de distância.'
      if (faixas.some(f => !valido(f.km_ate) || num(f.km_ate) <= 0 || !valido(f.valor_trecho))) {
        return 'Preencha a distância e o valor de todas as faixas.'
      }
      if (faixas.some(f => f.valor_ida_volta.trim() !== '' && !valido(f.valor_ida_volta))) return 'Confira o valor de ida e volta das faixas.'
      if (distMax.trim() !== '' && (!valido(distMax) || num(distMax) <= 0)) return 'Confira a distância máxima.'
    }
    if (usaRegiao) {
      if (ativo && modo === 'regiao' && regioes.length === 0) return 'Adicione ao menos uma região atendida.'
      if (regioes.some(r => r.cidade.trim().length < 2 || !valido(r.valor_trecho))) {
        return 'Toda região precisa de cidade e valor.'
      }
      if (regioes.some(r => r.valor_ida_volta.trim() !== '' && !valido(r.valor_ida_volta))) return 'Confira o valor de ida e volta das regiões.'
    }
    if (valorMinimo.trim() !== '' && !valido(valorMinimo)) return 'Confira o valor mínimo.'
    return null
  }

  function salvar() {
    setErro(null)
    setAviso(null)
    const problema = validarLocalmente()
    if (problema) {
      setErro(problema)
      return
    }

    const payload = {
      ativo,
      disponivel_online: online,
      modo_cobranca: modo,
      valor_buscar: valido(valorBuscar) ? num(valorBuscar) : 0,
      valor_entregar: valido(valorEntregar) ? num(valorEntregar) : 0,
      valor_buscar_entregar: valido(valorAmbos) ? num(valorAmbos) : 0,
      distancia_max_km: numOuNull(distMax),
      valor_minimo: numOuNull(valorMinimo),
      // Faixas e regiões vão sempre, mesmo fora do modo atual — trocar de
      // modo e voltar não pode apagar o que o lojista já tinha cadastrado.
      faixas: [...faixas]
        .filter(f => valido(f.km_ate) && valido(f.valor_trecho))
        .sort((a, b) => num(a.km_ate) - num(b.km_ate))
        .map(f => ({ km_ate: num(f.km_ate), valor_trecho: num(f.valor_trecho), valor_ida_volta: numOuNull(f.valor_ida_volta) })),
      regioes: regioes
        .filter(r => r.cidade.trim().length >= 2 && valido(r.valor_trecho))
        .map(r => ({
          bairro: r.bairro.trim() || null,
          cidade: r.cidade.trim(),
          uf: r.uf.trim().toUpperCase() || null,
          valor_trecho: num(r.valor_trecho),
          valor_ida_volta: numOuNull(r.valor_ida_volta),
          ativo: r.ativo,
        })),
    }

    startTransition(async () => {
      const result = await salvarTaxiDogConfigAction(payload)
      if (result.error) {
        setErro(result.error)
        return
      }
      setSalvo(true)
      setAviso(result.aviso ?? null)
      if (result.origemEndereco !== undefined) {
        setOrigemEndereco(result.origemEndereco)
        setTemOrigem(!!result.origemEndereco)
      }
    })
  }

  // ---------- Resumo em linguagem simples (topo da página) ----------
  const resumoCobranca = (() => {
    switch (modo) {
      case 'fixo':
        return `Buscar ${formatarReais(num(valorBuscar) || 0)} · Entregar ${formatarReais(num(valorEntregar) || 0)} · Buscar e entregar ${formatarReais(num(valorAmbos) || 0)}`
      case 'distancia':
        return `${faixas.length} ${faixas.length === 1 ? 'faixa' : 'faixas'} de distância${distMax ? ` · atende até ${distMax} km` : ''}`
      case 'regiao':
        return `${regioes.filter(r => r.ativo).length} ${regioes.filter(r => r.ativo).length === 1 ? 'região atendida' : 'regiões atendidas'}`
      case 'personalizado':
        return `${regioes.filter(r => r.ativo).length} regiões + ${faixas.length} faixas de distância${distMax ? ` (até ${distMax} km)` : ''}`
    }
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 820 }}>
      {/* Visão geral */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div className="flex items-center gap-3">
          <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconCar style={{ width: 18, height: 18 }} /></span>
          <div style={{ flex: 1 }}>
            <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Resumo do TaxiDog</div>
            <div className="text-sm text-muted">O que o cliente vai encontrar hoje</div>
          </div>
          <span className={`badge ${ativo ? 'badge-ativo' : 'badge-inativo'}`}>{ativo ? 'Ativado' : 'Desativado'}</span>
        </div>
        <div className="dash-detail-row"><span>No agendamento online</span><span>{ativo && online ? 'Disponível' : 'Não aparece'}</span></div>
        <div className="dash-detail-row"><span>Como cobra</span><span>{ROTULO_MODO_COBRANCA[modo]} — {resumoCobranca}</span></div>
        {valorMinimo.trim() !== '' && valido(valorMinimo) && (
          <div className="dash-detail-row"><span>Valor mínimo</span><span>{formatarReais(num(valorMinimo))}</span></div>
        )}
        <div className="dash-detail-row">
          <span>Quem pode ser TaxiDog</span>
          <span>
            {taxidogs.length > 0 ? taxidogs.join(', ') : 'Ninguém ainda'}{' · '}
            <Link href="/lojista/equipe" className="text-accent">Gerenciar em Equipe</Link>
          </span>
        </div>
      </div>

      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}

      {/* Ativação */}
      <div className="card">
        <div className="config-grupo-titulo" style={{ padding: 0, marginBottom: 'var(--space-4)' }}>Ativação</div>
        <LinhaSwitch
          titulo="Oferecer TaxiDog"
          descricao="Liga o serviço de busca e entrega da loja e a tela de corridas."
          ligado={ativo}
          onChange={v => { setAtivo(v); marcarAlterado() }}
        />
        <LinhaSwitch
          titulo="Disponível no agendamento online"
          descricao="O cliente pode pedir o TaxiDog sozinho, pelo link da loja ou pela conta dele."
          ligado={online}
          desativado={!ativo}
          onChange={v => { setOnline(v); marcarAlterado() }}
        />
      </div>

      {/* Forma de cobrança */}
      <div className="card">
        <div className="config-grupo-titulo" style={{ padding: 0, marginBottom: 'var(--space-4)' }}>Forma de cobrança</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          {MODOS.map(m => {
            const sel = modo === m.valor
            return (
              <button
                key={m.valor}
                type="button"
                onClick={() => { setModo(m.valor); marcarAlterado() }}
                style={{
                  textAlign: 'left', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer', font: 'inherit', color: 'inherit',
                  border: `1px solid ${sel ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                  background: sel ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{m.titulo}</span>
                  {sel && <IconCheck style={{ width: 15, height: 15, color: 'var(--primary-400)' }} />}
                </div>
                <div className="text-xs text-muted">{m.descricao}</div>
              </button>
            )
          })}
        </div>

        {modo === 'fixo' && (
          <div className="form-grid-3">
            <CampoValor rotulo="Somente buscar" valor={valorBuscar} onChange={v => { setValorBuscar(v); marcarAlterado() }} />
            <CampoValor rotulo="Somente entregar" valor={valorEntregar} onChange={v => { setValorEntregar(v); marcarAlterado() }} />
            <CampoValor rotulo="Buscar e entregar" valor={valorAmbos} onChange={v => { setValorAmbos(v); marcarAlterado() }} />
          </div>
        )}

        {usaRegiao && (
          <div style={{ marginBottom: usaDistancia ? 'var(--space-6)' : 0 }}>
            <div className="font-semibold" style={{ color: 'var(--gray-100)', marginBottom: 4 }}>Regiões atendidas</div>
            <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
              Deixe o bairro vazio para cobrar a cidade inteira. Um bairro cadastrado vale mais que a cidade dele.
              {modo === 'personalizado' && ' Endereços fora dessas regiões usam as faixas de distância abaixo.'}
            </p>
            {regioes.length === 0 && <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>Nenhuma região cadastrada.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {regioes.length > 0 && (
                <div className="text-xs text-muted" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 60px 110px 110px 44px 36px', gap: 'var(--space-2)' }}>
                  <span>Bairro (opcional)</span><span>Cidade</span><span>UF</span><span>Buscar ou entregar</span><span>Buscar e entregar</span><span>Ativa</span><span />
                </div>
              )}
              {regioes.map((r, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 60px 110px 110px 44px 36px', gap: 'var(--space-2)', alignItems: 'center', opacity: r.ativo ? 1 : 0.6 }}>
                  <input className="form-input" placeholder="Centro" value={r.bairro} onChange={e => atualizarRegiao(i, 'bairro', e.target.value)} maxLength={80} />
                  <input className="form-input" placeholder="Mauá" value={r.cidade} onChange={e => atualizarRegiao(i, 'cidade', e.target.value)} maxLength={80} />
                  <input className="form-input" placeholder="SP" value={r.uf} onChange={e => atualizarRegiao(i, 'uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
                  <InputMoeda valor={r.valor_trecho} onChange={v => atualizarRegiao(i, 'valor_trecho', v)} />
                  <InputMoeda valor={r.valor_ida_volta} placeholder={valido(r.valor_trecho) ? `${txt(num(r.valor_trecho) * 2)}` : ''} onChange={v => atualizarRegiao(i, 'valor_ida_volta', v)} />
                  <button
                    type="button"
                    className={`switch ${r.ativo ? 'switch-on' : ''}`}
                    onClick={() => atualizarRegiao(i, 'ativo', !r.ativo)}
                    role="switch"
                    aria-checked={r.ativo}
                    title={r.ativo ? 'Desativar região' : 'Ativar região'}
                  >
                    <span className="switch-thumb" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRegioes(prev => prev.filter((_, j) => j !== i)); marcarAlterado() }} aria-label="Remover região">
                    <IconTrash style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-3)' }} onClick={adicionarRegiao}>
              <IconPlus style={{ width: 14, height: 14 }} /> Adicionar região
            </button>
          </div>
        )}

        {usaDistancia && (
          <div>
            <div className="font-semibold" style={{ color: 'var(--gray-100)', marginBottom: 4 }}>Faixas de distância</div>
            <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
              Cada faixa vai até a distância informada, começando onde a anterior termina. Deixe &quot;buscar e entregar&quot; vazio para cobrar o dobro do trecho.
            </p>
            {faixas.length === 0 && <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>Nenhuma faixa cadastrada.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {faixas.length > 0 && (
                <div className="text-xs text-muted" style={{ display: 'grid', gridTemplateColumns: '90px 110px 130px 130px 36px', gap: 'var(--space-2)' }}>
                  <span>De</span><span>Até (km)</span><span>Buscar ou entregar</span><span>Buscar e entregar</span><span />
                </div>
              )}
              {faixas.map((f, i) => {
                const anterior = i === 0 ? '0' : faixas[i - 1].km_ate || '?'
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 110px 130px 130px 36px', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <span className="text-sm text-muted">{anterior} km →</span>
                    <input className="form-input" inputMode="decimal" value={f.km_ate} onChange={e => atualizarFaixa(i, 'km_ate', e.target.value)} />
                    <InputMoeda valor={f.valor_trecho} onChange={v => atualizarFaixa(i, 'valor_trecho', v)} />
                    <InputMoeda valor={f.valor_ida_volta} placeholder={valido(f.valor_trecho) ? `${txt(num(f.valor_trecho) * 2)}` : ''} onChange={v => atualizarFaixa(i, 'valor_ida_volta', v)} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFaixas(prev => prev.filter((_, j) => j !== i)); marcarAlterado() }} aria-label="Remover faixa">
                      <IconTrash style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                )
              })}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-3)' }} onClick={adicionarFaixa}>
              <IconPlus style={{ width: 14, height: 14 }} /> Adicionar faixa
            </button>

            <div className="form-group" style={{ marginTop: 'var(--space-5)', maxWidth: 260 }}>
              <label className="form-label">Distância máxima atendida (km)</label>
              <input className="form-input" inputMode="decimal" placeholder="Sem limite" value={distMax} onChange={e => { setDistMax(e.target.value); marcarAlterado() }} />
              <span className="form-hint">Endereços mais longe que isso veem que o TaxiDog não atende.</span>
            </div>

            <div className="flex items-center gap-2 text-sm" style={{ color: temOrigem ? 'var(--gray-300)' : 'var(--warning-400)' }}>
              <IconMapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
              {temOrigem
                ? <span>Distância medida a partir de: {origemEndereco}</span>
                : <span>A localização da loja é calculada ao salvar, a partir do endereço em <Link href="/lojista/perfil" className="text-accent">Dados da loja</Link>.</span>}
            </div>
          </div>
        )}
      </div>

      {/* Valor mínimo */}
      <div className="card">
        <div className="config-grupo-titulo" style={{ padding: 0, marginBottom: 'var(--space-3)' }}>Valor mínimo (opcional)</div>
        <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
          Nenhuma corrida sai por menos que isso, qualquer que seja a regra. Deixe vazio para não usar.
        </p>
        <div style={{ maxWidth: 200 }}>
          <InputMoeda valor={valorMinimo} placeholder="Sem mínimo" onChange={v => { setValorMinimo(v); marcarAlterado() }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {aviso && (
          <div className="alert alert-warning">
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{aviso}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          {salvo && !isPending && (
            <span className="text-sm text-success flex items-center gap-1"><IconCheck style={{ width: 14, height: 14 }} /> Configuração salva</span>
          )}
          <button type="button" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending} onClick={salvar}>
            {isPending ? 'Salvando...' : 'Salvar configuração'}
          </button>
        </div>
        {taxidogs.length === 0 && ativo && (
          <p className="text-xs text-muted flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>
            <IconUsers style={{ width: 12, height: 12 }} />
            Lembre de habilitar pelo menos um funcionário como TaxiDog em Equipe para poder atribuir as corridas.
          </p>
        )}
      </div>
    </div>
  )
}

function LinhaSwitch({ titulo, descricao, ligado, desativado, onChange }: {
  titulo: string
  descricao: string
  ligado: boolean
  desativado?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: 'var(--space-3) 0', opacity: desativado ? 0.5 : 1 }}>
      <div>
        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{titulo}</div>
        <div className="text-sm text-muted">{descricao}</div>
      </div>
      <button
        type="button"
        className={`switch ${ligado ? 'switch-on' : ''}`}
        onClick={() => !desativado && onChange(!ligado)}
        disabled={desativado}
        role="switch"
        aria-checked={ligado}
        style={{ flexShrink: 0 }}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}

function InputMoeda({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <span className="text-sm text-muted" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>R$</span>
      <input
        className="form-input"
        style={{ paddingLeft: 34 }}
        inputMode="decimal"
        placeholder={placeholder ?? '0,00'}
        value={valor}
        onChange={e => onChange(e.target.value.replace(/[^\d,.]/g, ''))}
      />
    </div>
  )
}

function CampoValor({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{rotulo}</label>
      <InputMoeda valor={valor} onChange={onChange} />
    </div>
  )
}
