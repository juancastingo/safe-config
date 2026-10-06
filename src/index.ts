import {
  SchemaShape,
  InferSchema,
  LoadOptions,
  ConfigInstance,
  FieldDef,
} from './types.js';
import { schema, ObjectField } from './schema.js';
import { SafeConfigError } from './errors.js';
import { loadConfigFile, deepMerge, extractEnvOverrides } from './loader.js';
import { redactObject, attachCustomInspect } from './redact.js';

export * from './types.js';
export * from './errors.js';
export * from './schema.js';
export * from './loader.js';
export * from './redact.js';

function collectSecrets(shape: SchemaShape, prefix = '', set: Set<string> = new Set()): Set<string> {
  for (const [key, field] of Object.entries(shape)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (field.isSecret()) {
      set.add(fullPath);
    }
    if (field instanceof ObjectField) {
      collectSecrets(field.shape, fullPath, set);
    }
  }
  return set;
}

export function loadConfig<S extends SchemaShape>(
  schemaShape: S,
  options: LoadOptions<S> = {}
): ConfigInstance<InferSchema<S>> {
  let rawMerged: Record<string, any> = {};

  // 1. Load files in sequential order
  if (options.files && options.files.length > 0) {
    for (const file of options.files) {
      const fileData = loadConfigFile(file);
      rawMerged = deepMerge(rawMerged, fileData);
    }
  }

  // 2. Load direct programmatic overrides
  if (options.overrides) {
    rawMerged = deepMerge(rawMerged, options.overrides);
  }

  // 3. Load env overrides (highest precedence for 12-factor app deployment)
  if (options.loadEnv !== false) {
    const envOverrides = extractEnvOverrides({
      envPrefix: options.envPrefix,
      envMap: options.envMap,
    });
    rawMerged = deepMerge(rawMerged, envOverrides);
  }

  // 4. Validate and coerce through schema
  const rootField = new ObjectField(schemaShape);
  const validatedValues = rootField.parse(rawMerged, '') as InferSchema<S>;

  // 5. Build secret registry
  const secretPaths = collectSecrets(schemaShape);
  const autoRedact = options.autoRedactSecrets !== false;

  // 6. Build redacted view
  const redactedCache = redactObject(validatedValues, secretPaths, autoRedact);

  // 7. Attach inspect security
  attachCustomInspect(validatedValues, redactedCache);

  const instance: ConfigInstance<InferSchema<S>> = {
    values: validatedValues,
    toRedacted: () => redactObject(validatedValues, secretPaths, autoRedact),
    get: <V = any>(path: string): V => {
      const parts = path.split('.');
      let current: any = validatedValues;
      for (const part of parts) {
        if (current === undefined || current === null) return undefined as any;
        current = current[part];
      }
      return current as V;
    },
    isSecret: (path: string): boolean => {
      return secretPaths.has(path);
    },
    toJSONString: (opts?: { unsafe?: boolean; indent?: number }) => {
      const target = opts?.unsafe ? validatedValues : redactedCache;
      return JSON.stringify(target, null, opts?.indent ?? 2);
    },
  };

  attachCustomInspect(instance, redactedCache);

  return instance;
}

export const safeConfig = {
  load: loadConfig,
  schema,
};

export default safeConfig;
