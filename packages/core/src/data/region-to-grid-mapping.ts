/**
 * Comprehensive mapping of cloud provider deployment regions to electricity grid zones
 *
 * This mapping connects cloud provider region codes to the corresponding electricity
 * grid zones defined in electricity_maps_zones.yml. The grid zones are used to
 * determine the carbon intensity of electricity in each region.
 *
 * Grid zone codes follow the ISO 3166-1 alpha-2 standard for countries, with
 * additional regional codes for specific electricity grids (e.g., US-CAL-CISO for
 * California Independent System Operator).
 *
 * Last updated: 2025-11-12
 * Sources:
 * - AWS: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html
 * - GCP: https://cloud.google.com/compute/docs/regions-zones
 * - Azure: https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/
 * - Vercel: https://vercel.com/docs/edge-network/regions
 * - Heroku: https://devcenter.heroku.com/articles/regions
 * - Netlify: https://docs.netlify.com/domains-https/custom-domains/configure-external-dns/
 */

export interface RegionGridMapping {
  /** Cloud provider region code */
  region: string;

  /** Electricity grid zone code (matches electricity_maps_zones.yml) */
  gridZone: string;

  /** Human-readable location */
  location: string;

  /** ISO 3166-1 alpha-2 country code */
  country: string;

  /** Additional notes about the mapping */
  notes?: string;
}

/**
 * AWS Region to Grid Zone Mappings
 */
