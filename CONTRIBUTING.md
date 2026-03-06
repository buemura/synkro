# Contributing to Synkro

Thanks for your interest in contributing! This guide will help you get set up and submit your first pull request.

## Project Structure

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces):

```
synkro/
├── packages/
│   ├── core/       → @synkro/core (core library)
│   └── nestjs/     → @synkro/nestjs (NestJS integration)
├── examples/
│   ├── core/       → usage examples for @synkro/core
│   └── nestjs/     → usage examples for @synkro/nestjs
├── package.json            → root workspace config
├── pnpm-workspace.yaml     → workspace definition
└── tsconfig.base.json      → shared TypeScript config
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9

## Getting Started

1. **Fork and clone the repository**

```bash
git clone https://github.com/<your-username>/synkro.git
cd synkro
```

2. **Install dependencies**

```bash
pnpm install
```

This installs dependencies for all packages in the workspace.

3. **Build all packages**

```bash
pnpm run build
```

4. **Run all tests**

```bash
pnpm run test
```

## Development Workflow

### Working on a specific package

You can scope commands to a single package using pnpm's `--filter` flag:

```bash
# Build only core
pnpm --filter @synkro/core build

# Run tests only for nestjs
pnpm --filter @synkro/nestjs test

# Watch mode for core tests
pnpm --filter @synkro/core test:watch
```

### Type checking

```bash
pnpm run type-check
```

## Submitting a Pull Request

1. Create a new branch from `master`:

```bash
git checkout -b feat/my-feature
```

2. Make your changes and ensure everything passes:

```bash
pnpm run build
pnpm run test
pnpm run type-check
```

3. Commit your changes with a clear message:

```bash
git commit -m "feat: add support for ..."
```

We follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:

| Prefix     | Use for                          |
|------------|----------------------------------|
| `feat:`    | New features                     |
| `fix:`     | Bug fixes                        |
| `docs:`    | Documentation changes            |
| `test:`    | Adding or updating tests         |
| `refactor:`| Code changes that don't fix bugs or add features |
| `chore:`   | Maintenance tasks                |

4. Push your branch and open a pull request against `master`.

## Guidelines

- **Keep changes focused** — one feature or fix per PR.
- **Add tests** for new functionality.
- **Don't break existing tests** — run the full test suite before submitting.
- **Follow existing code style** — the project uses TypeScript with strict mode enabled.

## License

By contributing, you agree that your contributions will be licensed under the [ISC License](LICENSE).
