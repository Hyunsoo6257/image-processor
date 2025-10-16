import axios from "axios";
import { getPool } from "../models/database.js";
import { ImageProcessor } from "./imageProcessor.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// External API Service for Unsplash and Email integration
export class ExternalAPIService {
  private static UNSPLASH_API_BASE = "https://api.unsplash.com";

  // Get API key dynamically
  private static get UNSPLASH_ACCESS_KEY(): string {
    return process.env.UNSPLASH_ACCESS_KEY || "demo_key";
  }

  // Initialize and log API key status
  static {
    console.log("🔧 ExternalAPIService initialized");
    console.log(
      "🔑 UNSPLASH_ACCESS_KEY:",
      this.UNSPLASH_ACCESS_KEY
        ? this.UNSPLASH_ACCESS_KEY.substring(0, 10) + "..."
        : "NOT SET"
    );
    console.log("🌐 UNSPLASH_API_BASE:", this.UNSPLASH_API_BASE);
  }

  /**
   * Get random image from Unsplash API
   * @param searchTerm - Search query for images
   * @returns Random image data from Unsplash
   */
  static async getRandomImage(searchTerm: string): Promise<{
    success: boolean;
    image?: any;
    error?: string;
  }> {
    try {
      if (!searchTerm || typeof searchTerm !== "string") {
        return {
          success: false,
          error: "Search query is required",
        };
      }

      // Reduced logging in production
      if (process.env.NODE_ENV !== "production") {
        console.log("Searching Unsplash for:", searchTerm);
      }

      // Call Unsplash API to get random image
      const response = await axios.get(
        `${this.UNSPLASH_API_BASE}/photos/random`,
        {
          params: {
            query: searchTerm,
            orientation: "landscape",
            count: 1,
          },
          headers: {
            Authorization: `Client-ID ${this.UNSPLASH_ACCESS_KEY}`,
          },
        }
      );

      if (process.env.NODE_ENV !== "production") {
        console.log("Unsplash API response received");
      }

      if (response.data && response.data.length > 0) {
        const photo = response.data[0];

        const imageData = {
          id: photo.id,
          url: photo.urls.regular,
          thumb: photo.urls.thumb,
          description:
            photo.description || photo.alt_description || "Random Image",
          author: photo.user?.name || "Unknown",
          authorUrl: photo.user?.links?.html,
          downloadUrl: photo.links?.download,
          width: photo.width,
          height: photo.height,
        };

        return {
          success: true,
          image: imageData,
        };
      } else {
        return {
          success: false,
          error: "No images found for the search query",
        };
      }
    } catch (error) {
      console.error("Unsplash API error:", error);
      return { success: false, error: "Failed to fetch random image" };
    }
  }

  /**
   * Download random image and save to user's files
   * @param imageUrl - URL of the image to download
   * @param searchTerm - Search term used to find the image
   * @param userId - User ID who is downloading the image
   * @returns Download result with file information
   */
  static async downloadRandomImage(
    imageUrl: string,
    searchTerm: string,
    userId: string
  ): Promise<{
    success: boolean;
    fileId?: number;
    filename?: string;
    error?: string;
  }> {
    try {
      if (!imageUrl) {
        return {
          success: false,
          error: "Image URL is required",
        };
      }

      // Download image from URL
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });

      const imageBuffer = Buffer.from(imageResponse.data);
      const timestamp = Date.now();
      const filename = `${timestamp}-random-${searchTerm || "image"}.jpg`;

