# Clinical Reasoning Language Monorepo

## Workspace & Monorepo Structure

This repository uses **npm workspaces** to manage multiple packages in a monorepo structure. The main package is located in `packages/crl`.

### Key Points:
- **Root `package.json`** defines the workspaces (see the `workspaces` field).
- **Each package** (e.g., `crl`) has its own `package.json` and (optionally) its own `tsconfig.json` for local TypeScript settings.
- **Root `tsconfig.json`** provides base TypeScript configuration. It is extended by each package's own `tsconfig.json`.
- **Root `tsconfig.json`** does not directly include or exclude source/test files from packages. Each package controls its own files.
- **ESLint** is configured to lint only TypeScript files. JS config files (like `jest.config.js`) are ignored via `.eslintignore`.

### Adding a New Package
1. Create a new directory under `packages/` (e.g., `packages/newpkg`).
2. Add a `package.json` and (optionally) a `tsconfig.json` that extends the root config.
3. Add the new package path to the `workspaces` array in the root `package.json`.
4. Run `npm install` at the root to update workspace links.

### Running Scripts
- To run scripts for a specific package, use:
  ```sh
  npm run <script> --workspace=<package-name>
  ```
  For example:
  ```sh
  npm test --workspace=@smile-digital-health/crl
  ```

### Linting & Formatting
- ESLint and Prettier are configured at the root.
- JS config files are ignored by ESLint (see `.eslintignore`).

## 📚 Additional Documentation

- [CRL Package README](packages/crl/README.md)
- [CRL User Guide](packages/crl/USER_GUIDE.md)
- [VS Code Extension README](packages/crl-vscode/README.md)

---