export const AWS_REGION_MAPPINGS: Record<string, RegionGridMapping> = {
  // North America - United States
  'us-east-1': { region: 'us-east-1', gridZone: 'US-MIDA-PJM', location: 'N. Virginia, USA', country: 'US', notes: 'PJM Interconnection' },
  'us-east-2': { region: 'us-east-2', gridZone: 'US-MIDW-MISO', location: 'Ohio, USA', country: 'US', notes: 'Midcontinent ISO' },
  'us-west-1': { region: 'us-west-1', gridZone: 'US-CAL-CISO', location: 'N. California, USA', country: 'US', notes: 'CAISO' },
  'us-west-2': { region: 'us-west-2', gridZone: 'US-NW-PACW', location: 'Oregon, USA', country: 'US', notes: 'Pacificorp West' },

  // North America - Canada
  'ca-central-1': { region: 'ca-central-1', gridZone: 'CA-ON', location: 'Central Canada', country: 'CA', notes: 'Ontario grid' },
  'ca-west-1': { region: 'ca-west-1', gridZone: 'CA-AB', location: 'Calgary, Canada', country: 'CA', notes: 'Alberta grid' },

  // South America
  'sa-east-1': { region: 'sa-east-1', gridZone: 'BR', location: 'São Paulo, Brazil', country: 'BR' },

  // Europe
  'eu-north-1': { region: 'eu-north-1', gridZone: 'SE', location: 'Stockholm, Sweden', country: 'SE' },
  'eu-west-1': { region: 'eu-west-1', gridZone: 'IE', location: 'Ireland', country: 'IE' },
  'eu-west-2': { region: 'eu-west-2', gridZone: 'GB', location: 'London, United Kingdom', country: 'GB' },
  'eu-west-3': { region: 'eu-west-3', gridZone: 'FR', location: 'Paris, France', country: 'FR' },
  'eu-central-1': { region: 'eu-central-1', gridZone: 'DE', location: 'Frankfurt, Germany', country: 'DE' },
  'eu-central-2': { region: 'eu-central-2', gridZone: 'CH', location: 'Zurich, Switzerland', country: 'CH' },
  'eu-south-1': { region: 'eu-south-1', gridZone: 'IT', location: 'Milan, Italy', country: 'IT' },
  'eu-south-2': { region: 'eu-south-2', gridZone: 'ES', location: 'Spain', country: 'ES' },

  // Asia Pacific
  'ap-east-1': { region: 'ap-east-1', gridZone: 'HK', location: 'Hong Kong', country: 'HK' },
  'ap-east-2': { region: 'ap-east-2', gridZone: 'TW', location: 'Taipei, Taiwan', country: 'TW' },
  'ap-south-1': { region: 'ap-south-1', gridZone: 'IN-WE', location: 'Mumbai, India', country: 'IN', notes: 'Western India grid' },
  'ap-south-2': { region: 'ap-south-2', gridZone: 'IN-SO', location: 'Hyderabad, India', country: 'IN', notes: 'Southern India grid' },
  'ap-northeast-1': { region: 'ap-northeast-1', gridZone: 'JP-TK', location: 'Tokyo, Japan', country: 'JP', notes: 'Tokyo grid' },
  'ap-northeast-2': { region: 'ap-northeast-2', gridZone: 'KR', location: 'Seoul, South Korea', country: 'KR' },
  'ap-northeast-3': { region: 'ap-northeast-3', gridZone: 'JP-KN', location: 'Osaka, Japan', country: 'JP', notes: 'Kansai grid' },
  'ap-southeast-1': { region: 'ap-southeast-1', gridZone: 'SG', location: 'Singapore', country: 'SG' },
  'ap-southeast-2': { region: 'ap-southeast-2', gridZone: 'AU-NSW', location: 'Sydney, Australia', country: 'AU', notes: 'New South Wales grid' },
  'ap-southeast-3': { region: 'ap-southeast-3', gridZone: 'ID', location: 'Jakarta, Indonesia', country: 'ID' },
  'ap-southeast-4': { region: 'ap-southeast-4', gridZone: 'AU-VIC', location: 'Melbourne, Australia', country: 'AU', notes: 'Victoria grid' },
  'ap-southeast-5': { region: 'ap-southeast-5', gridZone: 'MY', location: 'Malaysia', country: 'MY' },
  'ap-southeast-6': { region: 'ap-southeast-6', gridZone: 'NZ', location: 'New Zealand', country: 'NZ' },
  'ap-southeast-7': { region: 'ap-southeast-7', gridZone: 'TH', location: 'Thailand', country: 'TH' },

  // Middle East
  'me-south-1': { region: 'me-south-1', gridZone: 'BH', location: 'Bahrain', country: 'BH' },
  'me-central-1': { region: 'me-central-1', gridZone: 'AE', location: 'UAE', country: 'AE' },
  'il-central-1': { region: 'il-central-1', gridZone: 'IL', location: 'Tel Aviv, Israel', country: 'IL' },

  // Africa
  'af-south-1': { region: 'af-south-1', gridZone: 'ZA', location: 'Cape Town, South Africa', country: 'ZA' },

  // Mexico
  'mx-central-1': { region: 'mx-central-1', gridZone: 'MX', location: 'Central Mexico', country: 'MX' },

  // AWS GovCloud
  'us-gov-west-1': { region: 'us-gov-west-1', gridZone: 'US-NW-PACW', location: 'Oregon, USA', country: 'US', notes: 'GovCloud' },
  'us-gov-east-1': { region: 'us-gov-east-1', gridZone: 'US-MIDW-MISO', location: 'Ohio, USA', country: 'US', notes: 'GovCloud' },

  // AWS China
  'cn-north-1': { region: 'cn-north-1', gridZone: 'CN', location: 'Beijing, China', country: 'CN' },
  'cn-northwest-1': { region: 'cn-northwest-1', gridZone: 'CN', location: 'Ningxia, China', country: 'CN' },
};

/**
 * Google Cloud Platform Region to Grid Zone Mappings
 */
