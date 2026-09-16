import { z } from 'zod'
import { hojeBrasilISO } from '@/lib/agenda'

// ============================================================
// Schemas de validação com Zod
// ============================================================

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

export const cadastroClienteSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(120),
  cpf: z
    .string()
    .regex(/^\d{11}$/, 'CPF deve conter 11 dígitos numéricos')
    .refine(validarCPF, 'CPF inválido'),
  email: z.string().email('E-mail inválido'),
  telefone: z
    .string()
    .regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos'),
  senha: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter ao menos um número')
    .regex(/[^A-Za-z0-9]/, 'Deve conter ao menos um caractere especial'),
  confirmaSenha: z.string(),
}).refine(d => d.senha === d.confirmaSenha, {
  message: 'Senhas não conferem',
  path: ['confirmaSenha'],
})

// Edição de cliente PELO LOJISTA (fn_editar_cliente_lojista, migration
// 019) — deliberadamente só nome/telefone. E-mail é o login do cliente
// (auth.users) e CPF é documento — nenhum dos dois é editado por aqui.
export const editarClienteLojistaSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(120),
  telefone: z.string().regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos'),
})

export const cadastroLojistSchema = z.object({
  nome_loja: z.string().min(2).max(150),
  email: z.string().email('E-mail inválido'),
  telefone: z.string().regex(/^\d{10,11}$/, 'Telefone inválido'),
  descricao: z.string().max(500).optional(),
  endereco: z.string().max(200).optional(),
  cidade: z.string().max(100).optional(),
  estado: z.string().length(2).optional(),
  cep: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos').optional(),
  senha: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter ao menos um número')
    .regex(/[^A-Za-z0-9]/, 'Deve conter ao menos um caractere especial'),
  confirmaSenha: z.string(),
}).refine(d => d.senha === d.confirmaSenha, {
  message: 'Senhas não conferem',
  path: ['confirmaSenha'],
})

// Link personalizado de agendamento (/agendamento/[slug]) — só letras
// minúsculas, números e hífen simples entre eles, sem espaço/acento.
// Unicidade é garantida por UNIQUE no banco (migration 024), não aqui.
export const slugLojistaSchema = z.object({
  slug: z
    .string()
    .min(3, 'O link precisa ter no mínimo 3 caracteres')
    .max(60, 'O link pode ter no máximo 60 caracteres')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use só letras minúsculas, números e hífen — sem espaços, acentos ou símbolos'),
})

export const petSchema = z.object({
  nome: z.string().min(1).max(80),
  raca: z.string().min(1).max(80),
  sexo: z.enum(['Macho', 'Fêmea']),
  // Opcionais: pets já cadastrados antes da migration 010 não têm essa
  // informação. Usados por fn_calcular_preco_servico para casar as
  // faixas de preço "por porte"/"por raça" cadastradas pelo lojista.
  especie: z.enum(['Cão', 'Gato']).optional(),
  porte: z.enum(['Pequeno', 'Médio', 'Grande']).optional(),
  dt_nasc: z.string().refine(d => {
    const date = new Date(d)
    return date <= new Date()
  }, 'Data de nascimento não pode ser futura'),
  peso: z
    .number()
    .min(0.1, 'Peso inválido')
    .max(199.9, 'Peso muito alto')
    .optional(),
  obs: z.string().max(500).optional(),
})

// Complementar espécie/porte de um pet que já existe, sem mexer no resto
// do cadastro — usado no link público de agendamento (/agendamento/[id])
// quando o pet ainda não tem essa informação (precisa dela pra calcular
// preço por variação, ver fn_calcular_preco_servico).
export const classificacaoPetSchema = z.object({
  especie: z.enum(['Cão', 'Gato']),
  porte: z.enum(['Pequeno', 'Médio', 'Grande']),
})

// Pet cadastrado pelo LOJISTA em nome de um cliente já vinculado a ele
// (walk-in que ainda não tem pet cadastrado) — ver fn_criar_pet_lojista
// (migration 015). Mesmos campos de petSchema, mais o cliente dono do pet.
export const petLojistaSchema = petSchema.extend({
  id_cliente: z.string().uuid('Selecione um cliente'),
})

// Variação de preço de um serviço, por espécie+porte OU por
// espécie+raça específica — ver fn_calcular_preco_servico (migration 010).
export const servicoVariacaoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('porte'),
    especie: z.enum(['Cão', 'Gato']),
    porte: z.enum(['Pequeno', 'Médio', 'Grande']),
    preco: z.number().min(0, 'Preço inválido'),
  }),
  z.object({
    tipo: z.literal('raca'),
    especie: z.enum(['Cão', 'Gato']),
    raca: z.string().min(1, 'Informe a raça').max(80),
    preco: z.number().min(0, 'Preço inválido'),
  }),
])

