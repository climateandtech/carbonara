# AWS Production Infrastructure - High Carbon Region
# This example deploys to us-east-1, which has moderate carbon intensity

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# Production VPC
resource "aws_vpc" "production" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "production-vpc"
    Environment = "production"
  }
}

# Production ECS Cluster
resource "aws_ecs_cluster" "production_cluster" {
  name = "production-app-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Environment = "production"
  }
}

# RDS Database in production
resource "aws_db_instance" "production_db" {
  identifier           = "production-database"
  engine               = "postgres"
  engine_version       = "15.3"
  instance_class       = "db.t3.medium"
  allocated_storage    = 100
  storage_encrypted    = true
  db_name              = "proddb"
  username             = "dbadmin"
  skip_final_snapshot  = false

  tags = {
    Environment = "production"
  }
}
