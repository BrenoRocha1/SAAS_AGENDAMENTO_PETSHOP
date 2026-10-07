import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { assinarComSessao } from '@/lib/realtime'
import { SOM_PADRAO, ouvirSomDaLoja, tocarSom, type SomDaLoja, type TipoSom } from '@/lib/sonsNotificacao'

// O alerta sonoro de agendamento novo — o mesmo do painel do site
// (NotificacaoNovoAgendamento). Sem nada na tela: fica ligado em toda a área
// da loja, porque a pessoa pode estar na Início, na agenda ou num cadastro
// quando o agendamento chega.
//
// Ouve só a criação (INSERT) de agendamento da loja: editar, mudar de etapa
// ou só abrir o app nunca tocam. Vale para qualquer origem — a própria loja,
// o cliente pelo app ou pelo link. Com o app fechado não toca (não é
// notificação do celular): é o aviso de quem está com ele aberto.
export function AvisoNovoAgendamento({ idLojista }: { idLojista: string }) {
  const [som, setSom] = useState<SomDaLoja | null>(null)
  // Se a conexão cair e o mesmo evento chegar de novo, não toca duas vezes.
  const jaAvisados = useRef<Set<string>>(new Set())

  // A configuração da loja; sem a coluna no banco (migration 036), vale o
  // padrão do site: ligado, Sino.
  useEffect(() => {
    let vivo = true
    supabase
      .from('lojista')
      .select('som_novo_agendamento_ativo, som_novo_agendamento_tipo')
      .eq('id_lojista', idLojista)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return
        const linha = data as { som_novo_agendamento_ativo: boolean | null; som_novo_agendamento_tipo: string | null } | null
        setSom({
          ativo: linha?.som_novo_agendamento_ativo ?? SOM_PADRAO.ativo,
          tipo: (linha?.som_novo_agendamento_tipo ?? SOM_PADRAO.tipo) as TipoSom,
        })
      })
    // Trocou na tela de Notificações: passa a valer na hora.
    const parar = ouvirSomDaLoja(setSom)
    return () => { vivo = false; parar() }
  }, [idLojista])

  const ativo = som?.ativo
  const tipo = som?.tipo
  useEffect(() => {
    if (!ativo || !tipo) return
    const canal = supabase
      .channel(`novo-agendamento-${idLojista}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agendamento', filter: `id_lojista=eq.${idLojista}` },
        payload => {
          const id = (payload.new as { id_agendamento?: string } | null)?.id_agendamento
          if (id) {
            if (jaAvisados.current.has(id)) return
            jaAvisados.current.add(id)
          }
          tocarSom(tipo)
        }
      )
    return assinarComSessao(canal)
  }, [idLojista, ativo, tipo])

  return null
}
