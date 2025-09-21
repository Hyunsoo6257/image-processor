// Simple in-memory credit store used when the database is unavailable
// Not persisted across restarts; intended only for local/dev fallback

type UserRole = "admin" | "user";

const inMemoryCredits: Map<
  string,
  { credits: number; lastUpdated: Date; role: UserRole }
> = new Map();

// Initialize default users
function initializeDefaultUsers(): void {
  if (inMemoryCredits.size === 0) {
    // Admin user with unlimited credits
    inMemoryCredits.set("admin", {
      credits: 999999,
      lastUpdated: new Date(),
      role: "admin",
    });

    // Regular user with 10 credits
    inMemoryCredits.set("user1", {
      credits: 10,
      lastUpdated: new Date(),
      role: "user",
    });
  }
}

function getDefaultCredits(role: UserRole): number {
  return role === "admin" ? 999999 : 10;
}

function ensureUser(username: string, role: UserRole): void {
  if (!inMemoryCredits.has(username)) {
    inMemoryCredits.set(username, {
      credits: getDefaultCredits(role),
      lastUpdated: new Date(),
      role: role,
    });
  }
}

export function getCreditsFallback(
  username: string,
  role: UserRole
): { username: string; credits: number; lastUpdated: Date } {
  initializeDefaultUsers();
  ensureUser(username, role);
  const entry = inMemoryCredits.get(username)!;
  return { username, credits: entry.credits, lastUpdated: entry.lastUpdated };
}

export function deductCreditsFallback(
  username: string,
  role: UserRole,
  amount: number
): boolean {
  initializeDefaultUsers();
  ensureUser(username, role);
  const entry = inMemoryCredits.get(username)!;

  // Admin users have unlimited credits
  if (entry.role === "admin") {
    return true;
  }

  // Check if user has enough credits
  if (entry.credits < amount) {
    return false;
  }

  entry.credits -= amount;
  entry.lastUpdated = new Date();
  return true;
}

export function refundCreditsFallback(
  username: string,
  role: UserRole,
  amount: number
): void {
  initializeDefaultUsers();
  ensureUser(username, role);
  const entry = inMemoryCredits.get(username)!;

  // Don't refund admin users (they have unlimited credits)
  if (entry.role === "admin") {
    return;
  }

  entry.credits += amount;
  entry.lastUpdated = new Date();
}

export function grantCreditsFallback(username: string, amount: number): void {
  initializeDefaultUsers();
  // When role unknown, assume non-admin default if user not initialized
  ensureUser(username, "user");
  const entry = inMemoryCredits.get(username)!;

  // Don't grant credits to admin users (they have unlimited credits)
  if (entry.role === "admin") {
    return;
  }

  entry.credits += amount;
  entry.lastUpdated = new Date();
}

export function listAllUsersCreditsFallback(): Array<{
  username: string;
  credits: number;
  lastUpdated: Date;
  totalTransactions: number;
}> {
  initializeDefaultUsers();
  return Array.from(inMemoryCredits.entries()).map(([username, v]) => ({
    username,
    credits: v.credits,
    lastUpdated: v.lastUpdated,
    totalTransactions: 0,
  }));
}

// Get user role from memory
export function getUserRoleFallback(username: string): UserRole | null {
  initializeDefaultUsers();
  const entry = inMemoryCredits.get(username);
  return entry ? entry.role : null;
}

// Check if user has enough credits
export function hasEnoughCreditsFallback(
  username: string,
  requiredAmount: number
): boolean {
  initializeDefaultUsers();
  const entry = inMemoryCredits.get(username);
  if (!entry) return false;

  // Admin users always have enough credits
  if (entry.role === "admin") return true;

  return entry.credits >= requiredAmount;
}
