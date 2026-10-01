import { preflightDoApp, respostaDoApp, tokenDaRequisicao } from '@/lib/api-app'
import { comSessaoDoApp } from '@/lib/supabase/sessao-do-app'
import * as acoes from '@/lib/actions'
import * as acoesBloqueios from '@/lib/actions-bloqueios'
import * as acoesPagamento from '@/lib/actions-pagamento'
import * as acoesPlanos from '@/lib/actions-planos'
import * as acoesRotas from '@/lib/actions-rotas'
import * as acoesTaxiDog from '@/lib/actions-taxidog'

// Ponte entre o APP MOBILE e as Server Actions do painel.
//
// O app não consegue chamar uma Server Action (isso é coisa do navegador
// com o Next), e várias delas só existem no servidor: convite por e-mail,
// gravação feita por administrador (service_role), geocodificação, envio
// de imagem. Em vez de reescrever cada regra numa rota própria, o app
// chama ESTA rota dizendo qual action quer e com quais argumentos — e a
// action roda igualzinho ao painel, só que identificando o usuário pelo
// token do app (lib/supabase/sessao-do-app.ts).
//
//   POST /api/app/acao
//   Authorization: Bearer <access_token do Supabase>
//   { "acao": "editarServicoAction", "args": ["<id>", { "$form": { "nome": "Banho", … } }] }
//
// Segurança: só entra o que está na lista abaixo (nada de login, cadastro
// de conta, exclusão de conta ou qualquer action que redirecione), e cada
// action continua conferindo quem é o usuário e o que ele pode — nenhuma
// checagem é pulada por vir do app.

type Acao = (...args: never[]) => Promise<unknown>

const ACOES: Record<string, Acao> = {
  // Agenda
  criarAgendamentoLojistaAction: acoes.criarAgendamentoLojistaAction,
  atualizarStatusAgendamentoAction: acoes.atualizarStatusAgendamentoAction,
  cancelarAgendamentoAction: acoes.cancelarAgendamentoAction,
  remarcarAgendamentoAction: acoes.remarcarAgendamentoAction,
  editarAgendamentoAction: acoes.editarAgendamentoAction,
  atribuirFuncionarioAction: acoes.atribuirFuncionarioAction,
  atualizarPagamentoAction: acoesPagamento.atualizarPagamentoAction,
  // Clientes e pets
  cadastrarClienteLojistaAction: acoes.cadastrarClienteLojistaAction,
  editarClienteLojistaAction: acoes.editarClienteLojistaAction,
  criarPetLojistaAction: acoes.criarPetLojistaAction,
  editarPetLojistaAction: acoes.editarPetLojistaAction,
  atualizarFotoPetAction: acoes.atualizarFotoPetAction,
  removerFotoPetAction: acoes.removerFotoPetAction,
  salvarPerfilPetAction: acoesTaxiDog.salvarPerfilPetAction,
  // Serviços
  criarServicoAction: acoes.criarServicoAction,
  editarServicoAction: acoes.editarServicoAction,
  alternarStatusServicoAction: acoes.alternarStatusServicoAction,
  excluirServicoAction: acoes.excluirServicoAction,
  adicionarVariacaoServicoAction: acoes.adicionarVariacaoServicoAction,
  removerVariacaoServicoAction: acoes.removerVariacaoServicoAction,
  // Produtos
  criarProdutoAction: acoes.criarProdutoAction,
  editarProdutoAction: acoes.editarProdutoAction,
  alternarStatusProdutoAction: acoes.alternarStatusProdutoAction,
  movimentarEstoqueAction: acoes.movimentarEstoqueAction,
  excluirProdutoAction: acoes.excluirProdutoAction,
  criarCategoriaProdutoAction: acoes.criarCategoriaProdutoAction,
  atualizarFotoProdutoAction: acoes.atualizarFotoProdutoAction,
  removerFotoProdutoAction: acoes.removerFotoProdutoAction,
  // Horários e dias fechados
  salvarHorarioAction: acoes.salvarHorarioAction,
  salvarHorariosEmLoteAction: acoes.salvarHorariosEmLoteAction,
  toggleHorarioAction: acoes.toggleHorarioAction,
  salvarBloqueioAction: acoesBloqueios.salvarBloqueioAction,
  excluirBloqueioAction: acoesBloqueios.excluirBloqueioAction,
  // Equipe
  cadastrarFuncionarioAction: acoes.cadastrarFuncionarioAction,
  editarFuncionarioAction: acoes.editarFuncionarioAction,
  toggleFuncionarioAction: acoes.toggleFuncionarioAction,
  excluirFuncionarioAction: acoes.excluirFuncionarioAction,
  // Loja e configurações
  atualizarPerfilLojistaAction: acoes.atualizarPerfilLojistaAction,
  atualizarLogoLojistaAction: acoes.atualizarLogoLojistaAction,
  removerLogoLojistaAction: acoes.removerLogoLojistaAction,
  alternarKanbanAction: acoes.alternarKanbanAction,
  alternarAgendamentoOnlineAction: acoes.alternarAgendamentoOnlineAction,
  atualizarSlugLojistaAction: acoes.atualizarSlugLojistaAction,
  atualizarJanelaAgendamentoAction: acoes.atualizarJanelaAgendamentoAction,
  salvarFormasPagamentoAction: acoesPagamento.salvarFormasPagamentoAction,
  // Planos
  salvarPlanoAction: acoesPlanos.salvarPlanoAction,
  alterarStatusPlanoAction: acoesPlanos.alterarStatusPlanoAction,
  assinarPlanoAction: acoesPlanos.assinarPlanoAction,
  cancelarAssinaturaAction: acoesPlanos.cancelarAssinaturaAction,
  atualizarCobrancaPlanoAction: acoesPlanos.atualizarCobrancaPlanoAction,
  usarBeneficioAction: acoesPlanos.usarBeneficioAction,
  estornarBeneficioAction: acoesPlanos.estornarBeneficioAction,
  // TaxiDog (painel da loja e rotas)
  cotarTaxiDogLojaAction: acoesTaxiDog.cotarTaxiDogLojaAction,
  salvarTaxiDogConfigAction: acoesTaxiDog.salvarTaxiDogConfigAction,
  salvarTaxiDogCriaRotasAction: acoesTaxiDog.salvarTaxiDogCriaRotasAction,
  alternarPrecosEstimadosAction: acoesTaxiDog.alternarPrecosEstimadosAction,
  atribuirCorridaAction: acoesTaxiDog.atribuirCorridaAction,
  cancelarCorridaAction: acoesTaxiDog.cancelarCorridaAction,
  alterarTransporteAction: acoesRotas.alterarTransporteAction,
  criarRotaAction: acoesRotas.criarRotaAction,
  reordenarParadasAction: acoesRotas.reordenarParadasAction,
  removerDaRotaAction: acoesRotas.removerDaRotaAction,
  adicionarNaRotaAction: acoesRotas.adicionarNaRotaAction,
  atribuirRotaAction: acoesRotas.atribuirRotaAction,
  aprovarRotaAction: acoesRotas.aprovarRotaAction,
  cancelarRotaAction: acoesRotas.cancelarRotaAction,
  recalcularRotaAction: acoesRotas.recalcularRotaAction,
}

