'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  cadastroClienteSchema,
  cadastroLojistSchema,
  loginSchema,
  petSchema,
  petLojistaSchema,
  servicoSchema,
  servicoVariacaoSchema,
  horarioSchema,
  agendamentoSchema,
  agendamentoLojistaSchema,
  funcionarioSchema,
  editarFuncionarioSchema,
} from '@/lib/validations'
import type { ServicoVariacaoData } from '@/lib/validations'

// ============================================================
// HELPER: erro com detalhe técnico em dev
// ============================================================
// Em produção o usuário só vê a mensagem amigável (não vaza detalhe
// interno). Em dev (`npm run dev`), gruda a causa técnica real (mensagem
// do Supabase/Postgres) na mesma string, pra debugar sem precisar ficar
// catando log no terminal — some sozinho no build de produção.
function devError(mensagemAmigavel: string, detalheTecnico?: string | null) {
  if (process.env.NODE_ENV !== 'production' && detalheTecnico) {
    return `${mensagemAmigavel} [DEV: ${detalheTecnico}]`
  }
  return mensagemAmigavel
}

// ============================================================
// AUTH ACTIONS
// ============================================================

export async function loginAction(formData: FormData) {
  const raw = {
    email: formData.get('email') as string,
    senha: formData.get('senha') as string,
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (error) {
    return { error: 'E-mail ou senha incorretos' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  let role = user?.user_metadata?.role

  // Fallback: se o role não estiver no metadata (contas antigas ou timing de auth),
  // busca da tabela perfil_usuario que é a fonte de verdade
  if (!role && user) {
    const { data: perfil } = await supabase
      .from('perfil_usuario')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = perfil?.role

    // Fallback final: verifica diretamente nas tabelas lojista/cliente/funcionario
    if (!role) {
      const { data: lojista } = await supabase
        .from('lojista')
        .select('id_lojista')
        .eq('id_lojista', user.id)
        .maybeSingle()
      if (lojista) {
        role = 'lojista'
      } else {
        const { data: funcionario } = await supabase
          .from('funcionario')
          .select('id_funcionario')
          .eq('id_funcionario', user.id)
          .eq('ativo', true)
          .maybeSingle()
        if (funcionario) {
          role = 'funcionario'
        } else {
          role = 'cliente'
        }
      }
    }
  }

  // Verificar se funcionário está ativo
  if (role === 'funcionario') {
    const { data: func } = await supabase
      .from('funcionario')
      .select('ativo')
      .eq('id_funcionario', user!.id)
      .maybeSingle()
    if (!func?.ativo) {
      await supabase.auth.signOut()
      return { error: 'Sua conta de funcionário foi desativada. Entre em contato com o responsável pelo petshop.' }
    }
  }

  revalidatePath('/', 'layout')

  if (role === 'lojista') redirect('/lojista/dashboard')
  if (role === 'funcionario') redirect('/funcionario/dashboard')
  redirect('/cliente/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function cadastroClienteAction(formData: FormData) {
  const raw = {
    nome: formData.get('nome') as string,
    cpf: (formData.get('cpf') as string).replace(/\D/g, ''),
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
  }

  const parsed = cadastroClienteSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.senha,
    options: {
      data: { role: 'cliente', nome: parsed.data.nome },
    },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { error: 'Este e-mail já está cadastrado' }
    }
    return { error: devError('Erro ao criar conta. Tente novamente.', authError.message) }
  }

  if (!authData.user) {
    return { error: 'Erro interno. Tente novamente.' }
  }

  // Inserir na tabela cliente usando admin client (bypassa RLS pois a sessão
  // ainda não foi propagada imediatamente após o signUp)
  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.' }
  }

  const { error: clienteError } = await adminClient.from('cliente').insert({
    id_cliente: authData.user.id,
    nome: parsed.data.nome,
    cpf: parsed.data.cpf,
    email: parsed.data.email,
    telefone: parsed.data.telefone,
  })

  if (clienteError) {
    // Rollback: remover usuário criado
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { error: 'Não foi possível finalizar o cadastro. Tente novamente ou entre em contato com o suporte.' }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FIX: Estabelecer sessão nos cookies ANTES do redirect.
  // O signUp cria o usuário mas não propaga o JWT nos cookies do response.
  // Sem este signIn, o middleware bloqueará o acesso ao dashboard.
  // ──────────────────────────────────────────────────────────────────────────
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (signInError) {
    // O cadastro foi feito com sucesso, mas não conseguimos logar automaticamente.
    // Redirecionar para login para o usuário entrar manualmente.
    console.error('[cadastroClienteAction] signIn pós-cadastro falhou:', signInError.message)
    redirect('/login')
  }

  revalidatePath('/', 'layout')
  redirect('/cliente/dashboard')
}

export async function cadastroLojistaAction(formData: FormData) {
  // Campos opcionais do schema (descricao/endereco/cidade/estado/cep) só devem
  // ir para o Zod como `undefined` quando não preenchidos. Vindos de <input>/
  // <select> vazios eles chegam como string vazia (""), e `.optional()` não
  // trata "" como ausente — "" ainda cai nas validações de tamanho (ex.:
  // estado com .length(2)), gerando um erro confuso pro usuário mesmo com o
  // campo em branco, que é justamente o comportamento esperado.
  const raw = {
    nome_loja: formData.get('nome_loja') as string,
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    descricao: (formData.get('descricao') as string) || undefined,
    endereco: (formData.get('endereco') as string) || undefined,
    cidade: (formData.get('cidade') as string) || undefined,
    estado: (formData.get('estado') as string) || undefined,
    cep: (formData.get('cep') as string).replace(/\D/g, '') || undefined,
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
  }

  const parsed = cadastroLojistSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Admin client — obrigatório para:
  // 1. Criar o usuário Auth via admin API (evita ID fake do signUp normal)
  // 2. Chamar o RPC sem depender do JWT da sessão atual
  // 3. Rollback (deletar usuário Auth órfão se o INSERT falhar)
  const adminClient = createAdminClient()
  if (!adminClient) {
    return {
      error: 'Serviço indisponível: chave de servidor não configurada (SUPABASE_SERVICE_ROLE_KEY). Entre em contato com o suporte.'
    }
  }

  // ── PASSO 1: Verificar duplicata de e-mail na tabela lojista ──────────────
  const { data: existente } = await adminClient
    .from('lojista')
    .select('id_lojista')
    .eq('email', parsed.data.email)
    .maybeSingle()

  if (existente) {
    return { error: 'Este e-mail já está cadastrado como lojista. Acesse a tela de login.' }
  }

  // ── PASSO 2: Criar usuário em auth.users via Admin API ────────────────────
  // Por que admin.createUser e não supabase.auth.signUp?
  // • signUp com email já existente retorna um ID *fake* (prevenção de enumeração)
  //   → esse ID não existe em auth.users → viola a FK da tabela lojista
  // • admin.createUser falha explicitamente se o email já existir
  // • email_confirm:true pula a etapa de confirmação → signIn funciona imediatamente
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.senha,
    email_confirm: true,
    user_metadata: { role: 'lojista', nome_loja: parsed.data.nome_loja },
  })

  if (authError) {
    console.error('[cadastroLojistaAction] admin.createUser error:', authError)
    const msg = authError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate') || msg.includes('registered')) {
      return { error: 'Este e-mail já está cadastrado. Acesse a tela de login para entrar na sua conta.' }
    }
    if (msg.includes('password') || msg.includes('weak')) {
      return { error: 'Senha inválida. Use pelo menos 8 caracteres com maiúscula, número e símbolo.' }
    }
    if (msg.includes('rate limit')) {
      return { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' }
    }
    return { error: `Não foi possível criar a conta: ${authError.message}. Verifique os dados e tente novamente.` }
  }

  if (!authData.user?.id) {
    return { error: 'Erro interno ao criar conta. Tente novamente.' }
  }

  // ── PASSO 3: Inserir na tabela lojista via RPC (sempre com adminClient) ───
  // adminClient usa service_role → não depende de JWT/sessão ativa
  const { error: rpcError } = await adminClient.rpc('fn_registrar_lojista', {
    p_id_lojista: authData.user.id,
    p_nome_loja: parsed.data.nome_loja,
    p_email: parsed.data.email,
    p_telefone: parsed.data.telefone,
    p_descricao: parsed.data.descricao ?? null,
    p_endereco: parsed.data.endereco ?? null,
    p_cidade: parsed.data.cidade ?? null,
    p_estado: parsed.data.estado ?? null,
    p_cep: parsed.data.cep ?? null,
  })

  if (rpcError) {
    console.error('[cadastroLojistaAction] RPC error:', rpcError)
    // Rollback: remove o usuário Auth para não deixar registro órfão
    await adminClient.auth.admin.deleteUser(authData.user.id)

    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists') || msg.includes('23505')) {
      return { error: 'Este e-mail já está cadastrado. Acesse a tela de login.' }
    }
    if (msg.includes('Could not find') || msg.includes('does not exist') || msg.includes('42883')) {
      return { error: 'Erro de configuração: função fn_registrar_lojista não encontrada no banco. Execute as migrations.' }
    }
    if (msg.includes('permission denied') || msg.includes('42501')) {
      return { error: 'Permissão negada no banco de dados. Verifique as configurações do Supabase.' }
    }
    return { error: `Não foi possível salvar os dados: ${msg || 'erro desconhecido'}. Tente novamente.` }
  }

  // ── PASSO 4: Estabelecer sessão para o redirect ───────────────────────────
  // O adminClient não lida com cookies/sessão do browser.
  // Usamos o supabase client normal para fazer signIn e gravar o JWT nos cookies.
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (signInError) {
    // Cadastro salvo com sucesso, mas sessão não foi estabelecida.
    // Redireciona para login para o usuário entrar manualmente.
    console.error('[cadastroLojistaAction] signIn pós-cadastro falhou:', signInError.message)
    redirect('/login')
  }

  revalidatePath('/', 'layout')
  redirect('/lojista/dashboard')
}



