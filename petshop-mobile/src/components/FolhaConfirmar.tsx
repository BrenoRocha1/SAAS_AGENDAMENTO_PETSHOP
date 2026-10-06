import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Folha } from '@/components/Folha'
import { IconAlert } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'

interface Props {
  visivel: boolean
  titulo: string
  // Nome do que vai ser apagado: entra na pergunta, entre aspas e em negrito.
  nome?: string | null
  // false = nome sem aspas (pessoa, não coisa).
  aspas?: boolean
  // O que fecha a pergunta depois do nome (" da equipe?").
  depoisDoNome?: string
  // Pergunta inteira, quando não é a de excluir algo com nome.
  pergunta?: string
  // O resto da frase, depois de "Tem certeza que deseja excluir "X"?".
  children?: ReactNode
  rotulo?: string
  rotuloOcupado?: string
  ocupado?: boolean
  onConfirmar: () => void
  onFechar: () => void
}

// Janela de confirmação de exclusão do site no celular: a bolinha vermelha
// com o alerta, a pergunta ao lado e os botões "Excluir" e "Cancelar".
export function FolhaConfirmar({ visivel, titulo, nome, aspas = true, depoisDoNome = '?', pergunta, children, rotulo = 'Excluir', rotuloOcupado = 'Excluindo...', ocupado, onConfirmar, onFechar }: Props) {
  // Quem chama zera o item ao fechar; o nome fica guardado para a pergunta
  // não aparecer vazia enquanto a folha desce.
  const [mostrado, setMostrado] = useState(nome ?? '')
  if (nome && nome !== mostrado) setMostrado(nome)
  return (
    <Folha visivel={visivel} titulo={titulo} onFechar={onFechar} ocupado={ocupado}>
      <View style={styles.linha}>
        <View style={styles.bola}>
          <IconAlert size={18} color={colors.dangerFg} />
        </View>
        {pergunta ? (
          <Text style={styles.texto}>{pergunta}</Text>
        ) : (
          <Text style={styles.texto}>
            Tem certeza que deseja excluir <Text style={styles.forte}>{aspas ? `"${mostrado}"` : mostrado}</Text>{depoisDoNome} {children}
          </Text>
        )}
      </View>
      <View style={styles.rodape}>
        <BotaoPequeno normal variante="perigo" rotulo={ocupado ? rotuloOcupado : rotulo} desativado={ocupado} onPress={onConfirmar} />
        <BotaoPequeno normal rotulo="Cancelar" desativado={ocupado} onPress={onFechar} />
      </View>
    </Folha>
  )
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
