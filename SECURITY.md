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

## Data and accuracy

- PDF/image parsing happens in the browser before confirmation.
- After confirmation, the original is stored in private R2 and structured
  action data plus a bounded text excerpt are stored in D1.
- The current release has no user-facing retention or deletion workflow and
  does not malware-scan uploads. Avoid real sensitive documents in demos.
- Extracted dates and payments are suggestions. Verify financial, legal, and
  medical deadlines against the source document.
