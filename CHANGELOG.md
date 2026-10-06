# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-06

### Added
- Initial public release of `@juancastingo/safe-config`.
- Multi-format file loading supporting `.json`, `.yaml`/`.yml`, `.toml`, and `.env`.
- Cascading file inheritance with deep merging.
- Typed schema builder (`string`, `number`, `boolean`, `array`, `object`) with validation, transforms, and defaults.
- Environment variable overrides with prefixes (e.g. `APP_DATABASE__PORT`) and explicit key maps.
- Automatic and explicit secret masking (`***[REDACTED]***`) with custom `util.inspect` hook preventing accidental credential leaks in `console.log`.
- Dual CJS and ESM distribution with full TypeScript declarations.
