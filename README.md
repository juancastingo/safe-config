# @juancastingo/safe-config

[![CI](https://github.com/juancastingo/safe-config/actions/workflows/ci.yml/badge.svg)](https://github.com/juancastingo/safe-config/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@juancastingo/safe-config.svg)](https://www.npmjs.com/package/@juancastingo/safe-config)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)

**SafeConfig** is a type-safe configuration engine for Node.js and TypeScript applications. It seamlessly loads and merges configurations across **`.env`**, **JSON**, **YAML**, and **TOML**, performs strict runtime schema validation, supports hierarchical environment variable overrides, and **automatically prevents secret leakage** in application logs and serialization.

---

## Key Features

- 📁 **Universal Format Support**: Seamlessly load and cascade `.json`, `.yaml`, `.yml`, `.toml`, and `.env` files.
- 🔒 **Zero-Leakage Secret Protection**:
  - Automatically flags and redacts sensitive keys (`apiKey`, `password`, `token`, `secret`, `webhook`, etc.) as `***[REDACTED]***`.
  - Overrides `util.inspect` and `console.log()` so that printing configuration objects **never dumps raw credentials into your terminal or log pipelines**.
  - Provides a safe `.toRedacted()` snapshot and `.toJSONString()`.
- 🛡️ **Strict Runtime Validation**: Schema builders for `string`, `number` (with `.port()`, `.min()`, `.max()`, `.int()`), `boolean`, `array`, and nested `object`.
- ⚡ **Environment Variable Overrides**: Supports standard 12-factor overrides via prefixes (`APP_DATABASE__PORT` $\rightarrow$ `database.port`) and explicit mappings.
- 📦 **Dual Module & Zero Hassle**: Native CJS and ESM distributions with first-class TypeScript declarations.

---

## Installation

```bash
npm install @juancastingo/safe-config
# or
pnpm add @juancastingo/safe-config
# or
yarn add @juancastingo/safe-config
```

---

## Quick Start

### 1. Define Schema and Load Configuration

```typescript
import { safeConfig, schema } from '@juancastingo/safe-config';

// Define a type-safe configuration schema
const appSchema = {
  server: schema.object({
    host: schema.string({ default: '0.0.0.0' }),
    port: schema.number().port().default(3000),
  }),
  database: schema.object({
    host: schema.string({ default: 'localhost' }),
    port: schema.number().port().default(5432),
    password: schema.string().secret(), // explicitly protected
  }),
  auth: schema.object({
    jwtSecret: schema.string().secret(),
  }),
  logLevel: schema.string({ default: 'info' }),
};

// Load and cascade configuration files + env overrides
const config = safeConfig.load(appSchema, {
  files: [
    './config/default.json',
    './config/production.yaml',
    './.env',
  ],
  envPrefix: 'APP', // APP_SERVER__PORT -> server.port
});

// Access values with full static TypeScript autocompletion:
console.log(config.values.server.port); // 3000 (number)
console.log(config.values.database.password); // Plaintext in your DB client
```

### 2. Accidental Secret Leakage Prevention

```typescript
// Accidentally logging your config object in production?
console.log(config.values);
// Output:
// {
//   server: { host: '0.0.0.0', port: 3000 },
//   database: { host: 'localhost', port: 5432, password: '***[REDACTED]***' },
//   auth: { jwtSecret: '***[REDACTED]***' },
//   logLevel: 'info'
// }

// Exporting config to logs or monitoring:
console.log(config.toJSONString()); // Completely redacted JSON
```

---

## Environment Variable Overrides

SafeConfig supports standard 12-factor deployment patterns using nested double underscores (`__`):

```bash
APP_SERVER__PORT=8080
APP_DATABASE__HOST=db.prod.internal
```

Mapped to:
```typescript
safeConfig.load(schema, {
  envPrefix: 'APP',
});
```

You can also specify explicit environment variable aliases:

```typescript
safeConfig.load(schema, {
  envMap: {
    PORT: 'server.port',
    DATABASE_URL: 'database.url',
  },
});
```

---

## Schema Builders

| Builder | Modifiers | Description |
| :--- | :--- | :--- |
| `schema.string()` | `.default(v)`, `.optional()`, `.secret()`, `.validate(fn)`, `.transform(fn)` | String value parser |
| `schema.number()` | `.port()`, `.min(n)`, `.max(n)`, `.int()`, `.default(v)`, `.optional()` | Coerces strings & validates numbers |
| `schema.boolean()` | `.default(v)`, `.optional()` | Accepts `true/false`, `1/0`, `yes/no` |
| `schema.array(item)`| `.default([])`, `.optional()` | Arrays, also parses comma-delimited strings |
| `schema.object(shape)`| `.default({})`, `.optional()` | Hierarchical nested configurations |

---

## License

MIT License © 2026 Juan Castin
