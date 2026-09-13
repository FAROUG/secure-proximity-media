module "media_s3" {
  source = "../../modules/s3"

  bucket_name        = var.media_bucket_name
  environment        = var.environment
  force_destroy      = false
  versioning_enabled = true
}


module "media_cloudfront" {
  source = "../../modules/cloudfront"

  name        = var.application_name
  environment = var.environment

  s3_bucket_arn                  = module.media_s3.bucket_arn
  s3_bucket_regional_domain_name = module.media_s3.bucket_regional_domain_name

  trusted_key_group_id = var.cloudfront_key_group_id

  price_class = "PriceClass_100"
}

data "aws_iam_policy_document" "media_bucket_policy" {
  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type = "Service"

      identifiers = [
        "cloudfront.amazonaws.com"
      ]
    }

    actions = [
      "s3:GetObject"
    ]

    resources = [
      "${module.media_s3.bucket_arn}/*"
    ]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"

      values = [
        module.media_cloudfront.distribution_arn
      ]
    }
  }
}


resource "aws_s3_bucket_policy" "media" {
  bucket = module.media_s3.bucket_id
  policy = data.aws_iam_policy_document.media_bucket_policy.json
}
