import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { S3Service } from "./s3Service.js";
import {
  ImageProcessingParams,
  ImageMetadata,
  ImageProcessingJob,
  StressTestResult,
} from "../types/index.js";

// CPU-intensive image processing service
export class ImageProcessor {
  /**
   * Process image with various transformations
   * CPU intensive operations for load testing
   */
  static async processImage(
    inputPath: string,
    outputPath: string,
    params: {
      format?: string;
      quality?: number;
      width?: number;
      height?: number;
      enhance?: boolean;
      sharpen?: boolean;
      contrast?: number;
      brightness?: number;
      saturation?: number;
      gamma?: number;
      blur?: number;
      noise?: number;
      // New CPU intensive operations
      createGif?: boolean;
      createStopMotion?: boolean;
      applyAdvancedFilters?: boolean;
      generateVariations?: boolean;
      performAnalysis?: boolean;
      // S3 support
      inputS3Key?: string;
      outputS3Key?: string;
    }
  ): Promise<{ success: boolean; outputFile?: string; error?: string }> {
    try {
      console.log(`🖼️ Processing image: ${inputPath}`);
      console.log(`📊 Parameters:`, params);

      // Load image from S3 (stateless)
      let imageBuffer: Buffer;
      if (params.inputS3Key) {
        imageBuffer = await S3Service.downloadFile(params.inputS3Key);
      } else {
        throw new Error("S3 key is required for stateless processing");
      }

      let pipeline = sharp(imageBuffer);

      // Basic transformations
      if (params.width || params.height) {
        pipeline = pipeline.resize(params.width, params.height, {
          kernel: sharp.kernel.lanczos3, // CPU intensive kernel
          fit: "fill",
        });
      }

      if (params.enhance) {
        pipeline = pipeline.modulate({
          brightness: params.brightness || 1.1,
          saturation: params.saturation || 1.2,
          hue: 0,
        });
      }

      if (params.sharpen) {
        pipeline = pipeline.sharpen(1.5, 1.0, 2.0);
      }

      if (params.contrast) {
        pipeline = pipeline.linear(params.contrast, -(params.contrast - 1) / 2);
      }

      if (params.gamma) {
        pipeline = pipeline.gamma(params.gamma);
      }

      if (params.blur) {
        pipeline = pipeline.blur(params.blur);
      }

      // CPU Intensive Operations
      if (params.applyAdvancedFilters) {
        pipeline = await this.applyAdvancedFilters(pipeline);
      }

      if (params.createGif) {
        return await this.createGifAnimation(inputPath, outputPath, params);
      }

      if (params.createStopMotion) {
        return await this.createStopMotion(inputPath, outputPath, params);
      }

      if (params.generateVariations) {
        return await this.generateImageVariations(
          inputPath,
          outputPath,
          params
        );
      }

      if (params.performAnalysis) {
        return await this.performImageAnalysis(inputPath, outputPath, params);
      }

      // Format and quality
      const format = params.format || "jpeg";
      const quality = params.quality || 100;

      if (format === "jpeg") {
        pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
      } else if (format === "png") {
        pipeline = pipeline.png({ progressive: true, compressionLevel: 9 });
      } else if (format === "webp") {
        pipeline = pipeline.webp({ quality, effort: 6 });
      }

      // Add noise if specified
      if (params.noise) {
        pipeline = await this.addNoise(pipeline, params.noise);
      }

      // Process the image
      const processedBuffer = await pipeline.toBuffer();

      // Save to S3 (stateless)
      if (params.outputS3Key) {
        await S3Service.uploadFile(
          processedBuffer,
          params.outputS3Key,
          "image/jpeg"
        );
        console.log(
          `✅ Image processed and uploaded to S3: ${params.outputS3Key}`
        );
        return {
          success: true,
          outputFile: params.outputS3Key.split("/").pop()!,
        };
      } else {
        throw new Error("S3 output key is required for stateless processing");
      }
    } catch (error) {
      console.error("❌ Image processing error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Apply advanced CPU-intensive filters
   */
  private static async applyAdvancedFilters(
    pipeline: sharp.Sharp
  ): Promise<sharp.Sharp> {
    console.log("🎨 Applying advanced filters...");

    // Multiple filter passes for CPU intensive processing
    for (let i = 0; i < 5; i++) {
      pipeline = pipeline
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 9, -1, -1, -1, -1],
        })
        .median(2)
        .sharpen(1.5, 1.0, 2.0)
        .linear(1.2, -0.1);
    }

    return pipeline;
  }

