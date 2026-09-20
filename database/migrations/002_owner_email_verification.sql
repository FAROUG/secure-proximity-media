CREATE TABLE IF NOT EXISTS owner_email_verification_codes (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES users(id),

    code_hash VARCHAR(255) NOT NULL,

    expires_at TIMESTAMP NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 0,

    verified_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_owner_email_verification_codes_user_created
ON owner_email_verification_codes (
    user_id,
    created_at DESC
);

-- 275fe94d6a7e522166ddcf74ae8720149ffa3499c4cd55f8eeb787474851d813