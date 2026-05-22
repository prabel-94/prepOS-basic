/*
PrepOS Runtime Rule:
Use Supabase client for:
- database CRUD
- auth-aware runtime operations
Avoid raw REST fetch for internal tables.
Reason:
- automatic auth propagation
- hydration safety
- singleton runtime consistency
- fewer token bugs
*/

import { getClient } from "./get-client.js"

export async function getDB() {
  return await getClient()
}
