ALTER TABLE blueprints
    ADD COLUMN idempotency_key VARCHAR(255) NULL;

CREATE UNIQUE INDEX idx_blueprints_idempotency_key ON blueprints (idempotency_key);