// ============================================================
// PET ACTIONS
// ============================================================

export async function criarPetAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const raw = {
    nome: formData.get('nome') as string,
    raca: formData.get('raca') as string,
    sexo: formData.get('sexo') as string,
    especie: (formData.get('especie') as string) || undefined,
    porte: (formData.get('porte') as string) || undefined,
    dt_nasc: formData.get('dt_nasc') as string,
    peso: formData.get('peso') ? parseFloat(formData.get('peso') as string) : undefined,
    obs: formData.get('obs') as string,
  }

  const parsed = petSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.from('pet').insert({
    id_cliente: user.id,
    ...parsed.data,
  })

  if (error) return { error: 'Erro ao cadastrar pet.' }

  revalidatePath('/cliente/pets')
  return { success: true }
}

export async function editarPetAction(id_pet: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const raw = {
    nome: formData.get('nome') as string,
    raca: formData.get('raca') as string,
    sexo: formData.get('sexo') as string,
    especie: (formData.get('especie') as string) || undefined,
    porte: (formData.get('porte') as string) || undefined,
    dt_nasc: formData.get('dt_nasc') as string,
    peso: formData.get('peso') ? parseFloat(formData.get('peso') as string) : undefined,
    obs: formData.get('obs') as string,
  }

  const parsed = petSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('pet')
    .update(parsed.data)
    .eq('id_pet', id_pet)
    .eq('id_cliente', user.id)

  if (error) return { error: 'Erro ao atualizar pet.' }

  revalidatePath('/cliente/pets')
  return { success: true }
}

