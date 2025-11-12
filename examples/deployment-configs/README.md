# Deployment Configuration Examples

This directory contains example deployment configurations that demonstrate the Carbonara deployment detection and carbon intensity analysis feature.

## Overview

These example files showcase deployments across different cloud providers and regions, with varying carbon intensities. The Carbonara VSCode extension will automatically detect these configurations and provide recommendations for reducing carbon emissions.

## Example Files

### AWS Deployments

| File                | Region     | Country | Carbon Intensity | Environment |
| ------------------- | ---------- | ------- | ---------------- | ----------- |
| `aws-production.tf` | us-east-1  | USA     | 400 gCO2/kWh     | Production  |
| `aws-staging.tf`    | eu-north-1 | Sweden  | 45 gCO2/kWh      | Staging     |

**Insight**: The staging environment in Sweden has ~89% lower carbon intensity than the US production deployment!

### GCP Deployments

| File                | Region         | Country   | Carbon Intensity | Environment |
| ------------------- | -------------- | --------- | ---------------- | ----------- |
| `gcp-production.tf` | ap-southeast-1 | Singapore | 420 gCO2/kWh     | Production  |
| `gcp-dev.tf`        | eu-north-1     | Finland   | 85 gCO2/kWh      | Development |

**Insight**: Finland has ~80% lower carbon emissions than Singapore due to its clean grid.

### Azure Deployments

| File                  | Region        | Country   | Carbon Intensity | Environment |
| --------------------- | ------------- | --------- | ---------------- | ----------- |
| `azure-production.tf` | australiaeast | Australia | 650 gCO2/kWh     | Production  |
| `azure-staging.tf`    | norwayeast    | Norway    | 25 gCO2/kWh      | Staging     |

**Insight**: Norway has the lowest carbon intensity in this set at only 25 gCO2/kWh (hydro-powered)!

### CI/CD Pipelines

| File                                      | Region       | Carbon Intensity |
| ----------------------------------------- | ------------ | ---------------- |
| `.github/workflows/deploy-production.yml` | us-west-2    | 350 gCO2/kWh     |
| `.github/workflows/deploy-staging.yml`    | eu-central-1 | 420 gCO2/kWh     |

### Platform-as-a-Service

| File           | Platform | Notes                     |
| -------------- | -------- | ------------------------- |
| `vercel.json`  | Vercel   | Multi-region (iad1, sfo1) |
| `netlify.toml` | Netlify  | Global CDN                |
| `heroku.yml`   | Heroku   | Default US region         |

## Carbon Intensity Rankings (Low to High)

1. 🟢 **Norway** (25 gCO2/kWh) - Hydro-powered
2. 🟢 **Sweden** (45 gCO2/kWh) - Hydro/Nuclear
3. 🟢 **Finland** (85 gCO2/kWh) - Nuclear/Renewable mix
4. 🟡 **USA - West** (350 gCO2/kWh) - Mixed with renewables
5. 🟡 **USA - East** (400 gCO2/kWh) - Mixed
6. 🟠 **Germany** (420 gCO2/kWh) - Transitioning from coal
7. 🟠 **Singapore** (420 gCO2/kWh) - Natural gas
8. 🔴 **Australia** (650 gCO2/kWh) - Coal-heavy

## Testing the Feature

### 1. Initialize a Carbonara Project

```bash
# In VSCode, open this examples directory
# Then initialize a Carbonara project
```

### 2. Scan for Deployments

1. Open the Carbonara sidebar in VSCode
2. Navigate to the "Deployments" tree view
3. Click "Scan for Deployments" button
4. Wait for the scan to complete

### 3. View Results

The extension should detect:

- **8 deployments** from Terraform files
- **2 deployments** from GitHub Actions workflows
- **3 deployments** from PaaS configs (Vercel, Netlify, Heroku)

Each deployment will show:

- 🟢 Green badge: Low carbon intensity (< 100 gCO2/kWh)
- 🟡 Yellow badge: Medium carbon intensity (100-300 gCO2/kWh)
- 🟠 Orange badge: High carbon intensity (300-500 gCO2/kWh)
- 🔴 Red badge: Very high carbon intensity (> 500 gCO2/kWh)

### 4. View Recommendations

Click the lightbulb icon in the Deployments tree view to see carbon reduction recommendations. Expected recommendations:

1. **AWS Production**: Migrate from us-east-1 to eu-north-1 for 89% reduction
2. **GCP Production**: Migrate from Singapore to Finland for 80% reduction
3. **Azure Production**: Migrate from Australia to Norway for 96% reduction

## Potential CO2 Savings

If all production workloads were moved to low-carbon regions:

- **Current average**: ~490 gCO2/kWh
- **Optimal average**: ~52 gCO2/kWh
- **Potential reduction**: ~89%

Assuming 1 kWh/day per deployment:

- Annual savings: **~160 kg CO2 per deployment**
- For 3 production deployments: **~480 kg CO2/year**

## Real-World Considerations

When choosing deployment regions, also consider:

- **Latency**: Proximity to users
- **Data sovereignty**: Legal requirements
- **Cost**: Regional pricing differences
- **Availability**: Service availability in regions
- **Carbon intensity trends**: Some regions are rapidly decarbonizing

## Next Steps

Consider:

1. Moving development/staging to low-carbon regions (lower stakes)
2. Using multi-region deployments with green regions as primary
3. Scheduling batch jobs during low-carbon hours
4. Monitoring carbon intensity changes over time with ElectricityMaps API
