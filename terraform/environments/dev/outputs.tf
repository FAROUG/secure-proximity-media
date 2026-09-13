output "media_bucket_name" {
  description = "Private media S3 bucket name."
  value       = module.media_s3.bucket_name
}


output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = module.media_cloudfront.distribution_id
}


output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = module.media_cloudfront.distribution_arn
}


output "cloudfront_domain_name" {
  description = "CloudFront distribution domain."
  value       = module.media_cloudfront.distribution_domain_name
}