export const GCP_REGION_MAPPINGS: Record<string, RegionGridMapping> = {
  // Americas - North America - US
  'us-east1': { region: 'us-east1', gridZone: 'US-CAR-CPLE', location: 'Moncks Corner, South Carolina, USA', country: 'US', notes: 'Duke Energy Progress East' },
  'us-east4': { region: 'us-east4', gridZone: 'US-MIDA-PJM', location: 'Ashburn, N. Virginia, USA', country: 'US', notes: 'PJM Interconnection' },
  'us-east5': { region: 'us-east5', gridZone: 'US-MIDW-MISO', location: 'Columbus, Ohio, USA', country: 'US', notes: 'Midcontinent ISO' },
  'us-central1': { region: 'us-central1', gridZone: 'US-MIDW-MISO', location: 'Council Bluffs, Iowa, USA', country: 'US', notes: 'Midcontinent ISO' },
  'us-south1': { region: 'us-south1', gridZone: 'US-TEX-ERCO', location: 'Dallas, Texas, USA', country: 'US', notes: 'ERCOT' },
  'us-west1': { region: 'us-west1', gridZone: 'US-NW-PACW', location: 'The Dalles, Oregon, USA', country: 'US', notes: 'Pacificorp West' },
  'us-west2': { region: 'us-west2', gridZone: 'US-CAL-CISO', location: 'Los Angeles, California, USA', country: 'US', notes: 'CAISO' },
  'us-west3': { region: 'us-west3', gridZone: 'US-NW-PACE', location: 'Salt Lake City, Utah, USA', country: 'US', notes: 'Pacificorp East' },
  'us-west4': { region: 'us-west4', gridZone: 'US-SW-AZPS', location: 'Las Vegas, Nevada, USA', country: 'US', notes: 'Arizona Public Service' },

  // Americas - North America - Canada
  'northamerica-northeast1': { region: 'northamerica-northeast1', gridZone: 'CA-QC', location: 'Montréal, Canada', country: 'CA', notes: 'Québec grid' },
  'northamerica-northeast2': { region: 'northamerica-northeast2', gridZone: 'CA-ON', location: 'Toronto, Canada', country: 'CA', notes: 'Ontario grid' },

  // Americas - North America - Mexico
  'northamerica-south1': { region: 'northamerica-south1', gridZone: 'MX', location: 'Querétaro, Mexico', country: 'MX' },

  // Americas - South America
  'southamerica-east1': { region: 'southamerica-east1', gridZone: 'BR', location: 'São Paulo, Brazil', country: 'BR' },
  'southamerica-west1': { region: 'southamerica-west1', gridZone: 'CL-SEN', location: 'Santiago, Chile', country: 'CL', notes: 'Sistema Eléctrico Nacional' },

  // Europe
  'europe-north1': { region: 'europe-north1', gridZone: 'FI', location: 'Hamina, Finland', country: 'FI' },
  'europe-north2': { region: 'europe-north2', gridZone: 'SE', location: 'Stockholm, Sweden', country: 'SE' },
  'europe-west1': { region: 'europe-west1', gridZone: 'BE', location: 'St. Ghislain, Belgium', country: 'BE' },
  'europe-west2': { region: 'europe-west2', gridZone: 'GB', location: 'London, United Kingdom', country: 'GB' },
  'europe-west3': { region: 'europe-west3', gridZone: 'DE', location: 'Frankfurt, Germany', country: 'DE' },
  'europe-west4': { region: 'europe-west4', gridZone: 'NL', location: 'Eemshaven, Netherlands', country: 'NL' },
  'europe-west6': { region: 'europe-west6', gridZone: 'CH', location: 'Zurich, Switzerland', country: 'CH' },
  'europe-west8': { region: 'europe-west8', gridZone: 'IT', location: 'Milan, Italy', country: 'IT' },
  'europe-west9': { region: 'europe-west9', gridZone: 'FR', location: 'Paris, France', country: 'FR' },
  'europe-west10': { region: 'europe-west10', gridZone: 'DE', location: 'Berlin, Germany', country: 'DE' },
  'europe-west12': { region: 'europe-west12', gridZone: 'IT', location: 'Turin, Italy', country: 'IT' },
  'europe-central2': { region: 'europe-central2', gridZone: 'PL', location: 'Warsaw, Poland', country: 'PL' },
  'europe-southwest1': { region: 'europe-southwest1', gridZone: 'ES', location: 'Madrid, Spain', country: 'ES' },

  // Asia Pacific
  'asia-east1': { region: 'asia-east1', gridZone: 'TW', location: 'Changhua County, Taiwan', country: 'TW' },
  'asia-east2': { region: 'asia-east2', gridZone: 'HK', location: 'Hong Kong', country: 'HK' },
  'asia-northeast1': { region: 'asia-northeast1', gridZone: 'JP-TK', location: 'Tokyo, Japan', country: 'JP', notes: 'Tokyo grid' },
  'asia-northeast2': { region: 'asia-northeast2', gridZone: 'JP-KN', location: 'Osaka, Japan', country: 'JP', notes: 'Kansai grid' },
  'asia-northeast3': { region: 'asia-northeast3', gridZone: 'KR', location: 'Seoul, South Korea', country: 'KR' },
  'asia-south1': { region: 'asia-south1', gridZone: 'IN-WE', location: 'Mumbai, India', country: 'IN', notes: 'Western India grid' },
  'asia-south2': { region: 'asia-south2', gridZone: 'IN-NO', location: 'Delhi, India', country: 'IN', notes: 'Northern India grid' },
  'asia-southeast1': { region: 'asia-southeast1', gridZone: 'SG', location: 'Jurong West, Singapore', country: 'SG' },
  'asia-southeast2': { region: 'asia-southeast2', gridZone: 'ID', location: 'Jakarta, Indonesia', country: 'ID' },
  'australia-southeast1': { region: 'australia-southeast1', gridZone: 'AU-NSW', location: 'Sydney, Australia', country: 'AU', notes: 'New South Wales grid' },
  'australia-southeast2': { region: 'australia-southeast2', gridZone: 'AU-VIC', location: 'Melbourne, Australia', country: 'AU', notes: 'Victoria grid' },

  // Middle East
  'me-central1': { region: 'me-central1', gridZone: 'QA', location: 'Doha, Qatar', country: 'QA' },
  'me-central2': { region: 'me-central2', gridZone: 'SA', location: 'Dammam, Saudi Arabia', country: 'SA' },
  'me-west1': { region: 'me-west1', gridZone: 'IL', location: 'Tel Aviv, Israel', country: 'IL' },

  // Africa
  'africa-south1': { region: 'africa-south1', gridZone: 'ZA', location: 'Johannesburg, South Africa', country: 'ZA' },
};

