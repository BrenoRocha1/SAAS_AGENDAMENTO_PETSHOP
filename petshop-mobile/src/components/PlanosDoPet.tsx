import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Card } from './Card'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Folha } from './Folha'
import { Opcao } from './Opcao'
import { SeletorDia } from './SeletorDia'
import { supabase } from '@/lib/supabase'
import { dataBR, dataExtensaISO, hojeBrasilISO } from '@/lib/agenda'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda } from '@/lib/format'
import { ROTULO_FORMA_PAGAMENTO, formasAtivas, normalizarFormasLoja, type FormaPagamento } from '@/lib/pagamento'
import { sufixoPeriodo, type Plano, type PlanoDoPet } from '@/lib/planos'
import { colors, spacing, typography } from '@/theme/theme'

interface Props {
  idPet: string
  idLojista: string
  // Dono ou administrador: pode vincular um plano ao pet.
  podeVincular: boolean
}

// Planos do pet (migration 060): o que ele tem hoje e quanto já usou no
// período, e "Vincular plano" (fn_assinar_plano). Sem a migration, ou
// sem plano e sem permissão de vincular, a seção nem aparece.
export function PlanosDoPet({ idPet, idLojista, podeVincular }: Props) {
  const hoje = hojeBrasilISO()
  const [planosDoPet, setPlanosDoPet] = useState<PlanoDoPet[] | null>(null)
  const [painel, setPainel] = useState(false)
  const [planos, setPlanos] = useState<Plano[] | null>(null)
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [idPlano, setIdPlano] = useState('')
  const [inicio, setInicio] = useState(hoje)
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_beneficios_do_pet', { p_id_pet: idPet, p_data: hoje })
    setPlanosDoPet(error ? null : ((data ?? []) as PlanoDoPet[]))
  }, [idPet, hoje])

  useEffect(() => { carregar() }, [carregar])

  async function abrir() {
    setErro(null)
    setIdPlano('')
    setInicio(hoje)
    setPainel(true)
    const [planosRes, formasRes] = await Promise.all([
      supabase.rpc('fn_planos_da_loja'),
      supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }),
    ])
    if (planosRes.error) setErro(mensagemDoBanco(planosRes.error, 'Não foi possível carregar os planos.'))
    setPlanos(((planosRes.data ?? []) as Plano[]).filter(p => p.ativo).map(p => ({ ...p, valor: Number(p.valor) })))
    const ativas = formasAtivas(normalizarFormasLoja(formasRes.data))
    setFormas(ativas)
    setForma(ativas.length === 1 ? ativas[0] : '')
  }

  async function vincular() {
    if (!idPlano) return setErro('Escolha o plano.')
    setErro(null)
    setSalvando(true)
    const { error } = await supabase.rpc('fn_assinar_plano', {
      p_id_plano: idPlano,
      p_id_pet: idPet,
      p_data_inicio: inicio,
      p_forma_pagamento: forma || null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemDoBanco(error, 'Não foi possível vincular o plano.'))
    setPainel(false)
    carregar()
  }

  if (planosDoPet === null) return null
  if (planosDoPet.length === 0 && !podeVincular) return null

  return (
    <View style={styles.bloco}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>Planos</Text>
        {podeVincular && <Botao rotulo="Vincular plano" icone="add" variante="secundario" compacto onPress={abrir} />}
      </View>

      {planosDoPet.length === 0 ? (
        <Text style={styles.sub}>Este pet não tem plano ativo.</Text>
      ) : (
        planosDoPet.map(p => (
          <Card key={p.id_assinatura} style={{ gap: 4 }}>
            <Text style={styles.nome}>{p.plano}</Text>
            {p.periodo_fim ? (
              <>
                <Text style={styles.sub}>Período até {dataBR(p.periodo_fim)}</Text>
                {p.beneficios.map(b => (
                  <Text key={b.id_servico} style={styles.sub}>
                    {b.servico}: {Number(b.usados)} de {b.quantidade} {b.quantidade === 1 ? 'uso' : 'usos'}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={styles.sub}>Sem período em andamento hoje.</Text>
            )}
          </Card>
        ))
      )}

      <Folha visivel={painel} titulo="Vincular plano ao pet" onFechar={() => setPainel(false)} ocupado={salvando}>
        {erro && <Aviso tipo="erro" texto={erro} />}
        {planos === null ? (
          <Text style={styles.sub}>Carregando…</Text>
        ) : planos.length === 0 ? (
          <Aviso tipo="alerta" texto="A loja não tem plano ativo. Crie um em Mais → Planos." />
        ) : (
          <>
            <View style={{ gap: spacing.sm }}>
              {planos.map(p => (
                <Opcao
                  key={p.id_plano}
                  titulo={p.nome}
                  detalhe={p.servicos.map(s => `${s.quantidade}× ${s.servico}`).join(' · ')}
                  lateral={`${formatarMoeda(p.valor)}${sufixoPeriodo(p.periodicidade, p.intervalo_dias)}`}
                  selecionada={idPlano === p.id_plano}
                  onPress={() => setIdPlano(p.id_plano)}
                />
              ))}
            </View>

            <Text style={styles.rotulo}>Começa em</Text>
            <SeletorDia inicio={hoje} dias={60} valor={inicio} onChange={setInicio} />
            <Text style={styles.sub}>{dataExtensaISO(inicio)}</Text>

            {formas.length > 0 && (
              <>
                <Text style={styles.rotulo}>Forma de pagamento (opcional)</Text>
                <View style={{ gap: spacing.sm }}>
                  {formas.map(f => (
                    <Opcao key={f} titulo={ROTULO_FORMA_PAGAMENTO[f]} selecionada={forma === f} onPress={() => setForma(atual => (atual === f ? '' : f))} />
                  ))}
                </View>
              </>
            )}
            <Botao rotulo="Vincular plano" onPress={vincular} carregando={salvando} />
          </>
        )}
      </Folha>
    </View>
  )
}

const styles = StyleSheet.create({
  bloco: { gap: spacing.md, marginBottom: spacing.lg },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { ...typography.heading.sm, color: colors.text },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  sub: { ...typography.body.md, color: colors.textMuted },
  rotulo: { ...typography.label.md, color: colors.textDim },
})
