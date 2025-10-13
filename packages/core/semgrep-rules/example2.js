// Example file to demonstrate Semgrep custom rules
// This file intentionally contains issues that will be detected

class ApiClient {
  constructor() {
    // This hardcoded API key should trigger our rule
    this.apiKey = "sk-1234567890abcdef";

    // Alternative hardcoded key pattern
    const secretKey = "sk-prod-key-123";

    this.baseUrl = "https://api.example.com";
  }

  async fetchData(endpoint) {
    // These console.log statements should trigger our no-console-log rule
    console.log("Fetching data from:", endpoint);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const data = await response.json();
      console.debug("Response received:", data);

      return data;
    } catch (error) {
      // Another console statement that should be flagged
      console.info("Error occurred during fetch");
      console.error("Error details:", error);
      throw error;
    }
  }

  processResults(results) {
    // More console logging that should be flagged
    console.log(`Processing ${results.length} results`);

    return results.map((item) => {
      // This won't be flagged (console.warn is not in our rule)
      if (!item.id) {
        console.warn("Item missing ID");
      }
      return item;
    });
  }
}

// Configuration object with potential API key
const config = {
  // apiKey: "my-secret-api-key-123",
  endpoint: "/v1/data",
};

module.exports = ApiClient;
