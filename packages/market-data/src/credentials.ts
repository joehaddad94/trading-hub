export type S3Credentials = { accessKeyId: string; secretAccessKey: string };

export type CredentialCheck = { ok: true; credentials: S3Credentials } | { ok: false; error: string };

const NAMES = { accessKeyId: 'DUKASCOPY_S3_ACCESS_KEY_ID', secretAccessKey: 'DUKASCOPY_S3_SECRET_ACCESS_KEY' } as const;

/**
 * Trims the keys and rejects one with whitespace inside. A key pasted into Vercel more than once (13–17 Oct 2026:
 * the access key ID three times, one per line) otherwise reaches the request signer and fails as an opaque
 * "invalid header value" that also prints the key. The error names the variable, never its value.
 */
export function checkS3Credentials(raw: S3Credentials): CredentialCheck {
  const credentials = { accessKeyId: raw.accessKeyId.trim(), secretAccessKey: raw.secretAccessKey.trim() };
  for (const field of ['accessKeyId', 'secretAccessKey'] as const) {
    if (/\s/.test(credentials[field])) {
      return {
        ok: false,
        error: `${NAMES[field]} has spaces or line breaks inside (pasted more than once?). Re-enter it in Vercel › Settings › Environment Variables, then redeploy.`,
      };
    }
  }
  return { ok: true, credentials };
}
