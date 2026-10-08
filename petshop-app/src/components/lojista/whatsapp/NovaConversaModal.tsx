'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconAlert, IconInfo } from '@/components/icons'
import { Folha, Segmentos } from '@/components/app/PecasApp'
import { formatarTelefone } from '@/lib/format'
import { mensagemDoWhatsApp } from '@/lib/whatsapp/tipos'
import { BuscaCliente } from './DetalhesContato'

interface Props {
  conectado: boolean
  onFechar: () => void
  // A conversa aberta (nova ou a que o contato já tinha).
  onAberta: (idConversa: string) => void
}

type Modo = 'cliente' | 'telefone'

// "Nova conversa": por um cliente da loja ou por um telefone. Só abre a
// conversa — nenhuma mensagem é enviada aqui.
export default function NovaConversaModal({ conectado, onFechar, onAberta }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [modo, setModo] = useState<Modo>('cliente')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState(false)

  async function abrir(parametros: { p_id_cliente?: string; p_telefone?: string }) {
    setErro(null)
    setAbrindo(true)
    const { data, error } = await supabase.rpc('fn_whatsapp_nova_conversa', parametros)
    setAbrindo(false)
    if (error || typeof data !== 'string') return setErro(mensagemDoWhatsApp(error, 'Não foi possível abrir a conversa.'))
    onAberta(data)
  }

  const digitos = telefone.replace(/\D/g, '')

  return (
    <Folha titulo="Nova conversa" onFechar={onFechar} ocupado={abrindo}>
      {!conectado && (
        <div className="alert alert-warning">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>O WhatsApp da loja não está conectado. Dá para abrir a conversa, mas não para enviar mensagens.</span>
        </div>
      )}
      <div className="alert alert-info">
        <IconInfo style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
        <span>Pelas regras do WhatsApp, a loja só escreve livremente depois que o cliente manda a primeira mensagem. Abrir a conversa aqui deixa o contato pronto e ligado ao cadastro.</span>
      </div>

      <Segmentos<Modo>
        opcoes={[{ valor: 'cliente', rotulo: 'Cliente da loja' }, { valor: 'telefone', rotulo: 'Outro telefone' }]}
        valor={modo}
        onChange={m => { setModo(m); setErro(null) }}
      />

      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      {modo === 'cliente' ? (
        <BuscaCliente salvando={abrindo} onEscolher={c => abrir({ p_id_cliente: c.id_cliente })} />
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); void abrir({ p_telefone: telefone.trim().startsWith('+') ? `+${digitos}` : digitos }) }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          <div className="form-group">
            <label htmlFor="wa-novo-telefone" className="form-label form-label-required">Telefone com DDD</label>
            <input
              id="wa-novo-telefone"
              type="tel"
              className="form-input"
              value={telefone}
              onChange={e => {
                const valor = e.target.value
                // Número do Brasil ganha a máscara; com "+" fica como foi digitado.
                setTelefone(valor.trim().startsWith('+') ? valor : formatarTelefone(valor))
              }}
              placeholder="(11) 99999-9999"
              maxLength={20}
              autoFocus
            />
            <span className="form-hint">Número de fora do Brasil: digite com o código do país, começando por +.</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className={`btn btn-primary ${abrindo ? 'btn-loading' : ''}`} disabled={abrindo || digitos.length < 10}>
              {abrindo ? 'Abrindo...' : 'Abrir conversa'}
            </button>
          </div>
        </form>
      )}
    </Folha>
  )
}
