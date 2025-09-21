// ===================================
// User Types
// ===================================

export interface User {
  id: number;
  username: string;
  password: string;
  role: UserRole;
}

export type UserRole = "admin" | "user";

export interface AuthenticatedUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

// ===================================
// Job Types
// ===================================

export interface ImageProcessingParams {
  format?: "jpeg" | "png" | "webp";
  quality?: number;
  width?: number;
  height?: number;
  enhance?: boolean;
}

export interface Job {
  id: number;
  user: string;
  role: UserRole;
  file_id: string;
  params: ImageProcessingParams | null;
  status: JobStatus;
  result: ProcessingResult | null;
  created_at: Date;
  updated_at: Date;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface ProcessingResult {
  outputFile?: string;
  outputPath?: string;
  metadata?: ImageMetadata;
  processedAt?: Date;
  s3Key?: string;
  error?: string;
}

export interface CreateJobRequest {
  fileId: string;
  params?: ImageProcessingParams;
}

export interface JobListQuery {
  status?: JobStatus;
  page?: string;
  pageSize?: string;
  sort?: string;
}

export interface JobListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Job[];
}

// ===================================
// File Types
// ===================================

export interface ImageMetadata {
  format?: string;
  width?: number;
  height?: number;
  size?: number;
  density?: number;
  fileSize?: number;
  mimeType?: string;
  originalName?: string;
  uploadedBy?: string;
  uploadPath?: string;
}

export interface FileUploadResponse {
  fileId: string;
  path: string;
  s3Key?: string;
  presignedUrl?: string;
}

export interface ImageProcessingJob {
  id: number;
  inputPath: string;
  outputPath: string;
  options: ImageProcessingParams;
}

// ===================================
// Database Types
// ===================================

export interface DatabaseImageMetadata {
  id?: number;
  file_id: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  width?: number;
  height?: number;
  format?: string;
  uploaded_by: string;
  upload_path: string;
  s3_key?: string;
  created_at?: Date;
}

export interface ProcessingHistory {
  id: number;
  job_id: number;
  user: string;
  input_file_id: string;
  output_file_id?: string;
  processing_time_ms?: number;
  cpu_usage_percent?: number;
  memory_usage_mb?: number;
  success: boolean;
  error_message?: string;
  created_at: Date;
}

// ===================================
// Stress Test Types
// ===================================

export interface StressTestRequest {
  iterations?: number;
  sampleImage: string;
}

export interface StressTestResponse {
  message: string;
  iterations: number;
  estimatedDuration: string;
}

export interface StressTestResult {
  duration: number;
  iterations: number;
  results: any[];
  averageTimePerImage: number;
}

// ===================================
// Credit System Types
// ===================================

export interface UserCredits {
  username: string;
  credits: number;
  lastUpdated: Date;
}

export interface CreditTransaction {
  id: number;
  jobId: number | null;
  creditsUsed: number;
  transactionType: "deduct" | "refund" | "admin_grant";
  description: string;
  createdAt: Date;
}

export interface UserWithCredits {
  username: string;
  credits: number;
  lastUpdated: Date;
  totalTransactions: number;
}

export interface GrantCreditsRequest {
  username: string;
  creditsToGrant: number;
}

// ===================================
// Express Extensions
// ===================================

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
