import { useCallback, useEffect, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Text } from '@/components/Texto'
import { dialogo } from '@/lib/dialogo'
import { mensagemDoBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { whatsappRetiradaCancelada, type RetiradaCancelada } from '@/lib/taxidog'
import { colors } from '@/theme/theme'

interface Espera {
  status: string
  chegou_em: string | null
  limite_min: number | null
  agora: string
}

function mmss(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Tempo limite de espera na retirada (migration 093) — o mesmo do site
// (petshop-app/src/components/lojista/EsperaRetirada.tsx). Enquanto o TaxiDog
// espera no endereço, mostra quanto falta; passado o limite da loja, aparece
// "Cancelar retirada": o banco confere o tempo, cancela o agendamento, e o
// WhatsApp abre com o aviso pronto para o cliente.
export function EsperaRetirada({ idCorrida, pet, onCancelada }: { idCorrida: string; pet?: string; onCancelada?: () => void }) {
  const [espera, setEspera] = useState<Espera | null>(null)
  const [diferenca, setDiferenca] = useState(0)
  const [agora, setAgora] = useState(() => Date.now())
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_espera_retirada', { p_id_corrida: idCorrida })
    if (error || !data) return
    const e = data as Espera
    setEspera(e)
    setDiferenca(new Date(e.agora).getTime() - Date.now())
  }, [idCorrida])

  useEffect(() => {
    void carregar()
    const recarregar = setInterval(() => void carregar(), 60_000)
    const relogio = setInterval(() => setAgora(Date.now()), 1_000)
    return () => { clearInterval(recarregar); clearInterval(relogio) }
  }, [carregar])

  if (!espera || espera.status !== 'no_endereco' || !espera.limite_min || !espera.chegou_em) return null

  const esperando = (agora + diferenca - new Date(espera.chegou_em).getTime()) / 1000
  const falta = espera.limite_min * 60 - esperando

  async function cancelar() {
    setErro(null)
    setCancelando(true)
    const { data, error } = await supabase.rpc('fn_cancelar_retirada_por_espera', { p_id_corrida: idCorrida })
    setCancelando(false)
    if (error) {
      setErro(mensagemDoBanco(error, 'Não foi possível cancelar a retirada.'))
      void carregar()
      return
    }
    const link = whatsappRetiradaCancelada(data as RetiradaCancelada)
    if (link) Linking.openURL(link).catch(() => {})
    onCancelada?.()
  }

  function confirmar() {
    const quem = pet ? `de ${pet}` : 'do pet'
    dialogo('Cancelar retirada', `Cancelar a retirada ${quem}? O agendamento de hoje será cancelado e o WhatsApp abre com o aviso para o cliente.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar retirada', style: 'destructive', onPress: () => void cancelar() },
    ])
  }

  return (
    <View style={styles.caixa}>
      {falta > 0 ? (
        <Text style={styles.apoio}>Aguardando o cliente · tempo limite em {mmss(falta)}</Text>
      ) : (
        <>
          <Text style={styles.esgotado}>Tempo de espera de {espera.limite_min} min esgotado.</Text>
          <BotaoPequeno variante="perigo" rotulo="Cancelar retirada" carregando={cancelando} desativado={cancelando} onPress={confirmar} />
        </>
      )}
      {erro && <Text style={styles.esgotado}>{erro}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  caixa: { gap: 6, marginTop: 8 },
  apoio: { fontSize: 12, color: colors.textMuted },
  esgotado: { fontSize: 12, color: colors.dangerFg },
})
