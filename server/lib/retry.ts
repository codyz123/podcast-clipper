/**
 * Retry utilities for handling transient failures
 */

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitter: true,
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on the last attempt
      if (attempt === config.maxAttempts) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const baseDelay = config.baseDelayMs * Math.pow(config.exponentialBase, attempt - 1);
      let delay = Math.min(baseDelay, config.maxDelayMs);
      
      // Add jitter to prevent thundering herd
      if (config.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }
      
      console.info(`Operation failed (attempt ${attempt}/${config.maxAttempts}), retrying in ${Math.round(delay)}ms...`, {
        error: lastError.message,
        attempt
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Operation failed after ${config.maxAttempts} attempts. Last error: ${lastError.message}`);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    'ECONNRESET',
    'ECONNREFUSED', 
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    '429', // Rate limited
    '500', // Internal server error
    '502', // Bad gateway
    '503', // Service unavailable
    '504', // Gateway timeout
  ];
  
  const errorString = error.message.toLowerCase();
  return retryablePatterns.some(pattern => errorString.includes(pattern.toLowerCase()));
}

/**
 * Retry wrapper that only retries on retryable errors
 */
export async function withSmartRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(async () => {
    try {
      return await operation();
    } catch (error) {
      const err = error as Error;
      
      // If it's not retryable, throw immediately
      if (!isRetryableError(err)) {
        throw err;
      }
      
      // Otherwise, let the retry mechanism handle it
      throw err;
    }
  }, options);
}

/**
 * Rate limiter with exponential backoff
 */
export class RateLimiter {
  private requests: number[] = [];
  private isWaiting = false;

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  async waitIfNeeded(): Promise<void> {
    // Clean up old requests
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    // If we're under the limit, proceed immediately
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return;
    }

    // If we're already waiting, wait longer
    if (this.isWaiting) {
      const waitTime = 1000 + Math.random() * 2000; // 1-3 seconds
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitIfNeeded(); // Recursive check
    }

    // Calculate when we can make the next request
    const oldestRequest = Math.min(...this.requests);
    const waitTime = this.windowMs - (now - oldestRequest);

    if (waitTime > 0) {
      this.isWaiting = true;
      console.info(`Rate limit hit, waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.isWaiting = false;
      return this.waitIfNeeded(); // Check again after waiting
    }

    this.requests.push(now);
  }
}