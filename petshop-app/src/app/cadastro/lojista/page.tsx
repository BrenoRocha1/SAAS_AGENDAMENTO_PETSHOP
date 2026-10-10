import { redirect } from 'next/navigation'

// Cadastro do petshop = a mesma tela de login, já em "Sou lojista": o login
// com o Google cria a conta na hora e segue para os dados da loja.
export default function CadastroLojistaPage() {
  redirect('/login?perfil=lojista')
}
