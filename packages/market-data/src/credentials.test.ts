import { describe, expect, it } from 'vitest';
import { checkS3Credentials } from './credentials';

const ID = 'AKIAEXAMPLEEXAMPLE12';
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

describe('checkS3Credentials', () => {
  it('passes clean keys through', () => {
    expect(checkS3Credentials({ accessKeyId: ID, secretAccessKey: SECRET })).toEqual({
      ok: true,
      credentials: { accessKeyId: ID, secretAccessKey: SECRET },
    });
  });

  it('trims a trailing newline or spaces', () => {
    const result = checkS3Credentials({ accessKeyId: ` ${ID}\n`, secretAccessKey: `${SECRET}\r\n` });
    expect(result).toEqual({ ok: true, credentials: { accessKeyId: ID, secretAccessKey: SECRET } });
  });

  it('rejects a key pasted three times, naming the variable but not the key', () => {
    const result = checkS3Credentials({ accessKeyId: `${ID}\n${ID}\n${ID}`, secretAccessKey: SECRET });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/DUKASCOPY_S3_ACCESS_KEY_ID has spaces or line breaks/);
    expect(result.error).not.toContain(ID);
  });

  it('rejects a secret with a space inside', () => {
    const result = checkS3Credentials({ accessKeyId: ID, secretAccessKey: `${SECRET} ${SECRET}` });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/DUKASCOPY_S3_SECRET_ACCESS_KEY/) });
  });
});
