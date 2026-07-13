const SESSION_COOKIE = "menu_dashboard_session";

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

export function onRequestPost() {
  const cookie = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ].join("; ");

  return jsonResponse(
    { ok: true },
    200,
    { "Set-Cookie": cookie }
  );
}

export function onRequest() {
  return jsonResponse(
    { error: "Método no permitido." },
    405,
    { Allow: "POST" }
  );
}
