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
export async function getAuthToken(interactive = true) {
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
  if (!token) return;

  // Remove from Chrome's internal token cache
  await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));

  // Revoke on Google's servers
  await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
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
  let token = await getAuthToken(false);

  const makeRequest = (t) =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${t}`,
      },
    });

  let response = await makeRequest(token);

  // If 401, remove cached token and retry once with a fresh one
  if (response.status === 401) {
    await new Promise((resolve) =>
      chrome.identity.removeCachedAuthToken({ token }, resolve)
    );
    token = await getAuthToken(true);
    response = await makeRequest(token);
  }

  return response;
}
