import { db, usersTable } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import * as oidc from 'openid-client';
import { z } from 'zod';

import {
  clearSession,
  createSession,
  deleteSession,
  getOidcConfig,
  getSession,
  getSessionId,
  hashPassword,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
  verifyPassword,
} from '../lib/auth';

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();
const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  password: z.string().min(8).max(128),
});
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function attemptKey(req: Request, username: string) {
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${username.toLowerCase()}`;
}

function isRateLimited(key: string) {
  const current = loginAttempts.get(key);
  if (!current || current.expiresAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const current = loginAttempts.get(key);
  if (!current || current.expiresAt <= Date.now()) {
    loginAttempts.set(key, { count: 1, expiresAt: Date.now() + ATTEMPT_WINDOW_MS });
  } else {
    current.count += 1;
  }
  if (loginAttempts.size > 10_000) {
    for (const [candidate, attempt] of loginAttempts) {
      if (attempt.expiresAt <= Date.now()) loginAttempts.delete(candidate);
    }
  }
}

function clearFailedAttempts(key: string) {
  loginAttempts.delete(key);
}

function publicUser(user: {
  id: string;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
}

function getOrigin(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host =
    req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost';
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorStatus(
  value: Record<string, unknown>,
): number | string | undefined {
  if (typeof value.status === 'number' || typeof value.status === 'string') {
    return value.status;
  }
  if (
    typeof value.statusCode === 'number' ||
    typeof value.statusCode === 'string'
  ) {
    return value.statusCode;
  }
  return undefined;
}

function getSafeErrorMetadata(error: unknown) {
  if (!isRecord(error)) {
    return { errorName: typeof error };
  }

  const errorStatus = getErrorStatus(error);
  const causeStatus = isRecord(error.cause)
    ? getErrorStatus(error.cause)
    : undefined;

  return {
    errorName: error instanceof Error ? error.name : 'Error',
    errorStatus: errorStatus ?? causeStatus,
  };
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get('/auth/user', (req: Request, res: Response) => {
  res.json({
    user: req.isAuthenticated() ? req.user : null,
    authMethod: req.isAuthenticated() ? req.authMethod ?? 'replit' : null,
  });
});

router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Choisis un pseudo de 3 à 32 caractères et un mot de passe d’au moins 8 caractères.' });
    return;
  }

  const username = parsed.data.username.toLowerCase();
  const key = attemptKey(req, 'register');
  if (isRateLimited(key)) {
    res.setHeader('Retry-After', '600');
    res.status(429).json({ error: 'Trop de tentatives de création. Réessaie dans quelques minutes.' });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    firstName: username,
  }).onConflictDoNothing().returning({
    id: usersTable.id,
    username: usersTable.username,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    profileImageUrl: usersTable.profileImageUrl,
  });

  if (!user) {
    recordFailedAttempt(key);
    res.status(409).json({ error: 'Ce pseudo est déjà utilisé. Choisis-en un autre.' });
    return;
  }

  clearFailedAttempts(key);
  const sessionData: SessionData = {
    provider: 'password',
    user: publicUser(user),
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.status(201).json({ user: publicUser(user), authMethod: 'password' });
});

router.post('/auth/password/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Pseudo ou mot de passe invalide.' });
    return;
  }

  const username = parsed.data.username.toLowerCase();
  const key = attemptKey(req, username);
  if (isRateLimited(key)) {
    res.setHeader('Retry-After', '600');
    res.status(429).json({ error: 'Trop de tentatives de connexion. Réessaie dans quelques minutes.' });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    profileImageUrl: usersTable.profileImageUrl,
    passwordHash: usersTable.passwordHash,
  }).from(usersTable).where(sql`lower(${usersTable.username}) = ${username}`).limit(1);

  const verified = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
  if (!user || !verified) {
    recordFailedAttempt(key);
    res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
    return;
  }

  clearFailedAttempts(key);
  const sessionData: SessionData = {
    provider: 'password',
    user: publicUser(user),
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ user: publicUser(user), authMethod: 'password' });
});

router.post('/auth/logout', async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  if (sid) {
    const session = await getSession(sid);
    if (session?.provider === 'replit' || (session && !session.provider && session.access_token)) {
      res.status(400).json({ error: 'Utilise la déconnexion du fournisseur pour fermer cette session.' });
      return;
    }
  }
  await clearSession(res, sid);
  res.json({ success: true });
});

router.get('/login', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: 'openid email profile offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'login consent',
    state,
    nonce,
  });

  setOidcCookie(res, 'code_verifier', codeVerifier);
  setOidcCookie(res, 'nonce', nonce);
  setOidcCookie(res, 'state', state);
  setOidcCookie(res, 'return_to', returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get('/callback', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect('/api/login');
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect('/api/login');
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie('code_verifier', { path: '/' });
  res.clearCookie('nonce', { path: '/' });
  res.clearCookie('state', { path: '/' });
  res.clearCookie('return_to', { path: '/' });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect('/api/login');
    return;
  }

  const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    provider: 'replit',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get('/logout', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const postLogoutRedirectUrl = new URL(returnTo, `${origin}/`).href;

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutRedirectUrl,
  });

  res.redirect(endSessionUrl.href);
});

router.post(
  '/mobile-auth/token-exchange',
  async (req: Request, res: Response) => {
    const parsed = z.object({
      code: z.string().min(1),
      code_verifier: z.string().min(1),
      redirect_uri: z.string().url(),
      state: z.string().min(1),
      nonce: z.string().min(1).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required parameters' });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set('code', code);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('iss', ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: 'No claims in ID token' });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        provider: 'replit',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
       res.json({ token: sid });
    } catch (err) {
      req.log.error(getSafeErrorMetadata(err), 'Mobile token exchange error');
      res.status(500).json({ error: 'Token exchange failed' });
    }
  },
);

router.post('/mobile-auth/logout', async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json({ success: true });
});

export default router;
