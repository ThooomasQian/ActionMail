# Security policy

## Reporting

Please use this repository's **Security** tab to report vulnerabilities
privately. Use synthetic or redacted documents in reports; do not attach real
bills, notices, account numbers, or identity documents to a public issue.

## Deployment boundary

ActionMail trusts identity headers only when it runs behind OpenAI Sites, whose
edge authenticates the user and supplies those headers. Do not expose the
Worker directly on another host unless that host authenticates every request
and removes client-supplied copies of the identity headers.

The public GitHub Pages demo is a separate static deployment. It has no login,
server API, D1 database, or R2 bucket and does not use identity headers. PDF and
image processing happens in the browser, and confirmed action items remain in
that browser's `localStorage`. Anyone with access to the same browser profile
may be able to read that local data; clear the site's browser storage after
testing on a shared device.

## Data and accuracy

- PDF/image parsing happens in the browser before confirmation in both
  deployment profiles.
- In the full hosted application, after confirmation, the original is stored
  in private R2 and structured action data plus a bounded text excerpt are
  stored in D1. The public static demo never performs that upload.
- The current release has no user-facing retention or deletion workflow and
  does not malware-scan uploads. Avoid real sensitive documents in demos.
- Extracted dates and payments are suggestions. Verify financial, legal, and
  medical deadlines against the source document.