/**
 * Microsoft Azure Region to Grid Zone Mappings
 */
export const AZURE_REGION_MAPPINGS: Record<string, RegionGridMapping> = {
  // Americas - United States
  'eastus': { region: 'eastus', gridZone: 'US-MIDA-PJM', location: 'Virginia, USA', country: 'US', notes: 'PJM Interconnection' },
  'eastus2': { region: 'eastus2', gridZone: 'US-MIDA-PJM', location: 'Virginia, USA', country: 'US', notes: 'PJM Interconnection' },
  'centralus': { region: 'centralus', gridZone: 'US-MIDW-MISO', location: 'Iowa, USA', country: 'US', notes: 'Midcontinent ISO' },
  'northcentralus': { region: 'northcentralus', gridZone: 'US-MIDW-MISO', location: 'Illinois, USA', country: 'US', notes: 'Midcontinent ISO' },
  'southcentralus': { region: 'southcentralus', gridZone: 'US-TEX-ERCO', location: 'Texas, USA', country: 'US', notes: 'ERCOT' },
  'westcentralus': { region: 'westcentralus', gridZone: 'US-NW-PACE', location: 'Wyoming, USA', country: 'US', notes: 'Pacificorp East' },
  'westus': { region: 'westus', gridZone: 'US-CAL-CISO', location: 'California, USA', country: 'US', notes: 'CAISO' },
  'westus2': { region: 'westus2', gridZone: 'US-NW-PACW', location: 'Washington, USA', country: 'US', notes: 'Pacificorp West' },
  'westus3': { region: 'westus3', gridZone: 'US-SW-AZPS', location: 'Phoenix, Arizona, USA', country: 'US', notes: 'Arizona Public Service' },

  // Americas - Canada
  'canadacentral': { region: 'canadacentral', gridZone: 'CA-ON', location: 'Toronto, Canada', country: 'CA', notes: 'Ontario grid' },
  'canadaeast': { region: 'canadaeast', gridZone: 'CA-QC', location: 'Quebec, Canada', country: 'CA', notes: 'Québec grid' },

  // Americas - South America
  'brazilsouth': { region: 'brazilsouth', gridZone: 'BR', location: 'São Paulo State, Brazil', country: 'BR' },
  'brazilsoutheast': { region: 'brazilsoutheast', gridZone: 'BR', location: 'Rio, Brazil', country: 'BR' },
  'chilecentral': { region: 'chilecentral', gridZone: 'CL-SEN', location: 'Santiago, Chile', country: 'CL', notes: 'Sistema Eléctrico Nacional' },

  // Americas - Mexico
  'mexicocentral': { region: 'mexicocentral', gridZone: 'MX', location: 'Querétaro State, Mexico', country: 'MX' },

  // Europe
  'northeurope': { region: 'northeurope', gridZone: 'IE', location: 'Ireland', country: 'IE' },
  'westeurope': { region: 'westeurope', gridZone: 'NL', location: 'Netherlands', country: 'NL' },
  'uksouth': { region: 'uksouth', gridZone: 'GB', location: 'London, United Kingdom', country: 'GB' },
  'ukwest': { region: 'ukwest', gridZone: 'GB', location: 'Cardiff, United Kingdom', country: 'GB' },
  'francecentral': { region: 'francecentral', gridZone: 'FR', location: 'Paris, France', country: 'FR' },
  'francesouth': { region: 'francesouth', gridZone: 'FR', location: 'Marseille, France', country: 'FR' },
  'germanywestcentral': { region: 'germanywestcentral', gridZone: 'DE', location: 'Frankfurt, Germany', country: 'DE' },
  'germanynorth': { region: 'germanynorth', gridZone: 'DE', location: 'Berlin, Germany', country: 'DE' },
  'switzerlandnorth': { region: 'switzerlandnorth', gridZone: 'CH', location: 'Zurich, Switzerland', country: 'CH' },
  'switzerlandwest': { region: 'switzerlandwest', gridZone: 'CH', location: 'Geneva, Switzerland', country: 'CH' },
  'norwayeast': { region: 'norwayeast', gridZone: 'NO-NO1', location: 'Oslo, Norway', country: 'NO', notes: 'Southeast Norway grid' },
  'norwaywest': { region: 'norwaywest', gridZone: 'NO-NO5', location: 'Stavanger, Norway', country: 'NO', notes: 'West Norway grid' },
  'swedencentral': { region: 'swedencentral', gridZone: 'SE', location: 'Gävle, Sweden', country: 'SE' },
  'polandcentral': { region: 'polandcentral', gridZone: 'PL', location: 'Warsaw, Poland', country: 'PL' },
  'austriaeast': { region: 'austriaeast', gridZone: 'AT', location: 'Vienna, Austria', country: 'AT' },
  'belgiumcentral': { region: 'belgiumcentral', gridZone: 'BE', location: 'Brussels, Belgium', country: 'BE' },
  'spaincentral': { region: 'spaincentral', gridZone: 'ES', location: 'Madrid, Spain', country: 'ES' },
  'italynorth': { region: 'italynorth', gridZone: 'IT', location: 'Milan, Italy', country: 'IT' },

  // Asia Pacific
  'eastasia': { region: 'eastasia', gridZone: 'HK', location: 'Hong Kong SAR', country: 'HK' },
  'southeastasia': { region: 'southeastasia', gridZone: 'SG', location: 'Singapore', country: 'SG' },
  'japaneast': { region: 'japaneast', gridZone: 'JP-TK', location: 'Tokyo/Saitama, Japan', country: 'JP', notes: 'Tokyo grid' },
  'japanwest': { region: 'japanwest', gridZone: 'JP-KN', location: 'Osaka, Japan', country: 'JP', notes: 'Kansai grid' },
  'koreacentral': { region: 'koreacentral', gridZone: 'KR', location: 'Seoul, South Korea', country: 'KR' },
  'koreasouth': { region: 'koreasouth', gridZone: 'KR', location: 'Busan, South Korea', country: 'KR' },
  'centralindia': { region: 'centralindia', gridZone: 'IN-WE', location: 'Pune, India', country: 'IN', notes: 'Western India grid' },
  'southindia': { region: 'southindia', gridZone: 'IN-SO', location: 'Chennai, India', country: 'IN', notes: 'Southern India grid' },
  'westindia': { region: 'westindia', gridZone: 'IN-WE', location: 'Mumbai, India', country: 'IN', notes: 'Western India grid' },
  'australiaeast': { region: 'australiaeast', gridZone: 'AU-NSW', location: 'New South Wales, Australia', country: 'AU', notes: 'New South Wales grid' },
  'australiasoutheast': { region: 'australiasoutheast', gridZone: 'AU-VIC', location: 'Victoria, Australia', country: 'AU', notes: 'Victoria grid' },
  'australiacentral': { region: 'australiacentral', gridZone: 'AU', location: 'Canberra, Australia', country: 'AU' },
  'australiacentral2': { region: 'australiacentral2', gridZone: 'AU', location: 'Canberra, Australia', country: 'AU' },
  'indonesiacentral': { region: 'indonesiacentral', gridZone: 'ID', location: 'Jakarta, Indonesia', country: 'ID' },
  'malaysiawest': { region: 'malaysiawest', gridZone: 'MY', location: 'Kuala Lumpur, Malaysia', country: 'MY' },
  'newzealandnorth': { region: 'newzealandnorth', gridZone: 'NZ', location: 'Auckland, New Zealand', country: 'NZ' },

  // Middle East
  'uaenorth': { region: 'uaenorth', gridZone: 'AE', location: 'Dubai, UAE', country: 'AE' },
  'uaecentral': { region: 'uaecentral', gridZone: 'AE', location: 'Abu Dhabi, UAE', country: 'AE' },
  'qatarcentral': { region: 'qatarcentral', gridZone: 'QA', location: 'Doha, Qatar', country: 'QA' },
  'israelcentral': { region: 'israelcentral', gridZone: 'IL', location: 'Tel Aviv, Israel', country: 'IL' },

  // Africa
  'southafricanorth': { region: 'southafricanorth', gridZone: 'ZA', location: 'Johannesburg, South Africa', country: 'ZA' },
  'southafricawest': { region: 'southafricawest', gridZone: 'ZA', location: 'Cape Town, South Africa', country: 'ZA' },

  // Azure Government
  'usgov-virginia': { region: 'usgov-virginia', gridZone: 'US-MIDA-PJM', location: 'Virginia, USA', country: 'US', notes: 'Azure Government - PJM' },
  'usgov-texas': { region: 'usgov-texas', gridZone: 'US-TEX-ERCO', location: 'Texas, USA', country: 'US', notes: 'Azure Government - ERCOT' },
  'usgov-arizona': { region: 'usgov-arizona', gridZone: 'US-SW-AZPS', location: 'Arizona, USA', country: 'US', notes: 'Azure Government - Arizona PS' },
  'usdod-central': { region: 'usdod-central', gridZone: 'US-MIDW-MISO', location: 'Iowa, USA', country: 'US', notes: 'DoD - Midcontinent ISO' },
  'usdod-east': { region: 'usdod-east', gridZone: 'US-MIDA-PJM', location: 'Virginia, USA', country: 'US', notes: 'DoD - PJM' },

  // Azure China
  'chinaeast': { region: 'chinaeast', gridZone: 'CN', location: 'Shanghai, China', country: 'CN' },
  'chinaeast2': { region: 'chinaeast2', gridZone: 'CN', location: 'Shanghai, China', country: 'CN' },
  'chinanorth': { region: 'chinanorth', gridZone: 'CN', location: 'Beijing, China', country: 'CN' },
  'chinanorth2': { region: 'chinanorth2', gridZone: 'CN', location: 'Beijing, China', country: 'CN' },
  'chinanorth3': { region: 'chinanorth3', gridZone: 'CN', location: 'Hebei, China', country: 'CN' },
};

