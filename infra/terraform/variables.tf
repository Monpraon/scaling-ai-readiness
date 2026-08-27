variable "aws_region" {
  description = "AWS region for the backend (Lambda, DynamoDB, API Gateway). Must be a region where the chosen Bedrock models are available."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used to prefix resource names."
  type        = string
  default     = "scaling-ai-readiness"
}

variable "tags" {
  description = "Extra tags applied to all resources."
  type        = map(string)
  default     = {}
}

# ── Bedrock ───────────────────────────────────────────────

variable "bedrock_model_id" {
  description = "Primary Bedrock model (Converse API). Cheap text model recommended."
  type        = string
  default     = "amazon.nova-micro-v1:0"
}

variable "bedrock_fallback_model_id" {
  description = "Fallback Bedrock model used if the primary call fails."
  type        = string
  default     = "amazon.nova-lite-v1:0"
}

variable "max_output_tokens" {
  description = "Max tokens the model may return per analysis."
  type        = number
  default     = 800
}

# ── Cost / abuse guards ───────────────────────────────────

variable "max_ai_requests_per_day" {
  description = "Application-level daily cap on /analyze calls. Beyond this, /analyze returns 429."
  type        = number
  default     = 2000
}

variable "max_input_chars" {
  description = "Max characters of pasted text forwarded to the model."
  type        = number
  default     = 8000
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency cap for the backend Lambda (limits downstream Bedrock spend under a spike). -1 disables the reservation. Note: a positive value requires your account's concurrency limit to be high enough to leave >=10 unreserved; new/low-limit accounts should keep this at -1."
  type        = number
  default     = -1
}

variable "api_throttle_rate" {
  description = "Steady-state request/sec throttle on the HTTP API stage."
  type        = number
  default     = 20
}

variable "api_throttle_burst" {
  description = "Burst request throttle on the HTTP API stage."
  type        = number
  default     = 40
}

variable "responses_ttl_days" {
  description = "TTL (days) for transient budget items in DynamoDB."
  type        = number
  default     = 2
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the Lambda."
  type        = number
  default     = 14
}

# ── CORS / frontend ───────────────────────────────────────

variable "allowed_origins" {
  description = "Allowed CORS origins for the API. Use [\"*\"] for a fully public tool, or lock to your site's origin."
  type        = list(string)
  default     = ["*"]
}

variable "enable_frontend_hosting" {
  description = "If true, provision hosting for the built frontend."
  type        = bool
  default     = true
}

variable "github_token_ssm_name" {
  description = "SSM Parameter Store name (SecureString) holding a GitHub token used to scan PRIVATE repos. Create it yourself so the secret never enters Terraform/state: aws ssm put-parameter --name /scale-my-ai/github-token --type SecureString --value <TOKEN>. Leave empty to disable private-repo scanning (public repos still scan client-side; /scan returns 501)."
  type        = string
  default     = ""
}

variable "frontend_hosting_mode" {
  description = "How to host the frontend: \"cloudfront\" (private S3 + CloudFront + HTTPS, recommended) or \"s3_website\" (public S3 website, HTTP only — useful for accounts not yet verified for CloudFront)."
  type        = string
  default     = "cloudfront"

  validation {
    condition     = contains(["cloudfront", "s3_website"], var.frontend_hosting_mode)
    error_message = "frontend_hosting_mode must be \"cloudfront\" or \"s3_website\"."
  }
}
