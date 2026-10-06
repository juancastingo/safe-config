import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import util from 'node:util';
import { safeConfig, schema, SafeConfigError } from '../src/index.js';

test('safe-config basic schema validation & defaults', () => {
  const appSchema = {
    appName: schema.string({ default: 'MyMicroservice' }),
    port: schema.number().port().default(8080),
    debug: schema.boolean({ default: false }),
    tags: schema.array(schema.string()).default(['api', 'v1']),
  };

  const config = safeConfig.load(appSchema, {
    loadEnv: false,
    overrides: {
      port: '3000',
    },
  });

  assert.equal(config.values.appName, 'MyMicroservice');
  assert.equal(config.values.port, 3000);
  assert.equal(config.values.debug, false);
  assert.deepEqual(config.values.tags, ['api', 'v1']);
  assert.equal(config.get('port'), 3000);
});

test('safe-config nested objects and secret masking', () => {
  const dbSchema = {
    server: schema.object({
      host: schema.string({ default: 'localhost' }),
      port: schema.number().port().default(5432),
    }),
    database: schema.object({
      username: schema.string({ default: 'postgres' }),
      password: schema.string().secret(), // explicitly secret
    }),
    customApiKey: schema.string().secret(),
  };

  const config = safeConfig.load(dbSchema, {
    loadEnv: false,
    overrides: {
      database: {
        password: 'SuperSecretDbPassword123!',
      },
      customApiKey: 'api_live_key_9999',
    },
  });

  // Plain values are accessible in code
  assert.equal(config.values.database.password, 'SuperSecretDbPassword123!');
  assert.equal(config.values.customApiKey, 'api_live_key_9999');

  // Redacted view hides secrets
  const redacted = config.toRedacted();
  assert.equal(redacted.database.password, '***[REDACTED]***');
  assert.equal(redacted.customApiKey, '***[REDACTED]***');
  assert.equal(redacted.server.host, 'localhost');

  // Inspect outputs redacted
  const inspected = util.inspect(config);
  assert.match(inspected, /\*\*\*\[REDACTED\]\*\*\*/);
  assert.doesNotMatch(inspected, /SuperSecretDbPassword123!/);

  // JSON string is redacted
  const json = config.toJSONString();
  assert.match(json, /\*\*\*\[REDACTED\]\*\*\*/);
  assert.doesNotMatch(json, /SuperSecretDbPassword123!/);
});

test('safe-config auto-detects sensitive field names', () => {
  const sensitiveSchema = {
    stripeApiKey: schema.string(),
    adminAuthToken: schema.string(),
    userPasswordHash: schema.string(),
    normalConfig: schema.string(),
  };

  const config = safeConfig.load(sensitiveSchema, {
    loadEnv: false,
    autoRedactSecrets: true,
    overrides: {
      stripeApiKey: 'sk_live_12345',
      adminAuthToken: 'token_abcde',
      userPasswordHash: 'hash_xyz',
      normalConfig: 'hello-world',
    },
  });

  const redacted = config.toRedacted();
  assert.equal(redacted.stripeApiKey, '***[REDACTED]***');
  assert.equal(redacted.adminAuthToken, '***[REDACTED]***');
  assert.equal(redacted.userPasswordHash, '***[REDACTED]***');
  assert.equal(redacted.normalConfig, 'hello-world');
});

test('safe-config loads and cascades JSON, YAML, TOML, and .env files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-config-test-'));

  const jsonFile = path.join(tmpDir, 'config.json');
  fs.writeFileSync(jsonFile, JSON.stringify({ app: { name: 'BaseApp', port: 8000 } }));

  const yamlFile = path.join(tmpDir, 'config.yaml');
  fs.writeFileSync(yamlFile, `
app:
  port: 9000
database:
  host: "db.local"
`);

  const tomlFile = path.join(tmpDir, 'config.toml');
  fs.writeFileSync(tomlFile, `
[database]
port = 5433
`);

  const envFile = path.join(tmpDir, '.env');
  fs.writeFileSync(envFile, `
LOG_LEVEL=debug
APP_WORKERS=4
`);

  const appSchema = {
    app: schema.object({
      name: schema.string(),
      port: schema.number(),
    }),
    database: schema.object({
      host: schema.string(),
      port: schema.number(),
    }),
    LOG_LEVEL: schema.string(),
    APP_WORKERS: schema.number(),
  };

  const config = safeConfig.load(appSchema, {
    files: [jsonFile, yamlFile, tomlFile, envFile],
    loadEnv: false,
  });

  // JSON defined app.name and port 8000
  // YAML overridden app.port to 9000 and defined database.host
  // TOML defined database.port
  // .env defined LOG_LEVEL and APP_WORKERS
  assert.equal(config.values.app.name, 'BaseApp');
  assert.equal(config.values.app.port, 9000);
  assert.equal(config.values.database.host, 'db.local');
  assert.equal(config.values.database.port, 5433);
  assert.equal(config.values.LOG_LEVEL, 'debug');
  assert.equal(config.values.APP_WORKERS, 4);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('safe-config environment variable overrides and prefixes', () => {
  process.env.TEST_APP_SERVER__PORT = '4000';
  process.env.TEST_APP_SERVER__HOST = '0.0.0.0';
  process.env.CUSTOM_METRICS_FLAG = 'true';

  const appSchema = {
    server: schema.object({
      port: schema.number().port(),
      host: schema.string(),
    }),
    enableMetrics: schema.boolean(),
  };

  const config = safeConfig.load(appSchema, {
    envPrefix: 'TEST_APP',
    envMap: {
      CUSTOM_METRICS_FLAG: 'enableMetrics',
    },
    overrides: {
      server: {
        port: 3000,
        host: '127.0.0.1',
      },
      enableMetrics: false,
    },
  });

  // Env variables override inline defaults/overrides
  assert.equal(config.values.server.port, 4000);
  assert.equal(config.values.server.host, '0.0.0.0');
  assert.equal(config.values.enableMetrics, true);

  delete process.env.TEST_APP_SERVER__PORT;
  delete process.env.TEST_APP_SERVER__HOST;
  delete process.env.CUSTOM_METRICS_FLAG;
});

test('safe-config throws descriptive errors for missing and invalid types', () => {
  const appSchema = {
    serviceName: schema.string(),
    port: schema.number().port(),
    email: schema.string().validate((v) => v.includes('@') || 'Must be a valid email'),
  };

  try {
    safeConfig.load(appSchema, {
      loadEnv: false,
      overrides: {
        port: 999999, // out of port range
        email: 'invalid-email',
        // serviceName is missing
      },
    });
    assert.fail('Should have thrown SafeConfigError');
  } catch (err: any) {
    assert.ok(err instanceof SafeConfigError);
    assert.equal(err.issues.length, 3);
    const codes = err.issues.map((i: any) => i.code);
    assert.ok(codes.includes('MISSING'));
    assert.ok(codes.includes('VALIDATION_FAILED'));
  }
});