/**
 * Vercel Region to Grid Zone Mappings
 */
export const VERCEL_REGION_MAPPINGS: Record<string, RegionGridMapping> = {
  // Americas - United States
  'iad1': { region: 'iad1', gridZone: 'US-MIDA-PJM', location: 'Washington D.C., USA', country: 'US', notes: 'PJM Interconnection' },
  'cle1': { region: 'cle1', gridZone: 'US-MIDW-MISO', location: 'Cleveland, Ohio, USA', country: 'US', notes: 'Midcontinent ISO' },
  'pdx1': { region: 'pdx1', gridZone: 'US-NW-PACW', location: 'Portland, Oregon, USA', country: 'US', notes: 'Pacificorp West' },
  'sfo1': { region: 'sfo1', gridZone: 'US-CAL-CISO', location: 'San Francisco, California, USA', country: 'US', notes: 'CAISO' },

  // Americas - South America
  'gru1': { region: 'gru1', gridZone: 'BR', location: 'São Paulo, Brazil', country: 'BR' },

  // Europe
  'arn1': { region: 'arn1', gridZone: 'SE', location: 'Stockholm, Sweden', country: 'SE' },
  'cdg1': { region: 'cdg1', gridZone: 'FR', location: 'Paris, France', country: 'FR' },
  'dub1': { region: 'dub1', gridZone: 'IE', location: 'Dublin, Ireland', country: 'IE' },
  'fra1': { region: 'fra1', gridZone: 'DE', location: 'Frankfurt, Germany', country: 'DE' },
  'lhr1': { region: 'lhr1', gridZone: 'GB', location: 'London, United Kingdom', country: 'GB' },

  // Asia Pacific
  'bom1': { region: 'bom1', gridZone: 'IN-WE', location: 'Mumbai, India', country: 'IN', notes: 'Western India grid' },
  'hkg1': { region: 'hkg1', gridZone: 'HK', location: 'Hong Kong', country: 'HK' },
  'hnd1': { region: 'hnd1', gridZone: 'JP-TK', location: 'Tokyo, Japan', country: 'JP', notes: 'Tokyo grid' },
  'kix1': { region: 'kix1', gridZone: 'JP-KN', location: 'Osaka, Japan', country: 'JP', notes: 'Kansai grid' },
  'icn1': { region: 'icn1', gridZone: 'KR', location: 'Seoul, South Korea', country: 'KR' },
  'sin1': { region: 'sin1', gridZone: 'SG', location: 'Singapore', country: 'SG' },
  'syd1': { region: 'syd1', gridZone: 'AU-NSW', location: 'Sydney, Australia', country: 'AU', notes: 'New South Wales grid' },

  // Middle East
  'dxb1': { region: 'dxb1', gridZone: 'AE', location: 'Dubai, UAE', country: 'AE' },

  // Africa
  'cpt1': { region: 'cpt1', gridZone: 'ZA', location: 'Cape Town, South Africa', country: 'ZA' },
};

