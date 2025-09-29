import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { authenticateToken } from "../middleware/auth.js";
import { getPool } from "../models/database.js";
import { ImageProcessor } from "../services/imageProcessor.js";
import { ExternalAPIService } from "../services/externalAPIService.js";
import { S3Service } from "../services/s3Service.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for memory storage (S3 upload)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Get all files for the authenticated user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    try {
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
    console.error("Error fetching files:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch files",
    });
  }
});

// Upload a file (supports both direct upload and pre-signed URL metadata)
router.post("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)
    const username = req.user!.username;

    // Check if this is a pre-signed URL metadata request
    if (req.body.s3Key) {
      // Handle pre-signed URL upload metadata
      const { filename, s3Key, size, type } = req.body;

      if (!filename || !s3Key) {
        return res.status(400).json({
          success: false,
          error: "Filename and S3 key are required",
        });
      }

      try {
        // Save file metadata to database
        const query = `
          INSERT INTO s302.files (filename, user_id, size, type, s3_key, uploaded_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          RETURNING id
        `;

        const result = await getPool().query(query, [
          filename,
          userId,
          size || 0,
          type || "input",
          s3Key,
        ]);

        res.json({
          success: true,
          fileId: result.rows[0].id,
          filename: filename,
          message: "File metadata saved successfully",
        });
      } catch (dbError) {
        console.error("Database error:", dbError);
        res.status(500).json({
          success: false,
          error: "Failed to save file metadata",
        });
      }
      return;
    }

    // Handle direct file upload (legacy)
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }
    const fileSize = req.file.size;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;

    // Generate S3 key and filename using username
    const s3Key = S3Service.generateUserKey(username, originalName);
    const filename = s3Key.split("/").pop()!; // Extract filename from S3 key

    try {
      // Upload file to S3
      const s3Location = await S3Service.uploadFile(
        req.file.buffer,
        s3Key,
        mimeType
      );

      // Save file info to database
      const query = `
        INSERT INTO s302.files (filename, user_id, size, type, s3_key, uploaded_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `;

      const result = await getPool().query(query, [
        filename,
        userId,
        fileSize,
        "input",
        s3Key,
      ]);

      res.json({
        success: true,
        data: {
          id: result.rows[0].id,
          filename: filename,
          size: fileSize,
          s3Key: s3Key,
          s3Location: s3Location,
        },
      });
    } catch (dbError) {
      console.error("Database connection failed:", dbError);
      res.status(500).json({
        success: false,
        error:
          "Database connection required for file upload - no S3-only fallback for statelessness",
      });
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload file",
    });
  }
});

// Download a file
router.get("/download/:filename", authenticateToken, async (req, res) => {
  try {
    const filename = req.params.filename;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)

    try {
      // Check if user owns this file and get S3 key
      const query =
        "SELECT * FROM s302.files WHERE filename = $1 AND user_id = $2";
      const result = await getPool().query(query, [filename, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "File not found or access denied",
        });
      }

      const file = result.rows[0];

      if (file.s3_key) {
        // Download from S3
        const fileBuffer = await S3Service.downloadFile(file.s3_key);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        res.send(fileBuffer);
        return;
      }
    } catch (dbError) {
      console.error("Database connection failed:", dbError);
      res.status(500).json({
        success: false,
        error:
          "Database connection required for file download - no S3 fallback for statelessness",
      });
    }
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({
      success: false,
      error: "Failed to download file",
    });
  }
});

// Get file metadata
router.get("/metadata/:fileId", authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)

    const query = "SELECT * FROM s302.files WHERE id = $1 AND user_id = $2";
    const result = await getPool().query(query, [fileId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "File not found or access denied",
      });
    }

    const file = result.rows[0];

    // Extract metadata using ImageProcessor (stateless)
    try {
      const metadata = await ImageProcessor.extractMetadata(file.s3_key);
      res.json({
        success: true,
        data: {
          file: file,
          metadata: metadata,
        },
      });
    } catch (metadataError) {
      res.json({
        success: true,
        data: {
          file: file,
          metadata: null,
        },
      });
    }
  } catch (error) {
    console.error("Error getting file metadata:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get file metadata",
    });
  }
});

