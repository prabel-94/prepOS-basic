import { getClient } from "./core/get-client.js";

export async function createDraft(title, questions, duration) {
  try {
    const sb = await getClient();

    const session = await sb.auth.getSession();
    const accessToken = session?.data?.session?.access_token;

    if (!accessToken) {
      alert("Please sign in to create draft.");
      return null;
    }

    const res = await fetch(
      `${window.SUPABASE_URL}/functions/v1/create-exam`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title,
          duration,
          questions,
        }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Create exam failed:", res.status, errorText);
      alert(`Create draft failed (${res.status})`);
      return null;
    }

    const data = await res.json();

    console.log("CREATE EXAM RESPONSE:", data);

    if (data.error) {
      console.error(data.error);
      alert(data.error);
      return null;
    }

    const draftId =
      data.draft_id || data.draft?.id || data.id || null;

    if (!draftId) {
      console.error("Draft ID missing", data);
      alert("Draft created but ID missing");
      return null;
    }

    return `draft.html?id=${draftId}`;
  } catch (err) {
    console.error(err);
    alert("Failed to create draft");
    return null;
  }
}
