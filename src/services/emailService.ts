import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

// Email Service for sharing processed images
export class EmailService {
  private static transporter: nodemailer.Transporter;

  // Initialize email transporter
  static initializeTransporter() {
    const emailConfig = {
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "465"), // Changed to 465 (SSL)
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER || "demo@example.com",
        pass: process.env.EMAIL_PASS || "demo_password",
      },
      // Add timeout settings
      connectionTimeout: 30000, // 30 seconds
      greetingTimeout: 30000, // 30 seconds
      socketTimeout: 45000, // 45 seconds
      // Add TLS settings for better compatibility
      tls: {
        rejectUnauthorized: false,
        ciphers: "SSLv3",
      },
      // Add debug options
      debug: true,
      logger: true,
    };

    this.transporter = nodemailer.createTransport(emailConfig);

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error("❌ Email transporter verification failed:", error);
      } else {
        console.log("✅ Email server is ready to send messages");
      }
    });
  }

  /**
   * Send processed image via email
   * @param toEmail - Recipient email address
   * @param imagePath - Path to the processed image
   * @param imageName - Name of the image file
   * @param subject - Email subject
   * @param message - Email message
   * @returns Email sending result
   */
  static async sendImageEmail(
    toEmail: string,
    imagePath: string,
    imageName: string,
    subject: string = "Processed Image from Image Processor",
    message: string = "Here's your processed image from the Image Processor application."
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      console.log("📧 Attempting to send email to:", toEmail);

      // Check if email configuration is available
      if (
        !process.env.EMAIL_USER ||
        process.env.EMAIL_USER === "demo@example.com" ||
        !process.env.EMAIL_PASS ||
        process.env.EMAIL_PASS === "demo_password"
      ) {
        console.log("📧 Using demo mode - email not configured");
        // Return demo success if email is not configured
        return {
          success: true,
          messageId: "demo_message_id_123",
        };
      }

      // Initialize transporter if not already done
      if (!this.transporter) {
        console.log("📧 Initializing email transporter...");
        this.initializeTransporter();
      }

      // Check if file exists
      try {
        await fs.access(imagePath);
        console.log("📧 Image file found:", imagePath);
      } catch (fileError) {
        console.error("📧 Image file not found:", imagePath);
        return {
          success: false,
          error: "Image file not found",
        };
      }

      // Read the image file
      const imageBuffer = await fs.readFile(imagePath);
      console.log(
        "📧 Image file read successfully, size:",
        imageBuffer.length,
        "bytes"
      );

      // Send email with attachment
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: subject,
        text: message,
        html: `
          <h2>Image Processor - Processed Image</h2>
          <p>${message}</p>
          <p><strong>Image:</strong> ${imageName}</p>
          <p>This image was processed using the Image Processor application.</p>
          <hr>
          <p><small>Sent from Image Processor App</small></p>
        `,
        attachments: [
          {
            filename: imageName,
            content: imageBuffer,
            contentType: "image/jpeg",
          },
        ],
      };

      console.log("📧 Sending email...");
      const info = await this.transporter.sendMail(mailOptions);
      console.log("✅ Email sent successfully:", info.messageId);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error("❌ Email sending error:", error);

      // Provide more specific error messages
      let errorMessage = "Failed to send email";
      if (error instanceof Error) {
        if (error.message.includes("ETIMEDOUT")) {
          errorMessage = "Email server connection timeout. Please try again.";
        } else if (error.message.includes("authentication")) {
          errorMessage =
            "Email authentication failed. Please check your credentials.";
        } else if (error.message.includes("ENOTFOUND")) {
          errorMessage =
            "Email server not found. Please check your email configuration.";
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send image sharing link via email (alternative to attachment)
   * @param toEmail - Recipient email address
   * @param imageUrl - URL to the processed image
   * @param imageName - Name of the image file
   * @param subject - Email subject
   * @param message - Email message
   * @returns Email sending result
   */
  static async sendImageLinkEmail(
    toEmail: string,
    imageUrl: string,
    imageName: string,
    subject: string = "Processed Image Link from Image Processor",
    message: string = "Here's a link to your processed image from the Image Processor application."
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      // Check if email configuration is available
      if (
        !process.env.EMAIL_USER ||
        process.env.EMAIL_USER === "demo@example.com"
      ) {
        // Return demo success if email is not configured
        return {
          success: true,
          messageId: "demo_message_id_456",
        };
      }

      // Initialize transporter if not already done
      if (!this.transporter) {
        this.initializeTransporter();
      }

      // Send email with link
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: subject,
        text: `${message}\n\nImage: ${imageName}\nDownload Link: ${imageUrl}`,
        html: `
          <h2>Image Processor - Processed Image Link</h2>
          <p>${message}</p>
          <p><strong>Image:</strong> ${imageName}</p>
          <p><a href="${imageUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Download Image</a></p>
          <p>Or copy this link: <a href="${imageUrl}">${imageUrl}</a></p>
          <hr>
          <p><small>Sent from Image Processor App</small></p>
        `,
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error("Email sending error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send email",
      };
    }
  }

  /**
   * Validate email address format
   * @param email - Email address to validate
   * @returns Validation result
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
