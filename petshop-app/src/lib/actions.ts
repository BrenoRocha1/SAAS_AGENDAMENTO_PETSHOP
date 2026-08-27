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
  servicoSchema,
  horarioSchema,
  agendamentoSchema,
  funcionarioSchema,
  editarFuncionarioSchema,
} from '@/lib/validations'

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
    return { error: 'Erro ao criar conta. Tente novamente.' }
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
  const raw = {
    nome_loja: formData.get('nome_loja') as string,
    email: formData.get('email') as string,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    descricao: formData.get('descricao') as string,
    endereco: formData.get('endereco') as string,
    cidade: formData.get('cidade') as string,
    estado: formData.get('estado') as string,
    cep: (formData.get('cep') as string).replace(/\D/g, ''),
    senha: formData.get('senha') as string,
    confirmaSenha: formData.get('confirmaSenha') as string,
  }

  const parsed = cadastroLojistSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Admin client — usado para:
  // 1. Fallback de INSERT via RPC (bypassa timing de sessão)
  // 2. Rollback (deletar usuário Auth órfão se o INSERT falhar)
  const adminClient = createAdminClient()

  // Verificar se email já existe na tabela lojista ANTES de criar o usuário Auth
  // Usa adminClient se disponível (bypassa RLS); caso contrário usa anon client
  // com consulta pública (lojistas ativos são visíveis via RLS).
  const checkClient = adminClient ?? await createClient()
  const { data: existente } = await checkClient
    .from('lojista')
    .select('id_lojista')
    .eq('email', parsed.data.email)
    .maybeSingle()

  if (existente) {
    return { error: 'Este e-mail já está cadastrado. Acesse a tela de login para entrar na sua conta.' }
  }

  const supabase = await createClient()

  // Criar usuário no Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.senha,
    options: {
      data: { role: 'lojista', nome_loja: parsed.data.nome_loja },
    },
  })

  if (authError) {
    // Log técnico apenas no servidor — nunca exposto ao usuário
    console.error('[cadastroLojistaAction] Supabase signUp error:', {
      message: authError.message,
      status: authError.status,
      code: (authError as unknown as { code?: string }).code,
    })

    const msg = authError.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('email address') || authError.status === 422) {
      return { error: 'Este e-mail já está cadastrado. Acesse a tela de login para entrar na sua conta.' }
    }
    if (msg.includes('password') || msg.includes('weak')) {
      return { error: 'Senha inválida. Use pelo menos 8 caracteres com maiúscula, número e símbolo.' }
    }
    if (msg.includes('rate limit') || authError.status === 429) {
      return { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' }
    }
    return { error: 'Não foi possível criar a conta. Verifique os dados e tente novamente.' }
  }

  // Supabase retorna user com identities vazias quando email já existe e confirmação está ativa
  if (!authData.user || !authData.user.id) {
    return { error: 'Este e-mail pode já estar cadastrado. Tente fazer login ou recuperar sua senha.' }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FIX: Estabelecer sessão nos cookies ANTES de chamar o RPC.
  // O signUp cria o usuário mas NÃO propaga o JWT nos cookies do response.
  // Sem este signIn, auth.uid() retorna NULL no Postgres e o RPC falha.
  // ──────────────────────────────────────────────────────────────────────────
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  // ──────────────────────────────────────────────────────────────────────────
  // INSERT via RPC fn_registrar_lojista (SECURITY DEFINER)
  //
  // ESTRATÉGIA DUPLA:
  // 1. Se signIn funcionou → usa supabase client (auth.uid() válido)
  // 2. Se signIn falhou → usa adminClient como fallback (service_role bypassa uid check)
  // ──────────────────────────────────────────────────────────────────────────
  const rpcClient = signInError
    ? adminClient  // Fallback: service_role
    : supabase     // Normal: sessão autenticada

  if (!rpcClient) {
    // signIn falhou E adminClient não disponível — não há como inserir
    console.error('[cadastroLojistaAction] signIn falhou e adminClient não disponível')
    if (adminClient) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
    }
    return { error: 'Erro de configuração do servidor. Entre em contato com o suporte.' }
  }

  const { error: rpcError } = await rpcClient.rpc('fn_registrar_lojista', {
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
    // Rollback: remover usuário Auth criado para não deixar registro órfão
    console.error('[cadastroLojistaAction] RPC fn_registrar_lojista error:', rpcError.message)

    if (adminClient) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
    } else {
      console.error(
        '[cadastroLojistaAction] AVISO: usuário Auth criado mas INSERT falhou e ' +
        'SUPABASE_SERVICE_ROLE_KEY não está configurada — não foi possível fazer rollback. ' +
        'User ID órfão:', authData.user.id
      )
    }

    const msg = rpcError.message ?? ''
    if (msg.includes('email_already_exists') || msg.includes('23505')) {
      return { error: 'Este e-mail já está cadastrado. Acesse a tela de login para entrar na sua conta.' }
    }
    if (msg.includes('não autenticado') || msg.includes('uid divergente')) {
      return { error: 'Erro de autenticação. Recarregue a página e tente novamente.' }
    }
    return { error: 'Não foi possível salvar os dados do estabelecimento. Tente novamente.' }
  }

  // Se o signIn pós-signUp falhou mas o RPC funcionou via adminClient,
  // tentar fazer signIn novamente para estabelecer a sessão antes do redirect
  if (signInError) {
    const { error: retrySignIn } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.senha,
    })
    if (retrySignIn) {
      // Cadastro salvo com sucesso, mas sessão não estabelecida.
      // Redirecionar para login para o usuário entrar manualmente.
      console.error('[cadastroLojistaAction] signIn retry falhou:', retrySignIn.message)
      redirect('/login')
    }
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

  const { error } = await supabase.from('servico').insert({
    id_lojista: user.id,
    ...parsed.data,
  })

  if (error) return { error: 'Erro ao cadastrar serviço.' }

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
    return { error: 'Não foi possível criar a conta do funcionário. Tente novamente.' }
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
    return { error: 'Não foi possível cadastrar o funcionário. Tente novamente.' }
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
