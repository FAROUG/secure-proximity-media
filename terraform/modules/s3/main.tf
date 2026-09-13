locals {
  tags = {
    Application = "secure-proximity-media"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}


resource "aws_s3_bucket" "media" {
  bucket = var.bucket_name

  force_destroy = var.force_destroy

  tags = local.tags
}


/*
 * --------------------------------------------------
 * BLOCK ALL PUBLIC ACCESS
 * --------------------------------------------------
 */

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}


/*
 * --------------------------------------------------
 * OBJECT OWNERSHIP
 * --------------------------------------------------
 *
 * Disable ACL-based ownership.
 */

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}


/*
 * --------------------------------------------------
 * VERSIONING
 * --------------------------------------------------
 */

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}


/*
 * --------------------------------------------------
 * SERVER-SIDE ENCRYPTION
 * --------------------------------------------------
 *
 * Start with SSE-S3.
 *
 * Later we can switch to SSE-KMS if required.
 */

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
