import './configuracoes.css'

// Configurações e as telas que saem dela: o mesmo visual (ícone em roxo
// claro, textos menores) sem mexer nos cartões das outras áreas do painel.
export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return <div className="cfg-area">{children}</div>
}