export async function desativarPetAction(id_pet: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('pet')
    .update({ ativo: false })
    .eq('id_pet', id_pet)
    .eq('id_cliente', user.id)

  if (error) return { error: 'Erro ao remover pet.' }

  revalidatePath('/cliente/pets')
  return { success: true }
}

// ============================================================
// SERVIÇO ACTIONS (Lojista)
// ============================================================

export async function criarServicoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    descricao: formData.get('descricao') as string,
    preco: parseFloat(formData.get('preco') as string),
    duracao: parseInt(formData.get('duracao') as string),
    status: (formData.get('status') as string) || 'Ativo',
  }

  const parsed = servicoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // "Preços e Variações" podem vir junto já na criação (rascunho montado
  // no cliente antes de existir id_servico) — valida tudo ANTES de criar
  // o serviço, pra não salvar o serviço com variação inválida silenciosa.
  const variacoesRaw = formData.get('variacoes') as string | null
  const variacoesParsed: ServicoVariacaoData[] = []
  if (variacoesRaw) {
    let lista: unknown[]
    try {
      lista = JSON.parse(variacoesRaw)
    } catch {
      return { error: 'Dados de variação de preço inválidos.' }
    }
    for (const item of lista) {
      const r = servicoVariacaoSchema.safeParse(item)
      if (!r.success) return { error: `Variação de preço inválida: ${r.error.issues[0].message}` }
      variacoesParsed.push(r.data)
    }
  }

  const { data: novoServico, error } = await supabase
    .from('servico')
    .insert({ id_lojista: user.id, ...parsed.data })
    .select('id_servico')
    .single()

  if (error || !novoServico) return { error: 'Erro ao cadastrar serviço.' }

  if (variacoesParsed.length > 0) {
    const { error: variacaoError } = await supabase.from('servico_variacao').insert(
      variacoesParsed.map(v => ({ id_servico: novoServico.id_servico, ...v }))
    )
    if (variacaoError) {
      revalidatePath('/lojista/servicos')
      return {
        error: 'Serviço criado, mas não foi possível salvar as variações de preço (talvez duplicadas). Edite o serviço para ajustar.',
      }
    }
  }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

