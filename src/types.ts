export type Primitive = string | number | boolean | null | undefined;

export interface FieldOptions<T> {
  default?: T;
  required?: boolean;
  secret?: boolean;
  description?: string;
  validate?: (value: T) => boolean | string;
  transform?: (value: any) => T;
}

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface FieldDef<T = any> {
  readonly _type: FieldType;
  readonly options: FieldOptions<T>;
  parse(raw: unknown, path: string): T;
  isSecret(): boolean;
}

export type SchemaShape = {
  [key: string]: FieldDef<any>;
};

export type InferField<F> = F extends FieldDef<infer T> ? T : never;

export type InferSchema<S extends SchemaShape> = {
  [K in keyof S]: InferField<S[K]>;
};

export interface LoadOptions<S extends SchemaShape> {
  /**
   * Files to load in order (later files override earlier ones).
   * Supports .json, .yaml, .yml, .toml, .env
   */
  files?: string[];
  /**
   * Whether to include process.env overrides. Default: true.
   */
  loadEnv?: boolean;
  /**
   * Prefix for environment variable overrides.
   * Example: prefix 'APP' maps APP_DATABASE__PORT to database.port
   */
  envPrefix?: string;
  /**
   * Custom env mapping.
   * Example: { 'PORT': 'server.port' }
   */
  envMap?: Record<string, string>;
  /**
   * Directly supplied inline config overrides.
   */
  overrides?: Record<string, any>;
  /**
   * Whether to automatically detect secret keys by heuristic names. Default: true.
   */
  autoRedactSecrets?: boolean;
}

export interface ConfigInstance<T extends Record<string, any>> {
  /**
   * Typed configuration values. Secrets are accessible in plain text here for application logic.
   */
  readonly values: T;
  /**
   * Safe redacted view of the configuration where all secrets are masked as `***[REDACTED]***`.
   */
  toRedacted(): Record<string, any>;
  /**
   * Fetch a deeply nested property via dot notation (e.g. `database.host`).
   */
  get<V = any>(path: string): V;
  /**
   * Whether a specific path was marked as a secret.
   */
  isSecret(path: string): boolean;
  /**
   * Export as JSON string (secrets redacted by default unless unsafe=true).
   */
  toJSONString(options?: { unsafe?: boolean; indent?: number }): string;
}
