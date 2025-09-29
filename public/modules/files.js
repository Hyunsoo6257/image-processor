// Files Management Module
import { showAlert, formatFileSize } from "./utils.js";

// Truncate filename to specified length
function truncateFilename(filename, maxLength = 30) {
  if (filename.length <= maxLength) {
    return filename;
  }

  const extension = filename.split(".").pop();
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf("."));
  const maxNameLength = maxLength - extension.length - 4; // 4 for "..."

  if (maxNameLength <= 0) {
    return `...${extension}`;
  }

  return `${nameWithoutExt.substring(0, maxNameLength)}...${extension}`;
}

export function initFiles() {
  // Pagination state
  let currentPage = 1;
  let totalPages = 1;
  const itemsPerPage = 10;

  // Sorting state
  let currentSort = { field: "date", direction: "desc" };

  // Random image state
  let currentRandomImage = null;
  let imageSource = null; // 'upload' or 'random'

  // DOM elements
  const fileInput = document.getElementById("file-input");
  const uploadBtn = document.getElementById("upload-btn");
  const uploadProgress = document.getElementById("upload-progress");
  const uploadProgressBar = document.getElementById("upload-progress-bar");
  const uploadStatus = document.getElementById("upload-status");

  // Initialize sorting
  initSorting();

  // Update sort indicators on page load
  updateSortIndicators();

  // Initialize batch processing functionality
  initBatchProcessing();

  // Initialize file upload functionality
  initFileUpload();

  // Initialize random image functionality
  initRandomImage();

  // Initialize sorting functionality
  function initSorting() {
    const sortableHeaders = document.querySelectorAll(".sortable");
    sortableHeaders.forEach((header) => {
      header.addEventListener("click", () => {
        const field = header.dataset.sort;
        handleSort(field);
      });
    });
  }

  // Handle sorting
  function handleSort(field) {
    // Toggle direction if same field
    if (currentSort.field === field) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.field = field;
      currentSort.direction = "asc";
    }

    // Update visual indicators
    updateSortIndicators();

    // Reload files with current page (not reset to page 1)
    window.loadFiles(currentPage);
  }

  // Update sort indicators
  function updateSortIndicators() {
    const sortableHeaders = document.querySelectorAll(".sortable");
    sortableHeaders.forEach((header) => {
      header.classList.remove("sort-asc", "sort-desc");
      if (header.dataset.sort === currentSort.field) {
        header.classList.add(`sort-${currentSort.direction}`);
      }
    });
  }

  // Initialize file upload functionality
  function initFileUpload() {
    // File input change listener
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          // File selected - update button text
          updateUploadButtonText("Upload Selected File");
          handleFileSelection(e.target.files[0], "upload");
        } else {
          // No file selected - reset to default
          updateUploadButtonText("Upload Image");
          resetPreview();
          imageSource = null;
        }
      });
    }

    // Upload button click listener
    if (uploadBtn) {
      uploadBtn.addEventListener("click", handleUploadClick);
    }
  }

  // Initialize random image functionality
  function initRandomImage() {
    // Generate button is handled by window.generateRandomImage
  }

  // Update upload button text based on current state
  function updateUploadButtonText(text) {
    if (uploadBtn) {
      uploadBtn.textContent = text;
    }
  }

  // Handle upload button click
  async function handleUploadClick() {
    // Check if user is logged in
    if (!window.currentUser) {
      showAlert("Please login first to upload files", "danger");
      return;
    }

    // Handle different upload scenarios
    if (imageSource === "upload" && fileInput.files.length > 0) {
      // Upload selected file
      await handleFileUpload(fileInput.files[0]);
    } else if (imageSource === "random" && currentRandomImage) {
      // Upload random image
      await downloadRandomImageForProcessing();
    } else {
      showAlert(
        "Please select a file or generate a random image first",
        "danger"
      );
    }
  }

  // Handle file selection
  function handleFileSelection(file, source) {
    imageSource = source;

    if (source === "upload") {
      // Show file preview
      const reader = new FileReader();
      reader.onload = function (e) {
        displayImagePreview(e.target.result, "File Upload");
      };
      reader.readAsDataURL(file);
    }
  }

  // Display image preview
  function displayImagePreview(imageSrc, source) {
    // Hide placeholder and show content
    document.getElementById("preview-placeholder").classList.add("hidden");
    document.getElementById("preview-content").classList.remove("hidden");

    // Set image source
    document.getElementById("image-preview").src = imageSrc;
    document.getElementById("image-title").textContent =
      imageSource === "random"
        ? currentRandomImage?.description || "Random Image"
        : "Uploaded File";
  }

  // Reset preview to placeholder
  function resetPreview() {
    document.getElementById("preview-placeholder").classList.remove("hidden");
    document.getElementById("preview-content").classList.add("hidden");
  }

  // Generate random image from Unsplash API
  window.generateRandomImage = async function () {
    const searchTerm = document.getElementById("search-input").value.trim();

    if (!searchTerm) {
      showAlert("Please enter a search term", "danger");
      return;
    }

    try {
      const response = await fetch(
        `/files/random-image?search=${encodeURIComponent(searchTerm)}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );

      const data = await response.json();

      if (data.success) {
        currentRandomImage = data.image;
        imageSource = "random";
        displayImagePreview(data.image.url, "Random Image");

        // Update upload button text for random image
        updateUploadButtonText("Upload Random File");
      } else {
        showAlert(data.error || "Failed to generate random image", "danger");
      }
    } catch (error) {
      console.error("Random image generation error:", error);
      showAlert("Failed to generate random image", "danger");
    }
  };

  // Download random image for processing
  async function downloadRandomImageForProcessing() {
    try {
      const response = await fetch(`/files/download-random-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          imageUrl: currentRandomImage.url,
          searchTerm: document.getElementById("search-input").value,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Add the downloaded image to the file list
        window.loadFiles(1);
        showAlert(
          "Random image downloaded and ready for processing",
          "success"
        );

        // Reset states after successful upload
        setTimeout(() => {
          updateUploadButtonText("Upload Image");
          resetPreview();
          imageSource = null;
          currentRandomImage = null;
        }, 1000);
      } else {
        showAlert("Failed to download random image", "danger");
      }
    } catch (error) {
      console.error("Download random image error:", error);
      showAlert("Failed to download random image", "danger");
    }
  }

  // Handle file upload using pre-signed URLs
  async function handleFileUpload(file) {
    // Prevent duplicate uploads
    if (uploadBtn.disabled) {
      return;
    }

    // Disable upload button during upload
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";

    // Show upload progress
    uploadProgress.classList.remove("hidden");
    uploadProgressBar.style.width = "0%";
    uploadStatus.textContent = "Getting pre-signed URL...";

    try {
      // Step 1: Get pre-signed URL from our server
      const presignedResponse = await fetch("/files/presigned-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      const presignedResult = await presignedResponse.json();

      if (!presignedResult.success) {
        throw new Error(
          presignedResult.error || "Failed to get pre-signed URL"
        );
      }

      uploadStatus.textContent = "Uploading directly to S3...";
      uploadProgressBar.style.width = "50%";

      // Step 2: Upload directly to S3 using pre-signed URL
      const s3Response = await fetch(presignedResult.data.presignedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!s3Response.ok) {
        throw new Error(`S3 upload failed: ${s3Response.statusText}`);
      }

      uploadProgressBar.style.width = "75%";
      uploadStatus.textContent = "Saving file metadata...";

      // Step 3: Save file metadata to database
      const metadataResponse = await fetch("/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          filename: file.name,
          s3Key: presignedResult.data.s3Key,
          size: file.size,
          type: file.type,
        }),
      });

      const metadataResult = await metadataResponse.json();

      if (metadataResult.success) {
        uploadProgressBar.style.width = "100%";
        uploadStatus.textContent = "Upload completed!";

        // Refresh file list after successful upload
        setTimeout(() => {
          window.loadFiles(1);
          // Reset upload area
          fileInput.value = "";
          updateUploadButtonText("Upload Image");
          uploadBtn.disabled = false;
          uploadProgress.classList.add("hidden");
          // Reset preview to placeholder
          resetPreview();
          // Reset image source
          imageSource = null;
          currentRandomImage = null;
        }, 1000);
      } else {
        uploadStatus.textContent = "Upload failed: " + result.error;
      }
    } catch (error) {
      console.error("Upload error:", error);
      uploadStatus.textContent = "Upload failed";
    } finally {
      // Re-enable upload button if it was disabled
      if (uploadBtn.disabled) {
        uploadBtn.disabled = false;
        updateUploadButtonText("Upload Image");
      }
    }
  }

  // Unified files and jobs management with pagination
  const loadFiles = async function (page = 1) {
    const filesLoading = document.getElementById("files-loading");
    const filesTbody = document.getElementById("files-tbody");

    try {
      filesLoading.classList.remove("hidden");

      // Load both files and jobs
      const [filesResponse, jobsResponse] = await Promise.all([
        fetch("/files", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }),
        fetch("/jobs", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }),
      ]);

      const filesData = await filesResponse.json();
      const jobsData = await jobsResponse.json();

      if (filesResponse.ok && jobsResponse.ok) {
        // Store jobs globally for sorting access
        window.currentJobs = jobsData.data.items || [];
        displayUnifiedFiles(
          filesData.data.files,
          jobsData.data.items || [],
          page
        );
      } else {
        showAlert("Failed to load files", "danger");
      }
    } catch (error) {
      showAlert("Error loading files: " + error.message, "danger");
    } finally {
      filesLoading.classList.add("hidden");
    }
  };

  // Make loadFiles available globally
  window.loadFiles = loadFiles;

  function displayUnifiedFiles(files, jobs, page = 1) {
    const filesTbody = document.getElementById("files-tbody");
    filesTbody.innerHTML = "";

    // Create jobs map for quick lookup
    const jobsMap = new Map();
    jobs.forEach((job) => {
      jobsMap.set(job.file_id, job);
    });

    // Show only input files to avoid adding extra rows for outputs
    const inputOnly = files.filter((f) => f.type !== "output");

    // Remove duplicates based on filename
    const uniqueFiles = inputOnly.filter(
      (file, index, self) =>
        index === self.findIndex((f) => f.filename === file.filename)
    );

    // Sort all files first (to ensure latest files appear first)
    const sortedFiles = sortFiles(uniqueFiles, currentSort);

    // Apply pagination after sorting
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedFiles = sortedFiles.slice(startIndex, endIndex);

    // Update current page
    currentPage = page;

    paginatedFiles.forEach((file) => {
      const job = jobsMap.get(file.filename);
      const row = document.createElement("tr");
      row.className = "file-row";
      row.dataset.filename = file.filename;

      // Debug logging
      if (job) {
        console.log(
          `File: ${file.filename}, Job status: ${job.status}, Result:`,
          job.result
        );
      }

      // Determine if file can be processed (only input files without completed jobs)
      const canProcess = !job || job.status !== "completed";

      row.innerHTML = `
        <td>
          ${
            canProcess
              ? `<input type="checkbox" class="file-checkbox" data-filename="${file.filename}">`
              : ""
          }
        </td>
        <td title="${file.filename}">${truncateFilename(file.filename, 30)}</td>
        <td>
          ${
            job
              ? job.status === "completed"
                ? '<span style="color: #27ae60;">COMPLETED</span>'
                : job.status === "processing"
                ? '<span style="color: #f39c12;">PROCESSING</span>'
                : '<span style="color: #e74c3c;">FAILED</span>'
              : "-"
          }
        </td>
        <td>${formatFileSize(file.size)}</td>
        <td>${formatDate(file.uploaded_at || file.created_at)}</td>
        <td>
          ${
            job && job.status === "completed"
              ? `<div style="display: flex; gap: 5px;">
                   <button class="btn" style="font-size: 12px; padding: 4px 8px;" onclick="downloadFileSecure('${
                     job.result?.outputFile || `processed_${job.id}.jpg`
                   }')">Download</button>
                   <button class="btn" style="font-size: 12px; padding: 4px 8px;" onclick="shareProcessedImage(${
                     job.id
                   })">Share</button>
                 </div>`
              : "-"
          }
                   <div style="margin-top: 5px;">
             <button class="btn" style="font-size: 12px; padding: 4px 8px; background: #000; color: white; border-color: #000;" onclick="deleteFile('${
               file.filename
             }')">Delete</button>
            </div>
        </td>
      `;
      filesTbody.appendChild(row);
    });

    updatePagination(inputOnly.length);
    window.updateBatchControls();
  }

  // Authenticated download helper using pre-signed URLs
  window.downloadFileSecure = async function (filename) {
    try {
      if (!window.validateDownload || !window.validateDownload(filename)) {
        return;
      }

      // Step 1: Get pre-signed download URL from our server
      const presignedResponse = await fetch("/files/presigned-download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          filename: filename,
        }),
      });

      const presignedResult = await presignedResponse.json();

      if (!presignedResult.success) {
        throw new Error(
          presignedResult.error || "Failed to get pre-signed download URL"
        );
      }

      // Step 2: Download directly from S3 using pre-signed URL
      const s3Response = await fetch(presignedResult.data.presignedUrl);

      if (!s3Response.ok) {
        throw new Error(`S3 download failed: ${s3Response.statusText}`);
      }

      // Step 3: Create download link and trigger download
      const blob = await s3Response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showAlert(`File "${filename}" downloaded successfully!`, "success");
    } catch (error) {
      console.error("Download error:", error);
      showAlert(`Download failed: ${error.message}`, "danger");
    }
  };

  // Sort files based on current sort criteria
  function sortFiles(files, sortConfig) {
    return [...files].sort((a, b) => {
      let aValue, bValue;

      switch (sortConfig.field) {
        case "filename":
          aValue = a.filename;
          bValue = b.filename;
          break;
        case "status":
          // Get jobs from the current context
          const allJobs = window.currentJobs || [];
          const jobsMap = new Map();
          allJobs.forEach((job) => {
            jobsMap.set(job.file_id, job);
          });
          const jobA = jobsMap.get(a.filename);
          const jobB = jobsMap.get(b.filename);
          aValue = jobA ? jobA.status : "no-job";
          bValue = jobB ? jobB.status : "no-job";
          break;
        case "size":
          aValue = a.size;
          bValue = b.size;
          break;
        case "date":
          // Handle date sorting with fallback
          const dateA = a.uploaded_at || a.created_at;
          const dateB = b.uploaded_at || b.created_at;

          if (!dateA && !dateB) return 0;
          if (!dateA) return 1; // A goes to end
          if (!dateB) return -1; // B goes to end

          aValue = new Date(dateA);
          bValue = new Date(dateB);

          // Handle invalid dates
          if (isNaN(aValue.getTime()) && isNaN(bValue.getTime())) return 0;
          if (isNaN(aValue.getTime())) return 1; // Invalid date goes to end
          if (isNaN(bValue.getTime())) return -1; // Invalid date goes to end

          // For date sorting, we want newest first by default (desc)
          // So we reverse the comparison for desc direction
          if (sortConfig.direction === "desc") {
            return bValue.getTime() - aValue.getTime();
          } else {
            return aValue.getTime() - bValue.getTime();
          }
        default:
          return 0;
      }

      // Handle string comparison
      if (typeof aValue === "string" && typeof bValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      // Compare values
      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }

  function updatePagination(totalItems) {
    const pagination = document.getElementById("pagination");
    const paginationInfo = document.getElementById("pagination-info");
    pagination.innerHTML = "";

    // Update pagination info
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalItems} files (${itemsPerPage} per page)`;

    if (totalItems <= itemsPerPage) return;

    // Calculate total pages
    totalPages = Math.ceil(totalItems / itemsPerPage);

    // Previous button
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "←";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        window.loadFiles(currentPage - 1);
      }
    };
    pagination.appendChild(prevBtn);

    // Page numbers
    const maxVisiblePages = 5;
    const startPage = Math.max(
      1,
      currentPage - Math.floor(maxVisiblePages / 2)
    );
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement("button");
      pageBtn.textContent = i;
      pageBtn.className = i === currentPage ? "active" : "";
      pageBtn.onclick = () => window.loadFiles(i);
      pagination.appendChild(pageBtn);
    }

    // Next button
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "→";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
      if (currentPage < totalPages) {
        window.loadFiles(currentPage + 1);
      }
    };
    pagination.appendChild(nextBtn);
  }

  window.selectFileForProcessing = function (filename) {
    console.log("selectFileForProcessing called with filename:", filename);

    if (!window.currentUser) {
      alert("Please login first to process images.");
      return;
    }

    console.log("Setting currentFileId to:", filename);
    window.setCurrentFileId(filename);
    console.log("currentFileId after setting:", window.currentFileId);

    document.getElementById("processing-options").classList.remove("hidden");
  };

  // Download validation function
  window.validateDownload = function (filename) {
    console.log("Attempting to download:", filename);

    // Check if filename looks valid
    if (!filename || filename.includes(".json")) {
      console.error("Invalid filename for download:", filename);
      showAlert("Invalid file for download", "danger");
      return false;
    }

    return true;
  };

  // Initialize batch processing functionality
  function initBatchProcessing() {
    const selectAllCheckbox = document.getElementById("select-all");
    const processSelectedBtn = document.getElementById("process-selected");
    const clearSelectionBtn = document.getElementById("clear-selection");
    const refreshFilesBtn = document.getElementById("refresh-files");

    // Select all functionality
    selectAllCheckbox.addEventListener("change", handleSelectAll);

    // Process selected files
    processSelectedBtn.addEventListener("click", processSelectedFiles);

    // Clear selection
    clearSelectionBtn.addEventListener("click", clearSelection);

    // Refresh files
    refreshFilesBtn.addEventListener("click", handleRefreshFiles);

    // Handle individual file checkboxes
    document.addEventListener("change", (e) => {
      if (e.target.classList.contains("file-checkbox")) {
        handleFileCheckboxChange(e.target);
      }
    });
  }

  // Handle select all checkbox
  function handleSelectAll(e) {
    const checkboxes = document.querySelectorAll(".file-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.checked = e.target.checked;
      if (e.target.checked) {
        window.selectedFiles.add(checkbox.dataset.filename);
      } else {
        window.selectedFiles.delete(checkbox.dataset.filename);
      }
    });
    window.updateSelectAllState();
    window.updateBatchControls();
  }

  // Handle individual file checkbox changes
  function handleFileCheckboxChange(checkbox) {
    if (checkbox.checked) {
      window.selectedFiles.add(checkbox.dataset.filename);
    } else {
      window.selectedFiles.delete(checkbox.dataset.filename);
    }
    window.updateSelectAllState();
    window.updateBatchControls();
  }

  // Process selected files using batch processing options
  async function processSelectedFiles() {
    if (!window.currentUser) {
      alert("Please login first to process images.");
      return;
    }

    if (window.selectedFiles.size === 0) {
      alert("Please select files to process.");
      return;
    }

    // Get processing options from the batch controls
    const width = parseInt(document.getElementById("batch-width").value) || 800;
    const height =
      parseInt(document.getElementById("batch-height").value) || 600;
    const quality =
      parseInt(document.getElementById("batch-quality").value) || 80;
    const format = document.getElementById("batch-format").value || "jpeg";

    const params = {
      width,
      height,
      quality,
      format,
    };

    try {
      const response = await fetch("/jobs/batch-process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          fileIds: Array.from(window.selectedFiles),
          params,
        }),
      });

      const result = await response.json();

      if (result.success) {
        showAlert(
          `Batch processing initiated for ${result.data.successful} files`,
          "success"
        );
        clearSelection();
        // Refresh the file list and credits to show updated status
        setTimeout(() => {
          window.loadFiles(1);
          if (window.refreshCreditsAfterOperation) {
            window.refreshCreditsAfterOperation();
          }
        }, 2000); // Increased delay to ensure processing is complete
      } else {
        showAlert(result.error || "Failed to process files", "danger");
      }
    } catch (error) {
      console.error("Batch processing error:", error);
      showAlert("Failed to process files", "danger");
    }
  }

  // Clear all selections
  function clearSelection() {
    window.selectedFiles.clear();
    const checkboxes = document.querySelectorAll(".file-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    document.getElementById("select-all").checked = false;
    window.updateBatchControls();
  }

  // Handle refresh files button
  async function handleRefreshFiles() {
    const refreshBtn = document.getElementById("refresh-files");
    const originalText = refreshBtn.textContent;

    // Show loading state
    refreshBtn.textContent = "Refreshing...";
    refreshBtn.disabled = true;

    try {
      await window.loadFiles(1);
    } catch (error) {
      console.error("Refresh error:", error);
      showAlert("Failed to refresh files", "danger");
    } finally {
      // Restore button state
      refreshBtn.textContent = originalText;
      refreshBtn.disabled = false;
    }
  }

  // Initialize selected files set
  window.selectedFiles = new Set();

  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i)) + " " + sizes[i];
  }

  // Format date safely
  function formatDate(dateValue) {
    if (!dateValue) return "Unknown";

    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return date.toLocaleDateString();
    } catch (error) {
      console.warn("Date formatting error:", error, "for value:", dateValue);
      return "Invalid Date";
    }
  }

  // Delete file and all related data
  window.deleteFile = async function (filename) {
    if (!window.currentUser) {
      showAlert("Please login first to delete files", "danger");
      return;
    }

    // Confirm deletion
    if (
      !confirm(
        `Are you sure you want to delete "${filename}" and all related data?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/files/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showAlert(
          `File "${filename}" and all related data deleted successfully!`,
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
        showAlert(data.error || "Failed to delete file", "danger");
      }
    } catch (error) {
      console.error("Delete file error:", error);
      showAlert("Failed to delete file", "danger");
    }
  };
}
