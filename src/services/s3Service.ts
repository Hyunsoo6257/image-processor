import AWS from "aws-sdk";

export class S3Service {
  private static s3: AWS.S3 | null = null;
  private static bucketName: string | null = null;

  private static getS3(): AWS.S3 {
    if (!this.s3) {
      this.s3 = new AWS.S3({
        region: process.env.AWS_REGION || "ap-southeast-2",
      });
    }
    return this.s3;
  }

  private static getBucketName(): string {
    if (!this.bucketName) {
      this.bucketName =
        process.env.S3_BUCKET_NAME || "image-processor-s302-bucket";
    }
    return this.bucketName;
  }

  /**
   * Upload file to S3
   */
  static async uploadFile(
    file: Buffer,
    key: string,
    contentType: string = "image/jpeg"
  ): Promise<string> {
    const params = {
      Bucket: this.getBucketName(),
      Key: key,
      Body: file,
      ContentType: contentType,
    };

    const result = await this.getS3().upload(params).promise();
    return result.Location;
  }

  /**
   * Download file from S3
   */
  static async downloadFile(key: string): Promise<Buffer> {
    const params = {
      Bucket: this.getBucketName(),
      Key: key,
    };

    const result = await this.getS3().getObject(params).promise();
    return result.Body as Buffer;
  }

  /**
   * Generate presigned URL for upload
   */
  static generatePresignedUploadUrl(
    key: string,
    contentType: string = "image/jpeg"
  ): string {
    const params = {
      Bucket: this.getBucketName(),
      Key: key,
      ContentType: contentType,
      Expires: 3600, // 1 hour
    };

    return this.getS3().getSignedUrl("putObject", params);
  }

  /**
   * Generate presigned URL for download
   */
  static generatePresignedDownloadUrl(key: string): string {
    const params = {
      Bucket: this.getBucketName(),
      Key: key,
      Expires: 3600, // 1 hour
    };

    return this.getS3().getSignedUrl("getObject", params);
  }

  /**
   * Delete file from S3
   */
  static async deleteFile(key: string): Promise<void> {
    const params = {
      Bucket: this.getBucketName(),
      Key: key,
    };

    await this.getS3().deleteObject(params).promise();
  }

  /**
   * Check if file exists in S3
   */
  static async fileExists(key: string): Promise<boolean> {
    try {
      await this.getS3()
        .headObject({
          Bucket: this.getBucketName(),
          Key: key,
        })
        .promise();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata from S3
   */
  static async getFileMetadata(key: string): Promise<any> {
    try {
      const result = await this.getS3()
        .headObject({
          Bucket: this.getBucketName(),
          Key: key,
        })
        .promise();
      return result;
    } catch (error) {
      throw new Error(`Failed to get file metadata: ${error}`);
    }
  }

  /**
   * Generate user-specific S3 key using username
   */
  static generateUserKey(username: string, filename: string): string {
    const timestamp = Date.now();
    const extension = filename.split(".").pop();
    const baseName = filename.replace(/\.[^/.]+$/, "");
    return `${username}/${timestamp}-${baseName}.${extension}`;
  }

  /**
   * Generate processed file S3 key
   */
  static generateProcessedKey(
    username: string,
    jobId: number,
    filename: string
  ): string {
    const extension = filename.split(".").pop();
    const baseName = filename.replace(/\.[^/.]+$/, "");
    return `${username}/processed/${jobId}-${baseName}.${extension}`;
  }
}
