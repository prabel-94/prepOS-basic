import { getClient } from "./get-client.js";

async function getAccessToken() {
  const sb = await getClient();
  const { data: sessionData } = await sb.auth.getSession();
  let accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
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
