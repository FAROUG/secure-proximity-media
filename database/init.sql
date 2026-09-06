CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id),
    filename VARCHAR(500) NOT NULL,
    storage_key VARCHAR(1000),
    media_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shares (
    id UUID PRIMARY KEY,
    media_id UUID NOT NULL REFERENCES media(id),
    owner_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS share_recipients (
    id UUID PRIMARY KEY,
    share_id UUID NOT NULL REFERENCES shares(id),
    user_id UUID NOT NULL REFERENCES users(id),
    access_type VARCHAR(50) NOT NULL,
    reference_user_id UUID REFERENCES users(id),
    max_distance_meters INTEGER,
    max_location_age_seconds INTEGER DEFAULT 30,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
);
CREATE TABLE IF NOT EXISTS email_verification_codes (
    id UUID PRIMARY KEY,
    share_id UUID NOT NULL REFERENCES shares(id),
    user_id UUID NOT NULL REFERENCES users(id),
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY,
    share_id UUID NOT NULL REFERENCES shares(id),
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    result VARCHAR(30) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_recipients_share_id
    ON share_recipients(share_id);

CREATE INDEX IF NOT EXISTS idx_share_recipients_user_id
    ON share_recipients(user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_share_user
    ON email_verification_codes(share_id, user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_expires_at
    ON email_verification_codes(expires_at);
    
CREATE INDEX IF NOT EXISTS idx_access_logs_share_id
    ON access_logs(share_id);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_id
    ON access_logs(user_id);