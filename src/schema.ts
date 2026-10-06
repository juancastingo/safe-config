import { FieldDef, FieldOptions, SchemaShape, InferSchema } from './types.js';
import { SafeConfigError, ConfigIssue } from './errors.js';

export class BaseField<T> implements FieldDef<T> {
  public readonly _type: any;
  public readonly options: FieldOptions<T>;

  constructor(type: any, options: FieldOptions<T> = {}) {
    this._type = type;
    this.options = { ...options };
  }

  isSecret(): boolean {
    return Boolean(this.options.secret);
  }

  default(val: T): this {
    this.options.default = val;
    this.options.required = false;
    return this;
  }

  optional(): this {
    this.options.required = false;
    return this;
  }

  secret(isSecret = true): this {
    this.options.secret = isSecret;
    return this;
  }

  describe(desc: string): this {
    this.options.description = desc;
    return this;
  }

  validate(fn: (val: T) => boolean | string): this {
    this.options.validate = fn;
    return this;
  }

  transform(fn: (val: any) => T): this {
    this.options.transform = fn;
    return this;
  }

  parse(raw: unknown, path: string): T {
    let value = raw;

    if (value === undefined || value === null || value === '') {
      if (this.options.default !== undefined) {
        return this.options.default;
      }
      if (this.options.required === false) {
        return undefined as any;
      }
      throw new SafeConfigError([
        {
          path,
          code: 'MISSING',
          message: `Required configuration field is missing`,
        },
      ]);
    }

    if (this.options.transform) {
      value = this.options.transform(value);
    } else {
      value = this.coerce(value, path);
    }

    if (this.options.validate) {
      const res = this.options.validate(value as T);
      if (res !== true) {
        const msg = typeof res === 'string' ? res : `Value failed custom validation`;
        throw new SafeConfigError([
          {
            path,
            code: 'VALIDATION_FAILED',
            message: msg,
          },
        ]);
      }
    }

    return value as T;
  }

  protected coerce(raw: unknown, path: string): unknown {
    return raw;
  }
}

export class StringField extends BaseField<string> {
  constructor(options: FieldOptions<string> = {}) {
    super('string', { required: true, ...options });
  }

  protected coerce(raw: unknown, path: string): string {
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    throw new SafeConfigError([
      {
        path,
        code: 'INVALID_TYPE',
        message: `Expected string, received ${typeof raw}`,
      },
    ]);
  }
}

export class NumberField extends BaseField<number> {
  private minVal?: number;
  private maxVal?: number;
  private isInt = false;

  constructor(options: FieldOptions<number> = {}) {
    super('number', { required: true, ...options });
  }

  min(min: number): this {
    this.minVal = min;
    return this;
  }

  max(max: number): this {
    this.maxVal = max;
    return this;
  }

  int(): this {
    this.isInt = true;
    return this;
  }

  port(): this {
    this.min(1);
    this.max(65535);
    this.int();
    return this;
  }

  protected coerce(raw: unknown, path: string): number {
    let num: number;
    if (typeof raw === 'number') {
      num = raw;
    } else if (typeof raw === 'string') {
      num = Number(raw.trim());
      if (isNaN(num)) {
        throw new SafeConfigError([
          {
            path,
            code: 'INVALID_TYPE',
            message: `Cannot convert "${raw}" to number`,
          },
        ]);
      }
    } else {
      throw new SafeConfigError([
        {
          path,
          code: 'INVALID_TYPE',
          message: `Expected number, received ${typeof raw}`,
        },
      ]);
    }

    if (isNaN(num) || !isFinite(num)) {
      throw new SafeConfigError([
        {
          path,
          code: 'INVALID_TYPE',
          message: `Expected valid finite number`,
        },
      ]);
    }

    if (this.isInt && !Number.isInteger(num)) {
      throw new SafeConfigError([
        {
          path,
          code: 'VALIDATION_FAILED',
          message: `Expected integer, received float ${num}`,
        },
      ]);
    }

    if (this.minVal !== undefined && num < this.minVal) {
      throw new SafeConfigError([
        {
          path,
          code: 'VALIDATION_FAILED',
          message: `Value ${num} is less than minimum ${this.minVal}`,
        },
      ]);
    }

    if (this.maxVal !== undefined && num > this.maxVal) {
      throw new SafeConfigError([
        {
          path,
          code: 'VALIDATION_FAILED',
          message: `Value ${num} is greater than maximum ${this.maxVal}`,
        },
      ]);
    }

    return num;
  }
}

