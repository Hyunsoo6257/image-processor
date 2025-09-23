import AWS from "aws-sdk";

/**
 * Configuration service for managing application settings
 * Fetches configuration from AWS Parameter Store and Secrets Manager
 */
export class ConfigService {
  private static ssm = new AWS.SSM({
    region: process.env.AWS_REGION || "ap-southeast-2",
  });
  private static secretsManager = new AWS.SecretsManager({
    region: process.env.AWS_REGION || "ap-southeast-2",
  });

  private static configCache: Map<string, any> = new Map();
  private static secretsCache: Map<string, any> = new Map();

  /**
   * Get parameter from Parameter Store
   */
  static async getParameter(
    name: string,
    useCache: boolean = true
  ): Promise<string> {
    if (useCache && this.configCache.has(name)) {
      return this.configCache.get(name);
    }

    try {
      const result = await this.ssm
        .getParameter({
          Name: name,
          WithDecryption: false,
        })
        .promise();

      const value = result.Parameter?.Value || "";

      if (useCache) {
        this.configCache.set(name, value);
      }

      return value;
    } catch (error) {
      console.error(`Failed to get parameter ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple parameters from Parameter Store
   */
  static async getParameters(names: string[]): Promise<Record<string, string>> {
    try {
      const result = await this.ssm
        .getParameters({
          Names: names,
          WithDecryption: false,
        })
        .promise();

      const parameters: Record<string, string> = {};

      result.Parameters?.forEach((param) => {
        if (param.Name && param.Value) {
          // Remove the parameter name prefix to get just the key
          const key = param.Name.split("/").pop() || param.Name;
          parameters[key] = param.Value;
          this.configCache.set(param.Name, param.Value);
        }
      });

      return parameters;
    } catch (error) {
      console.error("Failed to get parameters:", error);
      throw error;
    }
  }

  /**
   * Get secret from Secrets Manager
   */
  static async getSecret(name: string, useCache: boolean = true): Promise<any> {
    if (useCache && this.secretsCache.has(name)) {
      return this.secretsCache.get(name);
    }

    try {
      const result = await this.secretsManager
        .getSecretValue({
          SecretId: name,
        })
        .promise();

      const secretValue = result.SecretString || "";
      let parsedValue: any;

      try {
        parsedValue = JSON.parse(secretValue);
      } catch {
        parsedValue = secretValue;
      }

      if (useCache) {
        this.secretsCache.set(name, parsedValue);
      }

      return parsedValue;
    } catch (error) {
      console.error(`Failed to get secret ${name}:`, error);
      throw error;
    }
  }

  /**
   * Initialize application configuration
   * Loads all necessary parameters and secrets
   */
  static async initializeConfig(): Promise<void> {
    try {
      console.log("🔧 Initializing application configuration...");

      // Load configuration parameters
      const configParams = await this.getParameters([
        "/n11837845/config/app-name",
        "/n11837845/config/s3-bucket-name",
        "/n11837845/config/aws-region",
        "/n11837845/config/application-url",
        "/n11837845/config/application-domain",
        "/n11837845/config/feature-flags",
      ]);

      // Load secrets
      const dbCredentials = await this.getSecret(
        "n11837845/database-credentials"
      );
      const jwtSecret = await this.getSecret("n11837845/jwt-secret");
      const s3Config = await this.getSecret("n11837845/s3-config");
      const appSecrets = await this.getSecret("n11837845/application-secrets");

      // Set environment variables
      process.env.DB_HOST = dbCredentials.host;
      process.env.DB_USER = dbCredentials.username;
      process.env.DB_PASSWORD = dbCredentials.password;
      process.env.DB_NAME = dbCredentials.database;
      process.env.DB_PORT = dbCredentials.port;
      process.env.DB_SSL = dbCredentials.ssl;
      process.env.DB_SSL_REJECT_UNAUTHORIZED =
        dbCredentials.sslRejectUnauthorized;

      process.env.JWT_SECRET = jwtSecret;

      process.env.S3_BUCKET_NAME = s3Config.bucketName;
      process.env.AWS_REGION = s3Config.region;

      process.env.NODE_ENV = appSecrets.nodeEnv;
      process.env.PORT = appSecrets.port;

      // Store feature flags in cache for getFeatureFlags() to use
      if (configParams["feature-flags"]) {
        this.configCache.set(
          "/n11837845/config/feature-flags",
          configParams["feature-flags"]
        );
      }

      console.log("✅ Configuration loaded successfully");
      console.log("📊 Loaded parameters:", Object.keys(configParams).length);
      console.log("🔐 Loaded secrets:", 4);
      console.log("🌐 S3 Bucket:", s3Config.bucketName);
      console.log("🗄️ Database:", dbCredentials.host);
    } catch (error) {
      console.error("❌ Failed to initialize configuration:", error);
      console.log("⚠️ Falling back to environment variables");
    }
  }

  /**
   * Clear configuration cache
   */
  static clearCache(): void {
    this.configCache.clear();
    this.secretsCache.clear();
  }

  /**
   * Get feature flags
   */
  static async getFeatureFlags(): Promise<Record<string, boolean>> {
    try {
      const flagsJson = await this.getParameter(
        "/n11837845/config/feature-flags"
      );
      return JSON.parse(flagsJson);
    } catch (error) {
      console.error("Failed to get feature flags:", error);
      return {
        s3Enabled: true,
        presignedUrlsEnabled: true,
        cognitoEnabled: false,
        rdsEnabled: true,
        statelessMode: true,
      };
    }
  }
}