// Imagem em base64 dentro do JSON: até ~5 MB de arquivo (o mesmo limite
// das actions de foto) mais a folga do base64.
const TAMANHO_MAXIMO = 8 * 1024 * 1024

type ValorForm = string | number | boolean | null | { $arquivo: { base64: string; nome?: string; tipo?: string } }

// As actions de formulário recebem FormData. O app manda
// { "$form": { campo: valor } } e aqui vira o FormData de verdade: lista
// vira campo repetido (getAll), { "$arquivo": … } vira arquivo.
function paraFormData(campos: Record<string, ValorForm | ValorForm[]>): FormData {
  const form = new FormData()
  for (const [chave, bruto] of Object.entries(campos)) {
    for (const valor of Array.isArray(bruto) ? bruto : [bruto]) {
      if (valor === null || valor === undefined) continue
      if (typeof valor === 'object') {
        const arq = valor.$arquivo
        if (!arq || typeof arq.base64 !== 'string') continue
        const bytes = Buffer.from(arq.base64, 'base64')
        form.append(chave, new File([bytes], arq.nome || 'imagem', { type: arq.tipo || 'application/octet-stream' }))
      } else {
        form.append(chave, String(valor))
      }
    }
  }
  return form
}

function prepararArgumento(arg: unknown): unknown {
  if (arg && typeof arg === 'object' && !Array.isArray(arg) && '$form' in arg) {
    const campos = (arg as { $form: unknown }).$form
    return paraFormData(campos && typeof campos === 'object' ? (campos as Record<string, ValorForm | ValorForm[]>) : {})
  }
  return arg
}

export function OPTIONS() {
  return preflightDoApp()
}

export async function POST(request: Request) {
  const token = tokenDaRequisicao(request)
  if (!token) return respostaDoApp({ error: 'Não autenticado' }, 401)
  if (Number(request.headers.get('content-length') ?? 0) > TAMANHO_MAXIMO) {
    return respostaDoApp({ error: 'Arquivo muito grande. O limite é 5 MB.' }, 413)
  }

  let corpo: { acao?: unknown; args?: unknown }
  try {
    corpo = (await request.json()) as { acao?: unknown; args?: unknown }
  } catch {
    return respostaDoApp({ error: 'Dados inválidos.' }, 400)
  }
  const nome = corpo?.acao
  if (typeof nome !== 'string' || !Object.hasOwn(ACOES, nome)) {
    return respostaDoApp({ error: 'Ação não disponível no app.' }, 400)
  }
  const args = Array.isArray(corpo.args) ? corpo.args.map(prepararArgumento) : []

  try {
    const resultado = await comSessaoDoApp(token, () => (ACOES[nome] as (...a: unknown[]) => Promise<unknown>)(...args))
    return respostaDoApp(resultado)
  } catch (e) {
    console.error(`[api/app/acao] ${nome}:`, e instanceof Error ? e.message : e)
    return respostaDoApp({ error: 'Não foi possível concluir. Tente de novo.' }, 500)
  }
}
