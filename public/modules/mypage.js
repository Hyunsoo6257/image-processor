// My Page Module
import { showAlert } from "./utils.js";

// App State
let currentUser = null;

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  // Check authentication status first
  checkAuthStatus();
});

// Update UI based on authentication status
function updateUI() {
  if (currentUser) {
    // Update user info in header
    const currentUserElement = document.getElementById("current-user");
    if (currentUserElement) {
      currentUserElement.textContent = `Welcome, ${currentUser.username} (${currentUser.role})`;
    }

    // Update user info in main section
    const usernameElement = document.getElementById("username");
    const userRoleElement = document.getElementById("user-role");
    const userInfoElement = document.getElementById("user-info");
    const memberSinceElement = document.getElementById("member-since");

    if (usernameElement) usernameElement.textContent = currentUser.username;
    if (userRoleElement) userRoleElement.textContent = currentUser.role;
    if (userInfoElement) userInfoElement.classList.remove("hidden");
    if (memberSinceElement)
      memberSinceElement.textContent = new Date().toLocaleDateString();

    // Show/hide admin panel
    const adminPanel = document.getElementById("admin-panel");
    if (currentUser.role === "admin") {
      if (adminPanel) {
        adminPanel.classList.remove("hidden");
      }
      // Load admin data
      loadAllUsers();
    } else {
      if (adminPanel) {
        adminPanel.classList.add("hidden");
      }
    }

    // Load user credits
    loadUserCredits();

    // Setup logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }

    // Setup MFA button
    const mfaSetupBtn = document.getElementById("mfa-setup-btn");
    if (mfaSetupBtn) {
      mfaSetupBtn.addEventListener("click", () => {
        if (window.setupMfa) {
          window.setupMfa();
        } else {
          showAlert("MFA setup not available", "warning");
        }
      });
    }
  } else {
    // Redirect to login page if not authenticated
    window.location.href = "index.html";
  }
}

// Check authentication status on page load
async function checkAuthStatus() {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      console.log("No token found, redirecting to login");
      window.location.href = "index.html";
      return;
    }

    const response = await fetch("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    if (response.ok && data.user) {
      currentUser = data.user;
      console.log("Auto-login successful for:", currentUser.username);
      updateUI();
    } else {
      console.log("Invalid token, redirecting to login");
      localStorage.removeItem("token");
      window.location.href = "index.html";
    }
  } catch (error) {
    console.error("Auth check error:", error);
    // Don't redirect on network errors, just show error
    showAlert("Connection error. Please try again.", "danger");
  }
}

// Logout handler
function handleLogout() {
  localStorage.removeItem("token");
  window.location.href = "index.html";
}

// Load user credits
async function loadUserCredits() {
  try {
    const response = await fetch("/credits/me", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    if (response.ok) {
      const data = await response.json();
      const creditsElement = document.getElementById("user-credits");
      if (creditsElement) {
        creditsElement.textContent = data.data.credits;
      }
    } else {
      console.warn("Failed to load user credits");
      const creditsElement = document.getElementById("user-credits");
      if (creditsElement) {
        // Show default credits based on user role
        const defaultCredits =
          currentUser && currentUser.role === "admin" ? "999999" : "10";
        creditsElement.textContent = defaultCredits;
      }
    }
  } catch (error) {
    console.error("Error loading user credits:", error);
    const creditsElement = document.getElementById("user-credits");
    if (creditsElement) {
      // Show default credits based on user role
      const defaultCredits =
        currentUser && currentUser.role === "admin" ? "999999" : "10";
      creditsElement.textContent = defaultCredits;
    }
  }
}

// Load all users (admin only)
async function loadAllUsers() {
  const usersLoading = document.getElementById("users-loading");
  const usersList = document.getElementById("users-list");
  const usersTbody = document.getElementById("users-tbody");
  const refreshUsersBtn = document.getElementById("refresh-users");
  const grantCreditsBtn = document.getElementById("grant-credits-btn");

  if (usersLoading) usersLoading.classList.remove("hidden");
  if (usersList) usersList.classList.add("hidden");

  try {
    const response = await fetch("/credits/users", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    if (response.ok) {
      const data = await response.json();
      displayUsers(data.data);
    } else {
      console.warn("Failed to load users");
      // Show empty table instead of error
      if (usersTbody) {
        usersTbody.innerHTML =
          '<tr><td colspan="5" style="text-align: center; color: #666;">No users available</td></tr>';
      }
    }
  } catch (error) {
    console.error("Error loading users:", error);
    // Show empty table instead of error
    if (usersTbody) {
      usersTbody.innerHTML =
        '<tr><td colspan="5" style="text-align: center; color: #666;">No users available</td></tr>';
    }
  } finally {
    if (usersLoading) usersLoading.classList.add("hidden");
    if (usersList) usersList.classList.remove("hidden");
  }

  // Setup refresh button
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", loadAllUsers);
  }

  // Setup grant credits button
  if (grantCreditsBtn) {
    grantCreditsBtn.addEventListener("click", handleGrantCredits);
  }
}

// Handle grant credits
async function handleGrantCredits() {
  const username = document.getElementById("grant-username").value.trim();
  const amount = parseInt(document.getElementById("grant-amount").value);

  if (!username) {
    showAlert("Please enter a username", "warning");
    return;
  }

  if (!amount || amount <= 0) {
    showAlert("Please enter a valid amount", "warning");
    return;
  }

  try {
    const response = await fetch("/credits/grant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        username: username,
        creditsToGrant: amount,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      showAlert(
        `Successfully granted ${amount} credits to ${username}`,
        "success"
      );
      // Clear form
      document.getElementById("grant-username").value = "";
      document.getElementById("grant-amount").value = "";
      // Refresh users list
      loadAllUsers();
    } else {
      showAlert(data.message || "Failed to grant credits", "danger");
    }
  } catch (error) {
    console.error("Error granting credits:", error);
    showAlert("Error granting credits", "danger");
  }
}

// Display users in table
function displayUsers(users) {
  const usersTbody = document.getElementById("users-tbody");
  if (!usersTbody) return;

  usersTbody.innerHTML = "";

  users.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.username}</td>
      <td>${user.credits}</td>
      <td>${new Date(user.lastUpdated).toLocaleString()}</td>
      <td>${user.transactionCount || 0}</td>
      <td>
        <button class="btn" onclick="viewUserTransactions('${user.username}')">
          View History
        </button>
      </td>
    `;
    usersTbody.appendChild(row);
  });
}

// View user transactions (global function)
window.viewUserTransactions = async function (username) {
  try {
    const response = await fetch(`/credits/transactions/${username}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    if (response.ok) {
      const data = await response.json();
      const transactions = data.data || [];

      let message = `Transaction history for ${username}:\n\n`;
      if (transactions.length === 0) {
        message += "No transactions found.";
      } else {
        transactions.forEach((tx, index) => {
          message += `${index + 1}. ${tx.type}: ${
            tx.amount
          } credits (${new Date(tx.timestamp).toLocaleString()})\n`;
        });
      }

      alert(message);
    } else {
      showAlert("Failed to load transaction history", "warning");
    }
  } catch (error) {
    console.error("Error loading transactions:", error);
    showAlert("Error loading transaction history", "danger");
  }
};
