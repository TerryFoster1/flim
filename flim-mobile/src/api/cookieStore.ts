import * as SecureStore from "expo-secure-store";

const COOKIE_KEY = "flim.native.session.cookie";

export async function getSessionCookie() {
  return SecureStore.getItemAsync(COOKIE_KEY);
}

export async function clearSessionCookie() {
  await SecureStore.deleteItemAsync(COOKIE_KEY);
}

export async function saveSessionCookieFromHeaders(headers: Headers) {
  const rawCookie = headers.get("set-cookie");
  if (!rawCookie) return;

  const sessionMatch = rawCookie.match(/flim_session=([^;,]+)/);
  if (!sessionMatch?.[1]) return;

  await SecureStore.setItemAsync(COOKIE_KEY, `flim_session=${sessionMatch[1]}`);
}
