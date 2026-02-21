/**
 * Error sanitization utilities
 * 
 * Prevents sensitive information leakage in error messages
 */

/**
 * Sensitive patterns that should be removed from error messages
 */
const SENSITIVE_PATTERNS = [
  // Database connection strings
  /postgresql:\/\/[^@\s]+@[^\/\s]+/gi,
  /postgres:\/\/[^@\s]+@[^\/\s]+/gi,
  
  // API keys and tokens
  /sk-[a-zA-Z0-9]{20,}/gi,
  /[a-zA-Z0-9]{32,}/gi, // Generic long strings that might be keys
  
  // File paths that reveal system structure
  /\/Users\/[^\/\s]+/gi,
  /C:\\Users\\[^\\\/\s]+/gi,
  /\/home\/[^\/\s]+/gi,
  /\/var\/[^\/\s]+/gi,
  /\/opt\/[^\/\s]+/gi,
  
  // IP addresses (private ranges)
  /\b192\.168\.\d{1,3}\.\d{1,3}\b/g,
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  /\b172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b/g,
  
  // Stack traces with file paths
  /at .+\/[^\/\s]+\.js:\d+:\d+/gi,
  /at .+\/[^\/\s]+\.ts:\d+:\d+/gi,
];

/**
 * Development-only error patterns (show full details in dev)
 */
const DEV_ERROR_PATTERNS = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'TypeError',
  'ReferenceError',
  'SyntaxError'
];

/**
 * Production error messages for common issues
 */
const PRODUCTION_ERROR_MAPPING: Record<string, string> = {
  'ECONNREFUSED': 'Service temporarily unavailable',
  'ENOTFOUND': 'Service temporarily unavailable', 
  'ENOENT': 'Resource not found',
  'EPERM': 'Permission denied',
  'EACCES': 'Access denied',
  'EMFILE': 'Too many requests',
  'ENFILE': 'Too many requests',
  'ValidationError': 'Invalid input provided',
  'CastError': 'Invalid data format',
  'MongoError': 'Database error',
  'PostgresError': 'Database error',
  'SequelizeError': 'Database error',
  'DrizzleError': 'Database error',
};

/**
 * Sanitize error message for client consumption
 */
export function sanitizeErrorMessage(error: Error | string, isDevelopment: boolean = false): string {
  let message = typeof error === 'string' ? error : error.message || 'Unknown error';
  
  // In development, show more detailed errors but still sanitize sensitive data
  if (isDevelopment) {
    // Remove sensitive patterns but keep error details
    for (const pattern of SENSITIVE_PATTERNS) {
      message = message.replace(pattern, '[REDACTED]');
    }
    return message;
  }
  
  // In production, use generic messages for common error types
  for (const [errorType, genericMessage] of Object.entries(PRODUCTION_ERROR_MAPPING)) {
    if (message.includes(errorType)) {
      return genericMessage;
    }
  }
  
  // Remove all sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    message = message.replace(pattern, '[REDACTED]');
  }
  
  // Generic fallback for unrecognized errors in production
  if (message.length > 100 || message.includes('Error:') || message.includes('Exception:')) {
    return 'An error occurred while processing your request';
  }
  
  return message;
}

/**
 * Create a safe error response for API endpoints
 */
export function createErrorResponse(error: Error | string, isDevelopment: boolean = false) {
  const sanitizedMessage = sanitizeErrorMessage(error, isDevelopment);
  
  return {
    error: sanitizedMessage,
    ...(isDevelopment && {
      debug: {
        originalMessage: typeof error === 'string' ? error : error.message,
        stack: typeof error === 'object' && error.stack ? error.stack.split('\n').slice(0, 3) : undefined
      }
    })
  };
}

/**
 * Log error with full details while returning sanitized version to client
 */
export function logAndSanitizeError(
  error: Error | string, 
  context: string, 
  isDevelopment: boolean = false
) {
  // Log full error details for debugging
  if (typeof error === 'object') {
    console.error(`[${context}] Error:`, {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  } else {
    console.error(`[${context}] Error:`, error);
  }
  
  // Return sanitized version
  return createErrorResponse(error, isDevelopment);
}