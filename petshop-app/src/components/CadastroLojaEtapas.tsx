'use client'

import { useRef, useState, useTransition } from 'react'
import Ilustracao, { type NomeIlustracao } from '@/components/Ilustracao'
import LogoSaip from '@/components/LogoSaip'
import { IconAlert, IconCheck, IconChevronLeft, IconStore } from '@/components/icons'
import {
  DADOS_LOJA_VAZIOS,
  ETAPAS_LOJA,
  TEXTO_ETAPA,
  UFS,
  camposDoCadastro,
  enderecoEmUmaLinha,
  etapaDoErro,
  mascaraCepLoja,
  mascaraDocumentoLoja,
  mascaraTelefoneLoja,
  problemaDaEtapa,
  soDigitos,
  type DadosLoja,
} from '@/lib/cadastro-loja'
import './cadastro-loja.css'

// Cadastro do petshop em etapas: uma pergunta por tela, a ilustração muda a
// cada passo e o nome da loja, depois de escrito, acompanha até o fim.
// Quem grava é `onEnviar` (a action do servidor), que confere tudo de novo.
export default function CadastroLojaEtapas({ email, onEnviar, onVoltarInicio }: {
  email?: string | null
  onEnviar: (campos: Record<string, string>) => Promise<{ error?: string } | undefined | void>
  // No primeiro passo, a seta volta para a escolha "cliente ou lojista".
  onVoltarInicio?: () => void
}) {
  const [dados, setDados] = useState<DadosLoja>(DADOS_LOJA_VAZIOS)
  const [indice, setIndice] = useState(0)
  const [direcao, setDirecao] = useState<'frente' | 'volta'>('frente')
  const [erro, setErro] = useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enviando, startTransition] = useTransition()
  const numeroRef = useRef<HTMLInputElement>(null)

  const etapa = ETAPAS_LOJA[indice]
  const texto = TEXTO_ETAPA[etapa]
  const mudar = (parte: Partial<DadosLoja>) => { setDados(d => ({ ...d, ...parte })); setErro(null) }

  function irPara(i: number) {
    setDirecao(i >= indice ? 'frente' : 'volta')
    setIndice(Math.max(0, Math.min(ETAPAS_LOJA.length - 1, i)))
    setErro(null)
  }

  function avancar(e?: React.FormEvent) {
    e?.preventDefault()
    const problema = problemaDaEtapa(etapa, dados)
    if (problema) return setErro(problema)
    if (etapa !== 'pronto') return irPara(indice + 1)
    startTransition(async () => {
      const r = await onEnviar(camposDoCadastro(dados))
      if (r?.error) {
        // Volta para a etapa do problema, com a mensagem do servidor.
        const alvo = ETAPAS_LOJA.indexOf(etapaDoErro(r.error))
        if (alvo !== indice) irPara(alvo)
        setErro(r.error)
      }
    })
  }

  // CEP completo: o ViaCEP preenche rua, bairro, cidade e UF.
  async function aoDigitarCep(t: string) {
    const cep = mascaraCepLoja(t)
    mudar({ cep })
    const digitos = soDigitos(cep)
    if (digitos.length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (j.erro) return setErro('CEP não encontrado. Preencha o endereço abaixo.')
      setDados(d => ({ ...d, endereco: j.logradouro || d.endereco, bairro: j.bairro || d.bairro, cidade: j.localidade || d.cidade, estado: j.uf || d.estado }))
      numeroRef.current?.focus()
    } catch {
      setErro('Não deu para buscar o CEP agora. Preencha o endereço abaixo.')
    } finally {
      setBuscandoCep(false)
    }
  }

  const nomeLoja = dados.nome_loja.trim()

  return (
    <div className="cl">
      <header className="cl-topo">
        {indice > 0 || onVoltarInicio ? (
          <button type="button" className="cl-voltar" onClick={() => (indice > 0 ? irPara(indice - 1) : onVoltarInicio?.())} aria-label="Voltar" disabled={enviando}>
            <IconChevronLeft />
          </button>
        ) : (
          <LogoSaip altura={22} />
        )}
        <div className="cl-progresso" role="progressbar" aria-valuemin={1} aria-valuemax={ETAPAS_LOJA.length} aria-valuenow={indice + 1} aria-label="Progresso do cadastro">
          {ETAPAS_LOJA.map((e, i) => <span key={e} className={i <= indice ? 'is-feito' : ''} />)}
        </div>
        <span className="cl-passo">{indice + 1} de {ETAPAS_LOJA.length}</span>
      </header>

      <form className="cl-corpo" onSubmit={avancar} noValidate>
        {/* Endereço e revisão têm mais campos: a ilustração encolhe. */}
        <div className={`cl-palco is-${direcao} ${etapa === 'endereco' || etapa === 'pronto' ? 'is-compacto' : ''}`} key={`palco-${etapa}`}>
          <span className="cl-circulo" aria-hidden="true" />
          <Ilustracao nome={texto.ilustracao as NomeIlustracao} altura={etapa === 'endereco' || etapa === 'pronto' ? 130 : 190} style={{ margin: 0, position: 'relative' }} />
          {/* O nome da loja numa placa: aparece enquanto é digitado e segue nas próximas telas. */}
          {nomeLoja && etapa !== 'pronto' && (
            <span className="cl-placa"><IconStore /> {nomeLoja}</span>
          )}
        </div>

        <div className={`cl-conteudo is-${direcao}`} key={`conteudo-${etapa}`}>
          {texto.opcional && <span className="cl-opcional">Opcional</span>}
          <h1 className="cl-titulo">{etapa === 'pronto' && nomeLoja ? `Tudo pronto, ${nomeLoja}!` : texto.titulo}</h1>
          <p className="cl-sub">{texto.sub}</p>

          {etapa === 'nome' && (
            <>
              <input className="cl-input" autoFocus placeholder="PetShop do Bairro" value={dados.nome_loja} maxLength={150}
                onChange={e => mudar({ nome_loja: e.target.value })} aria-label="Nome do petshop" />
              {email && <span className="cl-google"><IconCheck /> Conectado com o Google · {email}</span>}
            </>
          )}

          {etapa === 'whatsapp' && (
            <input className="cl-input" autoFocus type="tel" inputMode="tel" placeholder="(11) 98765-4321" value={dados.telefone}
              onChange={e => mudar({ telefone: mascaraTelefoneLoja(e.target.value) })} aria-label="WhatsApp da loja" />
          )}

          {etapa === 'documento' && (
            <input className="cl-input" autoFocus inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={dados.documento}
              onChange={e => mudar({ documento: mascaraDocumentoLoja(e.target.value) })} aria-label="CPF ou CNPJ" />
          )}

          {etapa === 'endereco' && (
            <div className="cl-campos">
              <div className="cl-linha">
                <input className="cl-input" autoFocus inputMode="numeric" placeholder="CEP" value={dados.cep} onChange={e => aoDigitarCep(e.target.value)} aria-label="CEP" />
                {buscandoCep && <span className="cl-buscando">Buscando…</span>}
              </div>
              <div className="cl-linha cl-rua">
                <input className="cl-input" placeholder="Rua" value={dados.endereco} maxLength={200} onChange={e => mudar({ endereco: e.target.value })} aria-label="Rua" />
                <input ref={numeroRef} className="cl-input" placeholder="Nº" value={dados.numero} maxLength={20} onChange={e => mudar({ numero: e.target.value })} aria-label="Número" />
              </div>
              <input className="cl-input" placeholder="Bairro" value={dados.bairro} maxLength={80} onChange={e => mudar({ bairro: e.target.value })} aria-label="Bairro" />
              <div className="cl-linha cl-cidade">
                <input className="cl-input" placeholder="Cidade" value={dados.cidade} maxLength={100} onChange={e => mudar({ cidade: e.target.value })} aria-label="Cidade" />
                <select className="cl-input" value={dados.estado} onChange={e => mudar({ estado: e.target.value })} aria-label="Estado">
                  <option value="">UF</option>
                  {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          )}

          {etapa === 'sobre' && (
            <>
              <textarea className="cl-input cl-texto" autoFocus rows={4} maxLength={500} placeholder="Banho e tosa com carinho desde 2015, atendimento sem pressa…"
                value={dados.descricao} onChange={e => mudar({ descricao: e.target.value })} aria-label="Sobre a loja" />
              <span className="cl-contador">{dados.descricao.length}/500</span>
            </>
          )}

          {etapa === 'pronto' && (
            <div className="cl-revisao">
              <LinhaRevisao rotulo="Petshop" valor={nomeLoja} onAlterar={() => irPara(0)} />
              <LinhaRevisao rotulo="WhatsApp" valor={dados.telefone} onAlterar={() => irPara(1)} />
              <LinhaRevisao rotulo="CPF/CNPJ" valor={dados.documento} onAlterar={() => irPara(2)} />
              <LinhaRevisao rotulo="Endereço" valor={enderecoEmUmaLinha(dados) || 'Completar depois'} apagado={!enderecoEmUmaLinha(dados)} onAlterar={() => irPara(3)} />
              <LinhaRevisao rotulo="Sobre" valor={dados.descricao.trim() || 'Completar depois'} apagado={!dados.descricao.trim()} onAlterar={() => irPara(4)} />
              <label className="cl-termos">
                <input type="checkbox" checked={dados.aceita_termos} onChange={e => mudar({ aceita_termos: e.target.checked })} />
                <span>Li e aceito os <a href="/termos" target="_blank" rel="noreferrer">Termos de Uso</a> e a <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a></span>
              </label>
            </div>
          )}
        </div>

        <footer className="cl-rodape">
          {erro && <div className="cl-erro" role="alert"><IconAlert /> <span>{erro}</span></div>}
          <button type="submit" className="cl-cta" disabled={enviando}>
            {etapa === 'pronto' ? (enviando ? 'Criando a sua loja…' : 'Criar meu petshop') : 'Continuar'}
          </button>
          {texto.opcional && (
            <button type="button" className="cl-pular" onClick={() => irPara(indice + 1)} disabled={enviando}>Pular por agora</button>
          )}
        </footer>
      </form>
    </div>
  )
}

function LinhaRevisao({ rotulo, valor, apagado, onAlterar }: { rotulo: string; valor: string; apagado?: boolean; onAlterar: () => void }) {
  return (
    <div className="cl-revisao-linha">
      <span className="cl-revisao-rotulo">{rotulo}</span>
      <span className={`cl-revisao-valor ${apagado ? 'is-apagado' : ''}`}>{valor}</span>
      <button type="button" className="cl-alterar" onClick={onAlterar}>Alterar</button>
    </div>
  )
}
