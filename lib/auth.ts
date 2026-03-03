import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "felix_user_id";

export function getAuthenticatedUserId() {
  return cookies().get(AUTH_COOKIE_NAME)?.value?.trim() || null;
}
