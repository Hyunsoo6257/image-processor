#!/usr/bin/env node

/**
 * Powerful Load Test Script for EC2 t3.micro
 *
 * Purpose: Generate >80% CPU utilization by processing 10 GIF files with intensive operations
 * Target: http://3.26.33.23:3000
 * Method: Process 10 GIF files with maximum CPU-intensive operations
 * Optimized for t3.micro (2 vCPU, 1GB RAM)
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Configuration for powerful load test
const CONFIG = {
  EC2_URL: "http://3.26.33.23:3000",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin123",
  GIF_FILES: [
    "test-gif-1.gif",
    "test-gif-2.gif",
    "test-gif-3.gif",
    "test-gif-4.gif",
    "test-gif-5.gif",
    "test-gif-6.gif",
    "test-gif-7.gif",
    "test-gif-8.gif",
    "test-gif-9.gif",
    "test-gif-10.gif",
  ],
  BATCH_SIZE: 10,
  CONCURRENT_BATCHES: 5,
  INTERVAL: 1000, // 1 second between batches
  TEST_DURATION: 300000, // 5 minutes
  MAX_ITERATIONS: 50,
};

// Processing parameters for maximum CPU load
const processingParams = {
  width: 8192,
  height: 8192,
  quality: 100,
  format: "jpeg",
  createGif: true,
  createStopMotion: true,
  iterations: 20,
  filters: ["sharpen", "blur", "emboss", "sepia", "grayscale"],
  effects: ["vintage", "modern", "artistic"],
  resizeMode: "fit",
  crop: true,
  rotate: 45,
  flip: "both",
  brightness: 1.5,
  contrast: 1.3,
  saturation: 1.2,
  gamma: 1.1,
};

let authToken = null;
let testStartTime = null;
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;

// Login function
async function login() {
  try {
    console.log("🔐 Logging in...");
    const response = await axios.post(`${CONFIG.EC2_URL}/auth/login`, {
      username: CONFIG.ADMIN_USERNAME,
      password: CONFIG.ADMIN_PASSWORD,
    });

    if (response.data.success) {
      authToken = response.data.token;
      console.log("✅ Login successful");
      return true;
    } else {
      console.log("❌ Login failed:", response.data.error);
      return false;
    }
  } catch (error) {
    console.log("❌ Login error:", error.message);
    return false;
  }
}

// Check if GIF files exist
function checkGifFiles() {
  console.log("🎬 Checking GIF files...");
  const missingFiles = [];

  CONFIG.GIF_FILES.forEach((filename) => {
    const filePath = path.join("data", "in", filename);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(filename);
    }
  });

  if (missingFiles.length > 0) {
    console.log(`❌ Missing GIF files: ${missingFiles.join(", ")}`);
    console.log("Please download high-quality GIF files first");
    return false;
  }

  console.log("✅ All GIF files found");
  return true;
}

// Submit batch processing job with maximum CPU load
async function submitBatchJob(batchNumber) {
  try {
    const response = await axios.post(
      `${CONFIG.EC2_URL}/jobs/batch-process`,
      {
        fileIds: CONFIG.GIF_FILES,
        params: processingParams,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    if (response.data.success) {
      console.log(`✅ Batch ${batchNumber} submitted successfully`);
      successfulRequests++;
      return response.data.jobId;
    } else {
      console.log(`❌ Batch ${batchNumber} failed:`, response.data.error);
      failedRequests++;
      return null;
    }
  } catch (error) {
    console.log(`❌ Batch ${batchNumber} error:`, error.message);
    failedRequests++;
    return null;
  }
}

// Submit extreme stress test
async function submitExtremeStressTest() {
  try {
    console.log("🔥 Submitting extreme stress test...");

    const stressParams = {
      ...processingParams,
      width: 8192,
      height: 8192,
      iterations: 50,
      filters: [
        "sharpen",
        "blur",
        "emboss",
        "sepia",
        "grayscale",
        "vintage",
        "modern",
      ],
      effects: ["vintage", "modern", "artistic", "dramatic", "cinematic"],
      createGif: true,
      createStopMotion: true,
      createAnimation: true,
      frameCount: 30,
      frameDelay: 100,
    };

    const response = await axios.post(
      `${CONFIG.EC2_URL}/jobs/batch-process`,
      {
        fileIds: CONFIG.GIF_FILES,
        params: stressParams,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    if (response.data.success) {
      console.log("🔥 Extreme stress test submitted successfully");
      return response.data.jobId;
    } else {
      console.log("❌ Extreme stress test failed:", response.data.error);
      return null;
    }
  } catch (error) {
    console.log("❌ Extreme stress test error:", error.message);
    return null;
  }
}

// Main load test function
async function runPowerfulLoadTest() {
  console.log("==============================================");
  console.log("🔥 Powerful Load Test for EC2 t3.micro");
  console.log("==============================================");
  console.log("Target: >80% CPU utilization for 5+ minutes");
  console.log("Method: Process 10 GIF files with maximum CPU load");
  console.log("EC2 URL:", CONFIG.EC2_URL);
  console.log("Instance: t3.micro (2 vCPU, 1GB RAM)");
  console.log("Files: 10 high-quality GIF files");
  console.log("Operations: 4K resolution, multiple filters, animations");
  console.log("==============================================");

  // Check GIF files
  if (!checkGifFiles()) {
    return;
  }

  // Login
  if (!(await login())) {
    return;
  }

  testStartTime = Date.now();
  console.log("🚀 Starting powerful load test...");

  // Submit initial extreme stress test
  await submitExtremeStressTest();

  // Submit multiple batches for sustained load
  let batchNumber = 1;
  const interval = setInterval(async () => {
    const elapsed = Date.now() - testStartTime;

    if (elapsed >= CONFIG.TEST_DURATION) {
      clearInterval(interval);
      console.log("⏰ Test duration completed");
      showResults();
      return;
    }

    // Submit multiple concurrent batches
    const promises = [];
    for (let i = 0; i < CONFIG.CONCURRENT_BATCHES; i++) {
      promises.push(submitBatchJob(batchNumber + i));
    }

    await Promise.all(promises);
    batchNumber += CONFIG.CONCURRENT_BATCHES;
    totalRequests += CONFIG.CONCURRENT_BATCHES;

    console.log(
      `📊 Progress: ${Math.round(
        elapsed / 1000
      )}s elapsed, ${totalRequests} batches submitted`
    );
  }, CONFIG.INTERVAL);

  // Show results after test duration
  setTimeout(() => {
    clearInterval(interval);
    showResults();
  }, CONFIG.TEST_DURATION);
}

// Show test results
function showResults() {
  const elapsed = Date.now() - testStartTime;
  const successRate =
    totalRequests > 0
      ? ((successfulRequests / totalRequests) * 100).toFixed(2)
      : 0;

  console.log("==============================================");
  console.log("📊 Load Test Results");
  console.log("==============================================");
  console.log(`⏱️  Duration: ${Math.round(elapsed / 1000)} seconds`);
  console.log(`📤 Total Batches: ${totalRequests}`);
  console.log(`✅ Successful: ${successfulRequests}`);
  console.log(`❌ Failed: ${failedRequests}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log("==============================================");
  console.log("🎯 Check AWS Console for CPU utilization");
  console.log("Target: >80% CPU for 5+ minutes");
  console.log("==============================================");
}

// Run the test
runPowerfulLoadTest().catch((error) => {
  console.error("❌ Load test error:", error);
});
