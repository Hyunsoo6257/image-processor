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
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Check if MFA is required
        if (data.challengeName === "SOFTWARE_TOKEN_MFA") {
          // Store session for MFA challenge
          window.mfaSession = data.session;
          window.mfaUsername = email;

          // Show MFA login modal
          showMfaLoginModal();
          showAlert("Please enter your MFA code", "info");
          return;
        }

        // Check if MFA setup is required
        if (data.challengeName === "MFA_SETUP_REQUIRED") {
          // For now, skip MFA setup and complete login
          // MFA setup will be available in user settings after login
          showAlert(
            "MFA setup is required but will be available after login",
            "info"
          );

          // Complete login without MFA for now
          localStorage.setItem("token", "temp-token");
          window.currentUser = { username: email, id: email };

          // Import and call updateUI from app.js
          const { updateUI } = await import("../app.js");
          updateUI();

          // Load initial data
          window.loadUserCredits && window.loadUserCredits();
          window.loadFiles && window.loadFiles(1);

          showAlert(
            "Logged in successfully. Please setup MFA in settings.",
            "success"
          );
          return;
        }

        // Check if new password is required
        if (data.challengeName === "NEW_PASSWORD_REQUIRED") {
          // Store session for new password challenge
          window.newPasswordSession = data.session;
          window.newPasswordUsername = email;

          // Show new password modal
          showNewPasswordModal();
          showAlert("Please set a new password", "info");
          return;
        }

        // Regular login success
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
        showAlert(data.error || "Login failed", "danger");
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

  // Register handler
  async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    const name = document.getElementById("register-name").value;

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.requiresConfirmation) {
          // Show email verification modal
          showEmailVerificationModal(email);
          hideRegisterModal();
          showAlert(
            "Registration successful! Please check your email for verification code.",
            "success"
          );
        } else {
          showAlert("Registration successful! Please login.", "success");
          hideRegisterModal();
        }
        // Clear form
        document.getElementById("register-form").reset();
      } else {
        showAlert(data.error || "Registration failed", "danger");
      }
    } catch (error) {
      showAlert("Registration error: " + error.message, "danger");
    }
  }

  // Email verification handler
  async function handleEmailVerification() {
    const email = document.getElementById("verification-email").value;
    const confirmationCode = document.getElementById("verification-code").value;

    if (!email || !confirmationCode) {
      showAlert("Please enter both email and verification code", "danger");
      return;
    }

    if (confirmationCode.length !== 6) {
      showAlert("Please enter a valid 6-digit verification code", "danger");
      return;
    }

    try {
      const response = await fetch("/auth/confirm-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, confirmationCode }),
      });

      const data = await response.json();

      if (response.ok) {
        hideEmailVerificationModal();
        showAlert(
          "Email verification successful! You can now login.",
          "success"
        );
        // Clear form
        document.getElementById("verification-code").value = "";
      } else {
        showAlert(data.error || "Email verification failed", "danger");
      }
    } catch (error) {
      showAlert("Email verification error: " + error.message, "danger");
    }
  }

  // Google login handler
  async function handleGoogleLogin() {
    try {
      const response = await fetch("/auth/google-auth-url");
      const data = await response.json();

      if (data.success) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        showAlert("Failed to initiate Google login", "danger");
      }
    } catch (error) {
      showAlert("Google login error: " + error.message, "danger");
    }
  }

  // MFA login handler
  async function handleMfaLogin() {
    const userCode = document.getElementById("mfa-login-code").value;

    if (!userCode || userCode.length !== 6) {
      showAlert("Please enter a valid 6-digit code", "danger");
      return;
    }

    try {
      const response = await fetch("/auth/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: window.mfaSession,
          userCode: userCode,
          username: window.mfaUsername,
        }),
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

        hideMfaLoginModal();
        showAlert("MFA authentication successful!", "success");
      } else {
        showAlert(data.error || "Invalid MFA code", "danger");
      }
    } catch (error) {
      showAlert("MFA verification error: " + error.message, "danger");
    }
  }

  // Generate MFA QR Code function
  function generateMfaQrCode(secretCode, username) {
    const qrCodeElement = document.getElementById("mfa-qr-code");

    if (!qrCodeElement) {
      console.error("QR code element not found");
      return;
    }

    // Create TOTP URI for authenticator apps
    const totpUri = `otpauth://totp/ImageProcessor:${
      username || "user"
    }?secret=${secretCode}&issuer=ImageProcessor`;

    // Clear previous content
    qrCodeElement.innerHTML = "";

    // Create a canvas element
    const canvas = document.createElement("canvas");
    qrCodeElement.appendChild(canvas);

    // Generate QR code on the canvas
    QRCode.toCanvas(
      canvas,
      totpUri,
      {
        width: 200,
        height: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      },
      function (error) {
        if (error) {
          console.error("QR Code generation error:", error);
          qrCodeElement.innerHTML = `
            <div style="text-align: center; padding: 20px;">
              <div style="font-size: 12px; margin-bottom: 10px;">QR Code Generation Failed</div>
              <div style="font-size: 10px; color: #666;">Secret: ${secretCode}</div>
              <div style="font-size: 10px; color: #666; margin-top: 5px;">Add this to your authenticator app</div>
            </div>
          `;
        } else {
          console.log("QR Code generated successfully");
        }
      }
    );
  }

  // MFA setup handler
  async function handleMfaSetup() {
    try {
      const response = await fetch("/auth/mfa/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        // Generate QR code using the new function
        generateMfaQrCode(
          data.secretCode,
          window.currentUser?.username || "user"
        );

        showMfaSetupModal();
        showAlert(
          "MFA setup initiated. Scan the QR code with your authenticator app.",
          "info"
        );
      } else {
        showAlert("Failed to setup MFA", "danger");
      }
    } catch (error) {
      showAlert("MFA setup error: " + error.message, "danger");
    }
  }

  // MFA verification handler
  async function handleMfaVerification() {
    const userCode = document.getElementById("mfa-verification-code").value;

    if (!userCode || userCode.length !== 6) {
      showAlert("Please enter a valid 6-digit code", "danger");
      return;
    }

    try {
      const response = await fetch("/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userCode,
          session: window.mfaSetupSession,
          username: window.mfaSetupUsername,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Store token and user info
        localStorage.setItem("token", data.token);
        window.currentUser = data.user;

        // Import and call updateUI from app.js
        const { updateUI } = await import("../app.js");
        updateUI();

        // Load initial data
        window.loadUserCredits && window.loadUserCredits();
        window.loadFiles && window.loadFiles(1);

        hideMfaSetupModal();
        showAlert(
          "MFA enabled successfully! You are now logged in.",
          "success"
        );

        // Clear stored session data
        window.mfaSetupSession = null;
        window.mfaSetupUsername = null;
      } else {
        showAlert("Invalid verification code", "danger");
      }
    } catch (error) {
      showAlert("MFA verification error: " + error.message, "danger");
    }
  }

  // Modal functions
  function showRegisterModal() {
    document.getElementById("register-modal").classList.remove("hidden");
  }

  function hideRegisterModal() {
    document.getElementById("register-modal").classList.add("hidden");
  }

  function showEmailVerificationModal(email) {
    document.getElementById("verification-email").value = email;
    document
      .getElementById("email-verification-modal")
      .classList.remove("hidden");
  }

  function hideEmailVerificationModal() {
    document.getElementById("email-verification-modal").classList.add("hidden");
  }

  function showMfaSetupModal() {
    document.getElementById("mfa-setup-modal").classList.remove("hidden");

    // Generate QR code when modal opens
    if (window.mfaSetupSession && window.mfaSetupUsername) {
      // Call the MFA setup endpoint to get the secret code
      fetch("/auth/mfa/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: window.mfaSetupSession,
          username: window.mfaSetupUsername,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            // Store the new session for verification
            if (data.session) {
              window.mfaSetupSession = data.session;
            }
            generateMfaQrCode(data.secretCode, window.mfaSetupUsername);
          } else {
            console.error("Failed to get MFA secret:", data.error);
          }
        })
        .catch((error) => {
          console.error("Error getting MFA secret:", error);
        });
    }
  }

  function hideMfaSetupModal() {
    document.getElementById("mfa-setup-modal").classList.add("hidden");
  }

  function showMfaLoginModal() {
    document.getElementById("mfa-login-modal").classList.remove("hidden");
  }

  function hideMfaLoginModal() {
    document.getElementById("mfa-login-modal").classList.add("hidden");
  }

  // Event listeners for new buttons
  const registerBtn = document.getElementById("register-btn");
  const googleLoginBtn = document.getElementById("google-login-btn");
  const registerForm = document.getElementById("register-form");
  const mfaLoginBtn = document.getElementById("mfa-login-btn");
  const verifyMfaBtn = document.getElementById("verify-mfa-btn");
  const verifyEmailBtn = document.getElementById("verify-email-btn");

  if (registerBtn) {
    registerBtn.addEventListener("click", showRegisterModal);
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", handleGoogleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }

  if (mfaLoginBtn) {
    mfaLoginBtn.addEventListener("click", handleMfaLogin);
  }

  if (verifyMfaBtn) {
    verifyMfaBtn.addEventListener("click", handleMfaVerification);
  }

  if (verifyEmailBtn) {
    verifyEmailBtn.addEventListener("click", handleEmailVerification);
  }

  // MFA setup button
  const setupMfaBtn = document.getElementById("mfa-setup-btn");
  if (setupMfaBtn) {
    setupMfaBtn.addEventListener("click", handleMfaSetup);
  }

  // Modal close handlers
  document
    .getElementById("close-register-modal")
    ?.addEventListener("click", hideRegisterModal);
  document
    .getElementById("cancel-register")
    ?.addEventListener("click", hideRegisterModal);
  document
    .getElementById("close-email-verification-modal")
    ?.addEventListener("click", hideEmailVerificationModal);
  document
    .getElementById("cancel-email-verification")
    ?.addEventListener("click", hideEmailVerificationModal);
  document
    .getElementById("close-mfa-setup-modal")
    ?.addEventListener("click", hideMfaSetupModal);
  document
    .getElementById("cancel-mfa-setup")
    ?.addEventListener("click", hideMfaSetupModal);
  document
    .getElementById("close-mfa-login-modal")
    ?.addEventListener("click", hideMfaLoginModal);
  document
    .getElementById("cancel-mfa-login")
    ?.addEventListener("click", hideMfaLoginModal);

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

  // Export MFA setup function for use in other modules
  window.setupMfa = handleMfaSetup;

  // New password challenge functions
  function showNewPasswordModal() {
    const modal = document.getElementById("new-password-modal");
    if (modal) {
      modal.style.display = "block";
    }
  }

  function hideNewPasswordModal() {
    const modal = document.getElementById("new-password-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  async function handleNewPassword() {
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById(
      "confirm-new-password"
    ).value;

    if (!newPassword || !confirmPassword) {
      showAlert("Please fill in all fields", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert("Passwords do not match", "error");
      return;
    }

    if (newPassword.length < 8) {
      showAlert("Password must be at least 8 characters long", "error");
      return;
    }

    try {
      const response = await fetch("/auth/new-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: window.newPasswordSession,
          newPassword: newPassword,
          username: window.newPasswordUsername,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Password updated successfully
        localStorage.setItem("token", data.token);
        window.currentUser = data.user;

        // Import and call updateUI from app.js
        const { updateUI } = await import("../app.js");
        updateUI();

        hideNewPasswordModal();
        showAlert(
          "Password updated successfully! You are now logged in.",
          "success"
        );

        // Clear stored session data
        window.newPasswordSession = null;
        window.newPasswordUsername = null;
      } else {
        showAlert(data.error || "Failed to update password", "error");
      }
    } catch (error) {
      console.error("New password error:", error);
      showAlert("An error occurred while updating password", "error");
    }
  }

  // Add event listeners for new password modal
  const newPasswordBtn = document.getElementById("set-new-password-btn");
  if (newPasswordBtn) {
    newPasswordBtn.addEventListener("click", handleNewPassword);
  }

  document
    .getElementById("close-new-password-modal")
    ?.addEventListener("click", hideNewPasswordModal);
  document
    .getElementById("cancel-new-password")
    ?.addEventListener("click", hideNewPasswordModal);
}
