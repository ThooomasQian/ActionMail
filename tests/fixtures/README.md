# Real-world fixture protocol

ActionMail's extraction behavior is checked against public documents and
open-source OCR fixtures rather than only hand-written happy paths. The binary
files are intentionally not committed. `remote-assets.json` records stable
URLs, checksums, licenses, and expected product behavior.

## Evaluation rules

- Run every file through the browser UI so PDF.js and Tesseract.js use the same
  code path as production.
- A date or amount is not sufficient evidence of user intent by itself.
- Automatic withdrawals, completed receipts, balances, and table labels should
  not become tasks.
- Conflicting repeated fields keep the first high-quality action mention and
  require human review rather than silently creating duplicates.
- Low OCR confidence must be visible and must cap action confidence.
- Download fixtures to a temporary directory and verify SHA-256 before use.

## Current baseline findings

- The original parser produced 8 candidates for the IRS CP14, although only one
  primary payment action exists.
- It produced 8 false actions from a CFPB Closing Disclosure by treating `due`
  and `payment` labels as commands.
- It produced a false action from explanatory Chinese prose containing the noun
  `支付`.
- The high-resolution CFPB scan was slow and mixed table columns; direct image
  input now downsizes oversized scans before OCR.
- Printed multi-line Chinese was readable. A photographed train ticket with
  folds, background texture, and mixed typefaces was low-confidence and should
  be presented as a manual-review case.

## Current evaluated behavior

- IRS CP14 now yields one payment task with the correct amount and primary due
  date instead of eight overlapping candidates.
- Closing Disclosure totals and contact-table labels are suppressed; four
  explicit directives remain for review.
- The CFPB statement scan yields one $53 minimum-payment task. Its OCR output
  compresses `4/20/12` to `472012`, so the date is intentionally left unset.
- The Azure receipt and explanatory Chinese sample yield zero tasks.
- The Chinese train-ticket photo yields zero tasks and visibly enters the
  low-confidence review path.

These are browser-observed results, while `tests/extract-actions.test.mjs`
provides the fast deterministic regression layer for parser behavior.