export async function editarServicoAction(id_servico: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    descricao: formData.get('descricao') as string,
    preco: parseFloat(formData.get('preco') as string),
    duracao: parseInt(formData.get('duracao') as string),
    status: (formData.get('status') as string) || 'Ativo',
  }

  const parsed = servicoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('servico')
    .update(parsed.data)
    .eq('id_servico', id_servico)
    .eq('id_lojista', user.id)

  if (error) return { error: 'Erro ao atualizar serviço.' }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

// Exclusão de verdade (não é o toggle de status Ativo/Inativo). Só é
// possível quando o serviço nunca teve nenhum agendamento (nem
// cancelado) — a FK agendamento.id_servico é ON DELETE RESTRICT de
// propósito, pra nunca perder histórico. Por isso a checagem prévia
// aqui, pra devolver uma mensagem clara em vez do erro cru do banco.
export async function excluirServicoAction(id_servico: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const { count } = await supabase
    .from('agendamento')
    .select('id_agendamento', { count: 'exact', head: true })
    .eq('id_servico', id_servico)

  if (count && count > 0) {
    return {
      error: 'Este serviço já tem agendamentos (inclusive cancelados) e não pode ser excluído. Marque-o como "Inativo" em vez de excluir.',
    }
  }

  const { error } = await supabase
    .from('servico')
    .delete()
    .eq('id_servico', id_servico)
    .eq('id_lojista', user.id)

  if (error) {
    if (error.code === '23503') {
      return { error: 'Este serviço tem agendamentos vinculados e não pode ser excluído. Marque-o como "Inativo" em vez de excluir.' }
    }
    return { error: 'Erro ao excluir serviço.' }
  }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

// "Preços e Variações": cobrar diferente por porte ou por raça
// específica para um serviço já existente. Ver migration 010
// (servico_variacao) e fn_calcular_preco_servico.
export async function adicionarVariacaoServicoAction(id_servico: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const tipo = formData.get('tipo') as string
  const raw = tipo === 'raca'
    ? {
        tipo: 'raca' as const,
        especie: formData.get('especie') as string,
        raca: formData.get('raca') as string,
        preco: parseFloat(formData.get('preco') as string),
      }
    : {
        tipo: 'porte' as const,
        especie: formData.get('especie') as string,
        porte: formData.get('porte') as string,
        preco: parseFloat(formData.get('preco') as string),
      }

  const parsed = servicoVariacaoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Confere que o serviço é do lojista logado antes de inserir (defense
  // in depth — a policy de INSERT já garante isso, mas dá pra devolver
  // uma mensagem melhor aqui).
  const { data: servico } = await supabase
    .from('servico')
    .select('id_servico')
    .eq('id_servico', id_servico)
    .eq('id_lojista', user.id)
    .maybeSingle()
  if (!servico) return { error: 'Serviço não encontrado' }

  const { error } = await supabase.from('servico_variacao').insert({
    id_servico,
    ...parsed.data,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Já existe uma faixa de preço cadastrada para essa combinação.' }
    }
    return { error: 'Erro ao cadastrar variação de preço.' }
  }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

export async function removerVariacaoServicoAction(id_variacao: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const { error } = await supabase
    .from('servico_variacao')
    .delete()
    .eq('id_variacao', id_variacao)

  if (error) return { error: 'Erro ao remover variação de preço.' }

  revalidatePath('/lojista/servicos')
  return { success: true }
}

// ============================================================
// HORÁRIO ACTIONS (Lojista)
// ============================================================

export async function salvarHorarioAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    dia_semana: formData.get('dia_semana') as string,
    hr_inicio: formData.get('hr_inicio') as string,
    hr_fim: formData.get('hr_fim') as string,
  }

  const parsed = horarioSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Upsert por lojista + dia_semana
  const { error } = await supabase.from('horario').upsert(
    { id_lojista: user.id, ...parsed.data },
    { onConflict: 'id_lojista,dia_semana' }
  )

  if (error) return { error: 'Erro ao salvar horário.' }

  revalidatePath('/lojista/horarios')
  return { success: true }
}

// Mesma coisa que salvarHorarioAction, mas pra vários dias de uma vez
// com o mesmo horário (ex.: Segunda a Sexta das 09h às 22h) — reaproveita
// horarioSchema pra validar cada dia individualmente antes de gravar.
export async function salvarHorariosEmLoteAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const dias = formData.getAll('dias') as string[]
  const hr_inicio = formData.get('hr_inicio') as string
  const hr_fim = formData.get('hr_fim') as string

  if (dias.length === 0) return { error: 'Selecione pelo menos um dia da semana.' }

  const linhas: { id_lojista: string; dia_semana: string; hr_inicio: string; hr_fim: string }[] = []
  for (const dia_semana of dias) {
    const parsed = horarioSchema.safeParse({ dia_semana, hr_inicio, hr_fim })
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    linhas.push({ id_lojista: user.id, ...parsed.data })
  }

  const { error } = await supabase
    .from('horario')
    .upsert(linhas, { onConflict: 'id_lojista,dia_semana' })

  if (error) return { error: 'Erro ao salvar horários.' }

  revalidatePath('/lojista/horarios')
  return { success: true }
}

