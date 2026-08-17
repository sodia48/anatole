export const SESSION_COOKIE_NAME = "anatole_session";

export function sessionCookie(
  value: string,
  expires: Date,
  production = process.env.NODE_ENV === "production",
) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: production,
    path: "/",
    expires,
  };
}

export function expiredSessionCookie(
  production = process.env.NODE_ENV === "production",
) {
  return {
    ...sessionCookie("", new Date(0), production),
    maxAge: 0,
  };
}
