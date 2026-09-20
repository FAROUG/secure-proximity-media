-- Apply before starting the lease-based media worker.
ALTER TABLE media
    ADD COLUMN IF NOT EXISTS processing_claim_id UUID,
    ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMP;

-- Recover jobs left PROCESSING by a worker without lease support.
UPDATE media
SET processing_status = 'UPLOADED',
    processing_claim_id = NULL,
    processing_error = NULL
WHERE processing_status = 'PROCESSING'
  AND processing_lease_expires_at IS NULL;