/**
 * Heroku Region to Grid Zone Mappings
 */
export const HEROKU_REGION_MAPPINGS: Record<string, RegionGridMapping> = {
  // Common Runtime
  'us': { region: 'us', gridZone: 'US-MIDA-PJM', location: 'Virginia (AWS us-east-1), USA', country: 'US', notes: 'PJM Interconnection' },
  'eu': { region: 'eu', gridZone: 'IE', location: 'Dublin (AWS eu-west-1), Ireland', country: 'IE' },

  // Private Spaces
  'virginia': { region: 'virginia', gridZone: 'US-MIDA-PJM', location: 'Virginia, USA', country: 'US', notes: 'PJM Interconnection' },
  'oregon': { region: 'oregon', gridZone: 'US-NW-PACW', location: 'Oregon, USA', country: 'US', notes: 'Pacificorp West' },
  'dublin': { region: 'dublin', gridZone: 'IE', location: 'Dublin, Ireland', country: 'IE' },
  'frankfurt': { region: 'frankfurt', gridZone: 'DE', location: 'Frankfurt, Germany', country: 'DE' },
  'london': { region: 'london', gridZone: 'GB', location: 'London, United Kingdom', country: 'GB' },
  'montreal': { region: 'montreal', gridZone: 'CA-QC', location: 'Montreal, Canada', country: 'CA', notes: 'Québec grid' },
  'mumbai': { region: 'mumbai', gridZone: 'IN-WE', location: 'Mumbai, India', country: 'IN', notes: 'Western India grid' },
  'singapore': { region: 'singapore', gridZone: 'SG', location: 'Singapore', country: 'SG' },
  'sydney': { region: 'sydney', gridZone: 'AU-NSW', location: 'Sydney, Australia', country: 'AU', notes: 'New South Wales grid' },
  'tokyo': { region: 'tokyo', gridZone: 'JP-TK', location: 'Tokyo, Japan', country: 'JP', notes: 'Tokyo grid' },
};

