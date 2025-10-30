# AWS Staging Infrastructure - Low Carbon Region
# This example uses eu-north-1 (Sweden) which has very low carbon intensity

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-north-1"  # Stockholm - powered by renewable energy
}

# Staging VPC
resource "aws_vpc" "staging" {
  cidr_block = "10.1.0.0/16"

  tags = {
    Name        = "staging-vpc"
    Environment = "staging"
  }
}

# Lambda function for staging
resource "aws_lambda_function" "staging_api" {
  function_name = "staging-api-handler"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"

  environment {
    variables = {
      ENVIRONMENT = "staging"
    }
  }

  tags = {
    Environment = "staging"
  }
}

resource "aws_iam_role" "lambda_role" {
  name = "staging_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}
