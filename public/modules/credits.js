// Credits System Module
export function initCredits(currentUser, showAlert) {
  // Event listeners
  const refreshUsersBtn = document.getElementById("refresh-users");
  const grantCreditsBtn = document.getElementById("grant-credits-btn");

  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", window.loadAllUsers);
  }

  if (grantCreditsBtn) {
    grantCreditsBtn.addEventListener("click", window.grantCredits);
  }

  // Credit system functions
  window.loadUserCredits = async function () {
    return await loadUserCreditsInternal();
  };

  async function loadUserCreditsInternal() {
    let success = false;
    let credits = 0;

    try {
      const response = await fetch("/credits/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();

      success = response.ok && !!data.success;
      if (success) {
        credits = Number(data.data?.credits || 0);
        const creditsElement = document.getElementById("user-credits");
        if (creditsElement) {
          creditsElement.textContent = String(credits);
        }
      } else {
        console.warn("Failed to load user credits:", data.error);
        // Set default credits when API fails
        const creditsElement = document.getElementById("user-credits");
        if (creditsElement) {
          creditsElement.textContent =
            window.currentUser?.role === "admin" ? "999999" : "10";
        }
        credits = window.currentUser?.role === "admin" ? 999999 : 10;
      }
    } catch (error) {
      console.warn("Error loading user credits:", error);
      // Set default credits when network fails
      const creditsElement = document.getElementById("user-credits");
      if (creditsElement) {
        creditsElement.textContent =
          window.currentUser?.role === "admin" ? "999999" : "10";
      }
      credits = window.currentUser?.role === "admin" ? 999999 : 10;
    }

    return {
      success,
      credits,
    };
  }

  window.loadAllUsers = async function () {
    if (!window.currentUser || window.currentUser.role !== "admin") {
      showAlert("Admin access required", "danger");
      return;
    }

    const usersLoading = document.getElementById("users-loading");
    const usersTbody = document.getElementById("users-tbody");

    try {
      usersLoading.classList.remove("hidden");

      const response = await fetch("/credits/users", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        displayUsers(data.data);
      } else {
        showAlert("Failed to load users", "danger");
      }
    } catch (error) {
      console.warn("Error loading users:", error);
      // Show default users when API fails
      displayUsers([
        {
          username: "admin",
          credits: 999999,
          lastUpdated: new Date(),
          totalTransactions: 0,
        },
        {
          username: "user1",
          credits: 0,
          lastUpdated: new Date(),
          totalTransactions: 0,
        },
      ]);
    } finally {
      usersLoading.classList.add("hidden");
    }
  };

  function displayUsers(users) {
    const usersTbody = document.getElementById("users-tbody");
    usersTbody.innerHTML = "";

    if (users.length === 0) {
      usersTbody.innerHTML =
        '<tr><td colspan="5" style="text-align: center;">No users found</td></tr>';
      return;
    }

    users.forEach((user) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.username}</td>
        <td>${user.credits}</td>
        <td>${new Date(user.lastUpdated).toLocaleString()}</td>
        <td>${user.totalTransactions}</td>
        <td>
          <button class="btn" onclick="viewUserTransactions('${
            user.username
          }')" style="font-size: 12px; padding: 4px 8px;">
            View History
          </button>
        </td>
      `;
      usersTbody.appendChild(row);
    });
  }

  window.viewUserTransactions = async function (username) {
    try {
      const response = await fetch(`/credits/transactions/${username}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        displayTransactionHistory(data.data, username);
      } else {
        showAlert("Failed to load transaction history", "danger");
      }
    } catch (error) {
      console.warn("Error loading transactions:", error);
      showAlert("Failed to load transaction history", "danger");
    }
  };

  function displayTransactionHistory(transactions, username) {
    const modalContent = `
      <h3>Transaction History for ${username}</h3>
      <div style="max-height: 300px; overflow-y: auto;">
        ${
          transactions.length === 0
            ? "<p>No transactions found</p>"
            : `<table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Credits</th>
                    <th>Job ID</th>
                    <th>Description</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${transactions
                    .map(
                      (t) => `
                    <tr>
                      <td>${t.transactionType}</td>
                      <td>${t.creditsUsed}</td>
                      <td>${t.jobId || "-"}</td>
                      <td>${t.description}</td>
                      <td>${new Date(t.createdAt).toLocaleString()}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>`
        }
      </div>
    `;

    showModal("Transaction History", modalContent);
  }

  window.grantCredits = async function () {
    if (!window.currentUser || window.currentUser.role !== "admin") {
      showAlert("Admin access required", "danger");
      return;
    }

    const username = document.getElementById("grant-username").value;
    const amount = parseInt(document.getElementById("grant-amount").value);

    if (!username || !amount || amount <= 0) {
      showAlert("Please enter a valid username and positive amount", "danger");
      return;
    }

    try {
      const response = await fetch("/credits/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ username, creditsToGrant: amount }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showAlert(data.message, "success");
        // Clear form
        document.getElementById("grant-username").value = "";
        document.getElementById("grant-amount").value = "";
        // Refresh users list
        window.loadAllUsers();
      } else {
        showAlert(data.error || "Failed to grant credits", "danger");
      }
    } catch (error) {
      console.error("Grant credits error:", error);
      showAlert("Failed to grant credits", "danger");
    }
  };

  // Refresh credits after operations
  window.refreshCreditsAfterOperation = async function () {
    try {
      const result = await loadUserCreditsInternal();
      if (result.success) {
        const creditsElement = document.getElementById("user-credits");
        if (creditsElement) {
          creditsElement.textContent = result.credits;
        }
      }
    } catch (error) {
      console.warn("Failed to refresh credits:", error);
    }
  };

  function showModal(title, content) {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h2>${title}</h2>
          <button onclick="this.closest('.modal').remove()" style="
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
          ">&times;</button>
        </div>
        ${content}
      </div>
    `;

    modal.className = "modal";
    document.body.appendChild(modal);
  }
}
