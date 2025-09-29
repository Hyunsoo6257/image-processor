import { getPool, withTransaction } from "./database.js";

// ===================================
// Credit System (ACID Requirements)
// ===================================

/**
 * Initialize credit system tables
 */
export async function initializeCreditSystem(): Promise<void> {
  const client = await getPool().connect();
  try {
    // Create user credits table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_credits (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        credits INTEGER NOT NULL DEFAULT 10,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create credit transactions table for audit trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        job_id INTEGER,
        credits_used INTEGER NOT NULL,
        transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deduct', 'refund', 'admin_grant')),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default credits for existing users
    await client.query(`
      INSERT INTO user_credits (username, credits)
      VALUES ('admin', 999999), ('user1', 10)
      ON CONFLICT (username) DO NOTHING
    `);

    console.log("✅ Credit system initialized");
  } finally {
    client.release();
  }
}

/**
 * Create user credits (for new users)
 */
export async function createUserCredits(
  username: string,
  role: string = "user"
): Promise<void> {
  const client = await getPool().connect();
  try {
    // Set initial credits based on role
    const initialCredits = role === "admin" ? 999999 : 10;

    await client.query(
      "INSERT INTO user_credits (username, credits) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING",
      [username, initialCredits]
    );

    console.log(
      `✅ User ${username} credits initialized with ${initialCredits} credits`
    );
  } finally {
    client.release();
  }
}

/**
 * Get user credits
 */
export async function getUserCredits(username: string): Promise<{
  username: string;
  credits: number;
  lastUpdated: Date;
} | null> {
  const client = await getPool().connect();
  try {
    const query =
      "SELECT username, credits, last_updated FROM user_credits WHERE username = $1";
    const result = await client.query(query, [username]);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Deduct credits with transaction (ACID guarantee)
 */
export async function deductCredits(
  username: string,
  jobId: number,
  creditsToDeduct: number = 1
): Promise<boolean> {
  return await withTransaction(async (client) => {
    // Check current credits
    const currentCredits = await client.query(
      "SELECT credits FROM user_credits WHERE username = $1 FOR UPDATE",
      [username]
    );

    if (!currentCredits.rows[0]) {
      throw new Error("User not found");
    }

    const availableCredits = currentCredits.rows[0].credits;

    // Check if user has enough credits
    if (availableCredits < creditsToDeduct) {
      throw new Error("Insufficient credits");
    }

    // Deduct credits
    await client.query(
      "UPDATE user_credits SET credits = credits - $1, last_updated = CURRENT_TIMESTAMP WHERE username = $2",
      [creditsToDeduct, username]
    );

    // Record transaction
    await client.query(
      "INSERT INTO credit_transactions (username, job_id, credits_used, transaction_type, description) VALUES ($1, $2, $3, 'deduct', 'Image processing job')",
      [username, jobId, creditsToDeduct]
    );

    return true;
  });
}

/**
 * Refund credits (for failed jobs)
 */
export async function refundCredits(
  username: string,
  jobId: number,
  creditsToRefund: number = 1
): Promise<void> {
  return await withTransaction(async (client) => {
    // Add credits back
    await client.query(
      "UPDATE user_credits SET credits = credits + $1, last_updated = CURRENT_TIMESTAMP WHERE username = $2",
      [creditsToRefund, username]
    );

    // Record refund transaction
    await client.query(
      "INSERT INTO credit_transactions (username, job_id, credits_used, transaction_type, description) VALUES ($1, $2, $3, 'refund', 'Job failed - credit refund')",
      [username, jobId, creditsToRefund]
    );
  });
}

/**
 * Admin function to grant credits
 */
export async function grantCredits(
  username: string,
  creditsToGrant: number,
  adminUsername: string
): Promise<void> {
  return await withTransaction(async (client) => {
    // Add credits
    await client.query(
      "UPDATE user_credits SET credits = credits + $1, last_updated = CURRENT_TIMESTAMP WHERE username = $2",
      [creditsToGrant, username]
    );

    // Record admin grant transaction
    await client.query(
      "INSERT INTO credit_transactions (username, job_id, credits_used, transaction_type, description) VALUES ($1, NULL, $2, 'admin_grant', $3)",
      [username, creditsToGrant, `Credits granted by admin ${adminUsername}`]
    );
  });
}

/**
 * Get all users with credits (admin only)
 */
export async function getAllUsersWithCredits(): Promise<
  {
    username: string;
    credits: number;
    lastUpdated: Date;
    totalTransactions: number;
  }[]
> {
  const client = await getPool().connect();
  try {
    const query = `
      SELECT 
        uc.username,
        uc.credits,
        uc.last_updated,
        COUNT(ct.id) as total_transactions
      FROM user_credits uc
      LEFT JOIN credit_transactions ct ON uc.username = ct.username
      GROUP BY uc.id, uc.username, uc.credits, uc.last_updated
      ORDER BY uc.username
    `;
    const result = await client.query(query);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get user transaction history
 */
export async function getUserTransactionHistory(username: string): Promise<
  {
    id: number;
    jobId: number | null;
    creditsUsed: number;
    transactionType: string;
    description: string;
    createdAt: Date;
  }[]
> {
  const client = await getPool().connect();
  try {
    const query = `
      SELECT id, job_id, credits_used, transaction_type, description, created_at
      FROM credit_transactions 
      WHERE username = $1 
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const result = await client.query(query, [username]);
    return result.rows;
  } finally {
    client.release();
  }
}
