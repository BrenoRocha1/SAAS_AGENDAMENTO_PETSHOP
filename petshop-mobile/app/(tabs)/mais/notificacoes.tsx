import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { IconBell, IconPlay, IconSave } from '@/components/IconesDoSite'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { SONS_DISPONIVEIS, SOM_PADRAO, avisarSomDaLoja, tocarSom, type TipoSom } from '@/lib/sonsNotificacao'
import { supabase } from '@/lib/supabase'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

// Notificações da loja — a mesma página do site (Configurações →
// Notificações): liga/desliga o alerta sonoro de agendamento novo e escolhe
// qual dos cinco sons toca (migration 036). Só dono ou administrador muda.
export default function NotificacoesScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal

  // O que está salvo, para saber se houve mudança.
  const [salvo, setSalvo] = useState(SOM_PADRAO)
  const [ativo, setAtivo] = useState(SOM_PADRAO.ativo)
  const [tipo, setTipo] = useState<TipoSom>(SOM_PADRAO.tipo)
  const [carregando, setCarregando] = useState(true)
  const [semMigration, setSemMigration] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const { data, error } = await supabase
      .from('lojista')
      .select('som_novo_agendamento_ativo, som_novo_agendamento_tipo')
      .eq('id_lojista', idLojista)
      .maybeSingle()
    // Sem a coluna no banco, a tela mostra o padrão (ligado, Sino) e avisa.
    setSemMigration(!!error)
    const linha = data as { som_novo_agendamento_ativo: boolean | null; som_novo_agendamento_tipo: string | null } | null
    const atual = {
      ativo: linha?.som_novo_agendamento_ativo ?? SOM_PADRAO.ativo,
      tipo: (linha?.som_novo_agendamento_tipo ?? SOM_PADRAO.tipo) as TipoSom,
    }
    setSalvo(atual)
    setAtivo(atual.ativo)
    setTipo(atual.tipo)
    setCarregando(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current) }, [])

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Notificações" />
        <SemPermissao area="mudar as configurações da loja" />
      </ScreenContainer>
    )
  }

  const houveMudanca = ativo !== salvo.ativo || tipo !== salvo.tipo

  async function salvar() {
    if (!idLojista) return
    setErro(null)
    setSucesso(false)
    setSalvando(true)
    // O dono grava direto na loja dele. Um administrador da equipe não tem
    // essa permissão no banco: aí quem grava é o site, que confere o acesso.
    const { data, error } = await supabase
      .from('lojista')
      .update({ som_novo_agendamento_ativo: ativo, som_novo_agendamento_tipo: tipo })
      .eq('id_lojista', idLojista)
      .select('id_lojista')
    let falha: string | undefined
    if (error || !data || data.length === 0) {
      falha = acoesDisponiveis()
        ? (await chamarAcao('atualizarSomNotificacaoAction', form({ ativo: String(ativo), tipo }))).error
        : 'Não foi possível salvar. Tente novamente.'
    }
    setSalvando(false)
    if (falha) return setErro(falha)

    setSalvo({ ativo, tipo })
    // O aviso de agendamento novo já passa a usar o que foi salvo.
    avisarSomDaLoja({ ativo, tipo })
    setSucesso(true)
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = setTimeout(() => setSucesso(false), 3000)
  }

  return (
    <ScreenContainer refreshing={carregando} onRefresh={carregar}>
      <DetailHeader title="Notificações" />

      {carregando ? null : (
        <View style={styles.cartao}>
          {semMigration && (
            <Aviso
              tipo="alerta"
              texto="Esta configuração ainda não foi criada no banco. Peça para rodar a migration 036_som_novo_agendamento.sql — até lá, o som segue no padrão (ativado, Sino)."
              style={styles.aviso}
            />
          )}
          {sucesso && <Aviso tipo="sucesso" texto="Configuração salva!" style={styles.aviso} />}
          {erro && <Aviso tipo="erro" texto={erro} style={styles.aviso} />}

          {/* Novos agendamentos — liga/desliga */}
          <View style={styles.linha}>
            <View style={styles.linhaTexto}>
              <View style={styles.sino}>
                <IconBell size={17} color="#4b5563" />
              </View>
              <View style={styles.textos}>
                <Text style={styles.titulo}>Novos agendamentos</Text>
                <Text style={styles.descricao}>
                  Receba um alerta sonoro sempre que um novo agendamento for criado — o som toca em qualquer tela do
                  painel, para todo mundo com acesso à agenda logado no momento.
                </Text>
              </View>
            </View>
            <Interruptor
              value={ativo}
              onValueChange={setAtivo}
              disabled={salvando}
              accessibilityLabel={ativo ? 'Desativar som de novos agendamentos' : 'Ativar som de novos agendamentos'}
            />
          </View>

          <View style={styles.separador} />

          {/* Escolha do som */}
          <Text style={styles.subtitulo}>Escolha o som</Text>
          <View style={styles.sons} accessibilityRole="radiogroup">
            {SONS_DISPONIVEIS.map(som => {
              const escolhido = tipo === som.valor
              return (
                <Pressable
                  key={som.valor}
                  onPress={() => setTipo(som.valor)}
                  disabled={salvando}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: escolhido, disabled: salvando }}
                  style={styles.som}
                >
                  <View style={[styles.radio, escolhido && styles.radioEscolhido]}>
                    {escolhido && <View style={styles.radioMiolo} />}
                  </View>
                  <Text style={styles.somRotulo}>{som.rotulo}</Text>
                  <BotaoPequeno rotulo="Ouvir" icone={IconPlay} tamanhoDoIcone={11} onPress={() => tocarSom(som.valor)} />
                </Pressable>
              )
            })}
          </View>

          <View style={styles.rodape}>
            <BotaoPequeno
              normal
              variante="primario"
              rotulo={salvando ? 'Salvando...' : 'Salvar alterações'}
              icone={salvando ? undefined : IconSave}
              desativado={salvando || !houveMudanca}
              onPress={salvar}
              // Desativado, o `.btn` do site fica a 50%.
              style={(salvando || !houveMudanca) && styles.parado}
            />
          </View>
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  cartao: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  aviso: { marginBottom: 20 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  linhaTexto: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  // `.dash-icon-btn`: quadrado branco de 40 com borda.
  sino: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1 },
  titulo: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  descricao: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  separador: { height: 1, backgroundColor: colors.border, marginVertical: 24 },
  subtitulo: { fontFamily: FONTE_TITULO, fontSize: 15.2, lineHeight: 19, fontWeight: '600', color: '#1f2937', marginBottom: 12 },
  sons: { gap: 8 },
  // `.som-notificacao-opcao`: faixa cinza com a bolinha, o nome e o "Ouvir".
  som: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 6, backgroundColor: colors.border },
  // A bolinha de escolha do navegador, com a cor do site (--primary-500).
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#767676', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  radioEscolhido: { borderWidth: 1.5, borderColor: colors.primary500 },
  radioMiolo: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary500 },
  somRotulo: { flex: 1, fontSize: 16, lineHeight: 25.6, fontWeight: '500', color: colors.text },
  rodape: { alignItems: 'flex-end', marginTop: 24 },
  parado: { opacity: 0.5 },
})
