================================================================================
  PETSHOP AGENDA - DOCUMENTACAO COMPLETA DO PROJETO
  SaaS de Agendamento para PetShops | Next.js 16 + Supabase + Vercel
================================================================================
Gerado em: 2026-08-11 | Versao: 1.0.0

================================================================================
  VISAO GERAL DO PROJETO
================================================================================

Plataforma SaaS multi-tenant de agendamento para petshops.
Dois tipos de usuario: LOJISTA (dono do petshop) e CLIENTE (dono do pet).
Clientes agendam servicos (banho, tosa etc.) com controle de horarios,
historico completo e metricas em tempo real para o lojista.

Stack tecnologica:
  Frontend/Backend : Next.js 16 com App Router + React 19
  Banco de dados   : Supabase (PostgreSQL gerenciado na nuvem)
  Autenticacao     : Supabase Auth (JWT + cookies HTTPOnly)
  Validacao        : Zod (frontend + servidor)
  Deploy           : Vercel (frontend) + Supabase (banco)
  Linguagem        : TypeScript

================================================================================
  ESTRUTURA DE ARQUIVOS
================================================================================

petshop-app/
  next.config.ts              Configuracao Next.js + headers de seguranca HTTP
  package.json                Dependencias do projeto
  .env.local                  Variaveis de ambiente (NAO subir no git)
  .env.example                Modelo das variaveis necessarias

  supabase/migrations/
    001_schema.sql            Schema completo do banco de dados
    002_rls.sql               Row Level Security (politicas de acesso)
    003_functions.sql         Stored procedures e funcoes SQL

  src/
    middleware.ts             Portao de seguranca - protecao de rotas
    lib/
      actions.ts              Server Actions (toda logica critica do servidor)
      validations.ts          Schemas Zod de validacao de dados
      supabase/server.ts      Cliente Supabase para Server Components
      supabase/client.ts      Cliente Supabase para Client Components
    components/layout/
      LojistaSidebar.tsx      Menu lateral do lojista
      ClienteSidebar.tsx      Menu lateral do cliente
    components/lojista/
      AgendamentosLojistaList.tsx   Lista e gestao de agendamentos
      HorariosManager.tsx           Gerenciador de horarios de funcionamento
      ServicosList.tsx              Gestao de servicos (CRUD completo)
      PerfilLojistaForm.tsx         Formulario de edicao do perfil da loja
    components/cliente/
      AgendamentosClienteList.tsx   Lista de agendamentos do cliente
      NovoAgendamentoWizard.tsx     Wizard multi-etapa para agendar
      PetCard.tsx                   Card de pet com edicao inline
    app/
      layout.tsx              Layout raiz (fonte, meta tags globais)
      globals.css             Design system completo (CSS variables, classes)
      page.tsx                Landing page publica
      login/page.tsx          Pagina de login
      cadastro/page.tsx       Cadastro de cliente com validacao CPF
      cadastro/lojista/page.tsx  Cadastro de lojista
      cliente/layout.tsx      Layout com sidebar do cliente
      cliente/dashboard/page.tsx    Dashboard: stats + proximos agendamentos
      cliente/pets/page.tsx         Lista de pets com PetCard
      cliente/pets/novo/page.tsx    Formulario de cadastro de pet
      cliente/agendamentos/page.tsx Historico completo de agendamentos
      cliente/novo-agendamento/     Wizard de 5 etapas para agendar
      lojista/layout.tsx            Layout com sidebar do lojista
      lojista/dashboard/page.tsx    Dashboard: metricas + agenda do dia
      lojista/agendamentos/page.tsx Todos os agendamentos do petshop
      lojista/servicos/page.tsx     Gestao de servicos
      lojista/horarios/page.tsx     Gestao de horarios por dia da semana
      lojista/clientes/page.tsx     Lista de clientes que agendaram
      lojista/perfil/page.tsx       Edicao do perfil da loja

================================================================================
  O QUE CADA ARQUIVO FAZ - DETALHADO
================================================================================

--- src/middleware.ts --- PORTAO DE SEGURANCA PRINCIPAL

Executado em TODA requisicao HTTP antes de qualquer pagina carregar.

