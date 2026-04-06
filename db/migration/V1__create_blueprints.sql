CREATE TABLE blueprints (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    blueprint_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blueprints_created_at_id ON blueprints (created_at DESC, id DESC);
CREATE INDEX idx_blueprints_name ON blueprints (name);
CREATE INDEX idx_blueprints_version ON blueprints (version);
CREATE INDEX idx_blueprints_created_at ON blueprints (created_at);
