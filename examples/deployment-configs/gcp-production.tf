# GCP Production Infrastructure - High Carbon Region
# This example deploys to ap-southeast-1 (Singapore)

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = "my-production-project"
  region  = "ap-southeast-1"  # Singapore
}

# Production GKE Cluster
resource "google_container_cluster" "production" {
  name     = "production-gke-cluster"
  location = "ap-southeast-1-a"

  initial_node_count = 3

  node_config {
    machine_type = "e2-medium"
    disk_size_gb = 100

    labels = {
      environment = "production"
    }

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
  }
}

# Cloud SQL Instance
resource "google_sql_database_instance" "production" {
  name             = "production-db-instance"
  database_version = "POSTGRES_15"
  region           = "ap-southeast-1"

  settings {
    tier = "db-f1-micro"

    backup_configuration {
      enabled = true
    }
  }

  deletion_protection = true
}
