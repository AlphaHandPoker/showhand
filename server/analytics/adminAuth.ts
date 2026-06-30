import crypto from 'node:crypto';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  return pw || null;
}

export function createAdminToken(): string | null {
  const secret = getAdminPassword();
  if (!secret) return null;
  const issued = Date.now().toString();
  const sig = crypto.createHmac('sha256', secret).update(issued).digest('hex');
  return `${issued}.${sig}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  const secret = getAdminPassword();
  if (!secret || !token) return false;

  const [issued, sig] = token.split('.');
  if (!issued || !sig) return false;

  const age = Date.now() - Number(issued);
  if (!Number.isFinite(age) || age < 0 || age > TOKEN_TTL_MS) return false;

  const expected = crypto.createHmac('sha256', secret).update(issued).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  const secret = getAdminPassword();
  if (!secret) return false;
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
