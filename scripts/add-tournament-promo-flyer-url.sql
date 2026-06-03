-- Columna + bucket en Supabase Storage (público, lectura para links de WhatsApp)
-- Dashboard: Storage → New bucket → tournament_promo_flyers → Public

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS promo_flyer_url TEXT;
