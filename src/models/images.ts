import { pool } from "./database.js";
import { DatabaseImageMetadata } from "../types/index.js";

// ===================================
// Image metadata functions
// ===================================

/**
 * Save image metadata to database
 */
export async function saveImageMetadata(
  metadata: DatabaseImageMetadata
): Promise<number> {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO image_metadata 
      (file_id, original_name, file_size, mime_type, width, height, format, uploaded_by, upload_path, s3_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const result = await client.query(query, [
      metadata.file_id,
      metadata.original_name,
      metadata.file_size,
      metadata.mime_type,
      metadata.width,
      metadata.height,
      metadata.format,
      metadata.uploaded_by,
      metadata.upload_path,
      metadata.s3_key,
    ]);

    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Get image metadata by file ID
 */
export async function getImageMetadata(
  fileId: string
): Promise<DatabaseImageMetadata | null> {
  const client = await pool.connect();
  try {
    const query = "SELECT * FROM image_metadata WHERE file_id = $1";
    const result = await client.query(query, [fileId]);
    return (result.rows[0] as DatabaseImageMetadata) || null;
  } finally {
    client.release();
  }
}

/**
 * List user images
 */
export async function listUserImages(
  username: string
): Promise<DatabaseImageMetadata[]> {
  const client = await pool.connect();
  try {
    const query = `
      SELECT * FROM image_metadata 
      WHERE uploaded_by = $1 
      ORDER BY created_at DESC
    `;
    const result = await client.query(query, [username]);
    return result.rows as DatabaseImageMetadata[];
  } finally {
    client.release();
  }
}

/**
 * Delete image metadata by file ID
 */
export async function deleteImageMetadata(fileId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const query = "DELETE FROM image_metadata WHERE file_id = $1";
    const result = await client.query(query, [fileId]);
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Get image metadata by user and file ID
 */
export async function getUserImageMetadata(
  username: string,
  fileId: string
): Promise<DatabaseImageMetadata | null> {
  const client = await pool.connect();
  try {
    const query = `
      SELECT * FROM image_metadata 
      WHERE uploaded_by = $1 AND file_id = $2
    `;
    const result = await client.query(query, [username, fileId]);
    return (result.rows[0] as DatabaseImageMetadata) || null;
  } finally {
    client.release();
  }
}
