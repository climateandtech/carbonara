# GCP Development Infrastructure - Low Carbon Region
# This example uses europe-north1 (Finland) which has low carbon intensity

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = "my-dev-project"
  region  = "europe-north1"  # Finland - low-carbon grid
}

# Development App Engine
resource "google_app_engine_application" "dev_app" {
  project     = "my-dev-project"
  location_id = "europe-north1"
}

# Cloud Run Service
resource "google_cloud_run_service" "dev_api" {
  name     = "dev-api-service"
  location = "europe-north1"

  template {
    spec {
      containers {
        image = "gcr.io/my-dev-project/api:latest"

        env {
          name  = "ENVIRONMENT"
          value = "development"
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}
