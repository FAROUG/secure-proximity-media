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

resource "aws_cloudfront_response_headers_policy" "media_cors" {
  name = "${var.name}-${var.environment}-media-cors"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = [
        "GET",
        "HEAD",
        "OPTIONS"
      ]
    }

    access_control_allow_origins {
      items = ["*"]
    }

    access_control_expose_headers {
      items = [
        "Accept-Ranges",
        "Content-Length",
        "Content-Range",
        "ETag"
      ]
    }

    access_control_max_age_sec = 3600

    origin_override = true
  }
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
      "HEAD",
      "OPTIONS"
    ]

    cached_methods = [
      "GET",
      "HEAD"
    ]

    viewer_protocol_policy = "redirect-to-https"

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id

    response_headers_policy_id = aws_cloudfront_response_headers_policy.media_cors.id

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
