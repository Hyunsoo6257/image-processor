import { Pool, PoolConfig } from "pg";

// PostgreSQL connection configuration
function getDbConfig(): PoolConfig {
  return {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "image_processor",
    port: parseInt(process.env.DB_PORT || "5432"),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    // Set default schema
    options: "-c search_path=s302,public",
    ssl:
      process.env.DB_SSL === "require"
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
          }
        : undefined,
  };
}

// Create connection pool (lazy initialization)
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getDbConfig());
  }
  return pool;
}

// Migrate user_id columns from INTEGER to VARCHAR for Cognito UUID support
async function migrateUserIdToVarchar(client: any): Promise<void> {
  try {
    // Check if jobs table exists and has INTEGER user_id
    const jobsCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 's302' 
      AND table_name = 'jobs' 
      AND column_name = 'user_id'
    `);

    if (jobsCheck.rows.length > 0 && jobsCheck.rows[0].data_type === 'integer') {
      console.log("🔄 Migrating jobs.user_id from INTEGER to VARCHAR...");
      
      // Drop existing data (since we can't convert INTEGER to VARCHAR with existing data)
      await client.query("DELETE FROM s302.jobs");
      
      // Alter column type
      await client.query("ALTER TABLE s302.jobs ALTER COLUMN user_id TYPE VARCHAR(255)");
      console.log("✅ jobs.user_id migrated to VARCHAR");
    }

    // Check if files table exists and has INTEGER user_id
    const filesCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 's302' 
      AND table_name = 'files' 
      AND column_name = 'user_id'
    `);

    if (filesCheck.rows.length > 0 && filesCheck.rows[0].data_type === 'integer') {
      console.log("🔄 Migrating files.user_id from INTEGER to VARCHAR...");
      
      // Drop existing data (since we can't convert INTEGER to VARCHAR with existing data)
      await client.query("DELETE FROM s302.files");
      
      // Alter column type
      await client.query("ALTER TABLE s302.files ALTER COLUMN user_id TYPE VARCHAR(255)");
      console.log("✅ files.user_id migrated to VARCHAR");
    }

    // Check if processing_history table exists and has INTEGER user_id
    const historyCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 's302' 
      AND table_name = 'processing_history' 
      AND column_name = 'user'
    `);

    if (historyCheck.rows.length > 0 && historyCheck.rows[0].data_type === 'integer') {
      console.log("🔄 Migrating processing_history.user from INTEGER to VARCHAR...");
      
      // Drop existing data
      await client.query("DELETE FROM s302.processing_history");
      
      // Alter column type
      await client.query("ALTER TABLE s302.processing_history ALTER COLUMN \"user\" TYPE VARCHAR(255)");
      console.log("✅ processing_history.user migrated to VARCHAR");
    }

  } catch (error) {
    console.error("Error during user_id migration:", error);
    // Don't throw - let the application continue
  }
}

// Initialize database (create tables)
export async function initializeDatabase(): Promise<void> {
  const client = await getPool().connect();

  try {
    // Create schema if not exists
    await client.query("CREATE SCHEMA IF NOT EXISTS s302");

    // Migrate existing tables to support Cognito UUID user_id
    await migrateUserIdToVarchar(client);

    // Create ENUM types
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'user');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE image_format AS ENUM ('jpeg', 'png', 'webp');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE theme_type AS ENUM ('light', 'dark');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 1. Jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS s302.jobs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL, -- Changed to VARCHAR for Cognito UUID
        file_id VARCHAR(255) NOT NULL,
        params JSONB,
        status job_status DEFAULT 'pending',
        result JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON s302.jobs (user_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON s302.jobs (status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON s302.jobs (created_at);
    `);

    // 2. Files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS s302.files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL, -- Changed to VARCHAR for Cognito UUID
        size BIGINT NOT NULL,
        type VARCHAR(50) NOT NULL,
        s3_key VARCHAR(255),
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_files_user_id ON s302.files (user_id);
      CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON s302.files (uploaded_at);
    `);

    // 3. Image metadata table
    await client.query(`
      CREATE TABLE IF NOT EXISTS s302.image_metadata (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) UNIQUE NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        width INTEGER,
        height INTEGER,
        format VARCHAR(20),
        uploaded_by VARCHAR(50) NOT NULL,
        upload_path VARCHAR(500) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_image_metadata_uploaded_by ON s302.image_metadata (uploaded_by);
      CREATE INDEX IF NOT EXISTS idx_image_metadata_file_id ON s302.image_metadata (file_id);
    `);

    // 4. User preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS s302.user_preferences (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        default_format image_format DEFAULT 'jpeg',
        default_quality INTEGER DEFAULT 80 CHECK (default_quality >= 1 AND default_quality <= 100),
        default_enhance BOOLEAN DEFAULT false,
        max_width INTEGER DEFAULT 1920,
        max_height INTEGER DEFAULT 1080,
        notifications_enabled BOOLEAN DEFAULT true,
        theme theme_type DEFAULT 'light',
        language VARCHAR(10) DEFAULT 'en',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Processing history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS s302.processing_history (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES s302.jobs(id) ON DELETE CASCADE,
        "user" VARCHAR(50) NOT NULL,
        input_file_id VARCHAR(255) NOT NULL,
        output_file_id VARCHAR(255),
        processing_time_ms INTEGER,
        cpu_usage_percent DECIMAL(5,2),
        memory_usage_mb INTEGER,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_processing_history_user ON s302.processing_history ("user");
      CREATE INDEX IF NOT EXISTS idx_processing_history_processed_at ON s302.processing_history (processed_at);
      CREATE INDEX IF NOT EXISTS idx_processing_history_success ON s302.processing_history (success);
    `);

    // 6. System statistics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS s302.system_stats (
        id SERIAL PRIMARY KEY,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DECIMAL(10,2) NOT NULL,
        unit VARCHAR(20),
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_system_stats_metric_name ON s302.system_stats (metric_name);
      CREATE INDEX IF NOT EXISTS idx_system_stats_recorded_at ON s302.system_stats (recorded_at);
    `);

    // Create trigger function (automatic updated_at update)
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Apply triggers
    await client.query(`
      DROP TRIGGER IF EXISTS update_jobs_updated_at ON s302.jobs;
      CREATE TRIGGER update_jobs_updated_at 
        BEFORE UPDATE ON s302.jobs 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        
      DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON s302.user_preferences;
      CREATE TRIGGER update_user_preferences_updated_at 
        BEFORE UPDATE ON s302.user_preferences 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log("✅ PostgreSQL database initialized successfully");

    // Insert default user preferences
    await insertDefaultUserPreferences(client);

    // Initialize credit system
    const { initializeCreditSystem } = await import("./credits.js");
    await initializeCreditSystem();
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Insert default user preferences
async function insertDefaultUserPreferences(client: any): Promise<void> {
  try {
    // Default settings for admin user
    await client.query(`
      INSERT INTO s302.user_preferences (username, default_format, default_quality, default_enhance, notifications_enabled) 
      VALUES ('admin', 'jpeg', 95, true, true)
      ON CONFLICT (username) DO NOTHING
    `);

    // Default settings for user1
    await client.query(`
      INSERT INTO s302.user_preferences (username, default_format, default_quality, default_enhance) 
      VALUES ('user1', 'png', 80, false)
      ON CONFLICT (username) DO NOTHING
    `);

    console.log("✅ Default user preferences inserted");
  } catch (error) {
    console.error("⚠️ Failed to insert default preferences:", error);
  }
}

// Connection test
export async function testConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query("SELECT 1");
    client.release();
    console.log("✅ PostgreSQL connection successful");
    return true;
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:", error);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  try {
    if (pool) {
      await pool.end();
      pool = null;
      console.log("✅ PostgreSQL connection closed");
    }
  } catch (error) {
    console.error("❌ Error closing PostgreSQL connection:", error);
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
