import util from 'node:util';

const REDACTED_MASK = '***[REDACTED]***';

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /auth/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /credential/i,
  /webhook/i,
  /conn(ection)?_?(str|string|uri)/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactObject<T extends Record<string, any>>(
  obj: T,
  explicitSecrets: Set<string> = new Set(),
  autoRedact = true
): Record<string, any> {
  return deepRedact(obj, '', explicitSecrets, autoRedact);
}

function deepRedact(
  value: any,
  currentPath: string,
  explicitSecrets: Set<string>,
  autoRedact: boolean
): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    if (explicitSecrets.has(currentPath)) {
      return REDACTED_MASK;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (explicitSecrets.has(currentPath)) {
      return REDACTED_MASK;
    }
    return value.map((item, idx) =>
      deepRedact(item, currentPath ? `${currentPath}[${idx}]` : `[${idx}]`, explicitSecrets, autoRedact)
    );
  }

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    const childPath = currentPath ? `${currentPath}.${k}` : k;
    const isExplicit = explicitSecrets.has(childPath);
    const isAuto = autoRedact && isSensitiveKey(k);

    if (isExplicit || isAuto) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        // Redact nested object values
        result[k] = deepRedact(v, childPath, explicitSecrets, autoRedact);
      } else {
        result[k] = REDACTED_MASK;
      }
    } else {
      result[k] = deepRedact(v, childPath, explicitSecrets, autoRedact);
    }
  }

  return result;
}

export function attachCustomInspect(target: any, redactedView: any): void {
  const customInspect = util.inspect.custom || Symbol.for('nodejs.util.inspect.custom');
  Object.defineProperty(target, customInspect, {
    value: () => redactedView,
    enumerable: false,
    configurable: true,
  });
}
