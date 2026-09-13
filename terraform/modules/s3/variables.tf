variable "bucket_name" {
  description = "Name of the private S3 media bucket."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "force_destroy" {
  description = "Allow Terraform to delete the bucket even when it contains objects."
  type        = bool
  default     = false
}

variable "versioning_enabled" {
  description = "Enable S3 object versioning."
  type        = bool
  default     = true
}