export async function toggleHorarioAction(id_horario: string, ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const { error } = await supabase
    .from('horario')
    .update({ ativo })
    .eq('id_horario', id_horario)
    .eq('id_lojista', user.id)

  if (error) return { error: 'Erro ao atualizar horário.' }

  revalidatePath('/lojista/horarios')
  return { success: true }
}

// ============================================================
// AGENDAMENTO ACTIONS
// ============================================================

export async function criarAgendamentoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'cliente') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    id_lojista: formData.get('id_lojista') as string,
    id_pet: formData.get('id_pet') as string,
    id_servico: formData.get('id_servico') as string,
    dt_agendamento: formData.get('dt_agendamento') as string,
    hr_agendamento: formData.get('hr_agendamento') as string,
    obs: formData.get('obs') as string,
  }

  const parsed = agendamentoSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Chamar função do banco que possui lock anti-double-booking
  const { data, error } = await supabase.rpc('fn_criar_agendamento', {
    p_id_pet: parsed.data.id_pet,
    p_id_servico: parsed.data.id_servico,
    p_id_cliente: user.id,
    p_id_lojista: parsed.data.id_lojista,
    p_data: parsed.data.dt_agendamento,
    p_hora: parsed.data.hr_agendamento,
    p_obs: parsed.data.obs || null,
  })

  if (error) {
    return {
      error: error.message.includes('Horário não disponível')
        ? 'Horário não disponível. Escolha outro horário.'
        : 'Erro ao criar agendamento. Tente novamente.'
    }
  }

  revalidatePath('/cliente/agendamentos')
  return { success: true, id_agendamento: data }
}

// Agendamento manual criado pelo LOJISTA (walk-in / telefone) para um
// cliente que já existe na base dele. Ação separada de
// criarAgendamentoAction (que é do cliente) porque as regras de quem pode
// chamar e o status inicial são diferentes — ver fn_criar_agendamento_lojista
// (migration 008) e agendamentoLojistaSchema.
export async function criarAgendamentoLojistaAction(
  formData: FormData
): Promise<{ error?: string; success?: boolean; id_agendamento?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    id_lojista: user.id,
    id_cliente: formData.get('id_cliente') as string,
    id_pet: formData.get('id_pet') as string,
    id_servico: formData.get('id_servico') as string,
    dt_agendamento: formData.get('dt_agendamento') as string,
    hr_agendamento: formData.get('hr_agendamento') as string,
    obs: (formData.get('obs') as string) || undefined,
  }

  const parsed = agendamentoLojistaSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { data, error } = await supabase.rpc('fn_criar_agendamento_lojista', {
    p_id_lojista: parsed.data.id_lojista,
    p_id_cliente: parsed.data.id_cliente,
    p_id_pet: parsed.data.id_pet,
    p_id_servico: parsed.data.id_servico,
    p_data: parsed.data.dt_agendamento,
    p_hora: parsed.data.hr_agendamento,
    p_obs: parsed.data.obs || null,
  })

  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('Could not find') || error.code === '42883') {
      return { error: 'Função fn_criar_agendamento_lojista não encontrada no banco. Execute a migration 008_fn_criar_agendamento_lojista.sql.' }
    }
    return {
      error: error.message.includes('Horário não disponível')
        ? 'Horário não disponível. Escolha outro horário.'
        : error.message.includes('histórico')
          ? 'Este cliente ainda não possui agendamentos com o seu petshop.'
          : 'Erro ao criar agendamento. Tente novamente.'
    }
  }

  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/agendamentos')
  return { success: true, id_agendamento: data }
}

