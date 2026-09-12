# Contributing to ActionMail

Thank you for improving ActionMail. Contributions that make document
extraction more accurate, explainable, private, or accessible are welcome.

## Development setup

Use Node.js 22.13 or later and pnpm 11.25.

```bash
pnpm install --frozen-lockfile
pnpm run db:generate
pnpm run dev
```

The development server supplies a local mock identity. Do not commit generated
OCR assets, local databases, environment files, or documents used for manual
testing.

## Before opening a pull request

```bash
pnpm test
pnpm run lint
pnpm exec tsc --noEmit
pnpm run build
```

- Add a focused regression test for extraction changes.
- Keep every extracted field linked to source evidence.
- Prefer abstaining over inventing an uncertain date or amount.
- Use synthetic, public-domain, or appropriately licensed fixtures. Store
  remote fixture metadata and checksums rather than redistributing binaries.
- Describe behavior changes and known limitations in the pull request.

## Reporting security issues

Follow [SECURITY.md](SECURITY.md) and use GitHub's private vulnerability
reporting flow. Never attach a real sensitive document to a public issue.
