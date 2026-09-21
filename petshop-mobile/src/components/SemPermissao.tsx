import { EmptyState } from './EmptyState'

// Mesmo aviso do dashboard web quando um funcionário sem a permissão
// certa tenta abrir uma tela (ver empty-state de podeGerenciarAgenda/
// podeGerenciarClientesPets em petshop-app).
export function SemPermissao({ area = 'esta área' }: { area?: string }) {
  return (
    <EmptyState
      icon="lock-closed-outline"
      title={`Sem permissão para ${area}`}
      subtitle="Fale com o responsável pelo petshop para liberar esse acesso."
    />
  )
}