export async function cancelarAgendamentoAction(id_agendamento: string, motivo?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.rpc('fn_cancelar_agendamento', {
    p_id_agendamento: id_agendamento,
    p_motivo: motivo || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/cliente/agendamentos')
  revalidatePath('/lojista/agendamentos')
  return { success: true }
}

export async function atualizarStatusAgendamentoAction(
  id_agendamento: string,
  status: 'Confirmado' | 'Concluído' | 'Cancelado'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const updateData: Record<string, string> = { status }
  if (status === 'Cancelado') {
    updateData.cancelado_por = 'lojista'
  }

  const { error } = await supabase
    .from('agendamento')
    .update(updateData)
    .eq('id_agendamento', id_agendamento)
    .eq('id_lojista', user.id)

  if (error) return { error: 'Erro ao atualizar status.' }

  revalidatePath('/lojista/agendamentos')
  return { success: true }
}

// Atribui (ou remove, se id_funcionario vier null) o profissional
// responsável por um agendamento. Ver migration 012 — todo agendamento
// nasce sem funcionário, mesmo os que o cliente cria sozinho; o
// lojista atribui manualmente pela tela de agenda.
export async function atribuirFuncionarioAction(id_agendamento: string, id_funcionario: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  if (id_funcionario) {
    const { data: func } = await supabase
      .from('funcionario')
      .select('id_funcionario')
      .eq('id_funcionario', id_funcionario)
      .eq('id_lojista', user.id)
      .eq('ativo', true)
      .maybeSingle()
    if (!func) return { error: 'Funcionário não encontrado ou inativo' }
  }

  const { error } = await supabase
    .from('agendamento')
    .update({ id_funcionario })
    .eq('id_agendamento', id_agendamento)
    .eq('id_lojista', user.id)

  if (error) return { error: 'Erro ao atribuir profissional.' }

  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/dashboard')
  return { success: true }
}

// ============================================================
// PERFIL LOJISTA ACTION
// ============================================================

export async function atualizarPerfilLojistaAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const nome_loja = (formData.get('nome_loja') as string)?.trim()
  const telefone = (formData.get('telefone') as string)?.replace(/\D/g, '')
  const descricao = (formData.get('descricao') as string)?.trim() || null
  const endereco = (formData.get('endereco') as string)?.trim() || null
  const cidade = (formData.get('cidade') as string)?.trim() || null
  const estado = (formData.get('estado') as string)?.trim().toUpperCase().slice(0, 2) || null
  const cepRaw = (formData.get('cep') as string)?.replace(/\D/g, '')
  const cep = cepRaw?.length === 8 ? cepRaw : null

  if (!nome_loja || nome_loja.length < 2) return { error: 'Nome da loja inválido' }
  if (!telefone || !/^\d{10,11}$/.test(telefone)) return { error: 'Telefone inválido' }

  const { error } = await supabase
    .from('lojista')
    .update({ nome_loja, telefone, descricao, endereco, cidade, estado, cep })
    .eq('id_lojista', user.id)

  if (error) return { error: 'Erro ao atualizar perfil.' }

  revalidatePath('/lojista/perfil')
  return { success: true }
}

// Liga/desliga o Kanban de agendamentos (migration 013). Mesmo padrão
// de toggleHorarioAction/toggleFuncionarioAction — troca só essa coluna,
// sem passar pelo formulário inteiro de perfil.
export async function alternarKanbanAction(ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const { error } = await supabase
    .from('lojista')
    .update({ kanban_ativo: ativo })
    .eq('id_lojista', user.id)

  if (error) {
    if (error.code === '42703' || error.message?.includes('kanban_ativo')) {
      return { error: 'Coluna kanban_ativo não encontrada no banco. Execute a migration 013_lojista_kanban_ativo.sql.' }
    }
    return { error: 'Erro ao atualizar configuração do Kanban.' }
  }

  revalidatePath('/lojista/perfil')
  revalidatePath('/lojista', 'layout')
  return { success: true }
}

// ============================================================
// CLIENTE ACTIONS (Lojista)
// ============================================================

// Cadastra um cliente direto pelo lojista (walk-in, telefone — cliente
// que não usa o app). Mesmo padrão de cadastrarFuncionarioAction: cria
// a conta Auth via admin API (o lojista logado não pode usar signUp
// pra outra pessoa sem deslogar a própria sessão) e insere na tabela
// `cliente` via RPC SECURITY DEFINER (migration 014), que também grava
// o vínculo em cliente_lojista pra o cliente aparecer na lista e já
// poder receber o primeiro agendamento manual.
export async function cadastrarClienteLojistaAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    cpf: (formData.get('cpf') as string).replace(/\D/g, ''),
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
  }

  const parsed = cadastroClienteSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.senha,
    email_confirm: true,
    user_metadata: { role: 'cliente', nome: parsed.data.nome },
  })

  if (authError) {
    console.error('[cadastrarClienteLojistaAction] createUser error:', authError.message)
    const msg = authError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate')) {
      return { error: 'Este e-mail já está cadastrado no sistema.' }
    }
    return { error: devError('Não foi possível criar a conta do cliente. Tente novamente.', authError.message) }
  }

  if (!authData.user) {
    return { error: 'Erro interno ao criar conta. Tente novamente.' }
  }

  const { error: rpcError } = await supabase.rpc('fn_registrar_cliente_lojista', {
    p_id_cliente: authData.user.id,
    p_id_lojista: user.id,
    p_nome: parsed.data.nome,
    p_cpf: parsed.data.cpf,
    p_email: parsed.data.email,
    p_telefone: parsed.data.telefone,
  })

  if (rpcError) {
    // Rollback: remover conta Auth criada
    console.error('[cadastrarClienteLojistaAction] RPC error:', rpcError.message)
    await adminClient.auth.admin.deleteUser(authData.user.id)

    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists')) {
      return { error: 'Este e-mail já está cadastrado como cliente, lojista ou funcionário.' }
    }
    if (msg.includes('cpf_already_exists')) {
      return { error: 'Este CPF já está cadastrado.' }
    }
    return { error: devError('Não foi possível cadastrar o cliente. Tente novamente.', rpcError.message) }
  }

  revalidatePath('/lojista/clientes')
  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/agendamentos')
  return { success: true }
}

