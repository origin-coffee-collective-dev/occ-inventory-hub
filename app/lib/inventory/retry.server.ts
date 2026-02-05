/**
 * Retry Logic for Shopify API Calls
 *
 * Provides retry functionality with exponential backoff for transient errors.
 * Only retries on transient errors (5xx, timeout), not auth errors (401, 403).
 */

import type { SyncErrorType } from "~/types/database";

// Retry configuration
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [100, 500]; // Exponential backoff delays

// HTTP status codes that are retryable (transient errors)
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

// HTTP status codes that should NOT be retried (permanent errors)
const NON_RETRYABLE_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  422, // Unprocessable Entity
]);

export interface RetryResult<T> {
  data: T | null;
  error: string | null;
  httpStatus: number | null;
  errorType: SyncErrorType | null;
  retryCount: number;
}

interface FetchResult<T> {
  data: T | null;
  error: string | null;
  httpStatus: number | null;
}

/**
 * Determines if an HTTP status code is retryable
 */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Classifies an error from HTTP status and message
 */
export function classifyErrorFromStatus(
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
    lowerMessage.includes("token expired")
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
    lowerMessage.includes("enotfound")
  ) {
    return "store_unreachable";
  }

  // Check for partial failures
  if (
    lowerMessage.includes("partial") ||
    lowerMessage.includes("some items")
  ) {
    return "partial_failure";
  }

  // Default to transient for unknown errors (allows retry)
  return "transient";
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a fetch-like function with retry logic
 *
 * @param fn - The async function to execute (should return FetchResult)
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns RetryResult with data, error info, and retry count
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<FetchResult<T>>,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<RetryResult<T>> {
  let lastResult: FetchResult<T> | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Execute the function
    const result = await fn();
    lastResult = result;

    // Success - return immediately
    if (result.data !== null && result.error === null) {
      return {
        data: result.data,
        error: null,
        httpStatus: result.httpStatus,
        errorType: null,
        retryCount,
      };
    }

    // Error - check if retryable
    const errorType = classifyErrorFromStatus(result.httpStatus, result.error || "");

    // Don't retry auth errors or permanent failures
    if (
      errorType === "auth_revoked" ||
      (result.httpStatus && NON_RETRYABLE_STATUS_CODES.has(result.httpStatus))
    ) {
      return {
        data: null,
        error: result.error,
        httpStatus: result.httpStatus,
        errorType,
        retryCount,
      };
    }

    // If not last attempt, wait and retry
    if (attempt < maxRetries) {
      const delayMs = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      await delay(delayMs);
      retryCount++;
    }
  }

  // All retries exhausted - return last error
  const finalErrorType = classifyErrorFromStatus(
    lastResult?.httpStatus ?? null,
    lastResult?.error || "Unknown error"
  );

  return {
    data: null,
    error: lastResult?.error || "All retry attempts failed",
    httpStatus: lastResult?.httpStatus ?? null,
    errorType: finalErrorType,
    retryCount,
  };
}