  /**
   * Create GIF animation from single image (CPU intensive)
   */
  private static async createGifAnimation(
    inputPath: string,
    outputPath: string,
    params: any
  ): Promise<{
    success: boolean;
    outputFile?: string;
    error?: string;
    frameUrls?: string[];
  }> {
    try {
      console.log("🎬 Creating GIF animation...");

      const frames: Buffer[] = [];
      const frameCount = 20; // CPU intensive: 20 frames

      // Generate multiple frames with different effects
      for (let i = 0; i < frameCount; i++) {
        const frame = await sharp(inputPath)
          .resize(params.width || 800, params.height || 600)
          .modulate({
            brightness: 1 + i * 0.05,
            saturation: 1 + i * 0.02,
            hue: i * 18, // Rotate hue
          })
          .sharpen({ sigma: 1 + i * 0.1 })
          .jpeg({ quality: 90 })
          .toBuffer();

        frames.push(frame);
      }

      // Create GIF using sharp (simulated - would need gif library)
      // For now, save as multi-frame JPEG
      const outputDir = path.dirname(outputPath);
      const baseName = path.basename(outputPath, path.extname(outputPath));

      // Upload frames to S3 and collect keys
      const frameUrls: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const frameKey = `processed/${baseName}_frame_${i}.jpg`;
        await S3Service.uploadFile(frames[i], frameKey, "image/jpeg");
        frameUrls.push(frameKey);
      }

      console.log(`✅ GIF animation frames created: ${frames.length} frames`);
      return {
        success: true,
        outputFile: frameUrls[0], // Return first frame URL
        frameUrls, // Return all frame URLs
      };
    } catch (error) {
      console.error("❌ GIF creation error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "GIF creation failed",
      };
    }
  }

  /**
   * Create stop-motion effect (CPU intensive)
   */
  private static async createStopMotion(
    inputPath: string,
    outputPath: string,
    params: any
  ): Promise<{
    success: boolean;
    outputFile?: string;
    error?: string;
    variationUrls?: string[];
  }> {
    try {
      console.log("🎭 Creating stop-motion effect...");

      const variations: Buffer[] = [];
      const variationCount = 15; // CPU intensive: 15 variations

      // Create multiple variations with different effects
      for (let i = 0; i < variationCount; i++) {
        const variation = await sharp(inputPath)
          .resize(params.width || 1024, params.height || 768)
          .modulate({
            brightness: 0.8 + i * 0.02,
            saturation: 0.9 + i * 0.03,
            hue: i * 24,
          })
          .sharpen({ sigma: 0.5 + i * 0.1 })
          .blur(i * 0.2)
          .jpeg({ quality: 95 })
          .toBuffer();

        variations.push(variation);
      }

      // Save variations
      const outputDir = path.dirname(outputPath);
      const baseName = path.basename(outputPath, path.extname(outputPath));

      // Upload variations to S3 and collect keys
      const variationUrls: string[] = [];
      for (let i = 0; i < variations.length; i++) {
        const variationKey = `processed/${baseName}_stopmotion_${i}.jpg`;
        await S3Service.uploadFile(variations[i], variationKey, "image/jpeg");
        variationUrls.push(variationKey);
      }

      console.log(
        `✅ Stop-motion variations created: ${variations.length} variations`
      );
      return {
        success: true,
        outputFile: variationUrls[0], // Return first variation URL
        variationUrls, // Return all variation URLs
      };
    } catch (error) {
      console.error("❌ Stop-motion creation error:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Stop-motion creation failed",
      };
    }
  }

  /**
   * Generate image variations (CPU intensive)
   */
  private static async generateImageVariations(
    inputPath: string,
    outputPath: string,
    params: any
  ): Promise<{
    success: boolean;
    outputFile?: string;
    error?: string;
    variationUrls?: string[];
  }> {
    try {
      console.log("🎨 Generating image variations...");

      const variations: Buffer[] = [];
      const variationCount = 25; // CPU intensive: 25 variations

      // Generate multiple artistic variations
      for (let i = 0; i < variationCount; i++) {
        const variation = await sharp(inputPath)
          .resize(params.width || 1200, params.height || 900)
          .modulate({
            brightness: 0.7 + i * 0.01,
            saturation: 0.8 + i * 0.02,
            hue: i * 15,
          })
          .sharpen({ sigma: 0.3 + i * 0.05 })
          .linear(1.1 + i * 0.01, -0.05)
          .gamma(0.9 + i * 0.005)
          .jpeg({ quality: 98 })
          .toBuffer();

        variations.push(variation);
      }

      // Save variations
      const outputDir = path.dirname(outputPath);
      const baseName = path.basename(outputPath, path.extname(outputPath));

      // Upload variations to S3 and collect keys
      const variationUrls: string[] = [];
      for (let i = 0; i < variations.length; i++) {
        const variationKey = `processed/${baseName}_variation_${i}.jpg`;
        await S3Service.uploadFile(variations[i], variationKey, "image/jpeg");
        variationUrls.push(variationKey);
      }

      console.log(
        `✅ Image variations generated: ${variations.length} variations`
      );
      return {
        success: true,
        outputFile: variationUrls[0], // Return first variation URL
        variationUrls, // Return all variation URLs
      };
    } catch (error) {
      console.error("❌ Variation generation error:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Variation generation failed",
      };
    }
  }

  /**
   * Perform image analysis (CPU intensive)
   */
  private static async performImageAnalysis(
    inputPath: string,
    outputPath: string,
    params: any
  ): Promise<{
    success: boolean;
    outputFile?: string;
    error?: string;
    analysisUrls?: string[];
  }> {
    try {
      console.log("🔍 Performing image analysis...");

      // Load image from S3 (stateless)
      let imageBuffer: Buffer;
      if (params.inputS3Key) {
        imageBuffer = await S3Service.downloadFile(params.inputS3Key);
      } else {
        throw new Error("S3 key is required for stateless processing");
      }

      // CPU intensive analysis operations
      const analysisResults: any[] = [];
      const analysisCount = 30; // CPU intensive: 30 analysis passes
      const analysisUrls: string[] = [];

      for (let i = 0; i < analysisCount; i++) {
        // Simulate complex image analysis
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();

        // Perform multiple analysis passes
        const analysis = await this.analyzeImage(image, i);
        analysisResults.push(analysis);

        // Create analysis visualization
        const analysisImage = await this.createAnalysisVisualization(
          image,
          analysis,
          i
        );

        // Upload analysis image to S3 (stateless)
        const analysisKey = `processed/analysis_${i}_${Date.now()}.jpg`;
        const analysisBuffer = await analysisImage.toBuffer();
        await S3Service.uploadFile(analysisBuffer, analysisKey, "image/jpeg");
        analysisUrls.push(analysisKey);
      }

      console.log(
        `✅ Image analysis completed: ${analysisCount} analysis passes`
      );
      return {
        success: true,
        outputFile: analysisUrls[0], // Return first analysis URL
        analysisUrls, // Return all analysis URLs
      };
    } catch (error) {
      console.error("❌ Image analysis error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Image analysis failed",
      };
    }
  }

  /**
   * Analyze image with various algorithms
   */
  private static async analyzeImage(
    image: sharp.Sharp,
    pass: number
  ): Promise<any> {
    // Simulate complex image analysis algorithms
    const analysis = {
      pass,
      timestamp: new Date().toISOString(),
      features: [] as any[],
      statistics: {} as any,
    };

    // Simulate feature detection
    for (let i = 0; i < 100; i++) {
      analysis.features.push({
        type: `feature_${i % 10}`,
        confidence: Math.random(),
        position: { x: Math.random() * 1000, y: Math.random() * 1000 },
      });
    }

    // Simulate statistical analysis
    analysis.statistics = {
      brightness: Math.random(),
      contrast: Math.random(),
      saturation: Math.random(),
      sharpness: Math.random(),
      noise: Math.random(),
    };

    return analysis;
  }

  /**
   * Create analysis visualization
   */
  private static async createAnalysisVisualization(
    image: sharp.Sharp,
    analysis: any,
    pass: number
  ): Promise<sharp.Sharp> {
    // Create visualization of analysis results
    return image
      .resize(800, 600)
      .modulate({
        brightness: 1 + pass * 0.01,
        saturation: 1 + pass * 0.02,
      })
      .sharpen({ sigma: 0.5 + pass * 0.1 })
      .jpeg({ quality: 90 });
  }

  /**
   * Add noise to image
   */
  private static async addNoise(
    pipeline: sharp.Sharp,
    intensity: number
  ): Promise<sharp.Sharp> {
    // Simulate noise addition
    return pipeline.modulate({
      brightness: 1 + intensity * 0.1,
      saturation: 1 - intensity * 0.1,
    });
  }

  /**
   * Stress test method for CPU load testing (stateless)
   */
  static async stressTest(
    inputS3Key: string,
    iterations: number
  ): Promise<{ success: boolean; processedFiles: number; error?: string }> {
    try {
      console.log(`🔥 Starting stress test with ${iterations} iterations...`);

      let processedFiles = 0;

      for (let i = 0; i < iterations; i++) {
        try {
          const outputS3Key = `stress_test/stress_test_${i}_${Date.now()}.jpg`;

          // Apply multiple CPU-intensive operations (stateless)
          await this.processImage("", "", {
            format: "jpeg",
            quality: 100,
            width: 2048,
            height: 1536,
            enhance: true,
            sharpen: true,
            contrast: 1.3,
            brightness: 1.1,
            saturation: 1.2,
            gamma: 1.1,
            applyAdvancedFilters: true,
            generateVariations: true,
            performAnalysis: true,
            inputS3Key: inputS3Key,
            outputS3Key: outputS3Key,
          });

          processedFiles++;
          console.log(
            `✅ Stress test iteration ${i + 1}/${iterations} completed`
          );
        } catch (error) {
          console.error(`❌ Stress test iteration ${i + 1} failed:`, error);
        }
      }

      console.log(
        `🎯 Stress test completed: ${processedFiles}/${iterations} files processed`
      );
      return {
        success: true,
        processedFiles,
      };
    } catch (error) {
      console.error("❌ Stress test failed:", error);
      return {
        success: false,
        processedFiles: 0,
        error: error instanceof Error ? error.message : "Stress test failed",
      };
    }
  }

  // Process multiple images simultaneously (CPU load multiplication)
  static async batchProcess(jobs: ImageProcessingJob[]): Promise<
    Array<{
      jobId: number;
      success: boolean;
      outputPath?: string;
      metadata?: ImageMetadata;
      error?: string;
    }>
  > {
    const results: Array<{
      jobId: number;
      success: boolean;
      outputPath?: string;
      metadata?: ImageMetadata;
      error?: string;
    }> = [];

    // Process sequentially for CPU load (parallel processing is faster but CPU load is distributed)
    for (const job of jobs) {
      try {
        const result = await this.processImage(
          job.inputPath,
          job.outputPath,
          job.options
        );
        results.push({
          jobId: job.id,
          success: true,
          outputPath: result.outputFile,
        });
      } catch (error) {
        results.push({
          jobId: job.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  // Extract image metadata (stateless)
  static async extractMetadata(s3Key: string): Promise<ImageMetadata> {
    try {
      // Download from S3 (stateless)
      const imageBuffer = await S3Service.downloadFile(s3Key);
      const metadata = await sharp(imageBuffer).metadata();

      return {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        size: imageBuffer.length,
        density: metadata.density,
      };
    } catch (error) {
      throw new Error(
        `Failed to extract metadata: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Check supported formats
  static isSupportedFormat(format: string): boolean {
    const supportedFormats = ["jpeg", "jpg", "png", "webp"];
    return supportedFormats.includes(format.toLowerCase());
  }

  // Image validation (stateless)
  static async validateImage(s3Key: string): Promise<{
    valid: boolean;
    error?: string;
    metadata?: ImageMetadata;
  }> {
    try {
      const metadata = await this.extractMetadata(s3Key);

      // Basic validation
      if (!metadata.width || !metadata.height) {
        return {
          valid: false,
          error: "Invalid image dimensions",
        };
      }

      if (metadata.size && metadata.size > 50 * 1024 * 1024) {
        // 50MB limit
        return {
          valid: false,
          error: "Image too large (max 50MB)",
        };
      }

      return {
        valid: true,
        metadata,
      };
    } catch (error) {
      return {
        valid: false,
        error:
          error instanceof Error ? error.message : "Unknown validation error",
      };
    }
  }
}
