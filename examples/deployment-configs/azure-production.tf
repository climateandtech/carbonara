# Azure Production Infrastructure - High Carbon Region
# This example deploys to Australia East, which has high carbon intensity

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

# Production Resource Group
resource "azurerm_resource_group" "production" {
  name     = "production-resources"
  location = "australiaeast"  # High carbon intensity region

  tags = {
    environment = "production"
  }
}

# App Service Plan
resource "azurerm_service_plan" "production" {
  name                = "production-app-service-plan"
  resource_group_name = azurerm_resource_group.production.name
  location            = azurerm_resource_group.production.location
  os_type             = "Linux"
  sku_name            = "P1v2"

  tags = {
    environment = "production"
  }
}

# Web App
resource "azurerm_linux_web_app" "production" {
  name                = "production-web-app"
  resource_group_name = azurerm_resource_group.production.name
  location            = azurerm_service_plan.production.location
  service_plan_id     = azurerm_service_plan.production.id

  site_config {
    application_stack {
      node_version = "18-lts"
    }
  }

  tags = {
    environment = "production"
  }
}

# PostgreSQL Server
resource "azurerm_postgresql_flexible_server" "production" {
  name                   = "production-psql-server"
  resource_group_name    = azurerm_resource_group.production.name
  location               = azurerm_resource_group.production.location
  version                = "15"
  administrator_login    = "psqladmin"
  administrator_password = "P@ssw0rd1234!"
  storage_mb             = 32768
  sku_name               = "GP_Standard_D2s_v3"

  tags = {
    environment = "production"
  }
}
