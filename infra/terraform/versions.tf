terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Remote state is recommended for team/two-repo workflows.
  # Copy backend.tf.example to backend.tf and fill in a bucket you own,
  # then run: terraform init -reconfigure
  # Left as local state by default so a fresh clone can `terraform apply`
  # without any pre-existing infrastructure.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Project   = var.project_name
        ManagedBy = "terraform"
      },
      var.tags
    )
  }
}

# CloudFront + ACM for the frontend must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = merge(
      {
        Project   = var.project_name
        ManagedBy = "terraform"
      },
      var.tags
    )
  }
}
