import { getClient } from "./get-client.js";

async function getAccessToken() {
  const sb = await getClient();
  const { data: userData, error: userError } = await sb.auth.getUser();

  if (userError || !userData?.user) {
    const { data: refreshed, error: refreshError } = await sb.auth.refreshSession();
    if (refreshError || !refreshed?.session?.access_token) {
      throw new Error("Your session expired. Please sign in again.");
    }
    return refreshed.session.access_token;
  }

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();

  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error("Your session expired. Please sign in again.");
  }

  let accessToken = sessionData.session.access_token;
  const expiresAt = sessionData.session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt <= now + 60) {
    const { data: refreshed, error: refreshError } = await sb.auth.refreshSession();
    if (refreshError || !refreshed?.session?.access_token) {
      throw new Error("Your session expired. Please sign in again.");
    }
    accessToken = refreshed.session.access_token;
  }

  return accessToken;
}

/**
 * Invoke a Supabase Edge Function with the current session token.
 * @param {string} name
 * @param {Record<string, unknown>} [body]
 */
export async function invokeEdgeFunction(name, body = {}) {
  const sb = await getClient();
  const accessToken = await getAccessToken();

  const { data, error } = await sb.functions.invoke(name, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    let message = error.message || `${name} failed`;

    if (error.context instanceof Response) {
      const details = await error.context.clone().json().catch(() => null);
      message = details?.error || message;
    }

    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
