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

output "cloudfront_domain" {
  description = "Public URL of the hosted frontend (empty if hosting disabled)."
  value       = var.enable_frontend_hosting ? "https://${aws_cloudfront_distribution.site[0].domain_name}" : null
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)."
  value       = var.enable_frontend_hosting ? aws_cloudfront_distribution.site[0].id : null
}
