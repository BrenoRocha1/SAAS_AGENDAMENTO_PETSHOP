-- ============================================================
-- PETSHOP SaaS - Migration 088: Comunicação → WhatsApp
-- ============================================================
-- Central de atendimento por WhatsApp dentro do painel da loja, ligada à
-- WhatsApp Business Platform (Cloud API oficial da Meta).
--
-- Cada loja conecta o PRÓPRIO número. Tudo aqui é por loja (id_lojista),
-- como o resto do sistema: uma loja nunca enxerga conversa de outra.
--
--   whatsapp_integracao  o número conectado da loja (sem nenhum segredo)
--   whatsapp_credencial  token e segredo do app da Meta — só o servidor lê
--   whatsapp_conversa    uma conversa por contato (telefone) em cada loja
--   whatsapp_mensagem    as mensagens, recebidas e enviadas
--
-- Quem pode usar: o dono, o administrador (acesso_total) e o funcionário
-- com a permissão nova pode_atender_whatsapp. Conectar e desconectar o
-- número é só do dono e do administrador.
--
-- Quem escreve:
--   • mensagem RECEBIDA e mudança de status (entregue, lida): o webhook da
--     Meta, no servidor, pelas funções fn_whatsapp_receber e
--     fn_whatsapp_status (só a chave de serviço executa);
--   • mensagem ENVIADA: o servidor, depois de mandar para a Meta;
--   • o resto (assumir, transferir, encerrar, marcar como lida, vincular
--     cliente, nova conversa): funções chamadas por quem está logado, que
--     conferem a permissão. Nenhuma tabela aceita escrita direta do
--     navegador — as regras abaixo só liberam leitura.
--
-- Nada existente muda: só entram tabelas, funções e uma coluna nova (com
-- padrão FALSE) em funcionario.
-- ============================================================

-- ============================================================
-- 1) Permissão do funcionário
-- ============================================================
ALTER TABLE funcionario ADD COLUMN IF NOT EXISTS pode_atender_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;

-- Quem atende o WhatsApp desta loja: dono, administrador ou funcionário
-- com a permissão.
CREATE OR REPLACE FUNCTION fn_whatsapp_da_loja(p_id_lojista UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_id_lojista IS NOT NULL AND (
    auth.uid() = p_id_lojista
    OR EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND id_lojista = p_id_lojista
        AND ativo = TRUE AND (acesso_total OR pode_atender_whatsapp)
    )
  )
$$;

