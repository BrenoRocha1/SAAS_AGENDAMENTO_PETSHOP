import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Folha } from '@/components/Folha'
import { IconAlert } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'

interface Props {
  visivel: boolean
  titulo: string
  // A pergunta. O nome do que vai ser apagado vai dentro de <Forte>.
  children: ReactNode
  rotulo?: string
  rotuloOcupado?: string
  ocupado?: boolean
  onConfirmar: () => void
  onFechar: () => void
}

// Janela de confirmação de exclusão do site no celular: a bolinha vermelha
// com o alerta, a pergunta ao lado e os botões "Excluir" e "Cancelar".
export function FolhaConfirmar({ visivel, titulo, children, rotulo = 'Excluir', rotuloOcupado = 'Excluindo...', ocupado, onConfirmar, onFechar }: Props) {
  return (
    <Folha visivel={visivel} titulo={titulo} onFechar={onFechar} ocupado={ocupado}>
      <View style={styles.linha}>
        <View style={styles.bola}>
          <IconAlert size={18} color={colors.dangerFg} />
        </View>
        <Text style={styles.texto}>{children}</Text>
      </View>
      <View style={styles.rodape}>
        <BotaoPequeno normal variante="perigo" rotulo={ocupado ? rotuloOcupado : rotulo} desativado={ocupado} onPress={onConfirmar} />
        <BotaoPequeno normal rotulo="Cancelar" desativado={ocupado} onPress={onFechar} />
      </View>
    </Folha>
  )
}

export function Forte({ children }: { children: ReactNode }) {
  return <Text style={styles.forte}>{children}</Text>
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bola: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { flex: 1, fontSize: 16, lineHeight: 25.6, color: '#1f2937' },
  forte: { fontWeight: '700', color: colors.text },
  // A Folha deixa 24 no fim; janela com botões no pé (`.modal-footer`) deixa 16.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
