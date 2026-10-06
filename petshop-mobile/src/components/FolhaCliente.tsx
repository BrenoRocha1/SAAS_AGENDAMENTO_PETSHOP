import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { IconUsers } from '@/components/IconesDoSite'
import { chamarAcao, form } from '@/lib/acoes'
import { mascaraCpf, mascaraTelefone, soDigitos } from '@/lib/mascaras'

interface Props {
  visivel: boolean
  // Com cliente = editar nome e telefone; sem = convidar um cliente novo.
  cliente?: { id_cliente: string; nome: string; telefone: string } | null
  onFechar: () => void
  // Chamado depois de gravar (na edição, com o que mudou).
  onSalvo: (dados?: { nome: string; telefone: string }) => void
}

// A janela "Novo Cliente / Editar …" do site (ClienteFormModal). Cliente
// novo entra por convite: recebe um e-mail e define a própria senha — a
// loja nunca informa senha de ninguém (cadastrarClienteLojistaAction).
export function FolhaCliente({ visivel, cliente, onFechar, onSalvo }: Props) {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [convidado, setConvidado] = useState(false)

  // Cada abertura começa do zero (ou dos dados de quem vai ser editado).
  useEffect(() => {
    if (!visivel) return
    setNome(cliente?.nome ?? '')
    setTelefone(cliente ? mascaraTelefone(cliente.telefone) : '')
    setCpf('')
    setEmail('')
    setErro(null)
    setConvidado(false)
  }, [visivel, cliente])

  async function salvar() {
    const tel = soDigitos(telefone)
    if (nome.trim().length < 2) return setErro('Informe o nome.')
    if (!cliente && soDigitos(cpf).length !== 11) return setErro('Informe o CPF com 11 dígitos.')
    if (tel.length < 10) return setErro('Informe o telefone com DDD.')
    if (!cliente && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro('Informe um e-mail válido.')
    setErro(null)
    setSalvando(true)
    const r = cliente
      ? await chamarAcao('editarClienteLojistaAction', cliente.id_cliente, form({ nome: nome.trim(), telefone: tel }))
      : await chamarAcao('cadastrarClienteLojistaAction', form({ nome: nome.trim(), cpf: soDigitos(cpf), email: email.trim().toLowerCase(), telefone: tel }))
    setSalvando(false)
    if (r.error) return setErro(r.error)
    if (cliente) onSalvo({ nome: nome.trim(), telefone: tel })
    else setConvidado(true)
  }

  if (convidado) {
    return (
      <Folha visivel={visivel} titulo="Convite enviado" onFechar={() => onSalvo()}>
        <Aviso tipo="sucesso" texto="O cliente já aparece na sua lista e recebeu um e-mail para definir a própria senha e acessar o sistema." />
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo="Fechar" onPress={() => onSalvo()} />
        </View>
      </Folha>
    )
  }

  return (
    <Folha visivel={visivel} titulo={cliente ? `Editar ${cliente.nome}` : 'Novo Cliente'} icone={IconUsers} onFechar={onFechar} ocupado={salvando}>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Campo rotulo="Nome completo" obrigatorio value={nome} onChangeText={setNome} placeholder="Maria Silva" maxLength={120} autoCapitalize="words" editable={!salvando} />
      {cliente ? (
        <Campo
          rotulo="Telefone"
          obrigatorio
          value={telefone}
          onChangeText={t => setTelefone(mascaraTelefone(t))}
          keyboardType="phone-pad"
          placeholder="(11) 99999-9999"
          maxLength={15}
          editable={!salvando}
          ajuda="E-mail e CPF não são editáveis por aqui — e-mail é o login do cliente."
        />
      ) : (
        <>
          <Campo rotulo="CPF" obrigatorio value={cpf} onChangeText={t => setCpf(mascaraCpf(t))} keyboardType="number-pad" placeholder="000.000.000-00" maxLength={14} editable={!salvando} />
          <Campo rotulo="Telefone" obrigatorio value={telefone} onChangeText={t => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(11) 99999-9999" maxLength={15} editable={!salvando} />
          <Campo
            rotulo="E-mail (será usado para login)"
            obrigatorio
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="cliente@email.com"
            editable={!salvando}
            ajuda="O cliente vai receber um e-mail nesse endereço para definir a própria senha"
          />
        </>
      )}
      <View style={styles.rodape}>
        <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : cliente ? 'Salvar Alterações' : 'Convidar Cliente'} desativado={salvando} onPress={salvar} />
        <BotaoPequeno normal variante="fantasma" rotulo="Cancelar" desativado={salvando} onPress={onFechar} />
      </View>
    </Folha>
  )
}

const styles = StyleSheet.create({
  // A Folha deixa 24 no fim; janela com botões no pé (`.modal-footer`) deixa 16.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