/**
 * Netlify Region to Grid Zone Mappings
 * Note: Netlify uses AWS infrastructure, so regions are AWS-based
 */
export const NETLIFY_REGION_MAPPINGS: Record<string, RegionGridMapping> = {
  'us-east-1': { region: 'us-east-1', gridZone: 'US-MIDA-PJM', location: 'N. Virginia (AWS), USA', country: 'US', notes: 'PJM Interconnection' },
  'us-east-2': { region: 'us-east-2', gridZone: 'US-MIDW-MISO', location: 'Ohio (AWS), USA', country: 'US', notes: 'Midcontinent ISO - Default region' },
  'us-west-1': { region: 'us-west-1', gridZone: 'US-CAL-CISO', location: 'N. California (AWS), USA', country: 'US', notes: 'CAISO' },
  'us-west-2': { region: 'us-west-2', gridZone: 'US-NW-PACW', location: 'Oregon (AWS), USA', country: 'US', notes: 'Pacificorp West' },
  'eu-central-1': { region: 'eu-central-1', gridZone: 'DE', location: 'Frankfurt (AWS), Germany', country: 'DE' },
  'eu-west-2': { region: 'eu-west-2', gridZone: 'GB', location: 'London (AWS), United Kingdom', country: 'GB' },
  'ap-southeast-1': { region: 'ap-southeast-1', gridZone: 'SG', location: 'Singapore (AWS), Singapore', country: 'SG' },
};

