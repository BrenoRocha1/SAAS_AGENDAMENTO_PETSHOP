-- ============================================================
-- PETSHOP SaaS - Migration 089: WhatsApp conectado por QR code
-- ============================================================
-- A 088 ligava a loja ao WhatsApp só pela API oficial da Meta (a loja cria
-- um app lá e cola os dados). Esta acrescenta o segundo jeito: a loja
-- escaneia um QR code com o WhatsApp do celular, como no WhatsApp Web.
--
-- Quem mantém essa sessão aberta é um servidor à parte, a Evolution API
-- (código aberto). NÃO é a API oficial: a loja usa o próprio número, sem
-- conta na Meta e sem a regra das 24 horas, mas o WhatsApp pode restringir
-- números que usem esse tipo de conexão.
--
-- O que muda no banco:
--   • whatsapp_integracao ganha `provedor` (cloud_api | evolution) e
--     `instancia` (o nome da sessão da loja no servidor da Evolution), e o
--     status novo "pendente" (QR gerado, ainda não escaneado). O
--     identificador do número da Meta deixa de ser obrigatório — só a API
--     oficial tem.
--   • uma função de servidor nova, fn_whatsapp_registrar_envio: grava a
--     mensagem que saiu da loja DEPOIS do envio, já com o identificador do
--     provedor. Vale também para o que a loja respondeu direto pelo
--     celular (na conexão por QR essas mensagens chegam pelo webhook), e
--     não deixa a mesma mensagem entrar duas vezes.
--
-- Conversas, mensagens, permissões e a tela não mudam: valem para os dois
-- jeitos de conectar. Nada do que já existe é alterado.
-- ============================================================

ALTER TABLE whatsapp_integracao ADD COLUMN IF NOT EXISTS provedor TEXT NOT NULL DEFAULT 'cloud_api';
ALTER TABLE whatsapp_integracao DROP CONSTRAINT IF EXISTS whatsapp_integracao_provedor_check;
ALTER TABLE whatsapp_integracao ADD CONSTRAINT whatsapp_integracao_provedor_check
  CHECK (provedor IN ('cloud_api', 'evolution'));

ALTER TABLE whatsapp_integracao ADD COLUMN IF NOT EXISTS instancia TEXT;
ALTER TABLE whatsapp_integracao ALTER COLUMN phone_number_id DROP NOT NULL;

ALTER TABLE whatsapp_integracao DROP CONSTRAINT IF EXISTS whatsapp_integracao_status_check;
ALTER TABLE whatsapp_integracao ADD CONSTRAINT whatsapp_integracao_status_check
  CHECK (status IN ('conectado', 'erro', 'desconectado', 'pendente'));

-- Cada sessão do servidor da Evolution é de uma loja só.
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_integracao_instancia
  ON whatsapp_integracao (instancia) WHERE instancia IS NOT NULL;

-- A tela precisa saber qual é o provedor: a regra das 24 horas só existe na
-- API oficial.
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
        'status', i.status, 'provedor', i.provedor, 'numero', i.numero_exibicao, 'nome', i.nome_verificado,
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

-- Mensagem que saiu da loja, gravada depois do envio (só o servidor chama).
--
--   • p_id_conversa preenchido: resposta escrita no SAIP. Com erro no
--     envio, entra com status "erro" e sem identificador do provedor.
--   • p_id_conversa NULL: mensagem que a loja mandou direto pelo celular e
--     o provedor avisou — a conversa é achada (ou aberta) pelo telefone.
--
-- O mesmo identificador do provedor nunca entra duas vezes: se o aviso do
-- provedor chegar antes de a resposta do envio voltar (ou o contrário), a
-- segunda chamada só completa quem escreveu e devolve a mesma mensagem.
CREATE OR REPLACE FUNCTION fn_whatsapp_registrar_envio(
  p_id_lojista  UUID,
  p_id_conversa UUID,
  p_telefone    TEXT,
  p_tipo        TEXT,
  p_texto       TEXT,
  p_midia       JSONB,
  p_dados       JSONB,
  p_status      TEXT,
  p_erro        TEXT,
  p_provider_id TEXT,
  p_id_autor    UUID,
  p_nome_autor  TEXT,
  p_quando      TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_conversa UUID := p_id_conversa;
  v_telefone    TEXT := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  v_chave       TEXT;
  v_id_cliente  UUID;
  v_id_mensagem UUID;
BEGIN
  IF v_id_conversa IS NOT NULL THEN
    PERFORM 1 FROM whatsapp_conversa WHERE id_conversa = v_id_conversa AND id_lojista = p_id_lojista FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WhatsApp: conversa não encontrada';
    END IF;
  ELSE
    v_chave := fn_whatsapp_chave_telefone(v_telefone);
    IF v_chave IS NULL THEN
      RAISE EXCEPTION 'WhatsApp: telefone inválido';
    END IF;

    SELECT id_conversa INTO v_id_conversa
    FROM whatsapp_conversa
    WHERE id_lojista = p_id_lojista AND chave_telefone = v_chave
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT c.id_cliente INTO v_id_cliente
      FROM cliente_lojista cl
      JOIN cliente c ON c.id_cliente = cl.id_cliente
      WHERE cl.id_lojista = p_id_lojista
        AND fn_whatsapp_chave_telefone(fn_whatsapp_normalizar_telefone(c.telefone)) = v_chave
      ORDER BY cl.created_at
      LIMIT 1;

      INSERT INTO whatsapp_conversa (id_lojista, telefone, id_cliente, status)
      VALUES (p_id_lojista, v_telefone, v_id_cliente, 'ativa')
      ON CONFLICT (id_lojista, chave_telefone) DO UPDATE SET updated_at = NOW()
      RETURNING id_conversa INTO v_id_conversa;
    END IF;
  END IF;

  IF p_provider_id IS NOT NULL THEN
    SELECT id_mensagem INTO v_id_mensagem
    FROM whatsapp_mensagem
    WHERE id_lojista = p_id_lojista AND provider_message_id = p_provider_id;

    IF FOUND THEN
      UPDATE whatsapp_mensagem SET
        id_autor = COALESCE(p_id_autor, id_autor),
        nome_autor = CASE WHEN p_id_autor IS NOT NULL THEN COALESCE(p_nome_autor, nome_autor) ELSE nome_autor END
      WHERE id_mensagem = v_id_mensagem;
      RETURN v_id_mensagem;
    END IF;
  END IF;

  INSERT INTO whatsapp_mensagem (
    id_conversa, id_lojista, direcao, tipo, texto, midia, dados, status, erro, provider_message_id,
    id_autor, nome_autor, enviada_em
  ) VALUES (
    v_id_conversa, p_id_lojista, 'saida', p_tipo, p_texto, p_midia, p_dados, p_status, p_erro, p_provider_id,
    p_id_autor, p_nome_autor, COALESCE(p_quando, NOW())
  )
  ON CONFLICT (id_lojista, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING
  RETURNING id_mensagem INTO v_id_mensagem;

  -- Duas chamadas ao mesmo tempo: a outra gravou primeiro.
  IF v_id_mensagem IS NULL AND p_provider_id IS NOT NULL THEN
    SELECT id_mensagem INTO v_id_mensagem
    FROM whatsapp_mensagem
    WHERE id_lojista = p_id_lojista AND provider_message_id = p_provider_id;
  END IF;

  RETURN v_id_mensagem;
END;
$$;

REVOKE ALL ON FUNCTION fn_whatsapp_registrar_envio(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_whatsapp_registrar_envio(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO service_role;
