import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import * as TOML from 'smol-toml';
import { SafeConfigError } from './errors.js';

export function parseDotEnv(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split('\n');

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const rawKey = line.slice(0, eqIdx).trim();
    let rawVal = line.slice(eqIdx + 1).trim();

    if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      rawVal = rawVal.slice(1, -1);
    } else {
      // Strip trailing comments if unquoted
      const hashIdx = rawVal.indexOf('#');
      if (hashIdx !== -1) {
        rawVal = rawVal.slice(0, hashIdx).trim();
      }
    }

    result[rawKey] = rawVal;
  }

  return result;
}

export function loadConfigFile(filePath: string): Record<string, any> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new SafeConfigError([
      {
        path: filePath,
        code: 'FILE_ERROR',
        message: `Configuration file does not exist: ${absPath}`,
      },
    ]);
  }

  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    throw new SafeConfigError([
      {
        path: filePath,
        code: 'FILE_ERROR',
        message: `Failed to read file ${absPath}: ${(err as Error).message}`,
      },
    ]);
  }

  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.json') {
      return JSON.parse(content);
    }
    if (ext === '.yaml' || ext === '.yml') {
      const parsed = YAML.parse(content);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    }
    if (ext === '.toml') {
      return TOML.parse(content) as Record<string, any>;
    }
    if (ext === '.env' || path.basename(filePath).startsWith('.env')) {
      return parseDotEnv(content);
    }
    // Attempt JSON then YAML fallback
    try {
      return JSON.parse(content);
    } catch {
      return YAML.parse(content) || {};
    }
  } catch (err) {
    throw new SafeConfigError([
      {
        path: filePath,
        code: 'PARSE_ERROR',
        message: `Failed to parse configuration file ${absPath}: ${(err as Error).message}`,
      },
    ]);
  }
}

export function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>
): Record<string, any> {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export function setNestedProperty(obj: Record<string, any>, keyPath: string, value: any): void {
  const parts = keyPath.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

export function extractEnvOverrides(options: {
  envPrefix?: string;
  envMap?: Record<string, string>;
  env?: Record<string, string | undefined>;
}): Record<string, any> {
  const env = options.env || process.env;
  const result: Record<string, any> = {};

  // 1. Process explicit env mappings
  if (options.envMap) {
    for (const [envVar, targetPath] of Object.entries(options.envMap)) {
      if (env[envVar] !== undefined) {
        setNestedProperty(result, targetPath, env[envVar]);
      }
    }
  }

  // 2. Process prefix overrides (e.g. APP_DATABASE__PORT -> database.port or APP_PORT -> port)
  if (options.envPrefix) {
    const prefix = options.envPrefix.toUpperCase() + '_';
    for (const [key, val] of Object.entries(env)) {
      if (key.startsWith(prefix) && val !== undefined) {
        const withoutPrefix = key.slice(prefix.length);
        // Replace double underscores with dot for nesting, single underscores kept as lowercase or camelCase
        const dotPath = withoutPrefix
          .toLowerCase()
          .split('__')
          .join('.');
        setNestedProperty(result, dotPath, val);
      }
    }
  }

  return result;
}
