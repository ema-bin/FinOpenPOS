-- Marca qué medios de pago son Mercado Pago. Correr en el editor de Supabase.
-- Solo agrega una columna. Los medios que ya existen quedan sin la marca.

ALTER TABLE payment_methods
    ADD COLUMN IF NOT EXISTS is_mercadopago BOOLEAN NOT NULL DEFAULT FALSE;