-- ============================================================
-- 2) Telefone
-- ============================================================
-- O número do WhatsApp vem sempre com o código do país ("5511999998888").
-- No Brasil o mesmo contato pode chegar com ou sem o nono dígito, então a
-- chave que identifica o contato é DDD + os 8 últimos dígitos. Número de
-- outro país entra inteiro.
CREATE OR REPLACE FUNCTION fn_whatsapp_chave_telefone(p_telefone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN left(d, 2) = '55' AND length(d) IN (12, 13) THEN 'BR' || substr(d, 3, 2) || right(d, 8)
    ELSE 'I' || d
  END
  FROM (SELECT regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g') AS d) t
$$;

-- Do jeito que a pessoa digita ou que está no cadastro do cliente (DDD +
-- número, sem o país) para o formato do WhatsApp.
CREATE OR REPLACE FUNCTION fn_whatsapp_normalizar_telefone(p_telefone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) IN (10, 11) THEN '55' || d
    ELSE d
  END
  FROM (SELECT regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g') AS d) t
$$;

-- ============================================================
-- 3) Integração (o número da loja)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_integracao (
  id_lojista       UUID PRIMARY KEY REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  -- Identificador do número na Meta: é por ele que o webhook descobre de
  -- qual loja é a mensagem que chegou.
  phone_number_id  TEXT NOT NULL,
  waba_id          TEXT,
  numero_exibicao  TEXT,
  nome_verificado  TEXT,
  status           TEXT NOT NULL DEFAULT 'conectado' CHECK (status IN ('conectado', 'erro', 'desconectado')),
  ultimo_erro      TEXT,
  -- Última vez que a Meta chamou o webhook para este número.
  webhook_em       TIMESTAMPTZ,
  conectado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Um número só pode estar ligado a uma loja por vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_integracao_numero
  ON whatsapp_integracao (phone_number_id) WHERE status <> 'desconectado';

ALTER TABLE whatsapp_integracao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_integracao: equipe do whatsapp ve" ON whatsapp_integracao;
CREATE POLICY "whatsapp_integracao: equipe do whatsapp ve"
  ON whatsapp_integracao FOR SELECT
  USING (fn_whatsapp_da_loja(id_lojista));

-- Token de acesso e segredo do app da Meta. Sem nenhuma regra de leitura:
-- o navegador (anon/authenticated) não lê nem escreve aqui; só o servidor,
-- com a chave de serviço.
CREATE TABLE IF NOT EXISTS whatsapp_credencial (
  id_lojista    UUID PRIMARY KEY REFERENCES whatsapp_integracao(id_lojista) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  app_secret    TEXT NOT NULL,
  -- Código que a loja cola na Meta ao cadastrar o webhook (a Meta devolve
  -- esse código na verificação). Gerado pelo SAIP.
  verify_token  TEXT NOT NULL UNIQUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_credencial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_credencial FROM anon, authenticated;

-- ============================================================
-- 4) Conversas
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_conversa (
  id_conversa       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista        UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  -- Número da conversa dentro da loja ("#12").
  numero            INTEGER NOT NULL,
  -- Telefone no formato do WhatsApp (só dígitos, com o país).
  telefone          TEXT NOT NULL CHECK (telefone ~ '^\d{8,15}$'),
  chave_telefone    TEXT GENERATED ALWAYS AS (fn_whatsapp_chave_telefone(telefone)) STORED,
  -- Nome do perfil do contato no WhatsApp (o do cadastro vale mais).
  nome_contato      TEXT,
  id_cliente        UUID REFERENCES cliente(id_cliente) ON DELETE SET NULL,
  -- Pet de que a conversa trata, quando o atendente escolhe um.
  id_pet            UUID REFERENCES pet(id_pet) ON DELETE SET NULL,
  -- espera: o contato escreveu e ninguém assumiu · ativa: em atendimento
  status            TEXT NOT NULL DEFAULT 'espera' CHECK (status IN ('espera', 'ativa', 'encerrada')),
  -- Quem atende: o dono ou um funcionário (por isso sem chave estrangeira).
  id_responsavel    UUID,
  nome_responsavel  TEXT,
  nao_lidas         INTEGER NOT NULL DEFAULT 0 CHECK (nao_lidas >= 0),
  ultima_mensagem_em       TIMESTAMPTZ,
  ultima_mensagem_texto    TEXT,
  ultima_mensagem_direcao  TEXT CHECK (ultima_mensagem_direcao IN ('entrada', 'saida')),
  -- Última mensagem do CONTATO: a Meta só deixa responder livremente até
  -- 24 horas depois dela.
  ultima_entrada_em TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_lojista, numero),
  UNIQUE (id_lojista, chave_telefone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversa_lista
  ON whatsapp_conversa (id_lojista, (COALESCE(ultima_mensagem_em, created_at)) DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversa_status ON whatsapp_conversa (id_lojista, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversa_cliente ON whatsapp_conversa (id_cliente);

ALTER TABLE whatsapp_conversa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_conversa: equipe do whatsapp ve" ON whatsapp_conversa;
CREATE POLICY "whatsapp_conversa: equipe do whatsapp ve"
  ON whatsapp_conversa FOR SELECT
  USING (fn_whatsapp_da_loja(id_lojista));

-- Número sequencial por loja.
CREATE OR REPLACE FUNCTION fn_trg_whatsapp_conversa_numero()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('whatsapp_conversa'), hashtext(NEW.id_lojista::text));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO NEW.numero FROM whatsapp_conversa WHERE id_lojista = NEW.id_lojista;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_conversa_numero ON whatsapp_conversa;
CREATE TRIGGER trg_whatsapp_conversa_numero
  BEFORE INSERT ON whatsapp_conversa
  FOR EACH ROW EXECUTE FUNCTION fn_trg_whatsapp_conversa_numero();

-- ============================================================
-- 5) Mensagens
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_mensagem (
  id_mensagem  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_conversa  UUID NOT NULL REFERENCES whatsapp_conversa(id_conversa) ON DELETE CASCADE,
  id_lojista   UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  -- entrada: o contato mandou · saida: a loja mandou
  direcao      TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  tipo         TEXT NOT NULL DEFAULT 'texto'
               CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'sistema', 'outro')),
  -- O texto, ou a legenda do arquivo.
  texto        TEXT,
  -- Arquivo: { id (da Meta), mime, nome }. O arquivo em si fica na Meta e
  -- é baixado pelo servidor quando alguém abre.
  midia        JSONB,
  -- Localização, contatos e o que mais o tipo trouxer.
  dados        JSONB,
  status       TEXT NOT NULL CHECK (status IN ('recebida', 'enviando', 'enviada', 'entregue', 'lida', 'erro')),
  erro         TEXT,
  -- Identificador da mensagem na Meta ("wamid…"): liga a mensagem daqui à
  -- do WhatsApp e impede gravar a mesma duas vezes.
  provider_message_id  TEXT,
  -- Quem escreveu, quando saiu daqui.
  id_autor     UUID,
  nome_autor   TEXT,
  enviada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_mensagem_provider
  ON whatsapp_mensagem (id_lojista, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagem_conversa ON whatsapp_mensagem (id_conversa, enviada_em DESC);

ALTER TABLE whatsapp_mensagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_mensagem: equipe do whatsapp ve" ON whatsapp_mensagem;
CREATE POLICY "whatsapp_mensagem: equipe do whatsapp ve"
  ON whatsapp_mensagem FOR SELECT
  USING (fn_whatsapp_da_loja(id_lojista));

-- O que aparece na lista como "última mensagem".
CREATE OR REPLACE FUNCTION fn_whatsapp_previa(p_tipo TEXT, p_texto TEXT, p_midia JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(CASE
    WHEN p_tipo = 'texto' THEN COALESCE(p_texto, '')
    WHEN btrim(COALESCE(p_texto, '')) <> '' THEN p_texto
    WHEN p_tipo = 'imagem' THEN 'Imagem'
    WHEN p_tipo = 'audio' THEN 'Áudio'
    WHEN p_tipo = 'video' THEN 'Vídeo'
    WHEN p_tipo = 'documento' THEN COALESCE(p_midia ->> 'nome', 'Documento')
    WHEN p_tipo = 'figurinha' THEN 'Figurinha'
    WHEN p_tipo = 'localizacao' THEN 'Localização'
    WHEN p_tipo = 'contato' THEN 'Contato'
    ELSE 'Mensagem'
  END, 200)
$$;

-- Cada mensagem nova atualiza o resumo da conversa (o que a lista mostra).
-- Mensagem do contato soma nas não lidas e reabre a conversa encerrada;
-- resposta da loja coloca a conversa em atendimento com quem respondeu.
-- Mensagem de sistema (assumiu, transferiu, encerrou) não mexe em nada.
CREATE OR REPLACE FUNCTION fn_trg_whatsapp_mensagem_nova()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'sistema' THEN
    RETURN NEW;
  END IF;

  UPDATE whatsapp_conversa c SET
    ultima_mensagem_em      = GREATEST(COALESCE(c.ultima_mensagem_em, NEW.enviada_em), NEW.enviada_em),
    ultima_mensagem_texto   = CASE WHEN c.ultima_mensagem_em IS NULL OR NEW.enviada_em >= c.ultima_mensagem_em
                                   THEN fn_whatsapp_previa(NEW.tipo, NEW.texto, NEW.midia) ELSE c.ultima_mensagem_texto END,
    ultima_mensagem_direcao = CASE WHEN c.ultima_mensagem_em IS NULL OR NEW.enviada_em >= c.ultima_mensagem_em
                                   THEN NEW.direcao ELSE c.ultima_mensagem_direcao END,
    ultima_entrada_em       = CASE WHEN NEW.direcao = 'entrada'
                                   THEN GREATEST(COALESCE(c.ultima_entrada_em, NEW.enviada_em), NEW.enviada_em) ELSE c.ultima_entrada_em END,
    nao_lidas               = CASE WHEN NEW.direcao = 'entrada' THEN c.nao_lidas + 1 ELSE c.nao_lidas END,
    status                  = CASE
                                WHEN NEW.direcao = 'entrada' AND c.status = 'encerrada' THEN 'espera'
                                WHEN NEW.direcao = 'saida' AND c.status <> 'ativa' THEN 'ativa'
                                ELSE c.status END,
    id_responsavel          = CASE
                                WHEN NEW.direcao = 'entrada' AND c.status = 'encerrada' THEN NULL
                                WHEN NEW.direcao = 'saida' AND c.status <> 'ativa' THEN COALESCE(NEW.id_autor, c.id_responsavel)
                                ELSE c.id_responsavel END,
    nome_responsavel        = CASE
                                WHEN NEW.direcao = 'entrada' AND c.status = 'encerrada' THEN NULL
                                WHEN NEW.direcao = 'saida' AND c.status <> 'ativa' THEN COALESCE(NEW.nome_autor, c.nome_responsavel)
                                ELSE c.nome_responsavel END,
    updated_at              = NOW()
  WHERE c.id_conversa = NEW.id_conversa;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_mensagem_nova ON whatsapp_mensagem;
CREATE TRIGGER trg_whatsapp_mensagem_nova
  AFTER INSERT ON whatsapp_mensagem
  FOR EACH ROW EXECUTE FUNCTION fn_trg_whatsapp_mensagem_nova();

-- ============================================================
-- 6) Funções do servidor (webhook da Meta) — só a chave de serviço
-- ============================================================

-- Mensagem que chegou. Acha (ou abre) a conversa do contato naquela loja,
-- liga ao cliente cadastrado que tiver o mesmo telefone e grava a
-- mensagem. A Meta reenvia o mesmo evento quando acha que não foi
-- entregue: a mesma mensagem (provider_message_id) não entra duas vezes.
CREATE OR REPLACE FUNCTION fn_whatsapp_receber(
  p_id_lojista  UUID,
  p_telefone    TEXT,
  p_nome        TEXT,
  p_provider_id TEXT,
  p_tipo        TEXT,
  p_texto       TEXT,
  p_midia       JSONB,
  p_dados       JSONB,
  p_quando      TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_telefone    TEXT := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  v_chave       TEXT := fn_whatsapp_chave_telefone(p_telefone);
  v_id_conversa UUID;
  v_id_cliente  UUID;
  v_id_mensagem UUID;
BEGIN
  IF v_chave IS NULL THEN
    RAISE EXCEPTION 'WhatsApp: telefone inválido';
  END IF;

  SELECT id_conversa INTO v_id_conversa
  FROM whatsapp_conversa
  WHERE id_lojista = p_id_lojista AND chave_telefone = v_chave
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Cliente da loja com este telefone (o mais antigo, se houver mais de um).
    SELECT c.id_cliente INTO v_id_cliente
    FROM cliente_lojista cl
    JOIN cliente c ON c.id_cliente = cl.id_cliente
    WHERE cl.id_lojista = p_id_lojista
      AND fn_whatsapp_chave_telefone(fn_whatsapp_normalizar_telefone(c.telefone)) = v_chave
    ORDER BY cl.created_at
    LIMIT 1;

    INSERT INTO whatsapp_conversa (id_lojista, telefone, nome_contato, id_cliente, status)
    VALUES (p_id_lojista, v_telefone, NULLIF(btrim(COALESCE(p_nome, '')), ''), v_id_cliente, 'espera')
    ON CONFLICT (id_lojista, chave_telefone) DO UPDATE SET updated_at = NOW()
    RETURNING id_conversa INTO v_id_conversa;
  ELSE
    -- Responde-se para o número exatamente como a Meta o informa agora.
    UPDATE whatsapp_conversa SET
      telefone = v_telefone,
      nome_contato = COALESCE(NULLIF(btrim(COALESCE(p_nome, '')), ''), nome_contato)
    WHERE id_conversa = v_id_conversa;
  END IF;

  INSERT INTO whatsapp_mensagem (
    id_conversa, id_lojista, direcao, tipo, texto, midia, dados, status, provider_message_id, enviada_em
  ) VALUES (
    v_id_conversa, p_id_lojista, 'entrada', p_tipo, p_texto, p_midia, p_dados, 'recebida', p_provider_id,
    COALESCE(p_quando, NOW())
  )
  ON CONFLICT (id_lojista, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING
  RETURNING id_mensagem INTO v_id_mensagem;

  RETURN v_id_mensagem;
END;
$$;

-- Status de uma mensagem enviada (enviada → entregue → lida, ou erro). Os
-- avisos podem chegar fora de ordem: o status nunca anda para trás.
CREATE OR REPLACE FUNCTION fn_whatsapp_status(
  p_id_lojista  UUID,
  p_provider_id TEXT,
  p_status      TEXT,
  p_erro        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE whatsapp_mensagem m SET
    status = p_status,
    erro = CASE WHEN p_status = 'erro' THEN COALESCE(p_erro, m.erro) ELSE m.erro END
  WHERE m.id_lojista = p_id_lojista
    AND m.provider_message_id = p_provider_id
    AND m.direcao = 'saida'
    AND p_status IN ('enviada', 'entregue', 'lida', 'erro')
    AND (
      CASE m.status WHEN 'enviando' THEN 0 WHEN 'enviada' THEN 1 WHEN 'entregue' THEN 2 WHEN 'lida' THEN 3 ELSE 0 END
      < CASE p_status WHEN 'enviada' THEN 1 WHEN 'entregue' THEN 2 WHEN 'lida' THEN 3 ELSE 0 END
      OR (p_status = 'erro' AND m.status IN ('enviando', 'enviada'))
    )
$$;

REVOKE ALL ON FUNCTION fn_whatsapp_receber(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_whatsapp_status(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_receber(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION fn_whatsapp_status(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- 7) Funções de quem atende
-- ============================================================

-- Nome de quem está logado, para assinar o atendimento.
CREATE OR REPLACE FUNCTION fn_whatsapp_meu_nome()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT nome FROM funcionario WHERE id_funcionario = auth.uid()),
    (SELECT nome_loja FROM lojista WHERE id_lojista = auth.uid())
  )
$$;

-- A conversa, travada, se quem chama pode atender nela. Senão, erro.
CREATE OR REPLACE FUNCTION fn_whatsapp_conversa_minha(p_id_conversa UUID)
RETURNS whatsapp_conversa
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversa whatsapp_conversa%ROWTYPE;
BEGIN
  SELECT * INTO v_conversa FROM whatsapp_conversa WHERE id_conversa = p_id_conversa FOR UPDATE;
  IF NOT FOUND OR NOT fn_whatsapp_da_loja(v_conversa.id_lojista) THEN
    RAISE EXCEPTION 'WhatsApp: conversa não encontrada';
  END IF;
  RETURN v_conversa;
END;
$$;

REVOKE ALL ON FUNCTION fn_whatsapp_conversa_minha(UUID) FROM PUBLIC, anon, authenticated;

-- Aviso no meio da conversa ("Fulano assumiu o atendimento").
CREATE OR REPLACE FUNCTION fn_whatsapp_aviso(p_id_conversa UUID, p_id_lojista UUID, p_texto TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO whatsapp_mensagem (id_conversa, id_lojista, direcao, tipo, texto, status, id_autor, nome_autor)
  VALUES (p_id_conversa, p_id_lojista, 'saida', 'sistema', p_texto, 'enviada', auth.uid(), fn_whatsapp_meu_nome())
$$;

REVOKE ALL ON FUNCTION fn_whatsapp_aviso(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Situação da integração e os contadores das abas.
CREATE OR REPLACE FUNCTION fn_whatsapp_resumo()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_whatsapp_da_loja(v_loja) THEN
    RAISE EXCEPTION 'WhatsApp: sem permissão';
  END IF;

  RETURN jsonb_build_object(
    'integracao', (
      SELECT jsonb_build_object(
        'status', i.status, 'numero', i.numero_exibicao, 'nome', i.nome_verificado,
        'ultimo_erro', i.ultimo_erro, 'webhook_em', i.webhook_em
      )
      FROM whatsapp_integracao i WHERE i.id_lojista = v_loja
    ),
    'contadores', (
      SELECT jsonb_build_object(
        'abertas',    COUNT(*) FILTER (WHERE status <> 'encerrada'),
        'espera',     COUNT(*) FILTER (WHERE status = 'espera'),
        'ativas',     COUNT(*) FILTER (WHERE status = 'ativa'),
        'minhas',     COUNT(*) FILTER (WHERE status = 'ativa' AND id_responsavel = auth.uid()),
        'encerradas', COUNT(*) FILTER (WHERE status = 'encerrada'),
        'nao_lidas',  COUNT(*) FILTER (WHERE nao_lidas > 0),
        'mensagens_nao_lidas', COALESCE(SUM(nao_lidas), 0)
      )
      FROM whatsapp_conversa WHERE id_lojista = v_loja
    )
  );
END;
$$;

-- Lista de conversas, da mais recente para a mais antiga, uma página por
-- vez (p_antes = a data da última linha da página anterior).
--   p_filtro: abertas | espera | ativas | minhas | nao_lidas | encerradas
--   p_busca:  nome do cliente ou do contato, telefone, nome do pet ou o
--             número da conversa
--   p_id:     uma conversa específica (aí o filtro e a busca não valem)
CREATE OR REPLACE FUNCTION fn_whatsapp_conversas(
  p_filtro TEXT DEFAULT 'abertas',
  p_busca  TEXT DEFAULT NULL,
  p_limite INTEGER DEFAULT 30,
  p_antes  TIMESTAMPTZ DEFAULT NULL,
  p_id     UUID DEFAULT NULL
)
RETURNS TABLE (
  id_conversa UUID,
  numero INTEGER,
  telefone TEXT,
  nome TEXT,
  id_cliente UUID,
  foto_url TEXT,
  id_pet UUID,
  pets TEXT,
  status TEXT,
  id_responsavel UUID,
  nome_responsavel TEXT,
  nao_lidas INTEGER,
  ultima_mensagem_em TIMESTAMPTZ,
  ultima_mensagem_texto TEXT,
  ultima_mensagem_direcao TEXT,
  ultima_entrada_em TIMESTAMPTZ,
  ordem TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_loja    UUID := auth_lojista_id();
  v_busca   TEXT := btrim(COALESCE(p_busca, ''));
  v_digitos TEXT := regexp_replace(COALESCE(p_busca, ''), '\D', '', 'g');
  -- Só vira número de conversa quando cabe em um (telefone não cabe).
  v_numero  INTEGER := CASE WHEN v_digitos ~ '^\d{1,6}$' THEN v_digitos::INTEGER END;
BEGIN
  IF NOT fn_whatsapp_da_loja(v_loja) THEN
    RAISE EXCEPTION 'WhatsApp: sem permissão';
  END IF;

  RETURN QUERY
  SELECT
    c.id_conversa, c.numero, c.telefone,
    COALESCE(cli.nome, c.nome_contato) AS nome,
    c.id_cliente, cli.foto_url, c.id_pet,
    -- O pet da conversa (com a raça), ou os pets do cliente.
    COALESCE(
      (SELECT p.nome || ' • ' || p.raca FROM pet p WHERE p.id_pet = c.id_pet),
      (SELECT string_agg(p.nome, ', ' ORDER BY p.nome) FROM pet p WHERE p.id_cliente = c.id_cliente AND p.ativo = TRUE)
    ) AS pets,
    c.status, c.id_responsavel, c.nome_responsavel, c.nao_lidas,
    c.ultima_mensagem_em, c.ultima_mensagem_texto, c.ultima_mensagem_direcao, c.ultima_entrada_em,
    COALESCE(c.ultima_mensagem_em, c.created_at) AS ordem
  FROM whatsapp_conversa c
  LEFT JOIN cliente cli ON cli.id_cliente = c.id_cliente
  WHERE c.id_lojista = v_loja
    AND (p_id IS NULL OR c.id_conversa = p_id)
    AND (p_id IS NOT NULL OR CASE COALESCE(p_filtro, 'abertas')
          WHEN 'espera'     THEN c.status = 'espera'
          WHEN 'ativas'     THEN c.status = 'ativa'
          WHEN 'minhas'     THEN c.status = 'ativa' AND c.id_responsavel = auth.uid()
          WHEN 'nao_lidas'  THEN c.nao_lidas > 0
          WHEN 'encerradas' THEN c.status = 'encerrada'
          ELSE c.status <> 'encerrada'
        END)
    AND (
      p_id IS NOT NULL
      OR v_busca = ''
      OR cli.nome ILIKE '%' || v_busca || '%'
      OR c.nome_contato ILIKE '%' || v_busca || '%'
      OR (v_digitos <> '' AND c.telefone LIKE '%' || v_digitos || '%')
      OR (v_numero IS NOT NULL AND c.numero = v_numero)
      OR EXISTS (
        SELECT 1 FROM pet p
        WHERE p.id_cliente = c.id_cliente AND p.ativo = TRUE AND p.nome ILIKE '%' || v_busca || '%'
      )
    )
    AND (p_antes IS NULL OR COALESCE(c.ultima_mensagem_em, c.created_at) < p_antes)
  ORDER BY COALESCE(c.ultima_mensagem_em, c.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 30), 1), 100);
END;
$$;

-- O painel do contato: cliente, pets e agendamentos NESTA loja.
CREATE OR REPLACE FUNCTION fn_whatsapp_contato(p_id_conversa UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c whatsapp_conversa%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM whatsapp_conversa WHERE id_conversa = p_id_conversa;
  IF NOT FOUND OR NOT fn_whatsapp_da_loja(v_c.id_lojista) THEN
    RAISE EXCEPTION 'WhatsApp: conversa não encontrada';
  END IF;

  IF v_c.id_cliente IS NULL THEN
    RETURN jsonb_build_object('cliente', NULL, 'pets', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'cliente', (
      SELECT jsonb_build_object(
        'id_cliente', c.id_cliente, 'nome', c.nome, 'telefone', c.telefone, 'foto_url', c.foto_url, 'ativo', c.ativo
      )
      FROM cliente c WHERE c.id_cliente = v_c.id_cliente
    ),
    'total_gasto', (
      SELECT COALESCE(SUM(a.valor), 0) FROM agendamento a
      WHERE a.id_lojista = v_c.id_lojista AND a.id_cliente = v_c.id_cliente AND a.status = 'Concluído'
    ),
    'atendimentos', (
      SELECT COUNT(*) FROM agendamento a
      WHERE a.id_lojista = v_c.id_lojista AND a.id_cliente = v_c.id_cliente AND a.status = 'Concluído'
    ),
    'ultimo', (
      SELECT jsonb_build_object('data', a.dt_agendamento, 'hora', a.hr_agendamento, 'servico', s.nome, 'pet', p.nome)
      FROM agendamento a
      JOIN servico s ON s.id_servico = a.id_servico
      LEFT JOIN pet p ON p.id_pet = a.id_pet
      WHERE a.id_lojista = v_c.id_lojista AND a.id_cliente = v_c.id_cliente AND a.status = 'Concluído'
      ORDER BY a.dt_agendamento DESC, a.hr_agendamento DESC
      LIMIT 1
    ),
    'proximo', (
      SELECT jsonb_build_object('data', a.dt_agendamento, 'hora', a.hr_agendamento, 'servico', s.nome, 'pet', p.nome, 'status', a.status)
      FROM agendamento a
      JOIN servico s ON s.id_servico = a.id_servico
      LEFT JOIN pet p ON p.id_pet = a.id_pet
      WHERE a.id_lojista = v_c.id_lojista AND a.id_cliente = v_c.id_cliente
        AND a.status NOT IN ('Cancelado', 'Concluído')
        AND a.dt_agendamento >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
      ORDER BY a.dt_agendamento, a.hr_agendamento
      LIMIT 1
    ),
    'pets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id_pet', p.id_pet, 'nome', p.nome, 'raca', p.raca, 'foto_url', p.foto_url,
        'proximo', (
          SELECT jsonb_build_object('data', a.dt_agendamento, 'hora', a.hr_agendamento, 'servico', s.nome)
          FROM agendamento a
          JOIN servico s ON s.id_servico = a.id_servico
          WHERE a.id_lojista = v_c.id_lojista AND a.id_pet = p.id_pet
            AND a.status NOT IN ('Cancelado', 'Concluído')
            AND a.dt_agendamento >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
          ORDER BY a.dt_agendamento, a.hr_agendamento
          LIMIT 1
        )
      ) ORDER BY p.nome)
      FROM pet p WHERE p.id_cliente = v_c.id_cliente AND p.ativo = TRUE
    ), '[]'::jsonb)
  );
END;
$$;

-- Abriu a conversa: zera as não lidas.
CREATE OR REPLACE FUNCTION fn_whatsapp_marcar_lida(p_id_conversa UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c whatsapp_conversa%ROWTYPE := fn_whatsapp_conversa_minha(p_id_conversa);
BEGIN
  IF v_c.nao_lidas > 0 THEN
    UPDATE whatsapp_conversa SET nao_lidas = 0, updated_at = NOW() WHERE id_conversa = p_id_conversa;
  END IF;
END;
$$;

-- Assumir o atendimento.
CREATE OR REPLACE FUNCTION fn_whatsapp_assumir(p_id_conversa UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c    whatsapp_conversa%ROWTYPE := fn_whatsapp_conversa_minha(p_id_conversa);
  v_nome TEXT := fn_whatsapp_meu_nome();
BEGIN
  IF v_c.status = 'ativa' AND v_c.id_responsavel = auth.uid() THEN
    RETURN;
  END IF;
  UPDATE whatsapp_conversa SET status = 'ativa', id_responsavel = auth.uid(), nome_responsavel = v_nome, updated_at = NOW()
  WHERE id_conversa = p_id_conversa;
  PERFORM fn_whatsapp_aviso(p_id_conversa, v_c.id_lojista, v_nome || ' assumiu o atendimento');
END;
$$;

-- Quem pode receber uma conversa: o dono e a equipe com a permissão.
CREATE OR REPLACE FUNCTION fn_whatsapp_equipe()
RETURNS TABLE (id UUID, nome TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_whatsapp_da_loja(v_loja) THEN
    RAISE EXCEPTION 'WhatsApp: sem permissão';
  END IF;
  RETURN QUERY
  SELECT l.id_lojista, l.nome_loja FROM lojista l WHERE l.id_lojista = v_loja
  UNION ALL
  SELECT f.id_funcionario, f.nome FROM funcionario f
  WHERE f.id_lojista = v_loja AND f.ativo = TRUE AND (f.acesso_total OR f.pode_atender_whatsapp);
END;
$$;

-- Transferir para outra pessoa da equipe.
CREATE OR REPLACE FUNCTION fn_whatsapp_transferir(p_id_conversa UUID, p_id_para UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c    whatsapp_conversa%ROWTYPE := fn_whatsapp_conversa_minha(p_id_conversa);
  v_para TEXT;
BEGIN
  SELECT e.nome INTO v_para FROM fn_whatsapp_equipe() e WHERE e.id = p_id_para;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WhatsApp: essa pessoa não atende o WhatsApp da loja';
  END IF;
  UPDATE whatsapp_conversa SET status = 'ativa', id_responsavel = p_id_para, nome_responsavel = v_para, updated_at = NOW()
  WHERE id_conversa = p_id_conversa;
  PERFORM fn_whatsapp_aviso(p_id_conversa, v_c.id_lojista, fn_whatsapp_meu_nome() || ' transferiu o atendimento para ' || v_para);
END;
$$;

-- Encerrar. Se o contato escrever de novo, a conversa volta para a espera.
CREATE OR REPLACE FUNCTION fn_whatsapp_encerrar(p_id_conversa UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c whatsapp_conversa%ROWTYPE := fn_whatsapp_conversa_minha(p_id_conversa);
BEGIN
  IF v_c.status = 'encerrada' THEN
    RETURN;
  END IF;
  UPDATE whatsapp_conversa SET status = 'encerrada', nao_lidas = 0, updated_at = NOW() WHERE id_conversa = p_id_conversa;
  PERFORM fn_whatsapp_aviso(p_id_conversa, v_c.id_lojista, fn_whatsapp_meu_nome() || ' encerrou a conversa');
END;
$$;

-- Ligar a conversa a um cliente da loja (e, se quiser, a um pet dele).
-- p_id_cliente NULL desfaz a ligação.
CREATE OR REPLACE FUNCTION fn_whatsapp_vincular(p_id_conversa UUID, p_id_cliente UUID, p_id_pet UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c whatsapp_conversa%ROWTYPE := fn_whatsapp_conversa_minha(p_id_conversa);
BEGIN
  IF p_id_cliente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cliente_lojista WHERE id_lojista = v_c.id_lojista AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'WhatsApp: cliente não encontrado nesta loja';
  END IF;
  IF p_id_pet IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pet WHERE id_pet = p_id_pet AND id_cliente = p_id_cliente AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'WhatsApp: esse pet não é deste cliente';
  END IF;
  UPDATE whatsapp_conversa SET id_cliente = p_id_cliente, id_pet = p_id_pet, updated_at = NOW()
  WHERE id_conversa = p_id_conversa;
END;
$$;

-- Nova conversa: por um cliente da loja (usa o telefone do cadastro) ou
-- por um telefone digitado. Se o contato já tem conversa, devolve a que
-- existe. Não envia nada: só abre a conversa.
CREATE OR REPLACE FUNCTION fn_whatsapp_nova_conversa(p_telefone TEXT DEFAULT NULL, p_id_cliente UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja     UUID := auth_lojista_id();
  v_telefone TEXT;
  v_chave    TEXT;
  v_cliente  UUID := p_id_cliente;
  v_id       UUID;
BEGIN
  IF NOT fn_whatsapp_da_loja(v_loja) THEN
    RAISE EXCEPTION 'WhatsApp: sem permissão';
  END IF;

  IF p_id_cliente IS NOT NULL THEN
    SELECT fn_whatsapp_normalizar_telefone(c.telefone) INTO v_telefone
    FROM cliente_lojista cl JOIN cliente c ON c.id_cliente = cl.id_cliente
    WHERE cl.id_lojista = v_loja AND cl.id_cliente = p_id_cliente;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WhatsApp: cliente não encontrado nesta loja';
    END IF;
  ELSIF btrim(COALESCE(p_telefone, '')) LIKE '+%' THEN
    -- Com "+" na frente, o número já veio com o código do país.
    v_telefone := regexp_replace(p_telefone, '\D', '', 'g');
  ELSE
    v_telefone := fn_whatsapp_normalizar_telefone(p_telefone);
  END IF;

  IF v_telefone IS NULL OR v_telefone !~ '^\d{10,15}$' THEN
    RAISE EXCEPTION 'WhatsApp: informe o telefone com DDD';
  END IF;
  v_chave := fn_whatsapp_chave_telefone(v_telefone);

  SELECT id_conversa INTO v_id FROM whatsapp_conversa WHERE id_lojista = v_loja AND chave_telefone = v_chave;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  -- Telefone digitado: liga ao cliente da loja que tiver esse número.
  IF v_cliente IS NULL THEN
    SELECT c.id_cliente INTO v_cliente
    FROM cliente_lojista cl JOIN cliente c ON c.id_cliente = cl.id_cliente
    WHERE cl.id_lojista = v_loja
      AND fn_whatsapp_chave_telefone(fn_whatsapp_normalizar_telefone(c.telefone)) = v_chave
    ORDER BY cl.created_at
    LIMIT 1;
  END IF;

  INSERT INTO whatsapp_conversa (id_lojista, telefone, id_cliente, status, id_responsavel, nome_responsavel)
  VALUES (v_loja, v_telefone, v_cliente, 'ativa', auth.uid(), fn_whatsapp_meu_nome())
  ON CONFLICT (id_lojista, chave_telefone) DO UPDATE SET updated_at = NOW()
  RETURNING id_conversa INTO v_id;

  RETURN v_id;
END;
$$;

-- Busca de clientes da loja para "Nova conversa" e para vincular.
CREATE OR REPLACE FUNCTION fn_whatsapp_buscar_clientes(p_busca TEXT DEFAULT NULL)
RETURNS TABLE (id_cliente UUID, nome TEXT, telefone TEXT, foto_url TEXT, pets TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_loja    UUID := auth_lojista_id();
  v_busca   TEXT := btrim(COALESCE(p_busca, ''));
  v_digitos TEXT := regexp_replace(COALESCE(p_busca, ''), '\D', '', 'g');
BEGIN
  IF NOT fn_whatsapp_da_loja(v_loja) THEN
    RAISE EXCEPTION 'WhatsApp: sem permissão';
  END IF;
  RETURN QUERY
  SELECT c.id_cliente, c.nome, c.telefone, c.foto_url,
         (SELECT string_agg(p.nome, ', ' ORDER BY p.nome) FROM pet p WHERE p.id_cliente = c.id_cliente AND p.ativo = TRUE)
  FROM cliente_lojista cl
  JOIN cliente c ON c.id_cliente = cl.id_cliente
  WHERE cl.id_lojista = v_loja
    AND (
      v_busca = ''
      OR c.nome ILIKE '%' || v_busca || '%'
      OR (v_digitos <> '' AND c.telefone LIKE '%' || v_digitos || '%')
      OR EXISTS (SELECT 1 FROM pet p WHERE p.id_cliente = c.id_cliente AND p.ativo = TRUE AND p.nome ILIKE '%' || v_busca || '%')
    )
  ORDER BY c.nome
  LIMIT 8;
END;
$$;

REVOKE ALL ON FUNCTION fn_whatsapp_resumo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_conversas(TEXT, TEXT, INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_contato(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_marcar_lida(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_assumir(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_equipe() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_transferir(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_encerrar(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_vincular(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_nova_conversa(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_whatsapp_buscar_clientes(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_whatsapp_resumo() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_conversas(TEXT, TEXT, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_contato(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_marcar_lida(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_assumir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_equipe() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_transferir(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_encerrar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_vincular(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_nova_conversa(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_buscar_clientes(TEXT) TO authenticated;

-- ============================================================
-- 8) Tempo real
-- ============================================================
-- A tela ouve as duas tabelas (mensagem nova, status, não lidas). As
-- regras de leitura acima valem também aqui: cada pessoa só recebe os
-- eventos da própria loja.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_conversa', 'whatsapp_mensagem'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
