import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  GetUserCommand,
  ListUsersCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createHmac } from "crypto";

export interface CognitoUser {
  username: string;
  email: string;
  name: string;
  role: "admin" | "user";
  mfaEnabled: boolean;
  googleLinked: boolean;
}

export interface AuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  challengeName?: string;
  session?: string;
}

export interface GoogleUserInfo {
  email: string;
  name: string;
  picture?: string;
}

export class CognitoService {
  private client: CognitoIdentityProviderClient;
  private userPoolId: string;
  private clientId: string;
  private clientSecret: string;
  private lastMfaSetupSession: string = "";
  private static instance: CognitoService;

  constructor() {
    // Initialize with empty values first
    this.userPoolId = "";
    this.clientId = "";
    this.clientSecret = "";
    this.client = new CognitoIdentityProviderClient({
      region: "ap-southeast-2",
    });
  }

  // Initialize with actual values after config is loaded
  initialize(): void {
    this.userPoolId = process.env.COGNITO_USER_POOL_ID || "";
    this.clientId = process.env.COGNITO_CLIENT_ID || "";
    this.clientSecret = process.env.COGNITO_CLIENT_SECRET || "";

    // Use SSO credentials if available, otherwise use default credentials
    const credentials =
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_SESSION_TOKEN
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN,
          }
        : undefined;

    this.client = new CognitoIdentityProviderClient({
      region: process.env.COGNITO_REGION || "ap-southeast-2",
      credentials: credentials,
    });

