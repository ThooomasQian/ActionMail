# Changelog

All notable changes to ActionMail are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-12

### Added

- Browser-local PDF text extraction and English/Chinese OCR.
- Evidence-linked action, deadline, organization, and amount suggestions.
- Human review before persistence to Cloudflare D1 and private R2.
- Inbox completion flow, original-file retrieval, and RFC 5545 calendar export.
- OCR confidence display and an explicit low-confidence review path.
- Reproducible public-document fixture manifest and parser regression suite.

### Improved

- Intent-aware filtering for receipts, financial tables, automatic
  withdrawals, and explanatory uses of payment terms.
- Payment-field association and duplicate handling without merging distinct
  obligations.
- CNY suffixes, OCR currency-symbol noise, two-digit years, and invalid-date
  rejection.

### Known limitations

- Layout OCR can collapse table columns or corrupt compact dates.
- Scene photographs may require manual review.
- The current release does not provide a user-facing retention/deletion flow.
