import { IconPaw } from '@/components/icons'

export const SLOGAN_SAIP = 'Sistema de agendamento inteligente para petshop'

// A marca no topo das telas de entrada (login, cadastro, senha): o selo, o
// nome e o slogan — num lugar só, pra nenhuma tela ficar com outro nome.
export default function MarcaSaip() {
  return (
    <div className="login-brand">
      <span className="login-brand-mark">
        <IconPaw />
      </span>
      <span className="login-brand-texto">
        <span className="login-brand-name">SA<span>IP</span></span>
        <span className="login-brand-slogan">{SLOGAN_SAIP}</span>
      </span>
    </div>
  )
}
