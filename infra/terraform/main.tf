data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name        = var.project_name
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.name
  cors_origin = length(var.allowed_origins) == 1 ? var.allowed_origins[0] : "*"

  host_enabled = var.enable_frontend_hosting
  host_cf      = var.enable_frontend_hosting && var.frontend_hosting_mode == "cloudfront"
  host_s3web   = var.enable_frontend_hosting && var.frontend_hosting_mode == "s3_website"
}

# ─────────────────────────────────────────────────────────
# DynamoDB — single table of atomic counters (steps + daily budget)
# ─────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "main" {
  name         = "${local.name}-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }
}

# ─────────────────────────────────────────────────────────
# Lambda backend
# ─────────────────────────────────────────────────────────

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/.build/lambda.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${local.name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${local.name}-lambda"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Sid    = "DynamoCounters"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
        ]
        Resource = aws_dynamodb_table.main.arn
      },
      {
        Sid      = "BedrockInvoke"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 30
  memory_size      = 256

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      TABLE_NAME                = aws_dynamodb_table.main.name
      BEDROCK_MODEL_ID          = var.bedrock_model_id
      BEDROCK_FALLBACK_MODEL_ID = var.bedrock_fallback_model_id
      MAX_INPUT_CHARS           = tostring(var.max_input_chars)
      MAX_AI_REQUESTS_PER_DAY   = tostring(var.max_ai_requests_per_day)
      MAX_OUTPUT_TOKENS         = tostring(var.max_output_tokens)
      ALLOWED_ORIGIN            = local.cors_origin
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

# ─────────────────────────────────────────────────────────
# HTTP API (API Gateway v2)
# ─────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

locals {
  routes = [
    "POST /analyze",
    "POST /stats",
    "GET /stats/summary",
  ]
}

resource "aws_apigatewayv2_route" "routes" {
  for_each  = toset(local.routes)
  api_id    = aws_apigatewayv2_api.http.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.api_throttle_rate
    throttling_burst_limit = var.api_throttle_burst
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# ─────────────────────────────────────────────────────────
# Frontend hosting (optional): private S3 + CloudFront (OAC)
# ─────────────────────────────────────────────────────────

resource "aws_s3_bucket" "site" {
  count         = local.host_enabled ? 1 : 0
  bucket        = "${local.name}-site-${local.account_id}"
  force_destroy = true
}

# In cloudfront mode the bucket is fully private (served via OAC).
# In s3_website mode public read is required, so the block is relaxed.
resource "aws_s3_bucket_public_access_block" "site" {
  count                   = local.host_enabled ? 1 : 0
  bucket                  = aws_s3_bucket.site[0].id
  block_public_acls       = local.host_cf
  block_public_policy     = local.host_cf
  ignore_public_acls      = local.host_cf
  restrict_public_buckets = local.host_cf
}

# ── s3_website mode ───────────────────────────────────────

resource "aws_s3_bucket_website_configuration" "site" {
  count  = local.host_s3web ? 1 : 0
  bucket = aws_s3_bucket.site[0].id

  index_document {
    suffix = "index.html"
  }
  # SPA fallback: serve index.html for unknown paths.
  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_policy" "site_public" {
  count  = local.host_s3web ? 1 : 0
  bucket = aws_s3_bucket.site[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowPublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site[0].arn}/*"
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.site]
}

# ── cloudfront mode ───────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "site" {
  count                             = local.host_cf ? 1 : 0
  name                              = "${local.name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  count               = local.host_cf ? 1 : 0
  enabled             = true
  default_root_object = "index.html"
  comment             = local.name
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.site[0].bucket_regional_domain_name
    origin_id                = "s3-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site[0].id
  }

  default_cache_behavior {
    target_origin_id       = "s3-site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA: serve index.html for client-side routes / missing keys.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "site" {
  count  = local.host_cf ? 1 : 0
  bucket = aws_s3_bucket.site[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site[0].arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.site[0].arn
        }
      }
    }]
  })
}
