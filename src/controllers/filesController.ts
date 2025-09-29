import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import {
  FileUploadResponse,
  ImageMetadata,
  AuthenticatedUser,
} from "../types/index.js";
import { ImageProcessor } from "../services/imageProcessor.js";
import { S3Service } from "../services/s3Service.js";
import { getPool } from "../models/database.js";
import { saveImageMetadata } from "../models/images.js";
import { listJobsByUser } from "../models/jobs.js";

// In-memory registry of uploads as a fallback when DB is unavailable
// Maps fileId (filename on disk) -> username of uploader
const uploadRegistry: Map<string, string> = new Map();

// Multer populates req.file; we simply return the saved name/path.
export async function handleUpload(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({
        error: "No file uploaded",
        success: false,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    // check if the file is a valid image
    const validation = await ImageProcessor.validateImage(req.file.path);
    if (!validation.valid) {
      // delete invalid file
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("Failed to delete invalid file:", unlinkError);
      }

      res.status(400).json({
        error: validation.error || "Invalid image file",
        success: false,
      });
      return;
    }

    try {
      // Generate S3 key for metadata
      const s3Key = S3Service.generateUserKey(
        req.user.username,
        req.file.originalname
      );

      // save image metadata to database
      await saveImageMetadata({
        file_id: req.file.filename,
        original_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        width: validation.metadata?.width,
        height: validation.metadata?.height,
        format: validation.metadata?.format,
        uploaded_by: req.user.username,
        upload_path: req.file.path,
        s3_key: s3Key,
      });
    } catch (dbError) {
      console.warn("Failed to save metadata to database:", dbError);
      // even if the database save fails, the file upload is still successful
    }

    // Record uploader in in-memory registry as a fallback for filtering
    try {
      uploadRegistry.set(req.file.filename, req.user.username);
    } catch {}

    const response: FileUploadResponse = {
      fileId: req.file.filename,
      path: req.file.path,
    };

    res.json({
      success: true,
      data: response,
      message: "File uploaded successfully",
    });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({
      error: "Failed to process uploaded file",
      success: false,
    });
  }
}

// Download files from S3 (stateless)
export async function downloadFile(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;

    if (!filename) {
      res.status(400).json({
        error: "Filename is required",
        success: false,
      });
      return;
    }

    // validate filename for security
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      res.status(400).json({
        error: "Invalid filename",
        success: false,
      });
      return;
    }

    try {
      // Get file from S3
      const fileBuffer = await S3Service.downloadFile(filename);

      // Set appropriate headers
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", fileBuffer.length);

      // Send file buffer
      res.send(fileBuffer);
    } catch (s3Error) {
      console.error("S3 download error:", s3Error);
      res.status(404).json({
        error: "File not found in S3",
        success: false,
      });
    }
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
}

// Get file metadata from S3 (stateless)
export async function getFileMetadata(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({
        error: "File ID is required",
        success: false,
      });
      return;
    }

    try {
      // Get file from S3
      const fileBuffer = await S3Service.downloadFile(fileId);

      // Extract metadata from buffer (temporary file approach for statelessness)
      const tempPath = `/tmp/${Date.now()}-${fileId}`;
      await fs.promises.writeFile(tempPath, fileBuffer);

      try {
        const metadata = await ImageProcessor.extractMetadata(tempPath);

        res.json({
          success: true,
          data: metadata,
        });
      } finally {
        // Clean up temporary file
        await fs.promises.unlink(tempPath).catch(() => {});
      }
    } catch (s3Error) {
      console.error("S3 metadata error:", s3Error);
      res.status(404).json({
        error: "File not found in S3",
        success: false,
      });
    }
  } catch (error) {
    console.error("Get metadata error:", error);
    res.status(500).json({
      error: "Failed to extract metadata",
      success: false,
    });
  }
}

// List uploaded files from database (S3-based, stateless)
export async function listFiles(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    const userId = req.user.id; // Use string ID directly (Cognito UUID)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    try {
      // Get files from database (S3-based)
      const query = `
        SELECT * FROM s302.files 
        WHERE user_id = $1 
        ORDER BY uploaded_at DESC 
        LIMIT $2 OFFSET $3
      `;

      const result = await getPool().query(query, [userId, limit, offset]);

      // Get total count
      const countQuery = "SELECT COUNT(*) FROM s302.files WHERE user_id = $1";
      const countResult = await getPool().query(countQuery, [userId]);

      res.json({
        success: true,
        data: {
          files: result.rows,
          pagination: {
            page,
            limit,
            total: parseInt(countResult.rows[0].count),
            totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
          },
        },
      });
    } catch (dbError) {
      console.error("Database connection failed:", dbError);
      res.status(500).json({
        success: false,
        error:
          "Database connection required - no local fallback for statelessness",
      });
    }
  } catch (error) {
    console.error("List files error:", error);
    res.status(500).json({
      error: "Failed to list files",
      success: false,
    });
  }
}
