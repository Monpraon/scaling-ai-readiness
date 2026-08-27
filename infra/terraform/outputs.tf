output "api_base_url" {
  description = "Base URL for the backend API. Set this as VITE_API_BASE when building the frontend."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "dynamodb_table" {
  description = "DynamoDB table backing the counters."
  value       = aws_dynamodb_table.main.name
}

output "frontend_bucket" {
  description = "S3 bucket that serves the built frontend (empty if hosting disabled)."
  value       = var.enable_frontend_hosting ? aws_s3_bucket.site[0].bucket : null
}

output "site_url" {
  description = "Public URL of the hosted frontend, whichever hosting mode is active."
  value = (
    local.host_cf ? "https://${aws_cloudfront_distribution.site[0].domain_name}" :
    local.host_s3web ? "http://${aws_s3_bucket_website_configuration.site[0].website_endpoint}" :
    null
  )
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation). Null in s3_website mode."
  value       = local.host_cf ? aws_cloudfront_distribution.site[0].id : null
}
