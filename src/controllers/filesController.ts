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
        req.user.id,
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

// Download processed files
export function downloadFile(req: Request, res: Response): void {
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

    const filePath = path.join("./data/out", filename);

    // check if the file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: "File not found",
        success: false,
      });
      return;
    }

    // download file
    res.download(filePath, (err) => {
      if (err) {
        console.error("File download error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            error: "Download failed",
            success: false,
          });
        }
      }
    });
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
}

// Get file metadata
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

    const filePath = path.join("./data/in", fileId);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: "File not found",
        success: false,
      });
      return;
    }

    const metadata = await ImageProcessor.extractMetadata(filePath);

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    console.error("Get metadata error:", error);
    res.status(500).json({
      error: "Failed to extract metadata",
      success: false,
    });
  }
}

// List uploaded files (user's own files or all files for admin)
export async function listFiles(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    const inputDir = "./data/in";
    const outputDir = "./data/out";

    const [inputFiles, outputFiles] = await Promise.all([
      fs.promises.readdir(inputDir).catch(() => []),
      fs.promises.readdir(outputDir).catch(() => []),
    ]);

    // Filter input files for non-admin users to show only their own uploads
    let visibleInputFiles = inputFiles;
    if (req.user.role !== "admin") {
      const allowed = new Set<string>();

      // From in-memory registry
      for (const filename of inputFiles) {
        if (uploadRegistry.get(filename) === req.user.username) {
          allowed.add(filename);
        }
      }

      // Also allow files referenced by this user's jobs (they may have processed files in this session)
      try {
        const jobs = listJobsByUser(req.user as unknown as AuthenticatedUser);
        for (const j of jobs) {
          allowed.add(j.file_id);
        }
      } catch {}

      visibleInputFiles = inputFiles.filter((f) => allowed.has(f));
    }

    // collect file information
    const fileList = await Promise.all([
      ...visibleInputFiles.map(async (filename) => {
        try {
          const filePath = path.join(inputDir, filename);
          const stats = await fs.promises.stat(filePath);
          return {
            filename,
            type: "input",
            size: stats.size,
            uploadedAt: stats.birthtime,
            path: filePath,
          };
        } catch {
          return null;
        }
      }),
      // Output files are not displayed directly in the UI list anymore, so skip adding them as rows
    ]);

    const validFiles = fileList.filter((file) => file !== null);

    res.json({
      success: true,
      data: {
        total: validFiles.length,
        files: validFiles,
      },
    });
  } catch (error) {
    console.error("List files error:", error);
    res.status(500).json({
      error: "Failed to list files",
      success: false,
    });
  }
}
