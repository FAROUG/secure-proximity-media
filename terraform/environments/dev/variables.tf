variable "aws_region" {
  description = "AWS region used for regional resources."
  type        = string
  default     = "ap-southeast-2"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "dev"
}

variable "application_name" {
  description = "Application name used for resource naming."
  type        = string
  default     = "secure-proximity-media"
}

variable "media_bucket_name" {
  description = "Globally unique S3 bucket name for private media."
  type        = string
}

variable "cloudfront_key_group_id" {
  description = "CloudFront trusted key group ID used for signed URLs."
  type        = string
}
