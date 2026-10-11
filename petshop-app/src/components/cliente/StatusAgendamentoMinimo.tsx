import { corSolidaStatus, etapaEncerrada, rotuloStatus } from '@/lib/status-agendamento'

// Selo de status das telas do cliente (Agendamentos, Dashboard): pílula
// suave (fundo e borda a ~12%/28% da cor do status, igual a um
// shadcn "Status" component) com um pontinho pulsando — bem mais
// discreto que o .badge cheio/maiúsculo do lojista, que não mexo aqui
// porque é compartilhado com as telas dele. Finalizado/Cancelado não
// mudam mais, então o ponto fica parado (sem pulso) nesses dois.
export default function StatusAgendamentoMinimo({ status }: { status: string }) {
  const cor = corSolidaStatus(status)
  const parado = etapaEncerrada(status)
  return (
    <span
      className="status-pilula"
      style={{
        background: `color-mix(in srgb, ${cor} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${cor} 28%, transparent)`,
        color: cor,
      }}
    >
      <span className={`status-pilula-ponto ${parado ? 'is-parado' : ''}`} style={{ background: cor }} />
      {rotuloStatus(status)}
    </span>
  )
}
