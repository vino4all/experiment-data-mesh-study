-- Client Domain Database Initialization
-- Clients are owned by the Client domain

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clients (
    client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    loyalty_tier VARCHAR(50) DEFAULT 'standard',
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_updated_at ON clients(updated_at);

-- Event log for auditing and replay
CREATE TABLE IF NOT EXISTS client_events (
    event_id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    client_id UUID NOT NULL REFERENCES clients(client_id),
    payload JSONB NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
);

CREATE INDEX idx_client_events_client_id ON client_events(client_id);
CREATE INDEX idx_client_events_created_at ON client_events(created_at);
CREATE INDEX idx_client_events_event_type ON client_events(event_type);

-- Seed data
INSERT INTO clients (client_id, first_name, last_name, email, phone, address_line1, city, state, zip_code, loyalty_tier)
VALUES
    ('00000000-0000-0000-0000-000000000001'::UUID, 'Alice', 'Johnson', 'alice@example.com', '555-0101', '123 Main St', 'New York', 'NY', '10001', 'gold'),
    ('00000000-0000-0000-0000-000000000002'::UUID, 'Bob', 'Smith', 'bob@example.com', '555-0102', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'silver'),
    ('00000000-0000-0000-0000-000000000003'::UUID, 'Charlie', 'Brown', 'charlie@example.com', '555-0103', '789 Pine Rd', 'Chicago', 'IL', '60601', 'standard'),
    ('00000000-0000-0000-0000-000000000004'::UUID, 'Diana', 'Davis', 'diana@example.com', '555-0104', '321 Elm St', 'Houston', 'TX', '77001', 'gold'),
    ('00000000-0000-0000-0000-000000000005'::UUID, 'Eve', 'Wilson', 'eve@example.com', '555-0105', '654 Maple Dr', 'Phoenix', 'AZ', '85001', 'standard')
ON CONFLICT (client_id) DO NOTHING;