/**
 * Combined mapping for all providers
 */
export const ALL_REGION_MAPPINGS = {
  aws: AWS_REGION_MAPPINGS,
  gcp: GCP_REGION_MAPPINGS,
  azure: AZURE_REGION_MAPPINGS,
  vercel: VERCEL_REGION_MAPPINGS,
  heroku: HEROKU_REGION_MAPPINGS,
  netlify: NETLIFY_REGION_MAPPINGS,
} as const;

/**
 * Get grid zone for a specific provider and region
 */
export function getGridZoneForRegion(provider: string, region: string): string | null {
  const providerMappings = ALL_REGION_MAPPINGS[provider.toLowerCase() as keyof typeof ALL_REGION_MAPPINGS];
  if (!providerMappings) {
    return null;
  }

  const mapping = providerMappings[region];
  return mapping?.gridZone || null;
}

/**
 * Get full mapping details for a specific provider and region
 */
export function getRegionMapping(provider: string, region: string): RegionGridMapping | null {
  const providerMappings = ALL_REGION_MAPPINGS[provider.toLowerCase() as keyof typeof ALL_REGION_MAPPINGS];
  if (!providerMappings) {
    return null;
  }

  return providerMappings[region] || null;
}

/**
 * Get all regions for a specific provider
 */
export function getAllRegionsForProvider(provider: string): RegionGridMapping[] {
  const providerMappings = ALL_REGION_MAPPINGS[provider.toLowerCase() as keyof typeof ALL_REGION_MAPPINGS];
  if (!providerMappings) {
    return [];
  }

  return Object.values(providerMappings);
}
