-- Cierre de caja diario (solo ventas cantina). Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS daily_sales_closures (
    id                       BIGSERIAL PRIMARY KEY,
    business_date            DATE NOT NULL UNIQUE,
    period_start             TIMESTAMPTZ NOT NULL,
    period_end               TIMESTAMPTZ NOT NULL,
    closed_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by_user_uid       UUID NOT NULL,
    total_sales              NUMERIC(10, 2) NOT NULL DEFAULT 0,
    orders_closed_count      INTEGER NOT NULL DEFAULT 0,
    transactions_count       INTEGER NOT NULL DEFAULT 0,
    total_discount           NUMERIC(10, 2) NOT NULL DEFAULT 0,
    zero_amount_orders_count INTEGER NOT NULL DEFAULT 0,
    discounted_orders_count  INTEGER NOT NULL DEFAULT 0,
    open_orders_count        INTEGER NOT NULL DEFAULT 0,
    open_orders_total        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes                    TEXT,
    revision_count           INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_closures_business_date
    ON daily_sales_closures(business_date DESC);

CREATE TABLE IF NOT EXISTS daily_sales_closure_payment_methods (
    id                  BIGSERIAL PRIMARY KEY,
    closure_id          BIGINT NOT NULL REFERENCES daily_sales_closures(id) ON DELETE CASCADE,
    payment_method_id   BIGINT REFERENCES payment_methods(id),
    payment_method_name TEXT NOT NULL,
    total_amount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    transaction_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_closure_pm_closure_id
    ON daily_sales_closure_payment_methods(closure_id);

CREATE TABLE IF NOT EXISTS daily_sales_closure_products (
    id            BIGSERIAL PRIMARY KEY,
    closure_id    BIGINT NOT NULL REFERENCES daily_sales_closures(id) ON DELETE CASCADE,
    product_id    BIGINT NOT NULL REFERENCES products(id),
    product_name  TEXT NOT NULL,
    category_id   BIGINT REFERENCES product_categories(id),
    category_name TEXT,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_closure_products_closure_id
    ON daily_sales_closure_products(closure_id);

CREATE TABLE IF NOT EXISTS daily_sales_closure_categories (
    id            BIGSERIAL PRIMARY KEY,
    closure_id    BIGINT NOT NULL REFERENCES daily_sales_closures(id) ON DELETE CASCADE,
    category_id   BIGINT REFERENCES product_categories(id),
    category_name TEXT NOT NULL,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_closure_categories_closure_id
    ON daily_sales_closure_categories(closure_id);