O que faz:
  1. Cria cliente Supabase com cookies HTTPOnly + SameSite=Strict
  2. Usa auth.getUser() (NAO getSession()) para validar JWT no servidor
     -> Previne ataques de REPLAY DE TOKEN (roubo de cookie)
  3. Verifica se rota e protegida (/cliente/*, /lojista/*)
  4. Redireciona para /login se nao houver sessao valida
     (preserva URL original em ?redirectTo=)
  5. Redireciona usuarios logados para fora das paginas de auth
  6. Verifica CROSS-ROLE ACCESS:
     -> Lojista acessando /cliente/* -> /lojista/dashboard
     -> Cliente acessando /lojista/* -> /cliente/dashboard

Resultado: Nenhuma pagina protegida e acessivel sem autenticacao valida.
Nenhum usuario pode invadir area de outra funcao, mesmo conhecendo a URL.


--- src/lib/supabase/server.ts --- CLIENTE SUPABASE PARA SERVIDOR

Cria o cliente Supabase para Server Components, Server Actions e middleware.
Usa cookies() do Next.js para ler/escrever a sessao de autenticacao.

Seguranca dos cookies configurados:
  httpOnly: true     -> JavaScript nao acessa (anti-XSS)
  sameSite: 'strict' -> Nao enviado em requests cross-site (anti-CSRF)
  secure: true       -> Apenas em HTTPS em producao (anti-sniffing)


--- src/lib/supabase/client.ts --- CLIENTE SUPABASE PARA BROWSER

Cria o cliente Supabase para Client Components ('use client').
Usa variaveis NEXT_PUBLIC_* que podem ser expostas ao browser.
Nao contem chaves secretas. Protegido pelas politicas RLS do banco.


--- src/lib/validations.ts --- VALIDACAO DE DADOS (Zod)

Define schemas de validacao para todos os formularios do sistema.
Cada schema e usado no frontend (feedback imediato) E no servidor (seguranca).

loginSchema:
  email valido, senha minimo 8 caracteres

cadastroClienteSchema:
  nome (2-120 chars)
  CPF: 11 digitos + algoritmo oficial do digito verificador
  email valido, telefone (10-11 digitos)
  senha forte: min 8 + 1 maiuscula + 1 numero + 1 especial
  confirmaSenha deve ser igual

cadastroLojistSchema:
  nome_loja (2-150), email, telefone
  descricao (max 500), endereco, cidade, estado (2 chars), cep (8 digitos)
  senha forte com mesmas regras

petSchema:
  nome e raca (1-80), sexo (Macho|Femea), dt_nasc (nao futura)
  peso opcional (0.1-199.9 kg), obs (max 500)

servicoSchema:
  nome (2-100), descricao (max 500), preco (>=0)
  duracao (15-480 minutos = max 8 horas), status (Ativo|Inativo)

horarioSchema:
  dia_semana (enum em portugues), hr_inicio e hr_fim (HH:MM)
  hr_fim DEVE ser maior que hr_inicio (refine validation)

agendamentoSchema:
  UUIDs validos para lojista, pet e servico
  data nao pode ser passada, hora HH:MM, obs (max 500)

validarCPF():
  Algoritmo matematico oficial dos digitos verificadores.
  Rejeita CPFs invalidos e sequencias iguais (111.111.111-11).
  Verifica os dois digitos verificadores matematicamente.


--- src/lib/actions.ts --- SERVER ACTIONS (TODA LOGICA CRITICA)

Server Actions executam EXCLUSIVAMENTE no servidor via RPC do Next.js.
Toda validacao e re-feita no servidor, independente do frontend.
O usuario nao pode manipular dados entre o formulario e o servidor.

AUTH ACTIONS:

  loginAction(formData):
    Valida com loginSchema -> autentica via signInWithPassword()
    Le role do user_metadata do JWT -> redireciona para dashboard correto
    Erro generico (nao revela qual campo esta errado - anti-enumeration)

  logoutAction():
    Invalida sessao via signOut() -> limpa cookies -> redireciona /login

  cadastroClienteAction(formData):
    Valida com cadastroClienteSchema
    Cria usuario no Supabase Auth com role='cliente' nos metadados
    Insere na tabela cliente com UUID do Auth como PK
    ROLLBACK: se insert falhar, deleta o usuario Auth criado
    -> Evita usuarios Auth sem registro na tabela cliente

  cadastroLojistaAction(formData):
    Igual ao cliente mas role='lojista' e insere na tabela lojista

PET ACTIONS:

  criarPetAction(formData):
    Verifica auth, valida petSchema
    INSERT com id_cliente = auth.uid() -> pet sempre do usuario logado

  editarPetAction(id_pet, formData):
    Verifica auth, valida petSchema
    UPDATE com WHERE id_pet=? AND id_cliente=auth.uid()
    -> Dupla verificacao: ID do pet E posse pelo cliente

  desativarPetAction(id_pet):
    UPDATE ativo=false WHERE id_pet=? AND id_cliente=auth.uid()
    Soft delete: dados historicos preservados em agendamentos passados

SERVICO ACTIONS (apenas lojistas):

  criarServicoAction(formData):
    Verifica role='lojista' no JWT -> valida servicoSchema
    INSERT com id_lojista=auth.uid()

  editarServicoAction(id_servico, formData):
    Verifica role='lojista'
    UPDATE com WHERE id_servico=? AND id_lojista=auth.uid()

HORARIO ACTIONS (apenas lojistas):

  salvarHorarioAction(formData):
    Verifica role='lojista', valida horarioSchema
    UPSERT por (id_lojista, dia_semana) -> garante 1 horario por dia

  toggleHorarioAction(id_horario, ativo):
    UPDATE ativo=? WHERE id_horario=? AND id_lojista=auth.uid()

AGENDAMENTO ACTIONS:

  criarAgendamentoAction(formData):
    Verifica role='cliente', valida agendamentoSchema
    Chama fn_criar_agendamento() via supabase.rpc()
    -> Funcao SQL tem lock pessimista anti-double-booking
    Retorna UUID do agendamento criado

  cancelarAgendamentoAction(id_agendamento, motivo):
    Funciona para cliente E lojista
    Chama fn_cancelar_agendamento() que registra cancelado_por e motivo

  atualizarStatusAgendamentoAction(id_agendamento, status):
    Apenas lojistas. Status: 'Confirmado' | 'Concluido' | 'Cancelado'
    UPDATE com WHERE id_agendamento=? AND id_lojista=auth.uid()

PERFIL ACTIONS:

  atualizarPerfilLojistaAction(formData):
    Verifica role='lojista'
    Sanitiza campos: trim(), toUpperCase() no estado, remove nao-digitos
    UPDATE na tabela lojista WHERE id_lojista=auth.uid()


--- supabase/migrations/001_schema.sql --- ESQUEMA DO BANCO

EXTENSOES PostgreSQL:
  uuid-ossp : funcao uuid_generate_v4() para PKs aleatorias
  pgcrypto  : funcoes de hash e criptografia no banco

ENUMS (lista fechada de valores validos):
  sexo_pet           : 'Macho', 'Femea'
  status_servico     : 'Ativo', 'Inativo'
  status_agendamento : 'Pendente', 'Confirmado', 'Cancelado', 'Concluido'
  dia_semana         : 'Segunda' a 'Domingo'
  role_usuario       : 'cliente', 'lojista'

TABELAS:

  perfil_usuario:
    id UUID FK -> auth.users, role enum, timestamps
    Criada automaticamente via trigger trg_handle_new_user ao registrar
    Garante que todo usuario Auth tem um role definido no banco

  cliente:
    id_cliente UUID FK -> auth.users ON DELETE CASCADE
    nome TEXT CHECK(2-120 chars), cpf TEXT UNIQUE CHECK(11 digitos)
    email TEXT UNIQUE, telefone TEXT CHECK(10-11 digitos)
    ativo BOOLEAN DEFAULT TRUE, timestamps

  lojista:
    id_lojista UUID FK -> auth.users ON DELETE CASCADE
    nome_loja TEXT(2-150), email UNIQUE, telefone
    descricao, endereco, cidade, estado CHAR(2), cep TEXT(8 digitos)
    logo_url TEXT, ativo BOOLEAN, timestamps

  pet:
    id_pet UUID gerado automaticamente (PK)
    id_cliente UUID FK -> cliente ON DELETE CASCADE
    nome TEXT(1-80), raca TEXT(1-80), sexo sexo_pet enum
    dt_nasc DATE CHECK(nao futura), peso NUMERIC(5,2) CHECK(0<peso<200)
    obs TEXT(max 500), ativo BOOLEAN (soft delete), timestamps

  servico:
    id_servico UUID, id_lojista FK -> lojista ON DELETE CASCADE
    nome TEXT(2-100), descricao TEXT(max 500)
    preco NUMERIC(10,2) CHECK(>=0)
    duracao INTEGER CHECK(0<duracao<=480)  -- minutos, max 8 horas
    status status_servico DEFAULT 'Ativo'

  horario:
    id_horario UUID, id_lojista FK -> lojista ON DELETE CASCADE
    dia_semana dia_semana enum, hr_inicio TIME, hr_fim TIME
    ativo BOOLEAN DEFAULT TRUE
    CONSTRAINT horario_valido: hr_fim > hr_inicio
    UNIQUE(id_lojista, dia_semana) -- 1 horario por dia por lojista

  agendamento:
    id_agendamento UUID, id_pet FK RESTRICT, id_servico FK RESTRICT
    id_cliente FK RESTRICT, id_lojista FK RESTRICT
    (RESTRICT = nao pode deletar registros com agendamentos vinculados)
    dt_agendamento DATE CHECK(nao passada), hr_agendamento TIME
    valor NUMERIC(10,2) -- snapshot do preco no momento do agendamento
    status status_agendamento DEFAULT 'Pendente'
    obs TEXT(max 500), cancelado_por TEXT, motivo_cancelamento TEXT

    INDICE UNICO ANTI-DOUBLE-BOOKING:
    UNIQUE(id_lojista, dt_agendamento, hr_agendamento)
    WHERE status NOT IN ('Cancelado')
    -> Impossivel ter dois agendamentos no mesmo horario no banco

  audit_log:
    id_log UUID, tabela TEXT, operacao CHECK(INSERT|UPDATE|DELETE)
    id_registro UUID, id_usuario UUID FK -> auth.users
    dados_antes JSONB, dados_depois JSONB, ip_address INET
    created_at TIMESTAMPTZ (sem updated_at - imutavel)

    IMUTABILIDADE VIA RULES:
    CREATE RULE audit_log_no_update -> ON UPDATE DO INSTEAD NOTHING
    CREATE RULE audit_log_no_delete -> ON DELETE DO INSTEAD NOTHING
    -> Nenhum codigo ou admin SQL pode alterar ou deletar logs historicos

INDICES de performance:
  idx_cliente_email, idx_cliente_cpf
  idx_pet_cliente
  idx_servico_lojista, idx_servico_status
  idx_horario_lojista
  idx_agendamento_cliente, idx_agendamento_lojista, idx_agendamento_pet
  idx_agendamento_status, idx_agendamento_data
  idx_agendamento_unique_slot (indice de unicidade anti-double-booking)
  idx_audit_registro, idx_audit_usuario, idx_audit_tabela

TRIGGERS automaticos:
  trg_*_updated_at: BEFORE UPDATE -> fn_set_updated_at() -> NEW.updated_at=NOW()
  trg_audit_agendamento: AFTER INSERT OR UPDATE OR DELETE -> registra no audit_log
    com dados_antes (OLD row em JSON) e dados_depois (NEW row em JSON)
  trg_handle_new_user: AFTER INSERT ON auth.users
    -> cria registro em perfil_usuario com o role extraido do JWT metadata


--- supabase/migrations/002_rls.sql --- ROW LEVEL SECURITY

RLS filtra automaticamente quais linhas cada usuario pode ver/modificar.
Funciona no nivel do banco, independente do codigo da aplicacao.
Mesmo com um bug no Next.js, o banco bloqueia o acesso nao autorizado.

CONFIGURACAO:
  ALTER TABLE ... ENABLE ROW LEVEL SECURITY    -> ativa RLS
  ALTER TABLE ... FORCE ROW LEVEL SECURITY     -> aplica ate para o dono da tabela
  Aplicado em TODAS as 8 tabelas.

FUNCAO HELPER auth_role():
  Le o role do JWT token em cache (performance sem JOIN)
  Fallback: consulta tabela perfil_usuario se JWT nao tiver o role

POLITICAS DETALHADAS:

  perfil_usuario:
    SELECT: id = auth.uid() (ve apenas o proprio)
    UPDATE: id = auth.uid() AND role = (SELECT role ... WHERE id=uid)
      -> Pode atualizar, mas NAO pode mudar o campo role
    INSERT: sem politica -> bloqueado para usuarios (apenas via trigger)
    DELETE: sem politica -> bloqueado

  cliente:
    SELECT (proprio): id_cliente = auth.uid()
    SELECT (lojista): auth_role()='lojista' AND id_cliente IN
      (SELECT DISTINCT id_cliente FROM agendamento WHERE id_lojista=uid)
      -> Lojista ve apenas clientes que agendaram com ele
    INSERT: id_cliente = auth.uid()
    UPDATE: id_cliente = auth.uid() (USING e WITH CHECK)
    DELETE: USING(FALSE) -> bloqueado para todos

  lojista:
    SELECT (proprio): id_lojista = auth.uid()
    SELECT (clientes): ativo=TRUE AND auth_role()='cliente'
      -> Clientes autenticados veem lojas ATIVAS (para busca no wizard)
    INSERT: id_lojista = auth.uid()
    UPDATE: id_lojista = auth.uid()
    DELETE: USING(FALSE) -> bloqueado

  pet:
    SELECT (dono): id_cliente = auth.uid()
    SELECT (lojista): auth_role()='lojista' AND id_pet IN
      (SELECT DISTINCT id_pet FROM agendamento WHERE id_lojista=uid)
      -> Lojista ve pets que foram atendidos no seu petshop
    INSERT: id_cliente = auth.uid()
    UPDATE: id_cliente = auth.uid()
    DELETE: USING(FALSE) -> usar soft delete (ativo=false)

  servico:
    SELECT (ativos): status='Ativo' (qualquer autenticado)
    SELECT (lojista): id_lojista = auth.uid() (ve todos, inclusive inativos)
    INSERT: id_lojista = auth.uid() AND auth_role()='lojista'
    UPDATE: id_lojista = auth.uid()
    DELETE: id_lojista = auth.uid() AND NOT EXISTS (agendamentos ativos)

  horario:
    SELECT (ativos): ativo=TRUE (qualquer autenticado)
    SELECT (lojista): id_lojista = auth.uid()
    INSERT/UPDATE/DELETE: id_lojista = auth.uid()

  agendamento:
    SELECT (cliente): id_cliente = auth.uid()
    SELECT (lojista): id_lojista = auth.uid()
    INSERT: id_cliente = auth.uid()
             AND auth_role() = 'cliente'
             AND EXISTS(pet WHERE id_pet=ag.id_pet AND id_cliente=uid AND ativo=TRUE)
             AND EXISTS(servico WHERE id_servico=ag.id_servico
                        AND id_lojista=ag.id_lojista AND status='Ativo')
    UPDATE (cliente): USING(id_cliente=uid AND status IN ('Pendente','Confirmado'))
                      WITH CHECK(id_cliente=uid AND status='Cancelado'
                                 AND cancelado_por='cliente')
    UPDATE (lojista): USING(id_lojista=uid) WITH CHECK(id_lojista=uid)
    DELETE: USING(FALSE) -> cancelar via status, nunca deletar fisicamente

  audit_log:
    SELECT (lojista): logs dos seus agendamentos
    SELECT (cliente): logs dos seus agendamentos
    INSERT: WITH CHECK(FALSE) -> apenas via triggers SECURITY DEFINER
    UPDATE/DELETE: sem politicas -> bloqueado (imutavel)


--- supabase/migrations/003_functions.sql --- FUNCOES SQL

fn_horarios_disponiveis(p_id_lojista UUID, p_data DATE, p_duracao INTEGER):
  LANGUAGE plpgsql, STABLE, SECURITY DEFINER, SET search_path=public
  1. Descobre dia da semana da data (EXTRACT DOW -> enum dia_semana)
  2. Busca hr_inicio e hr_fim do lojista para aquele dia
  3. Gera slots de 30 em 30 minutos entre hr_inicio e hr_fim
  4. Para cada slot: verifica sobreposicao com agendamentos ativos
     -> nao apenas o horario exato, mas considera duracao de cada servico
     -> slot < (hr_agendamento + duracao_servico_existente)
     -> E (slot + p_duracao) > hr_agendamento
  5. RETURN NEXT para cada slot com hr_slot e disponivel BOOLEAN
  Usado pelo NovoAgendamentoWizard (etapa 4) para mostrar slots coloridos.

fn_criar_agendamento(p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
                     p_data, p_hora, p_obs):
  LANGUAGE plpgsql, SECURITY DEFINER, SET search_path=public
  VERIFICACOES DE SEGURANCA:
  1. p_id_cliente != auth.uid() -> RAISE EXCEPTION (nao pode criar por outro)
  2. SELECT preco, duracao FROM servico WHERE ... FOR UPDATE (lock no servico)
     -> Congela preco e duracao durante a transacao (anti-race-condition)
  3. SELECT EXISTS(agendamentos no slot) FOR UPDATE SKIP LOCKED
     -> Lock pessimista: dois usuarios nao pegam o mesmo horario
  4. p_data < CURRENT_DATE -> RAISE EXCEPTION (nao agenda passado)
  5. Pet nao pertence ao cliente -> RAISE EXCEPTION
  6. INSERT agendamento com valor=preco_capturado
  7. RETURNING id_agendamento -> retorna UUID para o frontend

fn_cancelar_agendamento(p_id_agendamento UUID, p_motivo TEXT):
  LANGUAGE plpgsql, SECURITY DEFINER
  1. SELECT id_cliente, id_lojista, status FOR UPDATE (lock no agendamento)
  2. Se NOT FOUND -> RAISE EXCEPTION
  3. Identifica cancelado_por:
     auth.uid() = id_cliente -> 'cliente'
     auth.uid() = id_lojista -> 'lojista'
     else -> RAISE EXCEPTION (nao autorizado)
  4. Se status IN ('Cancelado', 'Concluido') -> RAISE EXCEPTION
  5. UPDATE status='Cancelado', cancelado_por, motivo_cancelamento

fn_metricas_lojista(p_id_lojista UUID):
  LANGUAGE plpgsql, STABLE, SECURITY DEFINER
  Verifica auth.uid() = p_id_lojista
  Retorna JSON com um SELECT e multiplos FILTER:
    total_mes    : agendamentos no mes/ano atual
    receita_mes  : SUM(valor) WHERE status='Concluido' no mes
    pendentes    : COUNT WHERE status='Pendente'
    confirmados  : COUNT WHERE status='Confirmado'
    hoje         : COUNT WHERE dt_agendamento=CURRENT_DATE e nao cancelado
    clientes_unicos: COUNT(DISTINCT id_cliente)

fn_agenda_dia(p_id_lojista UUID, p_data DATE):
  LANGUAGE plpgsql, STABLE, SECURITY DEFINER
  Verifica auth.uid() = p_id_lojista
  RETURN QUERY com JOIN em cliente (nome), pet (nome), servico (nome, duracao)
  WHERE id_lojista=p e dt_agendamento=p_data e status!='Cancelado'
  ORDER BY hr_agendamento ASC


--- next.config.ts --- CONFIGURACAO NEXT.JS PARA VERCEL

reactStrictMode: true
  Ativa StrictMode do React em desenvolvimento.
  Detecta renders duplos, efeitos sem cleanup e APIs depreciadas.

images.remotePatterns:
  Permite carregar imagens de https://*.supabase.co/storage/v1/object/public/*
  (logos de lojas, fotos de pets hospedadas no Supabase Storage)

HTTP SECURITY HEADERS aplicados em todas as rotas (source '/(.*)')':

X-Frame-Options: DENY
  Impede embedding em <iframe>. Protecao contra clickjacking.
  Atacante nao pode criar pagina falsa sobrepondo o site real.

X-Content-Type-Options: nosniff
  Impede que o browser adivinhe o Content-Type de respostas.
  Protecao contra arquivos maliciosos servidos com tipo incorreto.

Referrer-Policy: strict-origin-when-cross-origin
  Em requisicoes cross-origin, envia apenas a origem (sem o path).
  Impede que URLs internas com IDs de usuarios vazem para sites externos.

Permissions-Policy: camera=(), microphone=(), geolocation=()
  Desabilita APIs de hardware que o site nao usa.
  Mesmo com script malicioso injetado, browser bloqueia essas APIs.

Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  HSTS: instrui o browser a sempre usar HTTPS por 1 ano.
  Mesmo digitando http://, browser redireciona internamente para HTTPS.
  preload: candidata o dominio para lista HSTS preload dos browsers.
  includeSubDomains: aplica em todos os subdominios.

Content-Security-Policy (CSP):
  Defesa principal contra XSS (Cross-Site Scripting).
  Lista exata de origens autorizadas por tipo de recurso:
    default-src 'self'
    script-src 'self' 'unsafe-inline' 'unsafe-eval'  (Next.js requer)
    style-src 'self' 'unsafe-inline' fonts.googleapis.com
    font-src 'self' fonts.gstatic.com
    img-src 'self' data: blob: *.supabase.co
    connect-src 'self' *.supabase.co wss://*.supabase.co (Realtime)
    frame-ancestors 'none'  (reforco do X-Frame-Options no CSP)
    base-uri 'self'         (impede injecao de tag <base> maliciosa)
    form-action 'self'      (forms so enviam para o proprio dominio)

================================================================================
  COMPONENTES - O QUE CADA UM FAZ
================================================================================

LojistaSidebar.tsx / ClienteSidebar.tsx:
  Sidebar de navegacao com logo PetAgenda, links do menu e botao de logout.
  usePathname() destaca o link da rota ativa com estilo diferente.
  Botao Sair chama logoutAction() (Server Action).
  Design responsivo com colapso em telas menores.

AgendamentosLojistaList.tsx:
  Lista interativa de todos os agendamentos do petshop.
  Filtros por status: Todos | Pendente | Confirmado | Concluido | Cancelado.
  Acoes por agendamento de acordo com o status atual:
    Pendente   -> botoes Confirmar e Cancelar
    Confirmado -> botoes Concluir e Cancelar
    Concluido/Cancelado -> apenas visualizacao
  Chama atualizarStatusAgendamentoAction e cancelarAgendamentoAction.

HorariosManager.tsx:
  Grid visual dos 7 dias da semana com status e horario de cada um.
  Toggle ON/OFF para ativar ou desativar cada dia.
  Modal de edicao com inputs de hr_inicio e hr_fim (validacao hr_fim>hr_inicio).
  Chama salvarHorarioAction e toggleHorarioAction.

ServicosList.tsx:
  Tabela de servicos: nome, descricao, preco, duracao, status.
  Botao Novo Servico abre modal com formulario completo.
  Icone de editar abre modal pre-preenchido com dados do servico.
  Toggle de status Ativo/Inativo para cada servico.
  Chama criarServicoAction e editarServicoAction.

PerfilLojistaForm.tsx:
  Formulario dividido em secoes:
    Identificacao: nome_loja (obrigatorio), telefone (obrigatorio), descricao
    Endereco: endereco, cidade, estado (2 chars), cep
  Feedback de sucesso exibido por 3 segundos apos salvar.
  Chama atualizarPerfilLojistaAction.

AgendamentosClienteList.tsx:
  Historico de todos os agendamentos do cliente com filtros por status.
  Cada item mostra: petshop, servico, pet, data, hora, valor, status.
  Botao Cancelar visivel apenas para Pendente ou Confirmado.
  Modal de confirmacao com campo de motivo opcional.
  Chama cancelarAgendamentoAction.

NovoAgendamentoWizard.tsx - Wizard de 5 etapas:
  Barra de progresso visual com indicador de etapa atual.
  Etapa 1: busca lojas ativas (RLS garante apenas lojas ativas)
  Etapa 2: busca servicos ativos do petshop selecionado
  Etapa 3: lista pets ativos do cliente logado
  Etapa 4: input de data (min=hoje) -> chama fn_horarios_disponiveis()
           Grid de slots coloridos (verde=disponivel, vermelho=ocupado)
  Etapa 5: resumo completo + campo obs opcional -> Confirmar
  Navegacao: botoes Anterior/Proximo com validacao de selecao em cada etapa.
  Chama criarAgendamentoAction().

PetCard.tsx:
  Card visual para cada pet.
  Exibe: nome, raca, sexo, idade calculada (date-fns differenceInYears),
         peso (se informado) e observacoes.
  Botao Editar abre modal inline com formulario pre-preenchido.
  Botao Remover mostra confirmacao antes do soft delete.
  Chama editarPetAction e desativarPetAction.

================================================================================
  PAGINAS DETALHADAS
================================================================================

LOJISTA:

  /lojista/dashboard:
    Server Component. Busca em paralelo:
      supabase.rpc('fn_metricas_lojista') -> JSON com stats do mes
      supabase.rpc('fn_agenda_dia') -> agendamentos de hoje
    Cards de metricas: agendamentos hoje, pendentes, receita mes, clientes
    Tabela agenda do dia: horario, cliente, pet, servico, duracao, valor, status

  /lojista/agendamentos:
    SELECT com join: pet(nome,raca,sexo), servico(nome,duracao), cliente(nome,tel)
    Passa para AgendamentosLojistaList (Client Component interativo)

  /lojista/servicos:
    SELECT WHERE id_lojista=uid ORDER BY created_at DESC
    Passa para ServicosList

  /lojista/horarios:
    SELECT WHERE id_lojista=uid ORDER BY dia_semana
    Passa para HorariosManager

  /lojista/clientes:
    SELECT agendamentos com join em cliente e pet WHERE nao cancelado
    Agrupa por id_cliente em Map<string, entry>
    Para cada cliente acumula: pets atendidos (Set) e totalAgendamentos
    Renderiza tabela diretamente (Server Component, sem Client Component extra)

  /lojista/perfil:
    SELECT * FROM lojista WHERE id_lojista=uid
    Passa para PerfilLojistaForm

CLIENTE:

  /cliente/dashboard:
    Busca em paralelo:
      5 proximos agendamentos nao cancelados (data >= hoje, ASC, LIMIT 5)
        com JOIN em pet, servico e lojista
      COUNT pets WHERE ativo=true
      COUNT total agendamentos
      SUM(valor) WHERE status='Concluido'
    Cards de stats + lista de proximos agendamentos

  /cliente/pets:
    SELECT WHERE id_cliente=uid AND ativo=true ORDER BY created_at DESC
    differenceInYears(new Date(), new Date(pet.dt_nasc)) para calcular idade
    Grid de 3 colunas com PetCard para cada pet

  /cliente/pets/novo:
    Formulario com todos os campos do petSchema
    Chama criarPetAction, redireciona apos sucesso

  /cliente/agendamentos:
    Historico completo com filtros por status e cancelamento com modal

  /cliente/novo-agendamento:
    Renderiza NovoAgendamentoWizard com wizard de 5 etapas

PUBLICAS:

  / (Landing Page):
    Navbar com logo + botoes Entrar e Criar Conta
    Hero section com gradiente, titulo, descricao e CTAs
    Grid de 6 feature cards com icones e descricoes
    Secao CTA final com link para cadastro de lojista

  /login:
    useTransition para loading state durante a Server Action
    Exibe erro em alert vermelho (mensagem generica)
    Links para cadastro de cliente e lojista

  /cadastro:
    Formulario completo de cliente com mascara de CPF
    Validacao do CPF pelo algoritmo oficial no servidor

  /cadastro/lojista:
    Formulario com dados da loja + endereco + senha

================================================================================
  10 CAMADAS DE SEGURANCA
================================================================================

CAMADA 1 - FRONTEND (Zod)
  Valida inputs antes de submeter o formulario.
  Feedback imediato e amigavel para o usuario.
  NAO e considerada seguranca real (pode ser bypassada).

CAMADA 2 - MIDDLEWARE (Next.js)
  Intercepta toda requisicao HTTP antes de renderizar.
  Verifica JWT contra o servidor Supabase (nao apenas local).
  Bloqueia acesso cross-role entre lojistas e clientes.
  Redireciona nao autenticados preservando URL de destino.

CAMADA 3 - SERVER ACTIONS (Next.js)
  Re-valida todos os dados com Zod no servidor.
  Verifica role do usuario para cada operacao sensivel.
  Adiciona WHERE id = auth.uid() (ownership check) em todas as queries.
  Executa exclusivamente no servidor - codigo invisivel ao browser.

CAMADA 4 - ROW LEVEL SECURITY (PostgreSQL/Supabase)
  Politicas automaticas no banco de dados.
  Mesmo que o codigo da aplicacao tenha um bug de seguranca,
  o banco bloqueia operacoes nao autorizadas automaticamente.
  FORCE RLS: aplica ate para o superusuario do banco.

CAMADA 5 - FUNCOES SQL SECURITY DEFINER
  Operacoes criticas executam dentro de funcoes SQL controladas.
  SECURITY DEFINER: executam com privilegios de owner do schema.
  Verificacao de auth.uid() interna: impossivel bypassar.
  Lock pessimista (FOR UPDATE) evita race conditions em agendamentos.

CAMADA 6 - AUDIT LOG IMUTAVEL
  RULES do PostgreSQL bloqueiam UPDATE e DELETE na tabela audit_log.
  Nenhum codigo, trigger ou admin SQL pode alterar registros historicos.
  Cada mudanca em agendamentos registrada com dados completos (JSONB).
  Trilha de auditoria completa para investigacao de incidentes.

CAMADA 7 - COOKIES HTTPOnly
  Token de sessao em cookie HTTPOnly (JS nao pode ler ou roubar).
  SameSite=Strict: cookie nao enviado em requisicoes cross-site (anti-CSRF).
  Secure=true em producao: apenas em conexoes HTTPS criptografadas.
  Validacao no servidor com auth.getUser() (nao apenas local).

CAMADA 8 - HTTP SECURITY HEADERS
  6 headers aplicados em todas as rotas via next.config.ts:
  X-Frame-Options, CSP, HSTS, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy.
  Protecao contra: clickjacking, XSS, MIME sniffing, protocol downgrade,
  informacoes vazadas em referrer, acesso a hardware indevido.

CAMADA 9 - CONSTRAINTS DO BANCO
  CHECK constraints validam dados no nivel do PostgreSQL.
  UNIQUE indexes impedem duplicatas (CPF, email, slot de horario).
  FK com ON DELETE RESTRICT: nao permite deletar com referencias ativas.
  ENUMs: banco rejeita qualquer valor fora da lista definida.
  Indice unico anti-double-booking: (lojista, data, hora) exceto cancelados.

CAMADA 10 - VALIDACAO DE CPF
  Algoritmo matematico oficial dos 2 digitos verificadores do CPF.
  Implementado na funcao validarCPF() dentro do Zod schema.
  Rejeita CPFs invalidos (digitos verificadores incorretos).
  Rejeita sequencias iguais (111.111.111-11, 000.000.000-00 etc.).
  Executado no frontend (UX) E re-executado no servidor (seguranca real).

================================================================================
  DEPLOY - PASSO A PASSO COMPLETO
================================================================================

PARTE 1 - CONFIGURAR SUPABASE:

  1. Acesse https://supabase.com -> New project
     Escolha nome, senha do banco, regiao (prefira South America se disponivel)

  2. Aguarde o projeto inicializar (1-2 minutos)
     Va em SQL Editor -> New query

  3. Execute as migrations EM ORDEM (uma por vez):
       Cole e Execute: supabase/migrations/001_schema.sql
       Cole e Execute: supabase/migrations/002_rls.sql
       Cole e Execute: supabase/migrations/003_functions.sql
     Verifique que cada uma executou sem erros antes de continuar

  4. Va em Project Settings -> API e copie:
       Project URL       -> NEXT_PUBLIC_SUPABASE_URL
       anon / public key -> NEXT_PUBLIC_SUPABASE_ANON_KEY
     IMPORTANTE: NAO use a service_role key no frontend (acesso total ao banco)

  5. OPCIONAL - Para testes sem confirmacao de email:
     Authentication -> Providers -> Email -> desmarque "Confirm email"

PARTE 2 - DEPLOY NA VERCEL:

  1. Crie repositorio no GitHub e faca push:
       git add .
       git commit -m "Initial commit"
       git push origin main

  2. Acesse https://vercel.com -> Add New Project -> Import Git Repository
     Conecte sua conta GitHub e selecione o repositorio

  3. Configure o projeto:
       Framework Preset : Next.js (detectado automaticamente)
       Root Directory   : petshop-app
       Build Command    : npm run build (padrao)
       Output Directory : .next (padrao)

  4. Configure Environment Variables (obrigatorio):
       NEXT_PUBLIC_SUPABASE_URL      = https://xxxxxxxxxxx.supabase.co
       NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciO...

  5. Clique em Deploy. A Vercel executa automaticamente:
       npm install -> npx next build -> deploy

  6. Apos o deploy, copie a URL da Vercel (ex: meu-petshop.vercel.app)
     No Supabase -> Authentication -> URL Configuration:
       Site URL      : https://meu-petshop.vercel.app
       Redirect URLs : https://meu-petshop.vercel.app/**

ATUALIZACOES FUTURAS:
  Qualquer push para a branch main = deploy automatico na Vercel.
  Nao precisa fazer nada manualmente apos o setup inicial.

================================================================================
  VARIAVEIS DE AMBIENTE
================================================================================

Arquivo: petshop-app/.env.local
NAO commitar no git (ja esta no .gitignore)

  NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
    URL publica do projeto Supabase.
    Pode aparecer no codigo do browser sem problema.

  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    Chave publica anonima. Pode ser exposta ao browser.
    Protegida pelas politicas RLS: usuario so acessa o que tem permissao.
    NAO e a service_role key (que bypassa RLS e tem acesso irrestrito).

Para producao na Vercel: adicionar as mesmas em
Project Settings -> Environment Variables -> todas as envs (Production/Preview/Dev).

================================================================================
  DEPENDENCIAS DO PROJETO
================================================================================

PRODUCAO (package.json "dependencies"):
  next@16.3.0          Framework React full-stack com App Router e SSR
  react@19.2.8         Biblioteca de interface de usuario
  react-dom@19.2.8     Renderizador DOM do React
  @supabase/ssr@^0.12  Wrapper SSR do Supabase (cookies, middleware)
  @supabase/supabase-js SDK JavaScript oficial do Supabase
  date-fns@^4.4        Utilitarios de data com suporte a locale pt-BR
  zod@^4.4             Biblioteca de validacao TypeScript-first

DESENVOLVIMENTO (package.json "devDependencies"):
  typescript@^5        Superset tipado do JavaScript
  @types/node          Tipos TypeScript para APIs do Node.js
  @types/react         Tipos TypeScript para React
  @types/react-dom     Tipos TypeScript para React DOM
  eslint               Linter de codigo JavaScript/TypeScript
  eslint-config-next   Regras de lint especificas para Next.js

================================================================================
  COMANDOS UTEIS
================================================================================

  cd petshop-app            Entra na pasta do projeto

  npm install               Instala todas as dependencias (precisa .env.local)

  npm run dev               Inicia servidor de dev com hot-reload
                            Acesse: http://localhost:3000

  npx tsc --noEmit          Verifica erros de tipo TypeScript (sem compilar)

  npm run build             Gera build otimizado para producao

  npm start                 Serve o build de producao localmente

  npm run lint              Verifica o codigo com ESLint

================================================================================
  FLUXO DE USO DO SISTEMA
================================================================================

JORNADA DO LOJISTA:
  1. Acessa /cadastro/lojista -> preenche dados da loja -> cria conta
     -> Redirecionado para /lojista/dashboard automaticamente

  2. Acessa /lojista/servicos -> Adiciona servicos:
     Exemplos: Banho (R$ 50, 60 min), Tosa (R$ 80, 90 min)

  3. Acessa /lojista/horarios -> Configura funcionamento:
     Exemplos: Segunda-Sexta 08:00-18:00, Sabado 08:00-13:00

  4. Aguarda clientes agendarem (nao precisa de intervencao)

  5. Acessa /lojista/agendamentos -> ve novos agendamentos (Pendente)
     Confirma agendamentos que ira atender -> status Confirmado
     Apos atendimento: marca como Concluido
     Se necessario: cancela com motivo

  6. Acompanha metricas no /lojista/dashboard:
     Receita do mes, clientes unicos, agendamentos hoje e pendentes

  7. Edita dados da loja em /lojista/perfil se necessario

JORNADA DO CLIENTE:
  1. Acessa /cadastro -> preenche nome, CPF, telefone, email, senha
     -> Redirecionado para /cliente/dashboard automaticamente

  2. Acessa /cliente/pets -> Novo pet:
     Preenche nome, raca, sexo, data nascimento, peso, obs

  3. Clica em Novo Agendamento (dashboard ou /cliente/novo-agendamento)
     Wizard de 5 etapas:
     [1] Seleciona o petshop desejado
     [2] Seleciona o servico (banho, tosa etc.)
     [3] Seleciona qual pet sera atendido
     [4] Escolhe a data -> sistema mostra slots disponiveis em verde
         Clica no horario desejado
     [5] Revisa todos os dados -> confirma

  4. Agendamento criado com status Pendente

  5. Lojista confirma -> status muda para Confirmado

  6. Cliente leva o pet no horario -> Lojista marca Concluido

  7. Cliente acompanha historico em /cliente/agendamentos
     Pode cancelar agendamentos Pendentes ou Confirmados

================================================================================
  FIM DA DOCUMENTACAO - PETSHOP AGENDA SAAS
================================================================================

================================================================================
  BUGS ENCONTRADOS E CORRECOES APLICADAS
================================================================================

--- BUG #001 | Data: 2026-08-12 | Status: CORRIGIDO ---

TITULO: Cadastro de lojista falha com erro de RLS ao inserir na tabela lojista

ARQUIVO AFETADO: src/lib/actions.ts (funcao cadastroLojistaAction)
TAMBEM AFETADO: src/lib/actions.ts (funcao cadastroClienteAction, mesmo problema)

ERRO EXIBIDO NO BROWSER:
  "Erro ao salvar dados do estabelecimento: new row violates row-level security
   policy for table 'lojista'"

CAUSA RAIZ:
  O fluxo de cadastro faz:
    1. supabase.auth.signUp() -> cria o usuario no Supabase Auth
    2. supabase.from('lojista').insert() -> tenta inserir o perfil na tabela

  O problema: apos o signUp(), a sessao do novo usuario NAO esta disponivel
  imediatamente no servidor. O cookie de autenticacao ainda nao foi escrito
  ou propagado no contexto da Server Action.

  Resultado: o insert na etapa 2 e feito com a anon key sem JWT valido,
  ou seja, o Supabase trata como usuario ANONIMO (nao autenticado).

  A politica RLS de INSERT na tabela lojista exige:
    WITH CHECK (id_lojista = auth.uid())
  Como auth.uid() retorna NULL (anonimo), a policy bloqueia o insert.

  Isso vale identicamente para a tabela cliente no cadastroClienteAction.

ARQUIVOS CRIADOS NA CORRECAO:
  src/lib/supabase/admin.ts [NOVO]
    - Cria um Supabase client usando a SUPABASE_SERVICE_ROLE_KEY
    - A service_role key bypassa completamente o RLS
    - Usada SOMENTE em Server Actions (nunca no browser)
    - Variavel sem prefixo NEXT_PUBLIC_ = nunca exposta ao cliente

ALTERACOES EM ARQUIVOS EXISTENTES:
  src/lib/actions.ts
    - Import de createAdminClient de '@/lib/supabase/admin'
    - cadastroClienteAction: insert na tabela cliente agora usa adminClient
    - cadastroLojistaAction: insert na tabela lojista agora usa adminClient
    - Adicionado rollback (deleteUser) tambem no lojista se insert falhar

  petshop-app/.env.local
    - Adicionada linha: SUPABASE_SERVICE_ROLE_KEY=COLE_AQUI_SUA_SERVICE_ROLE_KEY
    - ACAO NECESSARIA: substituir pelo valor real em Project Settings > API
    - Tambem adicionar essa variavel na Vercel em Environment Variables

MENSAGENS DE ERRO MELHORADAS:
  Antes: "Erro ao salvar dados do estabelecimento: new row violates row-level
          security policy for table 'lojista'"
  Depois: "Nao foi possivel salvar os dados do estabelecimento. Tente novamente
           ou entre em contato com o suporte."

  Antes: "Erro ao salvar dados: [mensagem tecnica do banco]"
  Depois: "Nao foi possivel finalizar o cadastro. Tente novamente ou entre em
           contato com o suporte."

  Antes: "Erro interno."
  Depois: "Nao foi possivel criar a conta. Tente novamente."

OBSERVACAO IMPORTANTE PARA O FUTURO:
  Qualquer operacao que precise acontecer IMEDIATAMENTE apos um signUp(),
  antes da sessao do usuario estar disponivel, DEVE usar o adminClient.
  Exemplos: insert de perfil, criacao de registro inicial, etc.
  Operacoes de usuarios JA LOGADOS devem continuar usando o supabase normal
  (com cookies) para que o RLS funcione corretamente como camada de seguranca.

VARIAVEL DE AMBIENTE PENDENTE:
  SUPABASE_SERVICE_ROLE_KEY ainda tem valor placeholder no .env.local.
  Sem ela, o servidor vai lancar uma excecao ao tentar criar o adminClient
  e o cadastro continuara falhando (com mensagem diferente).
  PRIORIDADE: adicionar antes de qualquer novo teste de cadastro.

--- BUG #002 | Data: 2026-08-12 | Status: CORRIGIDO ---

TITULO: Build falha na Vercel com erro TypeScript TS18047 (adminClient possibly null)

ARQUIVO AFETADO: src/lib/actions.ts (funcao cadastroClienteAction)

ERRO EXIBIDO NO BUILD:
  src/lib/actions.ts(95,41): error TS18047: 'adminClient' is possibly 'null'.

CAUSA RAIZ:
  Quando createAdminClient() foi alterado para retornar null em vez de lancar
  excecao (correcao do BUG #001), o tipo de retorno passou a ser SupabaseClient|null.
  A funcao cadastroLojistaAction recebeu o null check corretamente, mas a funcao
  cadastroClienteAction foi esquecida. O TypeScript detecta o problema em build time
  e recusa compilar.

CORRECAO:
  Adicionado null check identico em cadastroClienteAction:
    const adminClient = createAdminClient()
    if (!adminClient) {
      return { error: 'Servico temporariamente indisponivel...' }
    }
  Alem disso, o rollback de deleteUser foi corrigido para usar adminClient
  em vez de supabase.auth.admin (que e undefined no client SSR normal).

--- BUG #003 | Data: 2026-08-12 | Status: CORRIGIDO ---

TITULO: Login redireciona lojista para /cliente/dashboard

ARQUIVO AFETADO:
  src/lib/actions.ts (loginAction)
  src/proxy.ts (arquivo renomeado para middleware.ts)

CAUSA RAIZ - PARTE 1 (arquivo com nome errado):
  O middleware de protecao de rotas estava no arquivo src/proxy.ts com a funcao
  exportada como proxy(). O Next.js exige que o arquivo se chame middleware.ts
  e que a funcao exportada se chame middleware(). Com o nome errado, o middleware
  NUNCA era executado em nenhuma requisicao.

CAUSA RAIZ - PARTE 2 (role nao disponivel):
  Mesmo com o middleware correto, o loginAction lia user_metadata.role para
  decidir o redirecionamento. Se o campo nao estivesse disponivel (timing de auth
  ou contas antigas), role seria undefined e a comparacao role==='lojista' retornaria
  false, mandando o lojista para /cliente/dashboard.

CORRECAO:
  src/proxy.ts renomeado para src/middleware.ts
  Funcao proxy() renomeada para middleware()
  loginAction agora usa cadeia de fallbacks:
    1. user_metadata.role (JWT, sem custo de rede)
    2. tabela perfil_usuario (banco)
    3. tabela lojista (verifica se o usuario existe la)

--- BUG #004 | Data: 2026-08-12 | Status: CORRIGIDO ---

TITULO: ERR_TOO_MANY_REDIRECTS ao acessar qualquer pagina logado

ARQUIVO AFETADO: src/middleware.ts

ERRO EXIBIDO NO BROWSER:
  ERR_TOO_MANY_REDIRECTS / "Redirecionamento em excesso"

CAUSA RAIZ:
  O middleware verificava o role para protecao cross-role, mas os destinos dos
  redirecionamentos estavam INVERTIDOS por erro de digitacao:

    ERRADO (causava loop):
      if (pathname.startsWith('/lojista') && role !== 'lojista') {
        url.pathname = '/lojista/dashboard'  <- MESMO URL = loop infinito!
      }
      if (pathname.startsWith('/cliente') && role !== 'cliente') {
        url.pathname = '/cliente/dashboard'  <- MESMO URL = loop infinito!
      }

    CORRETO:
      if (pathname.startsWith('/lojista') && role !== 'lojista') {
        url.pathname = '/cliente/dashboard'  <- redireciona para FORA da area
      }
      if (pathname.startsWith('/cliente') && role !== 'cliente') {
        url.pathname = '/lojista/dashboard'  <- redireciona para FORA da area
      }

  Alem disso, o middleware chamava resolveRole() duas vezes por requisicao
  (duplicacao desnecessaria de queries ao banco).

CORRECAO:
  Middleware reescrito do zero com logica clara em 4 etapas comentadas:
    1. Sem sessao em rota protegida -> /login
    2. Resolver role (user_metadata -> perfil_usuario -> tabela lojista)
    3. Logado em pagina de auth -> dashboard correto
    4. Cross-role: redireciona para a area CERTA do usuario
  resolveRole() executado uma vez por requisicao.
  Destinos de redirecionamento corretos e verificados.

LICAO APRENDIDA:
  Ao implementar protecao cross-role, sempre verificar:
    "Se NAO e lojista e esta em /lojista -> redireciona para /CLIENTE"
    "Se NAO e cliente e esta em /cliente -> redireciona para /LOJISTA"
  O destino deve ser o OPOSTO da area que esta bloqueando.

================================================================================
  FIM DO REGISTRO DE BUGS
================================================================================