// External API: Get random image from Unsplash
router.get("/random-image", authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;

    if (!search || typeof search !== "string") {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    const result = await ExternalAPIService.getRandomImage(search);

    if (result.success) {
      res.json({
        success: true,
        image: result.image,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error getting random image:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get random image",
    });
  }
});

// External API: Download random image
router.post("/download-random-image", authenticateToken, async (req, res) => {
  try {
    const { imageUrl, searchTerm } = req.body;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)
    const username = req.user!.username;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: "Image URL is required",
      });
    }

    const result = await ExternalAPIService.downloadRandomImage(
      imageUrl,
      searchTerm,
      userId // userId is already a number
    );

    if (result.success) {
      res.json({
        success: true,
        fileId: result.fileId,
        filename: result.filename,
        message: "Random image downloaded and saved successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error downloading random image:", error);
    res.status(500).json({
      success: false,
      error: "Failed to download random image",
    });
  }
});

// Delete file and all related data
router.delete("/:filename", authenticateToken, async (req, res) => {
  try {
    const filename = req.params.filename;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)

    // Validate filename for security
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid filename",
      });
    }

    try {
      // Check if user owns this file (database mode)
      const query =
        "SELECT * FROM s302.files WHERE filename = $1 AND user_id = $2";
      const result = await getPool().query(query, [filename, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "File not found or access denied",
        });
      }

      const file = result.rows[0];

      // Delete file from database
      await getPool().query(
        "DELETE FROM s302.files WHERE filename = $1 AND user_id = $2",
        [filename, userId]
      );

      // Delete related jobs
      await getPool().query("DELETE FROM s302.jobs WHERE file_id = $1", [
        filename,
      ]);

      // Delete original file from S3 (stateless)
      if (file.s3_key) {
        try {
          await S3Service.deleteFile(file.s3_key);
        } catch (error) {
          console.warn("Failed to delete S3 file:", error);
        }
      }
    } catch (dbError) {
      console.warn(
        "Database not available for delete check, proceeding with file system only:",
        dbError
      );
      // In memory mode, proceed with file system deletion
    }

    res.json({
      success: true,
      message: `File "${filename}" and all related data deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete file",
    });
  }
});

// Generate presigned URL for file upload
router.post("/presigned-upload", authenticateToken, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)
    const username = req.user!.username;

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: "Filename is required",
      });
    }

    // Generate S3 key for the file using username
    const s3Key = S3Service.generateUserKey(username, filename);

    // Generate presigned URL for upload
    const presignedUrl = S3Service.generatePresignedUploadUrl(
      s3Key,
      contentType || "image/jpeg"
    );

    res.json({
      success: true,
      data: {
        presignedUrl,
        s3Key,
        filename,
      },
    });
  } catch (error) {
    console.error("Error generating presigned upload URL:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate presigned upload URL",
    });
  }
});

// Generate presigned URL for file download
router.post("/presigned-download", authenticateToken, async (req, res) => {
  try {
    const { filename } = req.body;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: "Filename is required",
      });
    }

    // Check if user owns this file and get S3 key
    const query =
      "SELECT s3_key FROM s302.files WHERE filename = $1 AND user_id = $2";
    const result = await getPool().query(query, [filename, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "File not found or access denied",
      });
    }

    const s3Key = result.rows[0].s3_key;

    // Generate presigned URL for download
    const presignedUrl = S3Service.generatePresignedDownloadUrl(s3Key);

    res.json({
      success: true,
      data: {
        presignedUrl,
        s3Key,
        filename,
      },
    });
  } catch (error) {
    console.error("Error generating presigned download URL:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate presigned download URL",
    });
  }
});

export default router;
