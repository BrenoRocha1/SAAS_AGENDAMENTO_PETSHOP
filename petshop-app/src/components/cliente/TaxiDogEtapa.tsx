'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cotarTaxiDogAction } from '@/lib/actions-taxidog'
import {
  DESCRICAO_MODALIDADE,
  ENDERECO_VAZIO,
  MODALIDADES,
  ROTULO_MODALIDADE,
  enderecoEmUmaLinha,
  formatarCep,
  formatarKm,
  formatarReais,
  type CotacaoTaxiDog,
  type EnderecoTaxiDog,
  type EscolhaTaxiDog,
  type ModalidadeTaxiDog,
} from '@/lib/taxidog'
import { IconAlert, IconCar, IconCheck, IconMapPin, IconStore } from '@/components/icons'

// ============================================================
// Transporte do pet (TaxiDog) — campos compartilhados
// ============================================================
// TaxiDogCampos é usado nos dois lados:
//   • cliente: etapa "Como seu pet irá até a loja?" (TaxiDogEtapa, abaixo),
//     nos fluxos de agendamento do link público e da conta do cliente;
//   • loja: bloco "Transporte" do modal de novo agendamento (migration 047)
//     e a troca de transporte de um agendamento já feito (migration 052).
// O estado mora em quem usa (pra não se perder ao voltar/avançar etapas);
// estes componentes só editam esse estado. O preço exibido vem SEMPRE da
// cotação do banco (fn_cotar_taxidog) — e é recalculado de novo no
// momento de agendar, nunca aceito do navegador.

export interface EstadoTransporte {
  opcao: 'levar' | 'taxidog' | null
  modalidade: ModalidadeTaxiDog
  endereco: EnderecoTaxiDog
  cotacoes: Record<ModalidadeTaxiDog, CotacaoTaxiDog> | null
  precisao: 'endereco' | 'bairro' | 'cidade' | null
  // Quem faz a corrida — com as rotas (migration 052) a loja escolhe o
  // TaxiDog na rota, então fica sempre null.
  idTaxidog: string | null
  nomeTaxidog: string | null
}

export const ESTADO_TRANSPORTE_INICIAL: EstadoTransporte = {
  opcao: null,
  modalidade: 'buscar_entregar',
  endereco: ENDERECO_VAZIO,
  cotacoes: null,
  precisao: null,
  idTaxidog: null,
  nomeTaxidog: null,
}

// O que efetivamente vai pro agendamento: null = o pet vai sem TaxiDog.
export function escolhaDoTransporte(estado: EstadoTransporte): EscolhaTaxiDog | null {
  if (estado.opcao !== 'taxidog') return null
  const cotacao = estado.cotacoes?.[estado.modalidade]
  if (!cotacao?.disponivel) return null
  return {
    modalidade: estado.modalidade,
    endereco: estado.endereco,
    cotacao,
    idTaxidog: estado.idTaxidog,
    nomeTaxidog: estado.nomeTaxidog,
  }
}

export function transportePronto(estado: EstadoTransporte): boolean {
  return estado.opcao === 'levar' || escolhaDoTransporte(estado) !== null
}

// Campo JSON `taxidog` que as Server Actions de agendamento esperam.
export function taxiDogParaFormulario(escolha: EscolhaTaxiDog): string {
  return JSON.stringify({ modalidade: escolha.modalidade, endereco: escolha.endereco, id_funcionario: escolha.idTaxidog })
}

type Cotar = (endereco: EnderecoTaxiDog) => Promise<{
  error?: string
  cotacoes?: Record<ModalidadeTaxiDog, CotacaoTaxiDog>
  precisao?: 'endereco' | 'bairro' | 'cidade' | null
}>

function enderecoCompleto(e: EnderecoTaxiDog): boolean {
  return (
    e.cep.replace(/\D/g, '').length === 8 &&
    e.logradouro.trim().length >= 2 &&
    e.numero.trim().length >= 1 &&
    e.bairro.trim().length >= 2 &&
    e.cidade.trim().length >= 2 &&
    /^[A-Za-z]{2}$/.test(e.uf.trim())
  )
}

