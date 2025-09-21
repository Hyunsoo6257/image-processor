// Initialize job processing functionality
import { showAlert } from "./utils.js";

export function initJobs() {
  // Note: Single file processing has been removed
  // All processing now goes through batch processing in files.js
  console.log("Jobs module initialized - batch processing only");
}

// Delete job and all related data
window.deleteJob = async function (jobId) {
  if (!window.currentUser) {
    showAlert("Please login first to delete jobs", "danger");
    return;
  }

  // Confirm deletion
  if (
    !confirm(
      `Are you sure you want to delete job #${jobId} and all related data?`
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/jobs/${jobId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showAlert(
        `Job #${jobId} and all related data deleted successfully!`,
        "success"
      );

      // Refresh file list and credits
      setTimeout(() => {
        window.loadFiles(1);
        if (window.refreshCreditsAfterOperation) {
          window.refreshCreditsAfterOperation();
        }
      }, 1000);
    } else {
      showAlert(data.error || "Failed to delete job", "danger");
    }
  } catch (error) {
    console.error("Delete job error:", error);
    showAlert("Failed to delete job", "danger");
  }
};
