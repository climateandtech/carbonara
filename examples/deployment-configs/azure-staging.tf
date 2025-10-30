# Azure Staging Infrastructure - Low Carbon Region
# This example uses Norway East, which has very low carbon intensity (hydro-powered)

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

# Staging Resource Group
resource "azurerm_resource_group" "staging" {
  name     = "staging-resources"
  location = "norwayeast"  # Very low carbon intensity - hydro-powered

  tags = {
    environment = "staging"
  }
}

# Container Instances
resource "azurerm_container_group" "staging" {
  name                = "staging-container-group"
  location            = azurerm_resource_group.staging.location
  resource_group_name = azurerm_resource_group.staging.name
  os_type             = "Linux"

  container {
    name   = "staging-api"
    image  = "myregistry.azurecr.io/api:staging"
    cpu    = "0.5"
    memory = "1.5"

    ports {
      port     = 443
      protocol = "TCP"
    }

    environment_variables = {
      "ENVIRONMENT" = "staging"
    }
  }

  tags = {
    environment = "staging"
  }
}

# Storage Account
resource "azurerm_storage_account" "staging" {
  name                     = "stagingstorage"
  resource_group_name      = azurerm_resource_group.staging.name
  location                 = azurerm_resource_group.staging.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = {
    environment = "staging"
  }
}
