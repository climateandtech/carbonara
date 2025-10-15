# Carbonara Built-in Analyzers

## Carbonara SWD Analyzer

The Carbonara SWD Analyzer is a built-in tool that estimates CO2 emissions from web page data transfer using the Sustainable Web Design (SWD) model and established research methodologies.

### Methodology

The analyzer combines two well-established models:

1. **Energy Intensity Model for Network Transfer** - Based on research by Coroama (2021)
2. **Sustainable Web Design (SWD) Model** - As implemented in CO2.js by The Green Web Foundation

### How it Works

1. **Data Collection**: Uses Playwright to load a web page and measure all network requests
2. **Energy Calculation**: Converts bytes transferred to energy consumption using network intensity factors
3. **System Modeling**: Applies the SWD model to estimate total system energy (device, network, datacenter, embodied)
4. **Carbon Conversion**: Converts energy to CO2 emissions using grid carbon intensity

### Key Constants

- **Network Intensity**: 0.04106063 kWh/GB
  - Based on WAN+FAN+RAN model from Coroama (2021)
  - Includes Wide Area Network, Fixed Access Network, and Radio Access Network
  - Weighted approximately 90% FAN, 10% RAN for typical connections

- **Global Grid Intensity**: 473 gCO2e/kWh
  - 2024 global average from Ember Global Electricity Review 2025
  - Can be overridden with `--grid-intensity` option for specific regions

### SWD Model Breakdown

The Sustainable Web Design model allocates system energy across four components:

- **Consumer Device Usage**: 52% - End user device energy consumption
- **Network Transfer**: 14% - Energy for data transmission
- **Data Center Operations**: 15% - Server and infrastructure energy
- **Embodied Carbon**: 19% - Manufacturing and hardware lifecycle

### Usage

```bash
# Basic analysis
carbonara analyze carbonara-swd https://example.com

# With custom grid intensity (e.g., for a specific country)
carbonara analyze carbonara-swd https://example.com --grid-intensity 334

# For returning visitors (loads less data)
carbonara analyze carbonara-swd https://example.com --returning-visitor

# Save results to database
carbonara analyze carbonara-swd https://example.com --save
```

### Research References

1. **Coroama, V. (2021)** - "Investigating the inconsistencies among energy and energy intensity estimates of the internet" - Swiss Federal Office of Energy SFOE
   - Provides the Energy Intensity Model for network transfer calculations
   - Source: [green-coding.io](https://www.green-coding.io/co2-formulas/)

2. **CO2.js by The Green Web Foundation** - Open-source JavaScript library implementing the Sustainable Web Design model
   - Provides system-wide energy allocation percentages
   - Source: [thegreenwebfoundation.org/co2-js](https://www.thegreenwebfoundation.org/co2-js/)

3. **Ember Global Electricity Review 2025** - Global grid carbon intensity data
   - Provides current grid carbon intensity values by country and globally
   - Source: [ember-climate.org](https://ember-climate.org/)

4. **Green Coding Organization** - CO2 calculation formulas and methodologies
   - Compilation of research-based carbon calculation approaches
   - Source: [green-coding.io](https://www.green-coding.io/)

### Limitations

- **Network Model Assumptions**: Uses average network intensity values that may not reflect specific routing or infrastructure
- **Caching Effects**: Does not account for CDN caching or browser caching beyond the returning visitor model
- **Dynamic Content**: May not capture all dynamically loaded content or background requests
- **Regional Variations**: Default grid intensity is global average; actual emissions vary significantly by region
- **Temporal Variations**: Does not account for time-of-day variations in grid carbon intensity

### Validation

The analyzer has been designed to align with established methodologies used by:
- CO2.js (The Green Web Foundation)
- Website Carbon Calculator tools
- Academic research in digital carbon footprinting

For production use, consider validating results against other established tools and adjusting parameters based on your specific use case and regional context.