ALTER TABLE media
ADD COLUMN IF NOT EXISTS original_storage_key VARCHAR(1000);

ALTER TABLE media
ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30)
NOT NULL DEFAULT 'PENDING_UPLOAD';

ALTER TABLE media
ADD COLUMN IF NOT EXISTS processing_error TEXT;

ALTER TABLE media
ADD CONSTRAINT media_processing_status_check
CHECK (
    processing_status IN (
        'PENDING_UPLOAD',
        'UPLOADED',
        'PROCESSING',
        'READY',
        'FAILED'
    )
);