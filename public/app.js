// Initialize all modules
import { initAuth } from "./modules/auth.js";
import { initFiles } from "./modules/files.js";
import { initCredits } from "./modules/credits.js";
import { showAlert } from "./modules/utils.js";

// Global variables
window.currentUser = null;
window.selectedFiles = new Set();

// Initialize modules
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  initFiles();
  initCredits();

  // Auto-login on page load
  window.autoLogin();
});

// Update UI based on authentication state
export function updateUI() {
  const loginSection = document.getElementById("login-section");
  const userSection = document.getElementById("user-section");
  const currentUserSpan = document.getElementById("current-user");

  if (window.currentUser) {
    // User is logged in
    loginSection.classList.add("hidden");
    userSection.classList.remove("hidden");
    currentUserSpan.textContent = `Welcome, ${window.currentUser.username} (${window.currentUser.role})`;

    // Load files after login
    window.loadFiles(1);
  } else {
    // User is not logged in
    loginSection.classList.remove("hidden");
    userSection.classList.add("hidden");
    currentUserSpan.textContent = "";

    // Clear file list when logged out
    const filesTbody = document.getElementById("files-tbody");
    if (filesTbody) {
      filesTbody.innerHTML = "";
    }

    // Clear selected files
    window.selectedFiles.clear();

    // Update batch controls
    const selectedCount = document.getElementById("selected-count");
    if (selectedCount) {
      selectedCount.textContent = "0 files selected";
    }
  }
}

// Set current file ID for processing (legacy support)
export function setCurrentFileId(fileId) {
  window.currentFileId = fileId;
}

// Make setCurrentFileId globally available
window.setCurrentFileId = setCurrentFileId;

// Global function for file selection (legacy support)
window.selectFileForProcessing = function (filename) {
  // For single file processing, select only this file
  window.selectedFiles.clear();
  window.selectedFiles.add(filename);

  // Update checkboxes
  const checkboxes = document.querySelectorAll(".file-checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = checkbox.dataset.filename === filename;
  });

  updateSelectAllState();
  updateBatchControls();

  // Show alert to use batch processing
  showAlert(
    "File selected. Use 'Process Selected Files' button to process.",
    "info"
  );
};

// Global functions for batch processing
window.updateSelectAllState = function () {
  const selectAllCheckbox = document.getElementById("select-all");
  const checkboxes = document.querySelectorAll(".file-checkbox");
  const checkedBoxes = document.querySelectorAll(".file-checkbox:checked");

  selectAllCheckbox.checked =
    checkboxes.length > 0 && checkboxes.length === checkedBoxes.length;
  selectAllCheckbox.indeterminate =
    checkedBoxes.length > 0 && checkboxes.length !== checkedBoxes.length;
};

window.updateBatchControls = function () {
  const selectedCount = document.getElementById("selected-count");
  selectedCount.textContent = `${window.selectedFiles.size} file${
    window.selectedFiles.size !== 1 ? "s" : ""
  } selected`;
};

// Share processed image via email
window.shareProcessedImage = async function (jobId) {
  try {
    const toEmail = prompt("Enter recipient email address:");
    if (!toEmail) return;

    const subject = prompt("Enter email subject:", "Processed Image");
    if (!subject) return;

    const message = prompt(
      "Enter email message:",
      "Here's your processed image!"
    );
    if (!message) return;

    const response = await fetch("/jobs/share-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        jobId: jobId,
        toEmail: toEmail,
        subject: subject,
        message: message,
      }),
    });

    const data = await response.json();

    if (data.success) {
      showAlert("Image shared via email successfully!", "success");
    } else {
      showAlert(data.error || "Failed to share image", "danger");
    }
  } catch (error) {
    console.error("Share image error:", error);
    showAlert("Failed to share image", "danger");
  }
};

// Global function for downloading processed images
window.downloadProcessedImage = async function (jobId) {
  try {
    const response = await fetch(`/jobs/download-processed-image/${jobId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `processed_image_${jobId}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showAlert("Image downloaded successfully!", "success");
    } else {
      const data = await response.json();
      showAlert(data.error || "Failed to download image", "danger");
    }
  } catch (error) {
    console.error("Download processed image error:", error);
    showAlert("Failed to download image", "danger");
  }
};

// Global function to refresh the entire application state
window.refreshAppState = function () {
  // Refresh files list
  if (window.loadFiles) {
    window.loadFiles(1);
  }

  // Refresh credits
  if (window.refreshCreditsAfterOperation) {
    window.refreshCreditsAfterOperation();
  }

  // Clear any temporary states
  window.selectedFiles.clear();
  window.updateBatchControls();
};

// Global function to handle processing completion
window.handleProcessingComplete = function (jobId, result) {
  // Show success message
  showAlert("Image processing completed successfully!", "success");

  // Refresh the file list to show updated status
  setTimeout(() => {
    window.refreshAppState();
  }, 1000);

  // Update UI to show download/share buttons
  const actionCell = document.querySelector(
    `[data-job-id="${jobId}"] .action-cell`
  );
  if (actionCell) {
    actionCell.innerHTML = `
      <button class="btn btn-success" onclick="downloadProcessedImage('${jobId}')" style="font-size: 12px; padding: 4px 8px;">
        📥 Download
      </button>
      <button class="btn btn-info" onclick="shareProcessedImage('${jobId}')" style="font-size: 12px; padding: 4px 8px;">
        📤 Share
      </button>
    `;
  }
};

// Global function to handle processing errors
window.handleProcessingError = function (jobId, error) {
  // Show error message
  showAlert(`Processing failed: ${error}`, "danger");

  // Refresh the file list to show updated status
  setTimeout(() => {
    window.refreshAppState();
  }, 1000);
};

// Global function to check if user has enough credits
window.checkUserCredits = async function (requiredCredits = 1) {
  try {
    const response = await fetch("/credits/me", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    const data = await response.json();

    if (data.success) {
      const currentCredits = data.data.credits;
      return currentCredits >= requiredCredits;
    }

    return false;
  } catch (error) {
    console.error("Credit check error:", error);
    return false;
  }
};

// Global function to show credit warning
window.showCreditWarning = function (requiredCredits = 1) {
  showAlert(
    `Insufficient credits. You need ${requiredCredits} credit(s) to process images.`,
    "warning"
  );
};

// Global function to handle random image processing
window.processRandomImage = async function (searchTerm, processingOptions) {
  try {
    // Check credits first
    const hasCredits = await window.checkUserCredits(1);
    if (!hasCredits) {
      window.showCreditWarning(1);
      return;
    }

    const response = await fetch("/jobs/process-random-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        searchTerm,
        processingOptions,
      }),
    });

    const data = await response.json();

    if (data.success) {
      showAlert("Random image processing started!", "success");

      // Refresh file list after a delay
      setTimeout(() => {
        window.refreshAppState();
      }, 2000);
    } else {
      showAlert(data.error || "Failed to process random image", "danger");
    }
  } catch (error) {
    console.error("Random image processing error:", error);
    showAlert("Failed to process random image", "danger");
  }
};
