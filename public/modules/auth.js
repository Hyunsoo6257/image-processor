// Authentication Module
import { showAlert } from "./utils.js";

export function initAuth() {
  // Event listeners
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("logout-btn");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  // Login handler
  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.token);
        window.currentUser = data.user;

        // Import and call updateUI from app.js
        const { updateUI } = await import("../app.js");
        updateUI();

        // Load initial data
        window.loadUserCredits && window.loadUserCredits();
        window.loadFiles && window.loadFiles(1);

        showAlert("Logged in successfully", "success");
      } else {
        showAlert(data.message || "Login failed", "danger");
      }
    } catch (error) {
      showAlert("Login error: " + error.message, "danger");
    }
  }

  // Logout handler
  function handleLogout() {
    localStorage.removeItem("token");
    window.currentUser = null;

    // Clear file list and selections
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

    // Import and call updateUI from app.js
    import("../app.js").then(({ updateUI }) => {
      updateUI();
    });

    showAlert("Logged out successfully", "success");
  }

  // Auto-login function (exported for use in main app)
  window.autoLogin = async function () {
    const token = localStorage.getItem("token");
    if (!token) return false;

    try {
      const response = await fetch("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (response.ok && data.user) {
        window.currentUser = data.user;

        // Import and call updateUI from app.js
        const { updateUI } = await import("../app.js");
        updateUI();

        // Load initial data
        window.loadUserCredits && window.loadUserCredits();
        window.loadFiles && window.loadFiles(1);

        return true;
      } else {
        // Token is invalid, remove it
        localStorage.removeItem("token");
        return false;
      }
    } catch (error) {
      console.error("Auto-login error:", error);
      localStorage.removeItem("token");
      return false;
    }
  };
}
