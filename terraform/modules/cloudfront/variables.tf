variable "name" {
  description = "Name prefix for CloudFront resources."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the private S3 media bucket."
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the private S3 media bucket."
  type        = string
}

variable "trusted_key_group_id" {
  description = "CloudFront trusted key group used to validate signed URLs and cookies."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}

variable "enabled" {
  description = "Whether the CloudFront distribution is enabled."
  type        = bool
  default     = true
}

variable "comment" {
  description = "Optional CloudFront distribution comment."
  type        = string
  default     = "Secure proximity media distribution"
}
