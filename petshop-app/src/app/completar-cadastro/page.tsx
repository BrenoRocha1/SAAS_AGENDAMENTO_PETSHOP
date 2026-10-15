'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Ilustracao from '@/components/Ilustracao'
import LogoSaip from '@/components/LogoSaip'
import { IconCheck, IconChevronRight } from '@/components/icons'
import '@/components/cadastro-loja.css'

// Primeira tela de quem entrou com o Google e ainda não tem cadastro: é
// cliente ou tem um petshop? Obrigatória — a tela de entrar não pergunta, e
// é daqui que saem os dois cadastros em etapas (/completar-cadastro/cliente
// e /completar-cadastro/lojista). O app tem a mesma tela (EscolhaPerfil).
export default function EscolhaPerfilPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [primeiroNome, setPrimeiroNome] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      const nome: string = user.user_metadata?.full_name || user.user_metadata?.name || ''
      setPrimeiroNome(nome.trim().split(/\s+/)[0] ?? '')
      setEmail(user.email ?? null)
    })
  }, [router])

  if (email === undefined) return <div className="cl" aria-busy="true" />

  async function outraConta() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div className="cl">
      <header className="cl-topo"><LogoSaip altura={22} /></header>

      <div className="cl-corpo">
        <div className="cl-palco is-frente">
          <span className="cl-circulo" aria-hidden="true" />
          <Ilustracao nome="boas-vindas" altura={190} style={{ margin: 0, position: 'relative' }} />
        </div>

        <div className="cl-conteudo is-frente">
          <h1 className="cl-titulo">{primeiroNome ? `Boas-vindas, ${primeiroNome}!` : 'Boas-vindas ao SAIP!'}</h1>
          <p className="cl-sub">Para começar, conte como você vai usar o SAIP.</p>

          <div className="cl-escolhas">
            <button type="button" className="cl-escolha" onClick={() => router.push('/completar-cadastro/cliente')}>
              <span className="cl-escolha-figura"><Ilustracao nome="pets" altura={64} style={{ margin: 0 }} /></span>
              <span className="cl-escolha-textos">
                <span className="cl-escolha-titulo">Sou cliente</span>
                <span className="cl-escolha-desc">Quero agendar banho, tosa e outros cuidados para o meu pet.</span>
              </span>
              <IconChevronRight />
            </button>
            <button type="button" className="cl-escolha" onClick={() => router.push('/completar-cadastro/lojista')}>
              <span className="cl-escolha-figura"><Ilustracao nome="loja" altura={64} style={{ margin: 0 }} /></span>
              <span className="cl-escolha-textos">
                <span className="cl-escolha-titulo">Tenho um petshop</span>
                <span className="cl-escolha-desc">Quero receber agendamentos e organizar a minha loja.</span>
              </span>
              <IconChevronRight />
            </button>
          </div>
        </div>

        <footer className="cl-rodape">
          {email && <span className="cl-google" style={{ alignSelf: 'center', textAlign: 'center' }}><IconCheck /> Conectado com o Google · {email}</span>}
          <button type="button" className="cl-pular" onClick={outraConta}>Entrar com outra conta</button>
        </footer>
      </div>
    </div>
  )
}
