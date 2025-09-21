// Utilities Module
export function showAlert(message, type) {
  const alertsContainer = document.getElementById("alerts");
  const alert = document.createElement("div");
  alert.className = `alert alert-${type}`;
  alert.textContent = message;

  alertsContainer.appendChild(alert);

  setTimeout(() => {
    alert.remove();
  }, 5000);
}

export function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
