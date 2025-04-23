// FSH Path Functions utility
// [DEBUGGING] All debug logs are prefixed as per guidelines

/**
 * Ensures the value meets CPG-L identifier requirements (double-quoted string, no newlines, no escapes).
 */
export function toIdentifier(value: string): string {
  if (value == null) return '';
  // Remove newlines, tabs, and all escape sequences, then wrap in double quotes
  let cleaned = value
    .replace(/[\r\n\t]+/g, ' ')      // Replace newlines and tabs with space
    .replace(/\\["'\\bfnrtv]/g, '')  // Remove common escaped characters
    .replace(/"/g, '');              // Remove all double quotes
  return `"${cleaned.trim()}"`;
}

/**
 * Ensures the value meets CPG-L string requirements (double-quoted string, with escapes).
 */
export function toString(value: string): string {
  if (value == null) return '';
  // Escape backslashes and double quotes, wrap in double quotes
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '"') + '"';
}

/**
 * Removes all instances of the given string from the value.
 */
export function remove(value: string, removeStr: string): string {
  if (value == null) return '';
  return value.split(removeStr).join('');
}

/**
 * Adds the given prefix to the value.
 */
export function prefix(value: string, prefixStr: string): string {
  if (value == null) return '';
  return prefixStr + value;
}

/**
 * Only returns the value if the clause is satisfied (leftArg exists and equals rightArg).
 * rules: array of FSH rules, leftArg: FSH path, rightArg: value to match
 */
export function where(rules: any[], leftArg: string, rightArg: string, value: string): string {
  const found = rules.find((r: any) => r.path === leftArg && r.value === rightArg);
  return found ? value : '';
}

/**
 * Extracts system and code from a FSH code string (e.g., $ICD11#XM28X5 "Measles vaccines").
 */
export function extractCode(value: string): string {
  if (value == null) return '';
  const match = RegExp(/\$(\w+)#(\w+)\s+".*?"/).exec(value);
  if (match) {
    return `system "${match[1]}" code "${match[2]}"`;
  }
  return value;
}

/**
 * Extracts the display string from a FSH code string (e.g., $ICD11#XM28X5 "Measles vaccines").
 */
export function extractCodeDisplay(value: string): string {
  if (value == null) return '';
  const match = RegExp(/^.*?"(.*?)"$/).exec(value);
  if (match) {
    return `"${match[1]}"`;
  }
  return value;
}

/**
 * Extracts system and code from a CQL code expression (e.g., Code { system: '...', code: '...' }).
 */
export function extractCodeExpression(value: string): string {
  if (value == null) return '';
  const match = RegExp(/Code\s*{\s*system:\s*'([^']+)',\s*code:\s*'([^']+)'\s*}/).exec(value);
  if (match) {
    return `system "${match[1]}" code "${match[2]}"`;
  }
  return value;
}

/**
 * Converts a string to CPGL code format (kebab-case, wrapped in backticks).
 * Example: 'Client Age Less Than 6 Months' -> `client-age-less-than-6-months`
 */
export function toCode(value: string): string {
  if (value == null) return '``';
  // Remove quotes, lower case, replace whitespace with dashes, wrap in backticks
  let cleaned = value.replace(/"/g, '').toLowerCase().replace(/\s+/g, '-');
  return `\`${cleaned}\``;
} 