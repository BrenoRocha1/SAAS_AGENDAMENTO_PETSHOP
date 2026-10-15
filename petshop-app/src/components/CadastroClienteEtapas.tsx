'use client'

import { useState, useTransition } from 'react'
import Ilustracao, { type NomeIlustracao } from '@/components/Ilustracao'
import LogoSaip from '@/components/LogoSaip'
import { IconAlert, IconCheck, IconChevronLeft, IconPaw, IconUser } from '@/components/icons'
import { mascaraTelefoneLoja } from '@/lib/cadastro-loja'
import {
  DADOS_CLIENTE_VAZIOS,
  ESPECIES,
  ETAPAS_CLIENTE,
  PORTES,
  SEXOS,
  TEXTO_ETAPA_CLIENTE,
  camposDoCadastroCliente,
  etapaAnteriorCliente,
  etapaDoErroCliente,
  mascaraCpfCliente,
  mascaraDataCliente,
  petEmUmaLinha,
  primeiroNome,
  problemaDaEtapaCliente,
  proximaEtapaCliente,
  temPet,
  type DadosCliente,
} from '@/lib/cadastro-cliente-etapas'
import './cadastro-loja.css'

// Cadastro do cliente em etapas — o mesmo jeito do cadastro da loja
// (CadastroLojaEtapas): uma pergunta por tela, a ilustração muda a cada
// passo, o nome da pessoa e depois o do pet acompanham numa placa. O
// primeiro pet é opcional. Quem grava é `onEnviar` (a action do servidor).
export default function CadastroClienteEtapas({ email, nomeGoogle, onEnviar, onVoltarInicio }: {
  email?: string | null
  nomeGoogle?: string | null
  onEnviar: (campos: Record<string, string>) => Promise<{ error?: string } | undefined | void>
  // No primeiro passo, a seta volta para a escolha "cliente ou lojista".
  onVoltarInicio?: () => void
}) {
  const [dados, setDados] = useState<DadosCliente>({ ...DADOS_CLIENTE_VAZIOS, nome: nomeGoogle ?? '' })
  const [indice, setIndice] = useState(0)
  const [direcao, setDirecao] = useState<'frente' | 'volta'>('frente')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()

  const etapa = ETAPAS_CLIENTE[indice]
  const texto = TEXTO_ETAPA_CLIENTE[etapa]
  const mudar = (parte: Partial<DadosCliente>) => { setDados(d => ({ ...d, ...parte })); setErro(null) }
  const nome = primeiroNome(dados.nome)
  const pet = dados.pet_nome.trim()
  const ehPet = etapa === 'pet' || etapa === 'pet_detalhes'

  function irPara(i: number) {
    setDirecao(i >= indice ? 'frente' : 'volta')
    setIndice(Math.max(0, Math.min(ETAPAS_CLIENTE.length - 1, i)))
    setErro(null)
  }

  // "Pular por agora" no pet: sai sem pet nenhum.
  function pularPet() {
    setDados(d => ({ ...d, pet_nome: '', especie: '', sexo: '', porte: '', raca: '', nascimento: '' }))
    irPara(ETAPAS_CLIENTE.indexOf('pronto'))
  }

  function avancar(e?: React.FormEvent) {
    e?.preventDefault()
    const problema = problemaDaEtapaCliente(etapa, dados)
    if (problema) return setErro(problema)
    if (etapa !== 'pronto') return irPara(proximaEtapaCliente(indice, dados))
    startTransition(async () => {
      const r = await onEnviar(camposDoCadastroCliente(dados))
      if (r?.error) {
        // Volta para a etapa do problema, com a mensagem do servidor.
        const alvo = ETAPAS_CLIENTE.indexOf(etapaDoErroCliente(r.error))
        if (alvo !== indice) irPara(alvo)
        setErro(r.error.replace(/^Pet: /, ''))
      }
    })
  }

  const titulo = etapa === 'pronto' && nome ? `Tudo pronto, ${nome}!`
    : etapa === 'pet_detalhes' && pet ? `Mais sobre ${pet}`
    : texto.titulo

  return (
    <div className="cl">
      <header className="cl-topo">
        {indice > 0 || onVoltarInicio ? (
          <button type="button" className="cl-voltar" onClick={() => (indice > 0 ? irPara(etapaAnteriorCliente(indice, dados)) : onVoltarInicio?.())} aria-label="Voltar" disabled={enviando}>
            <IconChevronLeft />
          </button>
        ) : (
          <LogoSaip altura={22} />
        )}
        <div className="cl-progresso" role="progressbar" aria-valuemin={1} aria-valuemax={ETAPAS_CLIENTE.length} aria-valuenow={indice + 1} aria-label="Progresso do cadastro">
          {ETAPAS_CLIENTE.map((e, i) => <span key={e} className={i <= indice ? 'is-feito' : ''} />)}
        </div>
        <span className="cl-passo">{indice + 1} de {ETAPAS_CLIENTE.length}</span>
      </header>

      <form className="cl-corpo" onSubmit={avancar} noValidate>
        {/* Detalhes do pet e revisão têm mais coisa: a ilustração encolhe. */}
        <div className={`cl-palco is-${direcao} ${etapa === 'pet_detalhes' || etapa === 'pronto' ? 'is-compacto' : ''}`} key={`palco-${etapa}`}>
          <span className="cl-circulo" aria-hidden="true" />
          <Ilustracao nome={texto.ilustracao as NomeIlustracao} altura={etapa === 'pet_detalhes' || etapa === 'pronto' ? 130 : 190} style={{ margin: 0, position: 'relative' }} />
          {/* Numa placa: o nome da pessoa e, nas telas do pet, o nome dele. */}
          {ehPet ? (
            pet && <span className="cl-placa" key="placa-pet"><IconPaw /> {pet}</span>
          ) : (
            nome && etapa !== 'pronto' && <span className="cl-placa" key="placa-nome"><IconUser /> Oi, {nome}!</span>
          )}
        </div>

        <div className={`cl-conteudo is-${direcao}`} key={`conteudo-${etapa}`}>
          {texto.opcional && <span className="cl-opcional">Opcional</span>}
          <h1 className="cl-titulo">{titulo}</h1>
          <p className="cl-sub">{texto.sub}</p>

          {etapa === 'nome' && (
            <>
              <input className="cl-input" autoFocus placeholder="Seu nome" value={dados.nome} maxLength={120} autoComplete="name"
                onChange={e => mudar({ nome: e.target.value })} aria-label="Seu nome" />
              {email && <span className="cl-google"><IconCheck /> Conectado com o Google · {email}</span>}
            </>
          )}

          {etapa === 'whatsapp' && (
            <input className="cl-input" autoFocus type="tel" inputMode="tel" placeholder="(11) 98765-4321" value={dados.telefone}
              onChange={e => mudar({ telefone: mascaraTelefoneLoja(e.target.value) })} aria-label="Seu WhatsApp" />
          )}

          {etapa === 'cpf' && (
            <input className="cl-input" autoFocus inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={dados.cpf}
              onChange={e => mudar({ cpf: mascaraCpfCliente(e.target.value) })} aria-label="CPF" />
          )}

          {etapa === 'pet' && (
            <div className="cl-campos">
              <input className="cl-input" autoFocus placeholder="Nome do pet" value={dados.pet_nome} maxLength={80}
                onChange={e => mudar({ pet_nome: e.target.value })} aria-label="Nome do pet" />
              <Opcoes rotulo="Espécie" opcoes={ESPECIES} valor={dados.especie} onChange={v => mudar({ especie: v })} />
            </div>
          )}

          {etapa === 'pet_detalhes' && (
            <div className="cl-campos">
              <Opcoes rotulo="Sexo" opcoes={SEXOS} valor={dados.sexo} onChange={v => mudar({ sexo: v })} />
              <Opcoes rotulo="Porte" opcoes={PORTES} valor={dados.porte} onChange={v => mudar({ porte: v === dados.porte ? '' : v })} />
              <div className="cl-linha">
                <input className="cl-input" placeholder={dados.especie === 'Gato' ? 'Raça (ex.: SRD, Siamês)' : 'Raça (ex.: SRD, Shih Tzu)'} value={dados.raca} maxLength={80}
                  onChange={e => mudar({ raca: e.target.value })} aria-label="Raça" />
                <input className="cl-input cl-nasc" inputMode="numeric" placeholder="Nascimento" value={dados.nascimento}
                  onChange={e => mudar({ nascimento: mascaraDataCliente(e.target.value) })} aria-label="Data de nascimento (dia/mês/ano)" />
              </div>
            </div>
          )}

          {etapa === 'pronto' && (
            <div className="cl-revisao">
              <LinhaRevisao rotulo="Nome" valor={dados.nome.trim()} onAlterar={() => irPara(0)} />
              <LinhaRevisao rotulo="WhatsApp" valor={dados.telefone} onAlterar={() => irPara(1)} />
              <LinhaRevisao rotulo="CPF" valor={dados.cpf} onAlterar={() => irPara(2)} />
              <LinhaRevisao rotulo="Pet" valor={petEmUmaLinha(dados) || 'Cadastrar depois'} apagado={!temPet(dados)} onAlterar={() => irPara(3)} />
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
            {etapa === 'pronto' ? (enviando ? 'Criando a sua conta…' : 'Criar minha conta') : 'Continuar'}
          </button>
          {etapa === 'pet' && (
            <button type="button" className="cl-pular" onClick={pularPet} disabled={enviando}>Pular por agora</button>
          )}
        </footer>
      </form>
    </div>
  )
}

// Escolha de uma opção em botões (espécie, sexo, porte).
function Opcoes<T extends string>({ rotulo, opcoes, valor, onChange }: { rotulo: string; opcoes: readonly T[]; valor: string; onChange: (v: T) => void }) {
  return (
    <div className="cl-opcoes" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(o => (
        <button key={o} type="button" role="radio" aria-checked={valor === o} className={`cl-opcao ${valor === o ? 'is-ativa' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
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