export class BooleanField extends BaseField<boolean> {
  constructor(options: FieldOptions<boolean> = {}) {
    super('boolean', { required: true, ...options });
  }

  protected coerce(raw: unknown, path: string): boolean {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const lower = raw.trim().toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') return true;
      if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') return false;
    }
    throw new SafeConfigError([
      {
        path,
        code: 'INVALID_TYPE',
        message: `Expected boolean, received ${JSON.stringify(raw)}`,
      },
    ]);
  }
}

export class ArrayField<T> extends BaseField<T[]> {
  private itemField: FieldDef<T>;

  constructor(itemField: FieldDef<T>, options: FieldOptions<T[]> = {}) {
    super('array', { required: true, ...options });
    this.itemField = itemField;
  }

  protected coerce(raw: unknown, path: string): T[] {
    let list: unknown[];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === 'string') {
      // Allow comma-separated strings if loaded from .env or flat strings
      list = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    } else {
      throw new SafeConfigError([
        {
          path,
          code: 'INVALID_TYPE',
          message: `Expected array, received ${typeof raw}`,
        },
      ]);
    }

    const issues: ConfigIssue[] = [];
    const results: T[] = [];
    list.forEach((item, idx) => {
      try {
        results.push(this.itemField.parse(item, `${path}[${idx}]`));
      } catch (err) {
        if (err instanceof SafeConfigError) {
          issues.push(...err.issues);
        } else {
          issues.push({
            path: `${path}[${idx}]`,
            code: 'VALIDATION_FAILED',
            message: (err as Error).message,
          });
        }
      }
    });

    if (issues.length > 0) {
      throw new SafeConfigError(issues);
    }

    return results;
  }
}

export class ObjectField<S extends SchemaShape> extends BaseField<InferSchema<S>> {
  public readonly shape: S;

  constructor(shape: S, options: FieldOptions<InferSchema<S>> = {}) {
    super('object', { required: true, ...options });
    this.shape = shape;
  }

  isSecret(): boolean {
    return Boolean(this.options.secret);
  }

  parse(raw: unknown, path: string): InferSchema<S> {
    if (raw === undefined || raw === null) {
      if (this.options.default !== undefined) {
        return this.options.default;
      }
      if (this.options.required === false) {
        return undefined as any;
      }
      // If object itself is not explicitly optional, we attempt to parse empty object to populate defaults
      raw = {};
    }

    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SafeConfigError([
        {
          path,
          code: 'INVALID_TYPE',
          message: `Expected object, received ${typeof raw}`,
        },
      ]);
    }

    const obj = raw as Record<string, unknown>;
    const result: Record<string, any> = {};
    const issues: ConfigIssue[] = [];

    for (const [key, field] of Object.entries(this.shape)) {
      const childPath = path ? `${path}.${key}` : key;
      const childRaw = obj[key];
      try {
        const parsed = field.parse(childRaw, childPath);
        if (parsed !== undefined) {
          result[key] = parsed;
        }
      } catch (err) {
        if (err instanceof SafeConfigError) {
          issues.push(...err.issues);
        } else {
          issues.push({
            path: childPath,
            code: 'VALIDATION_FAILED',
            message: (err as Error).message,
          });
        }
      }
    }

    if (issues.length > 0) {
      throw new SafeConfigError(issues);
    }

    return result as InferSchema<S>;
  }
}

export const schema = {
  string: (opts?: FieldOptions<string>) => new StringField(opts),
  number: (opts?: FieldOptions<number>) => new NumberField(opts),
  boolean: (opts?: FieldOptions<boolean>) => new BooleanField(opts),
  array: <T>(item: FieldDef<T>, opts?: FieldOptions<T[]>) => new ArrayField<T>(item, opts),
  object: <S extends SchemaShape>(shape: S, opts?: FieldOptions<InferSchema<S>>) =>
    new ObjectField<S>(shape, opts),
};
