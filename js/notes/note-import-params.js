/**
 * URL params for notes-import.html (?id= or ?topic=).
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTopicId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function getTopicIdFromUrl(location = window.location) {
  const params = new URLSearchParams(location.search);
  const raw = params.get("topic") || params.get("id");
  const trimmed = raw?.trim() ?? "";
  return isValidTopicId(trimmed) ? trimmed : null;
}
