-- ============================================================
-- PETSHOP SaaS - Migration 044: search_path fixo em auth_role()
-- ============================================================
-- auth_role() (migration 002) era a única função usada nas policies sem
-- `SET search_path`, e o corpo dela cita `perfil_usuario` sem schema —
-- o resultado dependia do search_path de quem chamasse. É o que o
-- Security Advisor do Supabase aponta (function_search_path_mutable).
-- Nada muda no resultado da função.
--
-- Contexto: no QA do TaxiDog os eventos de Realtime de taxidog_corrida
-- (painel de corridas e app do TaxiDog) não chegavam, e esta função era
-- a suspeita principal. Fixar o search_path NÃO resolveu sozinho — a
-- investigação do Realtime continua —, mas a correção vale por si.
-- ============================================================

ALTER FUNCTION auth_role() SET search_path = public;
