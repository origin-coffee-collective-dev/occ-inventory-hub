/**
 * Error Classification for Inventory Sync
 *
 * Analyzes sync results and errors to determine if a critical failure has occurred
 * that requires notification (email alert).
 */

import type { CriticalSyncError, SyncErrorType } from "~/types/database";
import type { PartnerSyncResult } from "./sync.server";
import type { PartnerSyncStatus } from "~/lib/supabase.server";

// Thresholds for critical failure detection
const HIGH_FAILURE_RATE_THRESHOLD = 0.5; // 50% of items failed
const CONSECUTIVE_FAILURES_THRESHOLD = 3; // 3+ syncs failed in a row

/**
 * Classifies an HTTP status code and error message into a SyncErrorType
 */
export function classifyError(
  httpStatus: number | null,
  errorMessage: string
): SyncErrorType {
  // Check for auth errors
  if (httpStatus === 401 || httpStatus === 403) {
    return "auth_revoked";
  }

  // Check for error message patterns indicating auth issues
  const lowerMessage = errorMessage.toLowerCase();
  if (
    lowerMessage.includes("access denied") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("invalid token") ||
    lowerMessage.includes("token expired") ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("forbidden")
  ) {
    return "auth_revoked";
  }

  // Check for rate limiting
  if (httpStatus === 429) {
    return "rate_limited";
  }

  // Check for server errors / unreachable
  if (httpStatus && httpStatus >= 500 && httpStatus < 600) {
    return "store_unreachable";
  }

  // Check for network/timeout errors
  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("fetch failed") ||
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("enotfound") ||
    lowerMessage.includes("socket hang up") ||
    lowerMessage.includes("connection refused")
  ) {
    return "store_unreachable";
  }

  // Check for partial failures
  if (
    lowerMessage.includes("partial") ||
    lowerMessage.includes("some items failed")
  ) {
    return "partial_failure";
  }

  // Default to transient for unknown errors
  return "transient";
}

/**
 * Determines the appropriate sync status based on results
 */
export function determineSyncStatus(
  result: PartnerSyncResult
): PartnerSyncStatus {
  if (!result.success) {
    return "failed";
  }

  // Check for high failure rate
  if (result.itemsProcessed > 0) {
    const failureRate = result.itemsFailed / result.itemsProcessed;
    if (failureRate >= HIGH_FAILURE_RATE_THRESHOLD) {
      return "failed";
    }
    if (failureRate > 0) {
      return "warning";
    }
  }

  return "success";
}

/**
 * Checks if a partner sync result represents a critical failure that needs notification
 *
 * Critical failures:
 * - Token revoked/invalid (HTTP 401 or "Access denied")
 * - Store unreachable after retries (HTTP 5xx or timeout)
 * - High failure rate (>50% of items failed)
 * - Consecutive failures (3+ syncs failed in a row)
 */
export function detectCriticalFailure(
  partnerShop: string,
  result: PartnerSyncResult,
  previousConsecutiveFailures: number,
  errorType: SyncErrorType | null
): CriticalSyncError | null {
  // Check for token revoked
  if (errorType === "auth_revoked") {
    return {
      type: "token_revoked",
      partnerShop,
      message: `Partner store ${partnerShop} access token has been revoked or is invalid`,
      details: result.errors.join("; "),
    };
  }

  // Check for store unreachable
  if (errorType === "store_unreachable" && !result.success) {
    return {
      type: "store_unreachable",
      partnerShop,
      message: `Partner store ${partnerShop} is unreachable after multiple retry attempts`,
      details: result.errors.join("; "),
    };
  }

  // Check for high failure rate
  if (result.itemsProcessed > 0) {
    const failureRate = result.itemsFailed / result.itemsProcessed;
    if (failureRate >= HIGH_FAILURE_RATE_THRESHOLD) {
      return {
        type: "high_failure_rate",
        partnerShop,
        message: `High failure rate (${Math.round(failureRate * 100)}%) syncing inventory from ${partnerShop}`,
        details: result.errors.join("; "),
        failureRate,
      };
    }
  }

  // Check for consecutive failures (new failure would make it cross threshold)
  const newConsecutiveFailures = result.success ? 0 : previousConsecutiveFailures + 1;
  if (newConsecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
    return {
      type: "consecutive_failures",
      partnerShop,
      message: `Partner ${partnerShop} has failed ${newConsecutiveFailures} consecutive inventory syncs`,
      details: result.errors.join("; "),
      consecutiveFailures: newConsecutiveFailures,
    };
  }

  return null;
}

/**
 * Creates a critical error for owner store disconnection
 */
export function createOwnerStoreDisconnectedError(
  errorMessage: string
): CriticalSyncError {
  return {
    type: "owner_store_disconnected",
    partnerShop: "owner_store",
    message: "Owner store connection failed - inventory sync cannot proceed",
    details: errorMessage,
  };
}

/**
 * Calculates the new consecutive failure count based on sync result
 */
export function calculateConsecutiveFailures(
  previousCount: number,
  syncSucceeded: boolean
): number {
  return syncSucceeded ? 0 : previousCount + 1;
}
