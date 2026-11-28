/**
 * Central Firebase Module Barrel Export.
 * Single source of truth for Cloud Models, DTOs, Authentication, Room Services,
 * Presence, and GitHub Verification services.
 */

// Configuration and RTDB/Auth handles
export * from "./firebaseConfig";

// Centralized Data Transfer Objects & Schema Validators
export * from "./dtos";

// Authentication and User Profile Services
export * from "./authService";

// GitHub Star & Follow Verification Services
export * from "./githubVerificationService";

// Realtime Presence Tracking Services
export * from "./presenceService";

// Collaborative Cloud Room Services & Transactions
export * from "./roomService";

// Cloud Agent API Entitlements, API Keys & Admin Access Controls
export * from "./apiAccessService";