      try {
        // Save image to database
        const query = `
          INSERT INTO files (filename, user_id, size, type, s3_key, uploaded_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          RETURNING id
        `;

        const result = await getPool().query(query, [
          filename,
          userId,
          imageBuffer.length,
          "input",
          null, // s3_key is null for external API downloads
        ]);

        // Upload file to S3 (stateless)
        const { S3Service } = await import("./s3Service.js");
        const s3Key = S3Service.generateUserKey(`user_${userId}`, filename);
        await S3Service.uploadFile(imageBuffer, s3Key, "image/jpeg");

        // Update database with S3 key
        const updateQuery = `
          UPDATE s302.files 
          SET s3_key = $1 
          WHERE id = $2
        `;
        await getPool().query(updateQuery, [s3Key, result.rows[0].id]);

        return {
          success: true,
          fileId: result.rows[0].id,
          filename: filename,
        };
      } catch (dbError) {
        console.error(
          "Database not available for stateless operation:",
          dbError
        );
        return {
          success: false,
          error: "Database connection required for stateless file storage",
        };
      }
    } catch (error) {
      console.error("Download random image error:", error);
      return {
        success: false,
        error: "Failed to download random image",
      };
    }
  }

  // Share processed image via email
  // Email sharing removed

  /**
   * Get processed image file path for download
   * @param jobId - Job ID of the processed image
   * @param userId - User ID who is requesting the download
   * @returns File path and metadata for download
   */
  static async getProcessedImagePath(
    jobId: number,
    userId: string
  ): Promise<{
    success: boolean;
    filePath?: string;
    filename?: string;
    error?: string;
  }> {
    try {
      // Get job details and check if it's completed
      const jobQuery = `
        SELECT j.*, f.filename as input_filename
        FROM jobs j
        JOIN files f ON j.file_id = f.filename
        WHERE j.id = $1 AND f.user_id = $2
      `;

      const jobResult = await getPool().query(jobQuery, [jobId, userId]);

      if (jobResult.rows.length === 0) {
        return {
          success: false,
          error: "Job not found or access denied",
        };
      }

      const job = jobResult.rows[0];

      if (job.status !== "completed") {
        return {
          success: false,
          error: "Job is not completed yet",
        };
      }

      const outputFilename = job.result?.outputFile;

      if (!outputFilename) {
        return {
          success: false,
          error: "No output file found",
        };
      }

      // Get the processed image file path
      const outputDir = path.join(process.cwd(), "data", "out");
      const outputPath = path.join(outputDir, outputFilename);

      // Check if file exists
      try {
        await fs.access(outputPath);
      } catch {
        return {
          success: false,
          error: "Output file not found",
        };
      }

      return {
        success: true,
        filePath: outputPath,
        filename: outputFilename,
      };
    } catch (error) {
      console.error("Get processed image path error:", error);
      return {
        success: false,
        error: "Failed to get processed image path",
      };
    }
  }

  /**
   * Process random image directly (download + process)
   * @param searchTerm - Search term for random image
   * @param processingOptions - Image processing options
   * @param userId - User ID who is processing the image
   * @returns Processing job information
   */
  static async processRandomImage(
    searchTerm: string,
    processingOptions: any,
    userId: string
  ): Promise<{
    success: boolean;
    jobId?: number;
    filename?: string;
    error?: string;
  }> {
    try {
      if (!searchTerm) {
        return {
          success: false,
          error: "Search term is required",
        };
      }

      // First, get a random image
      const randomImageResult = await this.getRandomImage(searchTerm);

      if (!randomImageResult.success || !randomImageResult.image) {
        return {
          success: false,
          error: randomImageResult.error || "Failed to get random image",
        };
      }

      const photo = randomImageResult.image;

      // Download the image
      const imageResponse = await axios.get(photo.url, {
        responseType: "arraybuffer",
      });

      const imageBuffer = Buffer.from(imageResponse.data);
      const timestamp = Date.now();
      const filename = `${timestamp}-random-${searchTerm}.jpg`;

      // Save image to database
      const fileQuery = `
        INSERT INTO files (filename, user_id, size, type, s3_key, uploaded_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `;

      const fileResult = await getPool().query(fileQuery, [
        filename,
        userId,
        imageBuffer.length,
        "input",
        null, // s3_key is null for external API downloads
      ]);

      // Upload file to S3 (stateless)
      const { S3Service } = await import("./s3Service.js");
      const s3Key = S3Service.generateUserKey(`user_${userId}`, filename);
      await S3Service.uploadFile(imageBuffer, s3Key, "image/jpeg");

      // Update database with S3 key
      const updateQuery = `
        UPDATE s302.files 
        SET s3_key = $1 
        WHERE id = $2
      `;
      await getPool().query(updateQuery, [s3Key, fileResult.rows[0].id]);

      // Create processing job
      const jobQuery = `
        INSERT INTO jobs (file_id, user_id, status, created_at, params)
        VALUES ($1, $2, $3, NOW(), $4)
        RETURNING id
      `;

      const jobResult = await getPool().query(jobQuery, [
        filename,
        userId,
        "pending",
        JSON.stringify(processingOptions || {}),
      ]);

      const jobId = jobResult.rows[0].id;

      // Process the image asynchronously
      setTimeout(async () => {
        try {
          const inputPath = path.join(process.cwd(), "data", "in", filename);
          const outputFilename = `processed_${Date.now()}_${jobId}.jpg`;
          const outputPath = path.join(
            process.cwd(),
            "data",
            "out",
            outputFilename
          );

          await ImageProcessor.processImage(
            inputPath,
            outputPath,
            processingOptions || {}
          );

          // Update job status to completed with output file info
          await getPool().query(
            "UPDATE jobs SET status = 'completed', completed_at = NOW(), result = $1 WHERE id = $2",
            [JSON.stringify({ outputFile: outputFilename }), jobId]
          );
        } catch (error) {
          console.error("Background processing error:", error);

          // Update job status to failed
          await getPool().query(
            "UPDATE jobs SET status = 'failed', completed_at = NOW() WHERE id = $1",
            [jobId]
          );
        }
      }, 100);

      return {
        success: true,
        jobId: jobId,
        filename: filename,
      };
    } catch (error) {
      console.error("Process random image error:", error);
      return {
        success: false,
        error: "Failed to process random image",
      };
    }
  }
}
