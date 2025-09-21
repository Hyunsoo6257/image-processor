import { pool, withTransaction } from "./database.js";

// ===================================
// Processing history functions
// ===================================

/**
 * Record processing history with system statistics update
 */
export async function recordProcessingHistory(data: {
  jobId: number;
  user: string;
  inputFileId: string;
  outputFileId?: string;
  processingTimeMs?: number;
  cpuUsagePercent?: number;
  memoryUsageMb?: number;
  success: boolean;
  errorMessage?: string;
}): Promise<number> {
  return await withTransaction(async (client) => {
    // Record processing history
    const historyQuery = `
      INSERT INTO processing_history 
      (job_id, "user", input_file_id, output_file_id, processing_time_ms, 
       cpu_usage_percent, memory_usage_mb, success, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const historyResult = await client.query(historyQuery, [
      data.jobId,
      data.user,
      data.inputFileId,
      data.outputFileId,
      data.processingTimeMs,
      data.cpuUsagePercent,
      data.memoryUsageMb,
      data.success,
      data.errorMessage,
    ]);

    // Update system statistics (atomic transaction)
    if (data.success) {
      // Increase today's processed images count
      await client.query(`
        INSERT INTO system_stats (metric_name, metric_value, unit)
        VALUES ('images_processed_today', 1, 'count')
        ON CONFLICT (metric_name) 
        DO UPDATE SET 
          metric_value = system_stats.metric_value + 1,
          recorded_at = CURRENT_TIMESTAMP
      `);

      // Update average processing time
      if (data.processingTimeMs) {
        await client.query(
          `
          INSERT INTO system_stats (metric_name, metric_value, unit)
          VALUES ('avg_processing_time', $1, 'ms')
          ON CONFLICT (metric_name)
          DO UPDATE SET 
            metric_value = (system_stats.metric_value + $1) / 2,
            recorded_at = CURRENT_TIMESTAMP
        `,
          [data.processingTimeMs]
        );
      }
    }

    return historyResult.rows[0].id;
  });
}

/**
 * Get processing history for a user
 */
export async function getUserProcessingHistory(
  username: string,
  limit: number = 50
): Promise<any[]> {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        ph.*,
        j.file_id,
        j.status as job_status
      FROM processing_history ph
      LEFT JOIN jobs j ON ph.job_id = j.id
      WHERE ph."user" = $1
      ORDER BY ph.processed_at DESC
      LIMIT $2
    `;
    const result = await client.query(query, [username, limit]);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get processing history for a specific job
 */
export async function getJobProcessingHistory(
  jobId: number
): Promise<any | null> {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        ph.*,
        j.file_id,
        j.status as job_status
      FROM processing_history ph
      LEFT JOIN jobs j ON ph.job_id = j.id
      WHERE ph.job_id = $1
    `;
    const result = await client.query(query, [jobId]);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get system statistics
 */
export async function getSystemStats(): Promise<any[]> {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        metric_name,
        metric_value,
        unit,
        recorded_at
      FROM system_stats
      ORDER BY recorded_at DESC
    `;
    const result = await client.query(query);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get processing statistics for admin
 */
export async function getProcessingStats(): Promise<{
  totalProcessed: number;
  successRate: number;
  averageProcessingTime: number;
  totalUsers: number;
}> {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        COUNT(*) as total_processed,
        COUNT(CASE WHEN success = true THEN 1 END) as successful,
        AVG(processing_time_ms) as avg_time,
        COUNT(DISTINCT "user") as total_users
      FROM processing_history
    `;
    const result = await client.query(query);
    const stats = result.rows[0];

    return {
      totalProcessed: parseInt(stats.total_processed) || 0,
      successRate:
        stats.total_processed > 0
          ? (parseInt(stats.successful) / parseInt(stats.total_processed)) * 100
          : 0,
      averageProcessingTime: parseFloat(stats.avg_time) || 0,
      totalUsers: parseInt(stats.total_users) || 0,
    };
  } finally {
    client.release();
  }
}
