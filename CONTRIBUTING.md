# Contributing to SafeConfig

Thank you for considering contributing to `@juancastingo/safe-config`!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/juancastingo/safe-config.git
   cd safe-config
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests and type checks:
   ```bash
   npm test
   npm run typecheck
   npm run build
   ```

## Pull Request Guidelines

- Ensure all existing tests pass and add new unit tests for any added features or bug fixes.
- Maintain TypeScript strict mode compliance with no `any` leaks.
- Ensure all secrets continue to be strictly masked during inspection and serialization.
- Open a GitHub issue or PR explaining the motivation for the change.
