import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Folha } from '@/components/Folha'
import { IconSearch } from '@/components/IconesDoSite'
import { Text, TextInput } from '@/components/Texto'
import { iniciais } from '@/lib/format'
import { mascaraTelefone } from '@/lib/mascaras'
import { mensagemPdv, type ClientePdv } from '@/lib/pdv'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

interface Props {
  visivel: boolean
  onEscolher: (c: ClientePdv) => void
  onFechar: () => void
}

// Escolher o cliente da venda (opcional) — a janela "Cliente da venda" do
// caixa do site (ClienteModal): busca por nome ou telefone e a lista.
export function FolhaClientePdv({ visivel, onEscolher, onFechar }: Props) {
  const [busca, setBusca] = useState('')
  // `termo` diz de qual busca é a lista — se difere do que está digitado, ainda carrega.
  const [resultado, setResultado] = useState<{ termo: string; lista: ClientePdv[]; erro: string | null }>({
    termo: '\u0000', lista: [], erro: null,
  })

  useEffect(() => {
    if (!visivel) return
    let vivo = true
    const relogio = setTimeout(async () => {
      const { data, error } = await supabase.rpc('fn_pdv_buscar_clientes', { p_busca: busca.trim().slice(0, 60) || null })
      if (!vivo) return
      setResultado(error
        ? { termo: busca, lista: [], erro: mensagemPdv(error, 'Não foi possível buscar os clientes.') }
        : { termo: busca, lista: (data ?? []) as ClientePdv[], erro: null })
    }, 250)
    return () => { vivo = false; clearTimeout(relogio) }
  }, [busca, visivel])

  const carregando = resultado.termo !== busca

  return (
    <Folha visivel={visivel} titulo="Cliente da venda" onFechar={onFechar}>
      <View style={styles.busca}>
        <IconSearch size={18} color="#858d99" />
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por nome ou telefone"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          accessibilityLabel="Buscar cliente por nome ou telefone"
          style={styles.buscaCampo}
        />
      </View>

      <View style={styles.lista}>
        {resultado.erro ? (
          <Text style={styles.mensagem}>{resultado.erro}</Text>
        ) : carregando && resultado.lista.length === 0 ? (
          <Text style={styles.mensagem}>Buscando…</Text>
        ) : resultado.lista.length === 0 ? (
          <Text style={styles.mensagem}>Nenhum cliente encontrado.</Text>
        ) : (
          resultado.lista.map(c => (
            <Pressable
              key={c.id_cliente}
              onPress={() => onEscolher(c)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.opcao, pressed && styles.opcaoTocada]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarTexto}>{iniciais(c.nome).toUpperCase()}</Text>
              </View>
              <View style={styles.opcaoTextos}>
                <Text style={styles.nome} numberOfLines={1}>{c.nome}</Text>
                <Text style={styles.telefone}>{mascaraTelefone(c.telefone ?? '')}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <Text style={styles.nota}>Opcional — a venda também pode ser feita sem cliente.</Text>
    </Folha>
  )
}

const styles = StyleSheet.create({
  // `.pdv-busca`: 48 de altura, lupa por dentro.
  busca: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  buscaCampo: { flex: 1, height: '100%', fontSize: 16, color: colors.text },
  // `.pdv-clientes-lista`: sai 8 para cada lado, para o realce encostar.
  lista: { marginHorizontal: -8 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10.4, paddingHorizontal: 8, borderRadius: 6 },
  opcaoTocada: { backgroundColor: colors.surfaceMuted },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary50, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontSize: 13, lineHeight: 13, fontWeight: '700', color: colors.primary700 },
  opcaoTextos: { flex: 1, minWidth: 0 },
  nome: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text },
  telefone: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  mensagem: { paddingVertical: 24, textAlign: 'center', fontSize: 14, lineHeight: 22.4, color: '#858d99' },
  nota: { fontSize: 13, lineHeight: 20.8, color: '#858d99', textAlign: 'center' },
})
