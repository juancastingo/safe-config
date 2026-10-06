export interface ConfigIssue {
  path: string;
  message: string;
  code: 'MISSING' | 'INVALID_TYPE' | 'VALIDATION_FAILED' | 'FILE_ERROR' | 'PARSE_ERROR';
}

export class SafeConfigError extends Error {
  public readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[], message?: string) {
    const summary = issues.map((i) => `  - [${i.code}] ${i.path}: ${i.message}`).join('\n');
    const fullMessage = message
      ? `${message}\n${summary}`
      : `Configuration validation failed with ${issues.length} error(s):\n${summary}`;
    super(fullMessage);
    this.name = 'SafeConfigError';
    this.issues = issues;
    Object.setPrototypeOf(this, SafeConfigError.prototype);
  }
}
