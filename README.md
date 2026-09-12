# ActionMail

[![CI](https://github.com/ThooomasQian/ActionMail/actions/workflows/ci.yml/badge.svg)](https://github.com/ThooomasQian/ActionMail/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

ActionMail turns bills, notices, appointment letters, and scanned forms into a
small, verifiable action inbox. It extracts text in the browser, proposes
deadlines and payments with evidence, and saves only what the user confirms.

Built by **Thomas Qian** as a production-oriented multimodal software project.

## Why it exists

Important tasks are often hidden inside documents rather than task managers.
ActionMail closes that gap without sending every personal document to an
external model:

1. Drop in a PDF, image, or text file.
2. Extract embedded PDF text or run English/Chinese OCR locally.
3. Detect action language, dates, organizations, amounts, and source evidence.
4. Let the user edit or remove every suggestion.
5. Store confirmed tasks in D1 and the private original in R2.
6. Track completion or export open deadlines as an RFC 5545 calendar.

## Engineering highlights

- **Multimodal, local-first ingestion** — PDF.js reads digital PDFs and
  Tesseract.js handles scanned pages, PNG, JPEG, and WebP in the browser.
- **Hybrid document reasoning** — a deterministic evidence parser supports
  English and simplified Chinese, distinguishes commands from financial-table
  labels, resolves several date formats, associates nearby fields with explicit
  instructions, and merges conflicting duplicate payment mentions.
- **Human-in-the-loop UI** — every action is editable and includes the exact
  document quote that produced it.
- **Real persistence** — structured data lives in Cloudflare D1; original files
  live in a private R2 bucket and are streamed only after an ownership check.
- **Identity isolation** — every API request derives the stable user ID from
  Sign in with ChatGPT headers and scopes every query by that ID.
- **Agent-ready surface** — progressive WebMCP tools can list or complete
  actions while unsupported browsers continue to work normally.
- **No API key required** — the deployed MVP has no paid inference dependency.
- **Observable uncertainty** — OCR confidence is shown in the review UI, caps
  candidate confidence, and triggers a manual-review warning below 65%.

## Architecture

    PDF / image / text
            |
            v
    Browser PDF text + OCR  --->  evidence-linked action candidates
            |                                  |
            +---------- user review -----------+
                               |
                      authenticated API
                        /             \
                  D1 action data    R2 originals
                        |
                 inbox + ICS export

The Cloudflare Worker never runs Tesseract in its request path. That keeps CPU
and memory predictable while preserving a strong privacy boundary: the source
file is not uploaded until the user presses **Confirm and save**.

The authentication boundary assumes deployment behind OpenAI Sites, which
authenticates users and supplies the identity headers. A different public host
must authenticate users itself and strip untrusted copies of those headers.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.25.

    pnpm install
    pnpm run db:generate
    pnpm run build
    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js \
      d1 execute DB --local --config dist/server/wrangler.json \
      --persist-to .wrangler/state \
      --file drizzle/0000_productive_daimon_hellstrom.sql
    pnpm run dev

The development server supplies a local mock user. Production is private and
requires Sign in with ChatGPT.

## Validation

The current release passes:

- ESLint
- TypeScript strict type checking
- Vinext/Cloudflare production build
- Local D1 migration
- Browser flow: sample extraction → edit review → D1/R2 save → completion →
  reload persistence
- Same-origin PDF worker and English/Chinese OCR asset packaging
- 9 deterministic extraction regression tests covering English/Chinese
  directives, receipt false positives, duplicate/conflicting payments, two-digit
  years, invalid dates, yuan suffixes, and OCR punctuation noise

Run the same checks locally:

    pnpm test
    pnpm run lint
    pnpm exec tsc --noEmit
    pnpm run build

### Public-document evaluation

The browser workflow was also exercised with reproducible public and
open-source fixtures. URLs, SHA-256 checksums, licenses, and intended behavior
are recorded in `tests/fixtures/remote-assets.json`; fixture binaries are not
redistributed from this repository.

| Fixture | Before | Current result |
| --- | --- | --- |
| IRS CP14 notice | 8 noisy candidates | 1 primary payment action: $1,075.21 due 2018-02-20 |
| CFPB Closing Disclosure | 8 table-label false actions | 4 evidence-backed review/contact/payment directives; financial totals suppressed |
| CFPB card-statement scan | 8 mixed table candidates | 1 $53 minimum-payment action; corrupted OCR date is left blank for review |
| Azure photographed receipt | Not in the original test set | 0 actions at 92% OCR confidence |
| CnOCR explanatory Chinese | False action from the noun `支付` | 0 actions at 93% OCR confidence |
| CnOCR photographed train ticket | Not in the original test set | 0 actions and a visible 51% low-confidence warning |

These results deliberately measure product behavior, not just raw OCR. A
plausible amount or date without an instruction should not enter a user's task
inbox.

## Current scope

ActionMail is intentionally a deployable v1 rather than a generic chatbot.
Dates and amounts are suggestions, never silent automation. The next research
iteration can add bounding-box-aware field linking and an optional small
vision-language fallback for low-confidence documents. The main known failure
is layout OCR that compresses a date such as `4/20/12` into `472012`, or makes
it indistinguishable from a month/year such as `4/2012`; ActionMail currently
leaves that date blank instead of guessing.

## License

Apache License 2.0. Copyright 2026 Thomas Qian. Third-party dependencies and
fixtures retain their respective licenses; remote fixture binaries are not
redistributed by this repository.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Please report
security issues through the process in [SECURITY.md](SECURITY.md).