// Descrições do lado da loja (as de DESCRICAO_MODALIDADE falam com o cliente).
const DESCRICAO_MODALIDADE_LOJA: Record<ModalidadeTaxiDog, string> = {
  buscar: 'Busca o pet no endereço do cliente. Ele retira na loja depois.',
  entregar: 'Entrega o pet no endereço do cliente depois do serviço.',
  buscar_entregar: 'Busca o pet e leva de volta quando o serviço terminar.',
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function estiloOpcao(selecionado: boolean): React.CSSProperties {
  return {
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${selecionado ? 'var(--primary-500)' : 'var(--gray-700)'}`,
    background: selecionado ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    font: 'inherit',
    color: 'inherit',
  }
}

export function TaxiDogCampos({ valor, onChange, cotar, modoLoja = false, idCliente, modalidades = MODALIDADES, rotuloLevar }: {
  valor: EstadoTransporte
  onChange: Dispatch<SetStateAction<EstadoTransporte>>
  cotar: Cotar
  // Agendamento feito pela loja: textos na 3ª pessoa e o último endereço
  // vem do cliente escolhido (não de quem está logado).
  modoLoja?: boolean
  idCliente?: string
  // Tipos oferecidos (com o pet já na loja, só a entrega faz sentido).
  modalidades?: readonly ModalidadeTaxiDog[]
  rotuloLevar?: string
}) {
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState<string | null>(null)
  const [cotando, setCotando] = useState(false)
  const [erroCotacao, setErroCotacao] = useState<string | null>(null)
  const chaveAtual = useRef('')
  const jaPreencheu = useRef(false)

  // Último endereço usado num TaxiDog deste cliente — poupa digitar de
  // novo. No lado do cliente, a RLS "taxidog_corrida: cliente ve proprias"
  // já limita às dele; no da loja, filtra pelo cliente escolhido.
  useEffect(() => {
    if (jaPreencheu.current || valor.endereco.cep) return
    if (modoLoja && !idCliente) return
    jaPreencheu.current = true
    const supabase = createClient()
    let consulta = supabase
      .from('taxidog_corrida')
      .select('cep, logradouro, numero, complemento, bairro, cidade, uf')
    if (modoLoja && idCliente) consulta = consulta.eq('id_cliente', idCliente)
    consulta
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        onChange(prev => prev.endereco.cep ? prev : {
          ...prev,
          endereco: {
            cep: formatarCep(data.cep),
            logradouro: data.logradouro,
            numero: data.numero,
            complemento: data.complemento ?? '',
            bairro: data.bairro,
            cidade: data.cidade,
            uf: data.uf,
          },
          cotacoes: null,
        })
      })
  }, [valor.endereco.cep, onChange, modoLoja, idCliente])

  const chaveEndereco = useMemo(
    () => (valor.opcao === 'taxidog' && enderecoCompleto(valor.endereco) ? JSON.stringify(valor.endereco) : ''),
    [valor.opcao, valor.endereco]
  )

  // Cota assim que o endereço fica completo (com uma pausa curta pra não
  // cotar a cada tecla). Resposta de um endereço antigo é descartada.
  useEffect(() => {
    chaveAtual.current = chaveEndereco
    if (!chaveEndereco || valor.cotacoes) return
    const endereco = JSON.parse(chaveEndereco) as EnderecoTaxiDog
    const timer = setTimeout(async () => {
      setCotando(true)
      setErroCotacao(null)
      const result = await cotar(endereco)
      setCotando(false)
      if (chaveAtual.current !== chaveEndereco) return
      if (result.error || !result.cotacoes) {
        setErroCotacao(result.error ?? 'Não foi possível calcular a taxa agora.')
        return
      }
      onChange(prev => ({ ...prev, cotacoes: result.cotacoes!, precisao: result.precisao ?? null }))
    }, 600)
    return () => clearTimeout(timer)
  }, [chaveEndereco, valor.cotacoes, cotar, onChange])

  function atualizarEndereco(campo: keyof EnderecoTaxiDog, texto: string) {
    setErroCotacao(null)
    onChange(prev => ({ ...prev, endereco: { ...prev.endereco, [campo]: texto }, cotacoes: null, precisao: null }))
  }

  async function handleCep(texto: string) {
    const digitos = texto.replace(/\D/g, '').slice(0, 8)
    atualizarEndereco('cep', formatarCep(digitos))
    setErroCep(null)
    if (digitos.length !== 8) return

    // ViaCEP: serviço público e gratuito de CEP do Brasil — só preenche o
    // que ainda não foi digitado.
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const json = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (json.erro) {
        setErroCep('CEP não encontrado. Preencha o endereço manualmente.')
        return
      }
      onChange(prev => ({
        ...prev,
        endereco: {
          ...prev.endereco,
          logradouro: json.logradouro || prev.endereco.logradouro,
          bairro: json.bairro || prev.endereco.bairro,
          cidade: json.localidade || prev.endereco.cidade,
          uf: json.uf || prev.endereco.uf,
        },
        cotacoes: null,
        precisao: null,
      }))
    } catch {
      setErroCep('Não foi possível buscar o CEP. Preencha o endereço manualmente.')
    } finally {
      setBuscandoCep(false)
    }
  }

  const cotacaoSelecionada = valor.cotacoes?.[valor.modalidade] ?? null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
        <button type="button" style={estiloOpcao(valor.opcao === 'levar')} onClick={() => onChange(prev => ({ ...prev, opcao: 'levar' }))}>
          <IconStore style={{ width: 20, height: 20, color: 'var(--gray-400)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{rotuloLevar ?? (modoLoja ? 'O cliente leva o pet até a loja' : 'Vou levar o pet até a loja')}</div>
            <div className="text-sm text-muted">Sem taxa de transporte</div>
          </div>
          {valor.opcao === 'levar' && <IconCheck style={{ width: 16, height: 16, color: 'var(--primary-400)' }} />}
        </button>

        <button type="button" style={estiloOpcao(valor.opcao === 'taxidog')} onClick={() => onChange(prev => ({ ...prev, opcao: 'taxidog' }))}>
          <IconCar style={{ width: 20, height: 20, color: 'var(--gray-400)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{modoLoja ? 'Usar o TaxiDog' : 'Quero utilizar o TaxiDog'}</div>
            <div className="text-sm text-muted">Busca e/ou entrega do pet · taxa calculada pelo endereço</div>
          </div>
          {valor.opcao === 'taxidog' && <IconCheck style={{ width: 16, height: 16, color: 'var(--primary-400)' }} />}
        </button>
      </div>

      {valor.opcao === 'taxidog' && (
        <>
          <div className="form-group">
            <label className="form-label">{modoLoja ? 'O que o cliente precisa?' : 'O que você precisa?'}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {modalidades.map(m => {
                const cot = valor.cotacoes?.[m]
                const selecionada = valor.modalidade === m
                return (
                  <button
                    key={m}
                    type="button"
                    style={{ ...estiloOpcao(selecionada), padding: 'var(--space-3) var(--space-4)' }}
                    onClick={() => onChange(prev => ({ ...prev, modalidade: m }))}
                  >
                    <span
                      style={{
                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${selecionada ? 'var(--primary-500)' : 'var(--gray-600)'}`,
                        background: selecionada ? 'var(--primary-500)' : 'transparent',
                        boxShadow: selecionada ? 'inset 0 0 0 3px var(--gray-900)' : 'none',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{ROTULO_MODALIDADE[m]}</div>
                      <div className="text-xs text-muted">{(modoLoja ? DESCRICAO_MODALIDADE_LOJA : DESCRICAO_MODALIDADE)[m]}</div>
                    </div>
                    {cot && (
                      <span className={`text-sm font-semibold ${cot.disponivel ? 'text-success' : 'text-muted'}`} style={{ flexShrink: 0 }}>
                        {cot.disponivel ? formatarReais(cot.valor) : 'Indisponível'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              <IconMapPin style={{ width: 13, height: 13, verticalAlign: -2, marginRight: 4 }} />
              Endereço para {valor.modalidade === 'entregar' ? 'entrega' : 'busca'} do pet
            </label>

            <div className="form-grid-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <input
                  className="form-input"
                  placeholder="CEP"
                  inputMode="numeric"
                  value={valor.endereco.cep}
                  onChange={e => handleCep(e.target.value)}
                  maxLength={9}
                />
                {buscandoCep && <span className="form-hint">Buscando CEP...</span>}
                {erroCep && <span className="form-error">{erroCep}</span>}
              </div>
              <div />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <input className="form-input" placeholder="Rua" value={valor.endereco.logradouro} onChange={e => atualizarEndereco('logradouro', e.target.value)} maxLength={150} />
              <input className="form-input" placeholder="Número" value={valor.endereco.numero} onChange={e => atualizarEndereco('numero', e.target.value)} maxLength={20} />
            </div>
            <input
              className="form-input"
              style={{ marginTop: 'var(--space-3)' }}
              placeholder="Complemento (opcional)"
              value={valor.endereco.complemento}
              onChange={e => atualizarEndereco('complemento', e.target.value)}
              maxLength={80}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <input className="form-input" placeholder="Bairro" value={valor.endereco.bairro} onChange={e => atualizarEndereco('bairro', e.target.value)} maxLength={80} />
              <input className="form-input" placeholder="Cidade" value={valor.endereco.cidade} onChange={e => atualizarEndereco('cidade', e.target.value)} maxLength={80} />
              <select className="form-select" value={valor.endereco.uf} onChange={e => atualizarEndereco('uf', e.target.value)}>
                <option value="">UF</option>
                {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
          </div>

          {!chaveEndereco ? (
            <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>
              Preencha o endereço completo para calcularmos a taxa do TaxiDog.
            </p>
          ) : cotando || !valor.cotacoes ? (
            erroCotacao ? (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>{erroCotacao}</span>
              </div>
            ) : (
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>Calculando a taxa do TaxiDog...</p>
            )
          ) : cotacaoSelecionada && !cotacaoSelecionada.disponivel ? (
            <div className="alert alert-warning" style={{ marginBottom: 'var(--space-5)' }}>
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>
                {cotacaoSelecionada.motivo ?? 'O TaxiDog não está disponível para este endereço.'}
                {modoLoja ? ' O cliente ainda pode levar o pet até a loja.' : ' Você ainda pode levar o pet até a loja.'}
              </span>
            </div>
          ) : cotacaoSelecionada ? (
            <div
              style={{
                background: 'var(--gray-850)',
                border: '1px solid var(--gray-800)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <div className="text-sm" style={{ color: 'var(--gray-200)' }}>{enderecoEmUmaLinha(valor.endereco)}</div>
              {cotacaoSelecionada.distanciaKm != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Distância aproximada</span>
                  <span>{formatarKm(cotacaoSelecionada.distanciaKm)}</span>
                </div>
              )}
              {cotacaoSelecionada.criterio && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Como calculamos</span>
                  <span>{cotacaoSelecionada.criterio}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-semibold">Taxa TaxiDog · {ROTULO_MODALIDADE[valor.modalidade]}</span>
                <span className="font-semibold text-success">{formatarReais(cotacaoSelecionada.valor)}</span>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                A taxa do TaxiDog é referente ao transporte do pet e é cobrada separadamente do serviço.
                {cotacaoSelecionada.distanciaKm != null && ' Distância em linha reta a partir da loja · dados de mapa © OpenStreetMap.'}
                {valor.precisao === 'bairro' && ' Não achamos a rua exata no mapa, então usamos o centro do bairro.'}
              </p>
            </div>
          ) : null}

        </>
      )}
    </>
  )
}

// ============================================================
// Etapa do cliente: "Como seu pet irá até a loja?"
// ============================================================
interface Props {
  idLojista: string
  valor: EstadoTransporte
  onChange: Dispatch<SetStateAction<EstadoTransporte>>
  onContinuar: () => void
  rotuloContinuar?: string
}

// O cliente não escolhe quem faz a corrida — isso fica com a loja (modal de
// novo agendamento) ou com o próprio TaxiDog, que assume a corrida.
export default function TaxiDogEtapa({ idLojista, valor, onChange, onContinuar, rotuloContinuar = 'Continuar' }: Props) {
  const cotar = useCallback((endereco: EnderecoTaxiDog) => cotarTaxiDogAction(idLojista, endereco), [idLojista])

  return (
    <div className="card">
      <h2 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-2)' }}>Como seu pet irá até a loja?</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>
        Você pode levar o pet ou usar o TaxiDog da loja para buscar e/ou entregar.
      </p>

      <TaxiDogCampos valor={valor} onChange={onChange} cotar={cotar} />

      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" disabled={!transportePronto(valor)} onClick={onContinuar}>
          {rotuloContinuar}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Bloco "TAXIDOG" do resumo final — mostra a taxa separada do serviço.
// ============================================================
export function ResumoTaxiDog({ escolha, disponivel }: { escolha: EscolhaTaxiDog | null; disponivel: boolean }) {
  if (!disponivel) return null
  return (
    <div style={{ padding: 'var(--space-3) 0', borderTop: '1px solid var(--gray-800)' }}>
      <div className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>TaxiDog</div>
      {escolha ? (
        <>
          <div className="flex justify-between">
            <span>{ROTULO_MODALIDADE[escolha.modalidade]}</span>
            <span className="font-semibold text-success">{formatarReais(escolha.cotacao.valor)}</span>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 2 }}>{enderecoEmUmaLinha(escolha.endereco)}</div>
        </>
      ) : (
        <div className="text-sm text-muted">Não utilizado</div>
      )}
    </div>
  )
}