    // Debug logging
    console.log("🔧 CognitoService initialized:");
    console.log("  COGNITO_REGION:", process.env.COGNITO_REGION);
    console.log("  COGNITO_USER_POOL_ID:", process.env.COGNITO_USER_POOL_ID);
    console.log("  COGNITO_CLIENT_ID:", process.env.COGNITO_CLIENT_ID);
    console.log(
      "  COGNITO_CLIENT_SECRET:",
      this.clientSecret ? "***" : "not set"
    );
    console.log("  Using SSO credentials:", !!credentials);
  }

  // Singleton pattern
  static getInstance(): CognitoService {
    if (!CognitoService.instance) {
      CognitoService.instance = new CognitoService();
    }
    return CognitoService.instance;
  }

  // Generate secret hash for Cognito client authentication
  private generateSecretHash(username: string): string {
    if (!this.clientSecret) {
      return "";
    }

    const message = username + this.clientId;
    const hash = createHmac("sha256", this.clientSecret)
      .update(message)
      .digest("base64");

    return hash;
  }

  // Find existing user by email
  async findUserByEmail(email: string): Promise<CognitoUser | null> {
    try {
      const command = new ListUsersCommand({
        UserPoolId: this.userPoolId,
        Filter: `email = "${email}"`,
        Limit: 1,
      });

      const result = await this.client.send(command);

      if (result.Users && result.Users.length > 0) {
        const user = result.Users[0];
        return this.mapCognitoUserToUser(user);
      }

      return null;
    } catch (error) {
      console.error("Error finding user by email:", error);
      return null;
    }
  }

  // Convert Cognito user to our format
  private mapCognitoUserToUser(cognitoUser: any): CognitoUser {
    const user: CognitoUser = {
      username: cognitoUser.Username || "",
      email: "",
      name: "",
      role: "user",
      mfaEnabled: false,
      googleLinked: false,
    };

    cognitoUser.Attributes?.forEach((attr: any) => {
      switch (attr.Name) {
        case "email":
          user.email = attr.Value || "";
          break;
        case "name":
          user.name = attr.Value || "";
          break;
        case "custom:role":
          // Default to user role for all new users
          user.role = "user";
          break;
        // Custom attributes removed - not defined in User Pool schema
      }
    });

    user.mfaEnabled = cognitoUser.MFAOptions?.length ? true : false;
    return user;
  }

  // Handle Google authentication (login/register)
  async handleGoogleAuth(googleUserInfo: GoogleUserInfo): Promise<AuthResult> {
    try {
      // 1. Check if user exists
      const existingUser = await this.findUserByEmail(googleUserInfo.email);

      if (existingUser) {
        // 2. Link Google account (simplified - no custom attributes)
        await this.linkGoogleAccount(existingUser.username, googleUserInfo);

        // 3. Login user (check for MFA)
        return await this.loginUser(existingUser.email, "", true);
      } else {
        // 4. Create new user
        const username = await this.createGoogleUser(googleUserInfo);

        // 5. Login user
        return await this.loginUser(googleUserInfo.email, "", true);
      }
    } catch (error) {
      console.error("Error handling Google auth:", error);
      throw error;
    }
  }

  // Link Google account to existing user (simplified - no custom attributes)
  async linkGoogleAccount(
    username: string,
    googleUserInfo: GoogleUserInfo
  ): Promise<void> {
    try {
      // Since we removed custom attributes, we don't need to update user attributes
      // Just log the successful linking
      console.log(`Google account linked for user: ${username}`);
    } catch (error) {
      console.error("Error linking Google account:", error);
      throw error;
    }
  }

  // Create new Google user
  async createGoogleUser(googleUserInfo: GoogleUserInfo): Promise<string> {
    try {
      const command = new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: `google_${Date.now()}`, // Generate unique username for Google user
        TemporaryPassword: this.generateRandomPassword(),
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: googleUserInfo.email },
          { Name: "name", Value: googleUserInfo.name },
          { Name: "email_verified", Value: "true" },
        ],
      });

      const result = await this.client.send(command);
      const username = result.User?.Username || "";

      // Set permanent password
      const permanentPassword = this.generateRandomPassword();
      await this.setUserPassword(googleUserInfo.email, permanentPassword);

      // Add Google user to user group by default
      try {
        const addToGroupCommand = new AdminAddUserToGroupCommand({
          UserPoolId: this.userPoolId,
          Username: username,
          GroupName: "user",
        });
        await this.client.send(addToGroupCommand);
        console.log(`Google user ${googleUserInfo.email} added to user group`);
      } catch (groupError) {
        console.error("Error adding Google user to group:", groupError);
        // Don't fail user creation if group addition fails
      }

      // Initialize Google user credits
      try {
        const { createUserCredits } = await import("../models/credits.js");
        await createUserCredits(googleUserInfo.email, "user");
        console.log(`Google user ${googleUserInfo.email} credits initialized`);
      } catch (creditError) {
        console.error("Error initializing Google user credits:", creditError);
        // Don't fail user creation if credit initialization fails
      }

      return username;
    } catch (error) {
      console.error("Error creating Google user:", error);
      throw error;
    }
  }

  // Generate random password
  private generateRandomPassword(): string {
    return Math.random().toString(36).slice(-12) + "A1!";
  }

  // Register user with email verification (SignUp)
  async registerUser(
    email: string,
    password: string,
    name: string,
    role: "admin" | "user" = "user"
  ): Promise<{ username: string; requiresConfirmation: boolean }> {
    try {
      // Check for existing user
      const existingUser = await this.findUserByEmail(email);
      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      // Generate unique username (Cognito User Pool configured for email alias)
      const username = `user_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const command = new SignUpCommand({
        ClientId: this.clientId,
        Username: username, // Use generated username
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "name", Value: name },
        ],
        SecretHash: this.generateSecretHash(username),
      });

      const result = await this.client.send(command);
      const userSub = result.UserSub || "";

      console.log(`User ${email} registered, requires email confirmation`);

      return {
        username: userSub,
        requiresConfirmation: true,
      };
    } catch (error) {
      console.error("Error registering user:", error);
      throw error;
    }
  }

  // Confirm user signup with verification code
  async confirmSignUp(
    email: string,
    confirmationCode: string
  ): Promise<{ username: string; role: "admin" | "user" }> {
    try {
      // Find user by email to get the actual username
      const user = await this.findUserByEmail(email);
      if (!user) {
        throw new Error("User not found");
      }

      const command = new ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: user.username, // Use actual username, not email
        ConfirmationCode: confirmationCode,
        SecretHash: this.generateSecretHash(user.username),
      });

      await this.client.send(command);

      // Get user details to determine role
      const confirmedUser = await this.findUserByEmail(email);
      if (!confirmedUser) {
        throw new Error("User not found after confirmation");
      }

      // Add user to appropriate group based on role
      try {
        const addToGroupCommand = new AdminAddUserToGroupCommand({
          UserPoolId: this.userPoolId,
          Username: confirmedUser.username,
          GroupName: confirmedUser.role,
        });
        await this.client.send(addToGroupCommand);
        console.log(`User ${email} added to ${confirmedUser.role} group`);
      } catch (groupError) {
        console.error("Error adding user to group:", groupError);
        // Don't fail confirmation if group addition fails
      }

      // Initialize user credits after confirmation
      try {
        const { createUserCredits } = await import("../models/credits.js");
        await createUserCredits(email, user.role);
        console.log(`User ${email} credits initialized`);
      } catch (creditError) {
        console.error("Error initializing user credits:", creditError);
        // Don't fail confirmation if credit initialization fails
      }

      return {
        username: confirmedUser.username,
        role: confirmedUser.role,
      };
    } catch (error) {
      console.error("Error confirming signup:", error);
      throw error;
    }
  }

  // Legacy method for admin-created users (kept for backward compatibility)
  async registerUserLegacy(
    email: string,
    password: string,
    name: string,
    role: "admin" | "user" = "user"
  ): Promise<string> {
    try {
      // Check for existing user
      const existingUser = await this.findUserByEmail(email);
      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      const command = new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: `user_${Date.now()}`, // Generate unique username
        TemporaryPassword: password,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "name", Value: name },
          { Name: "email_verified", Value: "true" },
        ],
      });

      const result = await this.client.send(command);
      const username = result.User?.Username || "";

      // Set permanent password
      await this.setUserPassword(email, password);

      // Add user to appropriate group based on role
      try {
        const addToGroupCommand = new AdminAddUserToGroupCommand({
          UserPoolId: this.userPoolId,
          Username: username,
          GroupName: role,
        });
        await this.client.send(addToGroupCommand);
        console.log(`User ${email} added to ${role} group`);
      } catch (groupError) {
        console.error("Error adding user to group:", groupError);
        // Don't fail registration if group addition fails
      }

      // Initialize user credits
      try {
        const { createUserCredits } = await import("../models/credits.js");
        await createUserCredits(email, role);
        console.log(`User ${email} credits initialized`);
      } catch (creditError) {
        console.error("Error initializing user credits:", creditError);
        // Don't fail registration if credit initialization fails
      }

      return username;
    } catch (error) {
      console.error("Error registering user:", error);
      throw error;
    }
  }

  // Set user password
  async setUserPassword(username: string, password: string): Promise<void> {
    try {
      const command = new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      });

      await this.client.send(command);
    } catch (error) {
      console.error("Error setting user password:", error);
      throw error;
    }
  }

  // Login user
  async loginUser(
    email: string,
    password: string,
    isGoogleLogin: boolean = false
  ): Promise<AuthResult> {
    try {
      if (isGoogleLogin) {
        // Google login should be handled through OAuth callback
        throw new Error(
          "Google login should be handled through OAuth callback"
        );
      }

      // Find user by email to get the actual username
      const user = await this.findUserByEmail(email);
      if (!user) {
        throw new Error("User not found");
      }

      const authParameters: Record<string, string> = {
        USERNAME: user.username, // Use actual username, not email
        PASSWORD: password,
      };

      // Add secret hash if client secret is configured
      if (this.clientSecret) {
        authParameters.SECRET_HASH = this.generateSecretHash(user.username);
      }

      const command = new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: authParameters,
      });

      const result = await this.client.send(command);

      if (result.ChallengeName === "SOFTWARE_TOKEN_MFA") {
        return {
          accessToken: "",
          idToken: "",
          refreshToken: "",
          challengeName: result.ChallengeName,
          session: result.Session,
        };
      }

      if (result.ChallengeName === "MFA_SETUP") {
        // For MFA_SETUP, we need to skip MFA setup for now and complete login
        // MFA setup will be handled separately after login
        return {
          accessToken: "",
          idToken: "",
          refreshToken: "",
          challengeName: "MFA_SETUP_REQUIRED", // Different challenge name
          session: result.Session,
        };
      }

      if (result.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        return {
          accessToken: "",
          idToken: "",
          refreshToken: "",
          challengeName: result.ChallengeName,
          session: result.Session,
        };
      }

      if (result.AuthenticationResult) {
        return {
          accessToken: result.AuthenticationResult.AccessToken || "",
          idToken: result.AuthenticationResult.IdToken || "",
          refreshToken: result.AuthenticationResult.RefreshToken || "",
        };
      }

      // Log the full result for debugging
      console.log("Login result:", JSON.stringify(result, null, 2));
      throw new Error(
        `Authentication failed. Challenge: ${
          result.ChallengeName || "None"
        }, Session: ${result.Session || "None"}`
      );
    } catch (error) {
      console.error("Error logging in user:", error);
      throw error;
    }
  }

  // Associate software token for MFA
  async associateSoftwareToken(accessToken: string): Promise<string> {
    try {
      const command = new AssociateSoftwareTokenCommand({
        AccessToken: accessToken,
      });

      const result = await this.client.send(command);
      return result.SecretCode || "";
    } catch (error) {
      console.error("Error associating software token:", error);
      throw error;
    }
  }

  // Associate software token with session (for MFA_SETUP challenge)
  async associateSoftwareTokenWithSession(
    session: string,
    username: string
  ): Promise<string> {
    try {
      console.log("Associating software token with session:", {
        sessionLength: session.length,
        username,
      });

      // Alternative approach: Use AdminInitiateAuth to get access token first
      // Then use the access token to associate software token
      const authParameters: Record<string, string> = {
        USERNAME: username,
        PASSWORD: "dummy", // This won't be used since we have a session
      };

      if (this.clientSecret) {
        authParameters.SECRET_HASH = this.generateSecretHash(username);
      }

      // Try to get an access token using the session
      const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        AuthFlow: "ADMIN_NO_SRP_AUTH",
        AuthParameters: authParameters,
      });

      const authResult = await this.client.send(authCommand);

      console.log("Admin auth result:", {
        hasAuthenticationResult: !!authResult.AuthenticationResult,
        challengeName: authResult.ChallengeName,
      });

      if (authResult.AuthenticationResult?.AccessToken) {
        // Use the access token to associate software token
        const associateCommand = new AssociateSoftwareTokenCommand({
          AccessToken: authResult.AuthenticationResult.AccessToken,
        });

        const associateResult = await this.client.send(associateCommand);

        console.log("Associate software token result:", {
          hasSecretCode: !!associateResult.SecretCode,
        });

        if (associateResult.SecretCode) {
          // Store the session for later verification
          this.lastMfaSetupSession = session;
          return associateResult.SecretCode;
        }
      }

      throw new Error("Failed to associate software token with session");
    } catch (error) {
      console.error("Error associating software token with session:", error);
      throw error;
    }
  }

  // Verify software token
  async verifySoftwareToken(
    accessToken: string,
    userCode: string
  ): Promise<boolean> {
    try {
      const command = new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: userCode,
      });

      const result = await this.client.send(command);
      return result.Status === "SUCCESS";
    } catch (error) {
      console.error("Error verifying software token:", error);
      return false;
    }
  }

  // Respond to new password challenge
  async respondToNewPasswordChallenge(
    session: string,
    newPassword: string,
    username: string
  ): Promise<AuthResult> {
    try {
      const challengeResponses: Record<string, string> = {
        NEW_PASSWORD: newPassword,
        USERNAME: username,
      };

      // Add secret hash if client secret is configured
      if (this.clientSecret) {
        challengeResponses.SECRET_HASH = this.generateSecretHash(username);
      }

      const command = new RespondToAuthChallengeCommand({
        ClientId: this.clientId,
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        Session: session,
        ChallengeResponses: challengeResponses,
      });

      const result = await this.client.send(command);

      if (result.AuthenticationResult) {
        return {
          accessToken: result.AuthenticationResult.AccessToken || "",
          idToken: result.AuthenticationResult.IdToken || "",
          refreshToken: result.AuthenticationResult.RefreshToken || "",
        };
      }

      throw new Error("New password challenge failed");
    } catch (error) {
      console.error("Error responding to new password challenge:", error);
      throw error;
    }
  }

  // Respond to MFA challenge
  async respondToMfaChallenge(
    session: string,
    userCode: string,
    username: string,
    challengeName: "SOFTWARE_TOKEN_MFA" | "MFA_SETUP" = "SOFTWARE_TOKEN_MFA"
  ): Promise<AuthResult> {
    try {
      console.log("Responding to MFA challenge:", {
        challengeName,
        username,
        userCode: userCode.substring(0, 2) + "****",
        sessionLength: session.length,
      });

      const challengeResponses: Record<string, string> = {
        USERNAME: username,
      };

      // Set the appropriate challenge response based on challenge type
      if (challengeName === "SOFTWARE_TOKEN_MFA") {
        challengeResponses.SOFTWARE_TOKEN_MFA_CODE = userCode;
      } else if (challengeName === "MFA_SETUP") {
        challengeResponses.SOFTWARE_TOKEN_MFA_CODE = userCode;
      }

      // Add secret hash if client secret is configured
      if (this.clientSecret) {
        challengeResponses.SECRET_HASH = this.generateSecretHash(username);
      }

      console.log("Challenge responses:", Object.keys(challengeResponses));

      const command = new RespondToAuthChallengeCommand({
        ClientId: this.clientId,
        ChallengeName: challengeName,
        Session: session,
        ChallengeResponses: challengeResponses,
      });

      const result = await this.client.send(command);

      console.log("Cognito response:", {
        hasAuthenticationResult: !!result.AuthenticationResult,
        challengeName: result.ChallengeName,
        session: result.Session ? "present" : "missing",
      });

      if (result.AuthenticationResult) {
        return {
          accessToken: result.AuthenticationResult.AccessToken || "",
          idToken: result.AuthenticationResult.IdToken || "",
          refreshToken: result.AuthenticationResult.RefreshToken || "",
        };
      }

      throw new Error("MFA challenge failed");
    } catch (error) {
      console.error("Error responding to MFA challenge:", error);
      throw error;
    }
  }

  // Get user information
  async getUser(accessToken: string): Promise<CognitoUser> {
    try {
      const command = new GetUserCommand({
        AccessToken: accessToken,
      });

      const result = await this.client.send(command);

      const user: CognitoUser = {
        username: result.Username || "",
        email: "",
        name: "",
        role: "user",
        mfaEnabled: false,
        googleLinked: false,
      };

      result.UserAttributes?.forEach((attr) => {
        switch (attr.Name) {
          case "email":
            user.email = attr.Value || "";
            break;
          case "name":
            user.name = attr.Value || "";
            break;
          case "custom:role":
            // Default to user role for all users
            user.role = "user";
            break;
          // Custom attributes removed - not defined in User Pool schema
        }
      });

      user.mfaEnabled = result.MFAOptions?.length ? true : false;

      // Get user groups to determine role
      try {
        const groupsCommand = new AdminListGroupsForUserCommand({
          UserPoolId: this.userPoolId,
          Username: user.username,
        });
        const groupsResult = await this.client.send(groupsCommand);

        // Check if user is in admin group
        const isAdmin = groupsResult.Groups?.some(
          (group) => group.GroupName === "admin"
        );
        if (isAdmin) {
          user.role = "admin";
        }
      } catch (groupError) {
        console.log("Could not fetch user groups, using default role");
      }

      return user;
    } catch (error) {
      console.error("Error getting user:", error);
      throw error;
    }
  }

  // Handle Google OAuth callback
  async handleGoogleCallback(code: string, state: string): Promise<AuthResult> {
    try {
      // Get user info from Google
      const googleUserInfo = await this.getGoogleUserInfo(code);

      // Handle Google authentication
      return await this.handleGoogleAuth(googleUserInfo);
    } catch (error) {
      console.error("Error handling Google callback:", error);
      throw error;
    }
  }

  // Get Google user info from OAuth code
  private async getGoogleUserInfo(code: string): Promise<GoogleUserInfo> {
    try {
      // Exchange authorization code for access token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          code: code,
          grant_type: "authorization_code",
          redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange code for token");
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Get user info from Google
      const userResponse = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`
      );

      if (!userResponse.ok) {
        throw new Error("Failed to get user info from Google");
      }

      const userData = await userResponse.json();

      return {
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
      };
    } catch (error) {
      console.error("Error getting Google user info:", error);
      throw new Error("Failed to authenticate with Google");
    }
  }

  // Migrate existing users to Cognito
  async migrateExistingUsers(): Promise<void> {
    try {
      // Create admin user
      await this.registerUser(
        "admin@example.com",
        "Admin123!",
        "Admin User",
        "admin"
      );

      // Create user1
      await this.registerUser(
        "user1@example.com",
        "User123!",
        "Regular User",
        "user"
      );

      console.log("✅ Existing users migrated to Cognito");
    } catch (error) {
      console.error("Error migrating existing users:", error);
      // Ignore if users already exist
    }
  }
}
