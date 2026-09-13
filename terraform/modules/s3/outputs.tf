output "bucket_id" {
  description = "S3 bucket ID."
  value       = aws_s3_bucket.media.id
}


output "bucket_name" {
  description = "S3 bucket name."
  value       = aws_s3_bucket.media.bucket
}


output "bucket_arn" {
  description = "S3 bucket ARN."
  value       = aws_s3_bucket.media.arn
}


output "bucket_regional_domain_name" {
  description = "Regional S3 domain name used by CloudFront."
  value       = aws_s3_bucket.media.bucket_regional_domain_name
}
