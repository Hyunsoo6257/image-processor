import express from "express";
import authRoutes from "./routes/auth.js";
import filesRoutes from "./routes/files.js";
import jobsRoutes from "./routes/jobs.js";
import creditsRoutes from "./routes/credits.js";

import { EmailService } from "./services/emailService.js";
import { ConfigService } from "./services/configService.js";

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

const app = express();

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files (Web Client)
app.use(express.static("public"));

// Request logger for development
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Initialize email service
console.log("📧 Initializing email service...");
EmailService.initializeTransporter();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API routes
app.use("/auth", authRoutes);
app.use("/files", filesRoutes);
app.use("/jobs", jobsRoutes);
app.use("/credits", creditsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    method: req.method,
    path: req.originalUrl,
  });
});

// Error handler
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", error);

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        success: false,
      });
    }

    if (error.message === "Only image files are allowed") {
      return res.status(400).json({
        error: "Only image files are allowed",
        success: false,
      });
    }

    res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
);

const PORT = Number(process.env.PORT) || 3000;

// server start function
async function startServer(): Promise<void> {
  try {
    console.log("🚀 Starting Image Processor Server...");
    console.log(`📦 Environment: ${process.env.NODE_ENV || "development"}`);

    // Initialize configuration from AWS services
    console.log("🔧 Loading configuration from AWS services...");
    await ConfigService.initializeConfig();

    // Import database module AFTER config is loaded so pool picks up env vars
    const { initializeDatabase, testConnection } = await import(
      "./models/database.js"
    );

    // test database connection
    console.log("📊 Testing database connection...");
    const dbConnected = await testConnection();

    if (dbConnected) {
      // initialize database
      console.log("🗄️ Initializing database...");
      await initializeDatabase();
    } else {
      console.log("⚠️ Database not available, running in memory-only mode");
    }

    // start server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ API listening on http://0.0.0.0:${PORT}`);
      console.log("📋 Available endpoints:");
      console.log("  GET  /health - Health check");
      console.log("  POST /auth/login - User authentication");
      console.log("  GET  /auth/me - Get current user");
      console.log("  POST /files - File upload");
      console.log("  GET  /files - List files");
      console.log("  GET  /files/download/:filename - File download");
      console.log("  GET  /files/metadata/:fileId - File metadata");
      console.log("  POST /jobs - Create image processing job");
      console.log("  GET  /jobs - List jobs");
      console.log("  GET  /jobs/:id - Get job details");
      console.log("  POST /jobs/stress-test - CPU stress test (admin only)");
      console.log("");
      console.log("🔑 Default users:");
      console.log("  admin/admin123 (admin role)");
      console.log("  user1/user123 (user role)");
      console.log("");
      console.log("🐘 Database: PostgreSQL (with MySQL fallback)");
      console.log(
        "📁 Data storage: ./data/in (uploads), ./data/out (processed)"
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server gracefully...");
  // possible cleanup tasks like database connection close
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// start server
startServer().catch((error) => {
  console.error("💥 Failed to start server:", error);
  process.exit(1);
});
