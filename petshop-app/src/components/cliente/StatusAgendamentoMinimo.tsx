import { corSolidaStatus, rotuloStatus } from '@/lib/status-agendamento'

// Selo de status das telas do cliente (Agendamentos, Dashboard): só um
// ponto colorido + texto, sem a caixa/maiúsculas do .badge do lojista —
// esse aqui é bem mais discreto de propósito.
export default function StatusAgendamentoMinimo({ status }: { status: string }) {
  return (
    <span className="status-minimo">
      <span className="status-minimo-ponto" style={{ background: corSolidaStatus(status) }} />
      {rotuloStatus(status)}
    </span>
  )
}
