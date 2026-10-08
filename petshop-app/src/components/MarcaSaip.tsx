import LogoSaip from '@/components/LogoSaip'

export const SLOGAN_SAIP = 'Sistema de agendamento inteligente para petshop'

// A marca no topo das telas de entrada (login, cadastro, senha): o selo, o
// nome e o slogan — num lugar só, pra nenhuma tela ficar com outro nome.
export default function MarcaSaip() {
  return (
    <div className="login-brand">
      <span className="login-brand-texto">
        <LogoSaip altura={30} />
        <span className="login-brand-slogan">{SLOGAN_SAIP}</span>
      </span>
    </div>
  )
}
