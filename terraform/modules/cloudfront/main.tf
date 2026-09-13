locals {
  origin_id = "${var.name}-${var.environment}-media-origin"

  tags = {
    Application = var.name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}


resource "aws_cloudfront_origin_access_control" "media" {
  name = "${var.name}-${var.environment}-media-oac"

  description = "OAC for ${var.name} ${var.environment} private media"

  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}


data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}


data "aws_cloudfront_response_headers_policy" "cors" {
  name = "Managed-SimpleCORS"
}


resource "aws_cloudfront_distribution" "media" {
  enabled     = var.enabled
  comment     = var.comment
  price_class = var.price_class

  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id = local.origin_id

    allowed_methods = [
      "GET",
      "HEAD"
    ]

    cached_methods = [
      "GET",
      "HEAD"
    ]

    viewer_protocol_policy = "redirect-to-https"

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id

    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.cors.id

    trusted_key_groups = [
      var.trusted_key_group_id
    ]

    compress = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true

    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.tags
}
