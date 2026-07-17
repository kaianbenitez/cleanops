const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function requireGoogleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

export function buildGoogleAuthUrl(params: { state: string; redirectUri: string }): string {
  const { clientId } = requireGoogleEnv();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "email",
    "profile",
  ].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeGoogleAuthorizationCode(params: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = requireGoogleEnv();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(body.error_description || body.error || "Failed to exchange Google authorization code.");
  }
  return body;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; scope?: string; token_type: string }> {
  const { clientId, clientSecret } = requireGoogleEnv();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string; expires_in?: number; scope?: string; token_type?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Failed to refresh Google access token.");
  }
  return { access_token: body.access_token, expires_in: body.expires_in ?? 0, scope: body.scope, token_type: body.token_type ?? "Bearer" };
}

export function decodeJwtPayload<T extends Record<string, unknown>>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export type GmailMessageInput = {
  accessToken: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export async function sendGmailMessage(input: GmailMessageInput): Promise<{ id: string; threadId?: string }> {
  const message = buildRfc822Message(input);
  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: message }),
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: { message?: string } };
  if (!response.ok || !body.id) {
    throw new Error(body.error?.message || "Failed to send Gmail message.");
  }
  return { id: body.id, threadId: body.threadId };
}

function buildRfc822Message(input: GmailMessageInput): string {
  const headers = [
    `From: ${formatAddress(input.fromEmail)}`,
    `To: ${formatAddress(input.to)}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    input.replyTo ? `Reply-To: ${formatAddress(input.replyTo)}` : null,
    input.html ? 'Content-Type: multipart/alternative; boundary="cleanops-boundary"' : "Content-Type: text/plain; charset=UTF-8",
  ].filter(Boolean) as string[];

  let body = "";
  if (input.html) {
    body = [
      `--cleanops-boundary`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      input.text,
      "",
      `--cleanops-boundary`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      input.html,
      "",
      `--cleanops-boundary--`,
      "",
    ].join("\r\n");
  } else {
    body = input.text;
  }

  const raw = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(raw)
    .toString("base64url");
}

function formatAddress(email: string): string {
  return email.includes("<") ? email : `<${email}>`;
}
