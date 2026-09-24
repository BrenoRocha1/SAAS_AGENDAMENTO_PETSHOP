-- ============================================================
-- PETSHOP SaaS - Migration 054: busca e entrega do mesmo pet na mesma rota
-- ============================================================
-- Uma rota pode buscar um pet e, mais tarde, entregá-lo de volta. Entre o
-- "deixar na loja" e o "pegar na loja" acontece o serviço, então são duas
-- paradas na loja — mesmo que fiquem seguidas. fn_limpar_rota juntava
-- duas paradas na loja seguidas numa só, o que punha "deixar Tigor" e
-- "pegar Tigor" na mesma parada (e fn_validar_rota recusava a rota).
-- Agora ela só junta quando isso não acontece.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_limpar_rota(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p            RECORD;
  v_ant_id       UUID;
  v_ant_local    TEXT;
  v_ant_status   TEXT;
BEGIN
  DELETE FROM taxidog_parada p
  WHERE p.id_rota = p_id_rota AND p.status <> 'concluida'
    AND NOT EXISTS (SELECT 1 FROM taxidog_parada_item i WHERE i.id_parada = p.id_parada);

  FOR v_p IN SELECT * FROM taxidog_parada WHERE id_rota = p_id_rota ORDER BY ordem LOOP
    IF v_ant_id IS NOT NULL AND v_ant_local = 'loja' AND v_p.local = 'loja'
       AND v_ant_status = 'pendente' AND v_p.status = 'pendente'
       AND NOT EXISTS (
         SELECT 1
         FROM taxidog_parada_item a
         JOIN taxidog_parada_item b ON b.id_corrida = a.id_corrida
         WHERE a.id_parada = v_ant_id AND a.acao = 'deixar_loja'
           AND b.id_parada = v_p.id_parada AND b.acao = 'pegar_loja'
       ) THEN
      UPDATE taxidog_parada_item SET id_parada = v_ant_id WHERE id_parada = v_p.id_parada;
      DELETE FROM taxidog_parada WHERE id_parada = v_p.id_parada;
    ELSE
      v_ant_id := v_p.id_parada;
      v_ant_local := v_p.local;
      v_ant_status := v_p.status;
    END IF;
  END LOOP;

  WITH ord AS (
    SELECT id_parada, row_number() OVER (ORDER BY ordem) AS n
    FROM taxidog_parada WHERE id_rota = p_id_rota
  )
  UPDATE taxidog_parada p SET ordem = ord.n FROM ord WHERE ord.id_parada = p.id_parada;
END;
$$;

REVOKE ALL ON FUNCTION fn_limpar_rota(UUID) FROM PUBLIC;
