output "distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.media.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.media.arn
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.media.domain_name
}

output "origin_access_control_id" {
  description = "CloudFront Origin Access Control ID."
  value       = aws_cloudfront_origin_access_control.media.id
}