export const servicoSchema = z.object({
  nome: z.string().min(2).max(100),
  descricao: z.string().max(500).optional(),
  preco: z.number().min(0, 'Preço inválido'),
  duracao: z
    .number()
    .int()
    .min(15, 'Duração mínima de 15 minutos')
    .max(480, 'Duração máxima de 8 horas'),
  status: z.enum(['Ativo', 'Inativo']).default('Ativo'),
})

export const horarioSchema = z.object({
  dia_semana: z.enum(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']),
  hr_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  hr_fim: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
}).refine(d => d.hr_fim > d.hr_inicio, {
  message: 'Hora de fim deve ser após hora de início',
  path: ['hr_fim'],
})

export const agendamentoSchema = z.object({
  id_lojista: z.string().uuid(),
  id_pet: z.string().uuid(),
  id_servico: z.string().uuid(),
  // Comparação de strings 'yyyy-MM-dd', não de objetos Date: `new Date(d)`
  // com uma data sem hora vira meia-noite em UTC, o que fazia "hoje" ser
  // considerado passado a partir de ~21h de Brasília (Brasil é UTC-3) —
  // ver hojeBrasilISO() em src/lib/agenda.ts.
  dt_agendamento: z.string().refine(d => d >= hojeBrasilISO(), 'Data de agendamento não pode ser passada'),
  hr_agendamento: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  obs: z.string().max(500).optional(),
})

// Carrinho com um ou mais serviços — link público /agendamento/[id_lojista]
// (ver fn_criar_agendamento_multiplo, migration 022). Profissional é
// opcional ("sem preferência" = null).
export const agendamentoOnlineSchema = z.object({
  id_lojista: z.string().uuid(),
  id_pet: z.string().uuid(),
  id_funcionario: z.string().uuid().nullable().optional(),
  servicos: z.array(z.string().uuid()).min(1, 'Selecione ao menos um serviço').max(10),
  dt_agendamento: z.string().refine(d => d >= hojeBrasilISO(), 'Data de agendamento não pode ser passada'),
  hr_agendamento: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  obs: z.string().max(500).optional(),
})

// Agendamento criado pelo LOJISTA (walk-in/telefone) em nome de um cliente
// já existente na base dele. Mesmas regras de data/hora de agendamentoSchema,
// mais o cliente — ver fn_criar_agendamento_lojista (migration 008).
export const agendamentoLojistaSchema = agendamentoSchema.extend({
  id_cliente: z.string().uuid('Selecione um cliente'),
})

export const funcionarioSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(120),
  email: z.string().email('E-mail inválido'),
  telefone: z
    .string()
    .regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos'),
  cargo: z.string().max(100).optional(),
  senha: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter ao menos um número')
    .regex(/[^A-Za-z0-9]/, 'Deve conter ao menos um caractere especial'),
  confirmaSenha: z.string(),
  pode_gerenciar_agenda: z.boolean().default(true),
  pode_gerenciar_servicos: z.boolean().default(false),
}).refine(d => d.senha === d.confirmaSenha, {
  message: 'Senhas não conferem',
  path: ['confirmaSenha'],
})

export const editarFuncionarioSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(120),
  telefone: z
    .string()
    .regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos'),
  cargo: z.string().max(100).optional(),
  pode_gerenciar_agenda: z.boolean().default(true),
  pode_gerenciar_servicos: z.boolean().default(false),
})

// ============================================================
// Validação de CPF (algoritmo oficial)
// ============================================================
function validarCPF(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(cpf[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  return resto === parseInt(cpf[10])
}

// ============================================================
// Tipos derivados dos schemas
// ============================================================
export type LoginData = z.infer<typeof loginSchema>
export type CadastroClienteData = z.infer<typeof cadastroClienteSchema>
export type CadastroLojistaData = z.infer<typeof cadastroLojistSchema>
export type SlugLojistaData = z.infer<typeof slugLojistaSchema>
export type PetData = z.infer<typeof petSchema>
export type ServicoVariacaoData = z.infer<typeof servicoVariacaoSchema>
export type ServicoData = z.infer<typeof servicoSchema>
export type HorarioData = z.infer<typeof horarioSchema>
export type AgendamentoData = z.infer<typeof agendamentoSchema>
export type AgendamentoOnlineData = z.infer<typeof agendamentoOnlineSchema>
export type AgendamentoLojistaData = z.infer<typeof agendamentoLojistaSchema>
export type FuncionarioData = z.infer<typeof funcionarioSchema>
export type EditarFuncionarioData = z.infer<typeof editarFuncionarioSchema>
