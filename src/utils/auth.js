/**
 * auth.js
 * Handles OAuth2 authentication via Chrome's identity API.
 * Provides functions to get, refresh, and revoke tokens.
 */

import { CONFIG } from "../config.js";

/**
 * Request an OAuth2 access token interactively (shows consent screen if needed).
 * @returns {Promise<string>} Access token
 */
let authRefreshInteractiveDefault = false;

export function setAuthRefreshInteractive(enabled) {
  authRefreshInteractiveDefault = Boolean(enabled);
}

export async function getAuthToken(interactive = true) {
  assertOAuthClientConfigured();
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error("No token returned from identity API."));
        return;
      }
      resolve(token);
    });
  });
}

function assertOAuthClientConfigured() {
  const manifestClientId = String(chrome.runtime.getManifest?.()?.oauth2?.client_id || "").trim();
  const configClientId = String(CONFIG.OAUTH_CLIENT_ID || "").trim();

  if (!manifestClientId || manifestClientId.includes("YOUR_CLIENT_ID")) {
    throw new Error(
      "OAuth client ID is not configured in manifest.json. Update oauth2.client_id and reload the extension."
    );
  }

  if (
    configClientId &&
    !configClientId.includes("YOUR_CLIENT_ID") &&
    configClientId !== manifestClientId
  ) {
    console.warn("[Auth] CONFIG.OAUTH_CLIENT_ID differs from manifest oauth2.client_id.");
  }
}

/**
 * Silently get a cached token (non-interactive). Used for background sync.
 * @returns {Promise<string|null>} Access token or null if not authenticated
 */
export async function getAuthTokenSilent() {
  try {
    return await getAuthToken(false);
  } catch {
    return null;
  }
}

/**
 * Revoke the current OAuth token and clear cached credentials.
 * Useful for "Sign Out" functionality.
 */
export async function revokeAuthToken() {
  const token = await getAuthTokenSilent();

  if (token) {
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
  }

  if (typeof chrome.identity.clearAllCachedAuthTokens === "function") {
    await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
  }

  // Clear any manually stored override token
  await clearOverrideToken();
}

// ─── Override token (from launchWebAuthFlow) ──────────────────────────────────
// chrome.identity.getAuthToken re-uses the old OAuth grant silently even after
// clearAllCachedAuthTokens. The only way to guarantee a fresh consent screen
// with new scopes is launchWebAuthFlow + prompt=consent. Tokens from that flow
// aren't stored in Chrome's cache, so we manage them here in session storage.

const OVERRIDE_KEY = "oauthOverrideToken";

async function getOverrideToken() {
  if (!chrome.storage?.session) return null;
  return new Promise((resolve) => {
    chrome.storage.session.get(OVERRIDE_KEY, (result) => {
      const entry = result?.[OVERRIDE_KEY];
      if (!entry) { resolve(null); return; }
      if (Date.now() > entry.expiresAt) {
        chrome.storage.session.remove(OVERRIDE_KEY, () => {});
        resolve(null);
        return;
      }
      resolve(entry.token);
    });
  });
}

async function setOverrideToken(token) {
  if (!chrome.storage?.session) return;
  // OAuth access tokens are valid for 1 hour; store for 55 minutes to be safe
  await new Promise((resolve) =>
    chrome.storage.session.set(
      { [OVERRIDE_KEY]: { token, expiresAt: Date.now() + 55 * 60 * 1000 } },
      resolve
    )
  );
}

async function clearOverrideToken() {
  if (!chrome.storage?.session) return;
  await new Promise((resolve) => chrome.storage.session.remove(OVERRIDE_KEY, resolve));
}

/**
 * Force a fresh interactive OAuth grant with all current manifest scopes.
 * Revokes the existing token at Google's server first, which guarantees that
 * getAuthToken will show a real consent screen (including any new scopes like
 * calendar.readonly) instead of silently reusing the old grant.
 *
 * @returns {Promise<string>} Fresh access token
 */
export async function forceReauth() {
  // Step 1: Revoke the current token at Google's server so the underlying grant
  // is invalidated. This forces a real consent screen on the next auth call —
  // clearAllCachedAuthTokens alone only clears Chrome's local cache; Google
  // still has the old grant and getAuthToken would silently reuse it.
  const currentToken = await getAuthTokenSilent().catch(() => null);
  if (currentToken) {
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${currentToken}`).catch(() => {});
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token: currentToken }, resolve));
  }

  // Step 2: Clear ALL locally cached tokens as a belt-and-suspenders measure
  if (typeof chrome.identity.clearAllCachedAuthTokens === "function") {
    await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
  }
  await clearOverrideToken();

  // Step 3: Interactive auth — because the old grant was revoked server-side,
  // Google will show a fresh consent screen with ALL manifest scopes,
  // including calendar.readonly. No redirect_uri registration needed.
  const token = await getAuthToken(true);

  // Cache in session storage so authenticatedFetch uses it immediately
  await setOverrideToken(token);
  return token;
}

/**
 * Get the authenticated user's email address.
 * @param {string} token - Valid access token
 * @returns {Promise<string>} User email
 */
export async function getUserEmail(token) {
  const resp = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error("Failed to fetch user info.");
  const data = await resp.json();
  return data.email;
}

/**
 * Wraps a fetch call with automatic token refresh on 401.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(url, options = {}) {
  const {
    authInteractiveOnRefresh = authRefreshInteractiveDefault,
    ...fetchOptions
  } = options;

  // Prefer the manually granted override token (from forceReauth / launchWebAuthFlow)
  // because it carries all current manifest scopes including newly added ones.
  const override = await getOverrideToken();
  let token = override || await getAuthToken(false);

  const makeRequest = (t) =>
    fetch(url, {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        Authorization: `Bearer ${t}`,
      },
    });

  let response = await makeRequest(token);

  // If 401, clear tokens and retry once with a fresh one
  if (response.status === 401) {
    await clearOverrideToken();
    await new Promise((resolve) =>
      chrome.identity.removeCachedAuthToken({ token }, resolve)
    );
    try {
      token = await getAuthToken(false);
      response = await makeRequest(token);
    } catch {
      if (!authInteractiveOnRefresh) {
        return response;
      }
      try {
        token = await getAuthToken(true);
        response = await makeRequest(token);
      } catch {
        return response;
      }
    }
    if (!response.ok && response.status === 401) {
      // Keep original 401 response when refresh is not possible in this context.
      return response;
    }
  }

  return response;
}
