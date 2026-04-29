/**
 * UK Phone Number Validation
 *
 * Validates UK phone numbers with flexible format support.
 * Accepts landlines from any area code and mobile numbers.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  formattedNumber?: string;
}

/**
 * Validates a UK phone number
 *
 * Accepts:
 * - Mobile: 07xxx xxxxxx
 * - Landline: 01xxx, 02x, 03xxx, etc.
 * - Freephone: 0800, 0808
 * - International: +44 format
 *
 * @param phone - The phone number to validate
 * @returns Validation result with error message if invalid
 */
export function validateUKPhone(phone: string): PhoneValidationResult {
  if (!phone || phone.trim() === '') {
    return {
      isValid: false,
      error: 'Phone number is required',
    };
  }

  const trimmed = phone.trim();

  // Remove all non-digit characters except + at the start
  const digitsOnly = trimmed.replace(/[^\d+]/g, '');

  // Extract just the digits (no +)
  const numbersOnly = digitsOnly.replace(/\+/g, '');

  // Check for invalid characters (letters, etc.)
  const invalidChars = trimmed.match(/[^0-9\s\-+()]/);
  if (invalidChars) {
    return {
      isValid: false,
      error: 'Phone number contains invalid characters',
    };
  }

  // Must start with 0 (UK domestic), +44 (UK international), or (0 for parentheses format
  if (!trimmed.match(/^(\+44|\(?\s*0)/)) {
    return {
      isValid: false,
      error: 'UK phone numbers must start with 0 or +44',
    };
  }

  // Check digit count
  let expectedDigits: number;

  if (digitsOnly.startsWith('+44')) {
    // International format: +44 followed by 10 digits (without leading 0)
    // e.g., +44 7xxx xxx xxx = 12 characters (+44 + 10 digits)
    expectedDigits = 12; // +44 (3 chars) + 10 digits
    if (numbersOnly.length < 12 || numbersOnly.length > 13) {
      return {
        isValid: false,
        error: 'Invalid international format (expected +44 followed by 10 digits)',
      };
    }
  } else {
    // Domestic format: 11 digits starting with 0
    // e.g., 07xxx xxx xxx, 020 xxxx xxxx, 01xxx xxx xxx
    if (numbersOnly.length < 10 || numbersOnly.length > 11) {
      return {
        isValid: false,
        error: 'UK phone numbers must be 10-11 digits',
      };
    }
  }

  // Valid!
  return {
    isValid: true,
    formattedNumber: trimmed, // Keep user's preferred format
  };
}

/**
 * Formats a UK phone number to a clean, consistent format
 *
 * @param phone - The phone number to format
 * @returns Formatted phone number or original if invalid
 */
export function formatUKPhone(phone: string): string {
  const validation = validateUKPhone(phone);

  if (!validation.isValid) {
    return phone; // Return original if invalid
  }

  // Remove all formatting
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Normalize to +44 format if domestic
  if (cleaned.startsWith('0')) {
    cleaned = '+44' + cleaned.substring(1);
  }

  // Add spaces for readability
  // +44 7xxx xxx xxx (mobile)
  // +44 20 xxxx xxxx (London)
  // +44 1xxx xxx xxx (other)

  if (cleaned.startsWith('+447')) {
    // Mobile: +44 7xxx xxx xxx
    return cleaned.replace(/(\+44)(\d{4})(\d{3})(\d{3})/, '$1 $2 $3 $4');
  } else if (cleaned.startsWith('+4420')) {
    // London: +44 20 xxxx xxxx
    return cleaned.replace(/(\+44)(20)(\d{4})(\d{4})/, '$1 $2 $3 $4');
  } else {
    // Other: +44 1xxx xxx xxx or similar
    return cleaned.replace(/(\+44)(\d{4})(\d{3})(\d{3})/, '$1 $2 $3 $4');
  }
}
