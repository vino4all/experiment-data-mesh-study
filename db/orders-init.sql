-- Orders Domain Database Initialization
-- Orders are owned by the Orders domain
-- This schema supports all three synchronization patterns

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    order_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    order_total DECIMAL(10, 2) NOT NULL,
    shipping_status VARCHAR(50) NOT NULL DEFAULT 'not_shipped',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_order_status ON orders(order_status);

-- Pattern A: Direct API - References only (no denormalized data)
-- (Standard orders table above)

-- Pattern B: Event-Driven Projection
-- Local read model synchronized via Kafka events
CREATE TABLE IF NOT EXISTS orders_client_projection (
    client_id UUID PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    loyalty_tier VARCHAR(50),
    projection_version INTEGER NOT NULL DEFAULT 0,
    projected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    source_update_timestamp TIMESTAMP,
    visible_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    freshness_lag_ms BIGINT
);

CREATE INDEX idx_orders_client_projection_projected_at ON orders_client_projection(projected_at);

-- Consumer state tracking for replay and idempotency
CREATE TABLE IF NOT EXISTS orders_projection_consumer_state (
    consumer_group VARCHAR(255) PRIMARY KEY,
    last_offset BIGINT NOT NULL DEFAULT 0,
    last_processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Pattern C: Batch Data Product Replication
-- Full denormalized batch data product
CREATE TABLE IF NOT EXISTS orders_batch_client_ods (
    client_id UUID PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    loyalty_tier VARCHAR(50),
    batch_version INTEGER NOT NULL DEFAULT 0,
    batch_imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
    source_update_timestamp TIMESTAMP,
    visible_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    freshness_lag_ms BIGINT
);

CREATE INDEX idx_orders_batch_client_ods_batch_imported_at ON orders_batch_client_ods(batch_imported_at);

-- Batch sync state tracking
CREATE TABLE IF NOT EXISTS orders_batch_sync_state (
    sync_id BIGSERIAL PRIMARY KEY,
    source_database VARCHAR(255) NOT NULL,
    sync_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    rows_processed INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX idx_orders_batch_sync_state_status ON orders_batch_sync_state(sync_status);

-- Metrics tables
CREATE TABLE IF NOT EXISTS api_call_metrics (
    metric_id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL,
    client_id UUID NOT NULL,
    latency_ms INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_call_metrics_recorded_at ON api_call_metrics(recorded_at);

CREATE TABLE IF NOT EXISTS projection_lag_metrics (
    metric_id BIGSERIAL PRIMARY KEY,
    client_id UUID NOT NULL,
    lag_ms BIGINT NOT NULL,
    source_update_timestamp TIMESTAMP,
    visible_timestamp TIMESTAMP,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS synchronization_visibility_events (
    event_id BIGSERIAL PRIMARY KEY,
    pattern VARCHAR(50) NOT NULL,
    client_id UUID NOT NULL,
    source_update_timestamp TIMESTAMP NOT NULL,
    visible_timestamp TIMESTAMP NOT NULL,
    freshness_lag_ms BIGINT NOT NULL,
    source_reference VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_visibility_pattern_created_at ON synchronization_visibility_events(pattern, created_at);
CREATE INDEX idx_sync_visibility_client_id ON synchronization_visibility_events(client_id);

CREATE INDEX idx_projection_lag_metrics_recorded_at ON projection_lag_metrics(recorded_at);

-- Seed order data
INSERT INTO orders (order_id, client_id, order_status, order_total, shipping_status)
VALUES
    ('c8b5e4f8-3b14-4e1a-9c5d-8a7f1b9e2d3c'::UUID, '00000000-0000-0000-0000-000000000001'::UUID, 'pending', 99.99, 'not_shipped'),
    ('d7e3f2c1-5a9b-4c8f-3e2a-1b7d9c4f8e6a'::UUID, '00000000-0000-0000-0000-000000000002'::UUID, 'confirmed', 149.99, 'not_shipped'),
    ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'::UUID, '00000000-0000-0000-0000-000000000003'::UUID, 'shipped', 79.99, 'in_transit'),
    ('f4e3d2c1-b0a9-4f8e-7d6c-5b4a3f2e1d0c'::UUID, '00000000-0000-0000-0000-000000000004'::UUID, 'pending', 249.99, 'not_shipped'),
    ('b9a8f7e6-d5c4-4b3a-2f1e-0d9c8b7a6f5e'::UUID, '00000000-0000-0000-0000-000000000005'::UUID, 'delivered', 199.99, 'delivered')
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO orders_client_projection (client_id, first_name, last_name, email, phone, address_line1, city, state, zip_code, loyalty_tier, projection_version, projected_at)
VALUES
    ('00000000-0000-0000-0000-000000000001'::UUID, 'Alice', 'Johnson', 'alice@example.com', '555-0101', '123 Main St', 'New York', 'NY', '10001', 'gold', 1, NOW()),
    ('00000000-0000-0000-0000-000000000002'::UUID, 'Bob', 'Smith', 'bob@example.com', '555-0102', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'silver', 1, NOW()),
    ('00000000-0000-0000-0000-000000000003'::UUID, 'Charlie', 'Brown', 'charlie@example.com', '555-0103', '789 Pine Rd', 'Chicago', 'IL', '60601', 'standard', 1, NOW()),
    ('00000000-0000-0000-0000-000000000004'::UUID, 'Diana', 'Davis', 'diana@example.com', '555-0104', '321 Elm St', 'Houston', 'TX', '77001', 'gold', 1, NOW()),
    ('00000000-0000-0000-0000-000000000005'::UUID, 'Eve', 'Wilson', 'eve@example.com', '555-0105', '654 Maple Dr', 'Phoenix', 'AZ', '85001', 'standard', 1, NOW())
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO orders_batch_client_ods (client_id, first_name, last_name, email, phone, address_line1, city, state, zip_code, loyalty_tier, batch_version, batch_imported_at)
VALUES
    ('00000000-0000-0000-0000-000000000001'::UUID, 'Alice', 'Johnson', 'alice@example.com', '555-0101', '123 Main St', 'New York', 'NY', '10001', 'gold', 1, NOW()),
    ('00000000-0000-0000-0000-000000000002'::UUID, 'Bob', 'Smith', 'bob@example.com', '555-0102', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'silver', 1, NOW()),
    ('00000000-0000-0000-0000-000000000003'::UUID, 'Charlie', 'Brown', 'charlie@example.com', '555-0103', '789 Pine Rd', 'Chicago', 'IL', '60601', 'standard', 1, NOW()),
    ('00000000-0000-0000-0000-000000000004'::UUID, 'Diana', 'Davis', 'diana@example.com', '555-0104', '321 Elm St', 'Houston', 'TX', '77001', 'gold', 1, NOW()),
    ('00000000-0000-0000-0000-000000000005'::UUID, 'Eve', 'Wilson', 'eve@example.com', '555-0105', '654 Maple Dr', 'Phoenix', 'AZ', '85001', 'standard', 1, NOW())
ON CONFLICT (client_id) DO NOTHING;