// Cadastra um pet em nome de um cliente já vinculado a este lojista
// (migration 015) — cobre o cliente cadastrado pelo botão acima que
// ainda não tem nenhum pet, e por isso travava no modal de "Novo
// Agendamento" na etapa de escolher o pet.
export async function criarPetLojistaAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    id_cliente: formData.get('id_cliente') as string,
    nome: formData.get('nome') as string,
    raca: formData.get('raca') as string,
    sexo: formData.get('sexo') as string,
    especie: (formData.get('especie') as string) || undefined,
    porte: (formData.get('porte') as string) || undefined,
    dt_nasc: formData.get('dt_nasc') as string,
    peso: formData.get('peso') ? parseFloat(formData.get('peso') as string) : undefined,
    obs: (formData.get('obs') as string) || undefined,
  }

  const parsed = petLojistaSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: id_pet, error } = await supabase.rpc('fn_criar_pet_lojista', {
    p_id_lojista: user.id,
    p_id_cliente: parsed.data.id_cliente,
    p_nome: parsed.data.nome,
    p_raca: parsed.data.raca,
    p_sexo: parsed.data.sexo,
    p_especie: parsed.data.especie ?? null,
    p_porte: parsed.data.porte ?? null,
    p_dt_nasc: parsed.data.dt_nasc,
    p_peso: parsed.data.peso ?? null,
    p_obs: parsed.data.obs ?? null,
  })

  if (error) {
    console.error('[criarPetLojistaAction] RPC error:', error.message)
    return { error: devError('Não foi possível cadastrar o pet. Tente novamente.', error.message) }
  }

  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/clientes')
  revalidatePath('/lojista/agendamentos')
  return { success: true, id_pet: id_pet as string }
}

// ============================================================
// RELATÓRIOS DE VENDAS (Lojista)
// ============================================================

// Máximo de linhas por exportação — protege contra alguém pedindo um CSV
// gigante (ex.: período personalizado enorme) e travando a Server Action.
// Se bater no limite, orienta a estreitar o período em vez de cortar
// silenciosamente o arquivo pela metade sem avisar.
const LIMITE_LINHAS_CSV = 5000

