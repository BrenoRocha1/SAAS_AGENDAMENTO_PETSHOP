import { z } from 'zod'

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

export const petSchema = z.object({
  nome: z.string().min(1).max(80),
  raca: z.string().min(1).max(80),
  sexo: z.enum(['Macho', 'Fêmea']),
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
  dt_agendamento: z.string().refine(d => {
    const date = new Date(d)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date >= today
  }, 'Data de agendamento não pode ser passada'),
  hr_agendamento: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  obs: z.string().max(500).optional(),
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
export type PetData = z.infer<typeof petSchema>
export type ServicoData = z.infer<typeof servicoSchema>
export type HorarioData = z.infer<typeof horarioSchema>
export type AgendamentoData = z.infer<typeof agendamentoSchema>
