-- ============================================================
-- PETSHOP SaaS - Migration 056: página pública "Acompanhar agendamento"
-- ============================================================
-- Depois de agendar, o cliente recebe (pelo WhatsApp) um link
-- /acompanhar/<id_agendamento> que abre sem login e mostra como está a
-- visita: serviços e status de cada um, TaxiDog, loja. O id do
-- agendamento é um UUID aleatório — quem tem o link é quem recebeu.
-- Só sai o necessário pra acompanhar: nada de telefone, endereço ou
-- e-mail do cliente.
--
-- Visita = os agendamentos criados juntos (mesmo pet, loja, dia e
-- created_at — um carrinho com vários serviços vira um agendamento por
-- serviço, na mesma transação).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_acompanhar_agendamento(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a agendamento%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM agendamento WHERE id_agendamento = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'data', v_a.dt_agendamento,
    'loja', (
      SELECT jsonb_build_object(
        'nome', l.nome_loja,
        'logo_url', l.logo_url,
        'telefone', l.telefone,
        'endereco', l.endereco,
        'numero', l.numero,
        'complemento', l.complemento,
        'bairro', l.bairro,
        'cidade', l.cidade,
        'estado', l.estado
      )
      FROM lojista l WHERE l.id_lojista = v_a.id_lojista
    ),
    'pet', (
      SELECT jsonb_build_object('nome', p.nome, 'foto_url', p.foto_url)
      FROM pet p WHERE p.id_pet = v_a.id_pet
    ),
    'servicos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nome', s.nome,
        'hora', a.hr_agendamento,
        'duracao', s.duracao,
        'status', a.status,
        'valor', a.valor
      ) ORDER BY a.hr_agendamento), '[]'::jsonb)
      FROM agendamento a
      JOIN servico s ON s.id_servico = a.id_servico
      WHERE a.id_lojista = v_a.id_lojista AND a.id_pet = v_a.id_pet
        AND a.dt_agendamento = v_a.dt_agendamento AND a.created_at = v_a.created_at
    ),
    -- TaxiDog da visita: o em aberto; sem ele, o concluído mais recente.
    'taxidog', (
      SELECT jsonb_build_object(
        'modalidade', c.modalidade,
        'status', c.status,
        'valor', c.valor,
        'tem_taxidog', c.id_funcionario IS NOT NULL
      )
      FROM taxidog_corrida c
      JOIN agendamento a ON a.id_agendamento = c.id_agendamento
      WHERE a.id_lojista = v_a.id_lojista AND a.id_pet = v_a.id_pet
        AND a.dt_agendamento = v_a.dt_agendamento AND a.created_at = v_a.created_at
        AND c.status <> 'cancelada'
      ORDER BY (c.status <> 'concluida') DESC, c.created_at DESC
      LIMIT 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_acompanhar_agendamento(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_acompanhar_agendamento(UUID) TO anon, authenticated;