function escaparCsv(valor: string) {
  if (/[",\n;]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

export async function exportarRelatorioVendasCsvAction(filtros: {
  dataIni: string
  dataFim: string
  idFuncionario?: string
  idServico?: string
  status?: string
}): Promise<{ csv: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  let query = supabase
    .from('agendamento')
    .select(`
      dt_agendamento, hr_agendamento, valor, status,
      pet:id_pet ( nome ),
      servico:id_servico ( nome ),
      cliente:id_cliente ( nome ),
      funcionario:id_funcionario ( nome )
    `)
    .eq('id_lojista', user.id)
    .gte('dt_agendamento', filtros.dataIni)
    .lte('dt_agendamento', filtros.dataFim)
    .order('dt_agendamento', { ascending: true })
    .order('hr_agendamento', { ascending: true })
    .limit(LIMITE_LINHAS_CSV + 1)

  if (filtros.idFuncionario) query = query.eq('id_funcionario', filtros.idFuncionario)
  if (filtros.idServico) query = query.eq('id_servico', filtros.idServico)
  if (filtros.status) query = query.eq('status', filtros.status)

  const { data, error } = await query

  if (error) {
    console.error('[exportarRelatorioVendasCsvAction] erro:', error.message)
    return { error: devError('Não foi possível gerar o CSV. Tente novamente.', error.message) }
  }

  const linhas = (data ?? []) as unknown as Array<{
    dt_agendamento: string
    hr_agendamento: string
    valor: number
    status: string
    pet: { nome: string } | null
    servico: { nome: string } | null
    cliente: { nome: string } | null
    funcionario: { nome: string } | null
  }>

  if (linhas.length > LIMITE_LINHAS_CSV) {
    return { error: `O período selecionado tem mais de ${LIMITE_LINHAS_CSV} registros. Estreite o período ou aplique um filtro antes de exportar.` }
  }

  const cabecalho = ['Data', 'Horário', 'Cliente', 'Pet', 'Serviço', 'Profissional', 'Valor', 'Status']
  const corpo = linhas.map(l => [
    l.dt_agendamento.split('-').reverse().join('/'),
    l.hr_agendamento.slice(0, 5),
    l.cliente?.nome ?? '',
    l.pet?.nome ?? '',
    l.servico?.nome ?? '',
    l.funcionario?.nome ?? '',
    l.valor.toFixed(2).replace('.', ','),
    l.status,
  ].map(v => escaparCsv(String(v))).join(';'))

  const csv = '﻿' + [cabecalho.join(';'), ...corpo].join('\r\n')
  return { csv }
}

// ============================================================
// FUNCIONÁRIO ACTIONS (Lojista)
// ============================================================

export async function cadastrarFuncionarioAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    cargo: formData.get('cargo') as string,
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
    pode_gerenciar_agenda: formData.get('pode_gerenciar_agenda') === 'true',
    pode_gerenciar_servicos: formData.get('pode_gerenciar_servicos') === 'true',
  }

  const parsed = funcionarioSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Admin client é obrigatório para criar conta Auth para o funcionário
  // (o lojista logado não pode usar signUp — isso deslogaria ele)
  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }
  }

  // Criar conta Auth para o funcionário via admin API
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.senha,
    email_confirm: true, // Confirma email automaticamente (funcionário convidado pelo lojista)
    user_metadata: {
      role: 'funcionario',
      nome: parsed.data.nome,
      id_lojista: user.id,
    },
  })

  if (authError) {
    console.error('[cadastrarFuncionarioAction] createUser error:', authError.message)
    const msg = authError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate')) {
      return { error: 'Este e-mail já está cadastrado no sistema.' }
    }
    return { error: devError('Não foi possível criar a conta do funcionário. Tente novamente.', authError.message) }
  }

  if (!authData.user) {
    return { error: 'Erro interno ao criar conta. Tente novamente.' }
  }

  // Inserir na tabela funcionario via RPC (SECURITY DEFINER)
  const { error: rpcError } = await supabase.rpc('fn_registrar_funcionario', {
    p_id_funcionario: authData.user.id,
    p_id_lojista: user.id,
    p_nome: parsed.data.nome,
    p_email: parsed.data.email,
    p_telefone: parsed.data.telefone,
    p_cargo: parsed.data.cargo ?? null,
    p_pode_agenda: parsed.data.pode_gerenciar_agenda,
    p_pode_servicos: parsed.data.pode_gerenciar_servicos,
  })

  if (rpcError) {
    // Rollback: remover conta Auth criada
    console.error('[cadastrarFuncionarioAction] RPC error:', rpcError.message)
    await adminClient.auth.admin.deleteUser(authData.user.id)

    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists')) {
      return { error: 'Este e-mail já está cadastrado como funcionário, lojista ou cliente.' }
    }
    return { error: devError('Não foi possível cadastrar o funcionário. Tente novamente.', rpcError.message) }
  }

  revalidatePath('/lojista/funcionarios')
  return { success: true }
}

export async function editarFuncionarioAction(id_funcionario: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    cargo: formData.get('cargo') as string,
    pode_gerenciar_agenda: formData.get('pode_gerenciar_agenda') === 'true',
    pode_gerenciar_servicos: formData.get('pode_gerenciar_servicos') === 'true',
  }

  const parsed = editarFuncionarioSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('funcionario')
    .update({
      nome: parsed.data.nome,
      telefone: parsed.data.telefone,
      cargo: parsed.data.cargo ?? null,
      pode_gerenciar_agenda: parsed.data.pode_gerenciar_agenda,
      pode_gerenciar_servicos: parsed.data.pode_gerenciar_servicos,
    })
    .eq('id_funcionario', id_funcionario)
    .eq('id_lojista', user.id) // Garante que é funcionário do SEU petshop

  if (error) return { error: 'Erro ao atualizar funcionário.' }

  revalidatePath('/lojista/funcionarios')
  return { success: true }
}

export async function toggleFuncionarioAction(id_funcionario: string, ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'lojista') {
    return { error: 'Acesso não autorizado' }
  }

  const { error } = await supabase
    .from('funcionario')
    .update({ ativo })
    .eq('id_funcionario', id_funcionario)
    .eq('id_lojista', user.id)

  if (error) return { error: ativo ? 'Erro ao reativar funcionário.' : 'Erro ao desativar funcionário.' }

  revalidatePath('/lojista/funcionarios')
  return { success: true }
}
