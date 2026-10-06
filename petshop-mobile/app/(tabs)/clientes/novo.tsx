import { useState } from 'react'
import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { mascaraCpf, mascaraTelefone, soDigitos } from '@/lib/mascaras'
import { colors, spacing, typography } from '@/theme/theme'

// Cliente cadastrado pela loja (balcão, telefone). A conta é criada por
// convite: o cliente recebe um e-mail e define a própria senha — a loja
// nunca informa senha de ninguém (cadastrarClienteLojistaAction).
export default function NovoClienteScreen() {
  const router = useRouter()
  const { contexto } = useAuth()
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [feito, setFeito] = useState(false)

  if (!contexto?.acessoTotal) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Novo cliente" />
        <SemPermissao area="cadastrar clientes" />
      </ScreenContainer>
    )
  }

  async function salvar() {
    if (nome.trim().length < 2) return setErro('Informe o nome.')
    if (soDigitos(cpf).length !== 11) return setErro('Informe o CPF com 11 dígitos.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro('Informe um e-mail válido.')
    if (soDigitos(telefone).length < 10) return setErro('Informe o telefone com DDD.')
    setErro(null)
    setSalvando(true)
    const r = await chamarAcao('cadastrarClienteLojistaAction', form({
      nome: nome.trim(),
      cpf: soDigitos(cpf),
      email: email.trim().toLowerCase(),
      telefone: soDigitos(telefone),
    }))
    setSalvando(false)
    if (r.error) return setErro(r.error)
    setFeito(true)
  }

  if (feito) {
    return (
      <ScreenContainer>
        <DetailHeader title="Novo cliente" />
        <View style={{ gap: spacing.md }}>
          <Aviso tipo="sucesso" texto={`${nome.trim()} foi cadastrado. O convite para criar a senha foi enviado para ${email.trim().toLowerCase()}.`} />
          <Aviso tipo="info" texto="Agora cadastre o pet na ficha do cliente — sem pet não dá para agendar." />
          <Botao rotulo="Concluir" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Novo cliente" />
      <View style={{ gap: spacing.md }}>
        {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} />}
        <Text style={{ ...typography.body.md, color: colors.textMuted }}>
          O cliente recebe um e-mail para criar a própria senha e acompanhar os agendamentos.
        </Text>
        <Campo rotulo="Nome completo" value={nome} onChangeText={setNome} maxLength={120} autoCapitalize="words" />
        <Campo rotulo="CPF" value={cpf} onChangeText={t => setCpf(mascaraCpf(t))} keyboardType="number-pad" placeholder="000.000.000-00" maxLength={14} />
        <Campo rotulo="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Campo rotulo="Telefone / WhatsApp" value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(11) 98765-4321" maxLength={15} />
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Botao rotulo="Cadastrar cliente" onPress={salvar} carregando={salvando} />
      </View>
    </ScreenContainer>
  )
}
