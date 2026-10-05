'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { hojeBrasilISO } from '@/lib/agenda'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@/components/icons'

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

interface Props {
  // Período que está valendo (AAAA-MM-DD).
  ini: string
  fim: string
  onAplicar: (ini: string, fim: string) => void
  // Último dia que dá pra escolher (ex.: hoje, em relatório do que já
  // aconteceu). Sem ele, qualquer dia.
  dataMax?: string
  aberto: boolean
  onAberto: (aberto: boolean) => void
}

// Período "de — até" escolhido num calendário: o botão mostra o período que
// está valendo e abre o mês em grade (o mesmo do SeletorDataHora) pra
// marcar o primeiro e o último dia. Usado no "Personalizado" dos filtros de
// período dos relatórios (FiltroPeriodo).
export default function SeletorPeriodo({ ini, fim, onAplicar, dataMax, aberto, onAberto }: Props) {
  const raiz = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) onAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onAberto(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto, onAberto])

  return (
    <div className="periodo" ref={raiz}>
      <button
        type="button"
        className="btn btn-secondary btn-sm periodo-gatilho"
        onClick={() => onAberto(!aberto)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
      >
        <IconCalendar style={{ width: 14, height: 14 }} />
        {ini === fim ? dataBR(ini) : `${dataBR(ini)} – ${dataBR(fim)}`}
      </button>
      {/* A chave refaz o calendário quando o período que está valendo muda
          com ele aberto (ex.: acabou de entrar em "Personalizado"). */}
      {aberto && (
        <CalendarioPeriodo
          key={`${ini}|${fim}`}
          ini={ini}
          fim={fim}
          dataMax={dataMax}
          onCancelar={() => onAberto(false)}
          onAplicar={onAplicar}
        />
      )}
    </div>
  )
}

function CalendarioPeriodo({ ini, fim, dataMax, onCancelar, onAplicar }: {
  ini: string
  fim: string
  dataMax?: string
  onCancelar: () => void
  onAplicar: (ini: string, fim: string) => void
}) {
  const hoje = hojeBrasilISO()
  // `fim` nulo: o primeiro dia já foi marcado e falta o último.
  const [escolha, setEscolha] = useState<{ ini: string; fim: string | null }>({ ini, fim })
  const [mesAtual, setMesAtual] = useState(() => startOfMonth(new Date(`${fim}T12:00:00`)))
  const caixa = useRef<HTMLDivElement>(null)

  // Perto da borda direita da tela, a caixa recua pra caber inteira.
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const sobra = r.right - (window.innerWidth - 12)
    if (sobra > 0) el.style.marginLeft = `${-Math.min(sobra, Math.max(0, r.left - 12))}px`
  }, [])

  const dias = eachDayOfInterval({ start: startOfWeek(startOfMonth(mesAtual)), end: endOfWeek(endOfMonth(mesAtual)) })
  const podeAvancar = !dataMax || format(startOfMonth(addMonths(mesAtual, 1)), 'yyyy-MM-dd') <= dataMax

  function marcar(iso: string) {
    setEscolha(atual => {
      // Com o período completo (ou nada marcado), o clique começa outro.
      if (atual.fim !== null) return { ini: iso, fim: null }
      return iso < atual.ini ? { ini: iso, fim: atual.ini } : { ini: atual.ini, fim: iso }
    })
  }

  const ultimo = escolha.fim ?? escolha.ini
  const variosDias = escolha.fim !== null && escolha.fim !== escolha.ini

  return (
    <div className="periodo-popover" ref={caixa} role="dialog" aria-label="Escolher período">
      <div className="sdh-calendario">
        <div className="sdh-cabecalho">
          <button type="button" className="sdh-nav" onClick={() => setMesAtual(m => subMonths(m, 1))} aria-label="Mês anterior">
            <IconChevronLeft style={{ width: 14, height: 14 }} />
          </button>
          <span className="sdh-mes">{format(mesAtual, "MMMM 'de' yyyy", { locale: ptBR })}</span>
          <button type="button" className="sdh-nav" onClick={() => setMesAtual(m => addMonths(m, 1))} disabled={!podeAvancar} aria-label="Próximo mês">
            <IconChevronRight style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div className="sdh-semana">
          {DIAS_CURTOS.map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="sdh-dias">
          {dias.map(d => {
            const iso = format(d, 'yyyy-MM-dd')
            if (!isSameMonth(d, mesAtual)) return <span key={iso} />
            const ponta = iso === escolha.ini || iso === ultimo
            const dentro = escolha.fim !== null && iso > escolha.ini && iso < escolha.fim
            return (
              <button
                key={iso}
                type="button"
                className={[
                  'sdh-dia',
                  ponta ? 'is-selecionado' : '',
                  dentro ? 'is-intervalo' : '',
                  variosDias && iso === escolha.ini ? 'is-inicio' : '',
                  variosDias && iso === escolha.fim ? 'is-fim' : '',
                  iso === hoje ? 'is-hoje' : '',
                ].filter(Boolean).join(' ')}
                disabled={!!dataMax && iso > dataMax}
                onClick={() => marcar(iso)}
                aria-pressed={ponta || dentro}
              >
                {format(d, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      <div className="periodo-rodape">
        <span className="periodo-resumo">
          {escolha.fim === null ? (
            <>De <strong>{dataBR(escolha.ini)}</strong> — toque no último dia.</>
          ) : variosDias ? (
            <><strong>{dataBR(escolha.ini)}</strong> a <strong>{dataBR(escolha.fim)}</strong></>
          ) : (
            <>Só o dia <strong>{dataBR(escolha.ini)}</strong></>
          )}
        </span>
        <div className="periodo-acoes">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onAplicar(escolha.ini, ultimo)}>Aplicar</button>
        </div>
      </div>
    </div>
  )
}
