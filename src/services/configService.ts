import AWS from "aws-sdk";

// Declare global variables for TypeScript
declare global {
  var DB_HOST: string;
  var DB_USER: string;
  var DB_PASSWORD: string;
  var DB_NAME: string;
  var DB_PORT: string;
  var DB_SSL: string;
  var DB_SSL_REJECT_UNAUTHORIZED: string;
  var S3_BUCKET_NAME: string;
  var JWT_SECRET: string;
  var AWS_REGION: string;
}

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

      // Load database credentials from AWS Secrets Manager
      const dbCredentials = await this.getSecret(
        "n11837845/database-credentials"
      );

      // Set environment variables
      console.log("🔧 Setting environment variables...");
      console.log("🔧 DB_HOST:", dbCredentials.host);
      console.log("🔧 DB_USER:", dbCredentials.username);
      console.log("🔧 DB_NAME:", dbCredentials.database);
      console.log("🔧 DB_PORT:", dbCredentials.port);

      process.env.DB_HOST = dbCredentials.host;
      process.env.DB_USER = dbCredentials.username;
      process.env.DB_PASSWORD = dbCredentials.password;
      process.env.DB_NAME = dbCredentials.database;
      process.env.DB_PORT = dbCredentials.port;
      process.env.DB_SSL = dbCredentials.ssl;
      process.env.DB_SSL_REJECT_UNAUTHORIZED =
        dbCredentials.sslRejectUnauthorized;
      process.env.S3_BUCKET_NAME = dbCredentials.s3BucketName;
      process.env.JWT_SECRET = dbCredentials.jwtSecret;
      process.env.AWS_REGION = dbCredentials.awsRegion;

      // Load email credentials from AWS Secrets Manager
      try {
        const emailCredentials = await this.getSecret(
          "n11837845/email-credentials"
        );
        process.env.EMAIL_HOST = emailCredentials.host;
        process.env.EMAIL_PORT = emailCredentials.port;
        process.env.EMAIL_USER = emailCredentials.user;
        process.env.EMAIL_PASS = emailCredentials.pass;
        console.log("✅ Email credentials loaded from Secrets Manager");
      } catch (error) {
        console.log(
          "⚠️ Email credentials not found in Secrets Manager, using environment variables"
        );
      }

      // Load Unsplash API keys from AWS Secrets Manager
      try {
        const unsplashKeys = await this.getSecret("n11837845/unsplash-keys");
        process.env.UNSPLASH_ACCESS_KEY = unsplashKeys.UNSPLASH_ACCESS_KEY;
        console.log("✅ Unsplash API keys loaded from Secrets Manager");
      } catch (error) {
        console.log(
          "⚠️ Unsplash API keys not found in Secrets Manager, using environment variables"
        );
      }

      // Load Cognito configuration from AWS Secrets Manager
      try {
        const cognitoConfig = await this.getSecret("n11837845/cognito-config");
        process.env.COGNITO_USER_POOL_ID = cognitoConfig.COGNITO_USER_POOL_ID;
        process.env.COGNITO_CLIENT_ID = cognitoConfig.COGNITO_CLIENT_ID;
        process.env.COGNITO_CLIENT_SECRET = cognitoConfig.COGNITO_CLIENT_SECRET;
        process.env.COGNITO_REGION =
          cognitoConfig.COGNITO_REGION || "ap-southeast-2";
        console.log("✅ Cognito configuration loaded from Secrets Manager");
      } catch (error) {
        console.log(
          "⚠️ Cognito configuration not found in Secrets Manager, using environment variables"
        );
      }

      // Load Google OAuth configuration from AWS Secrets Manager
      try {
        const googleConfig = await this.getSecret(
          "n11837845/google-oauth-config"
        );
        process.env.GOOGLE_CLIENT_ID = googleConfig.GOOGLE_CLIENT_ID;
        process.env.GOOGLE_CLIENT_SECRET = googleConfig.GOOGLE_CLIENT_SECRET;
        process.env.GOOGLE_REDIRECT_URI = googleConfig.GOOGLE_REDIRECT_URI;
        console.log(
          "✅ Google OAuth configuration loaded from Secrets Manager"
        );
      } catch (error) {
        console.log(
          "⚠️ Google OAuth configuration not found in Secrets Manager, using environment variables"
        );
      }

      // Set global variables for docker exec commands
      global.DB_HOST = dbCredentials.host;
      global.DB_USER = dbCredentials.username;
      global.DB_PASSWORD = dbCredentials.password;
      global.DB_NAME = dbCredentials.database;
      global.DB_PORT = dbCredentials.port;
      global.DB_SSL = dbCredentials.ssl;
      global.DB_SSL_REJECT_UNAUTHORIZED = dbCredentials.sslRejectUnauthorized;
      global.S3_BUCKET_NAME = dbCredentials.s3BucketName;
      global.JWT_SECRET = dbCredentials.jwtSecret;
      global.AWS_REGION = dbCredentials.awsRegion;

      console.log("✅ Environment variables set successfully");
      console.log("🔧 DB_HOST after setting:", process.env.DB_HOST);
      console.log("🔧 DB_USER after setting:", process.env.DB_USER);

      console.log("✅ Configuration loaded successfully");
      console.log("🌐 S3 Bucket:", dbCredentials.s3BucketName);
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
