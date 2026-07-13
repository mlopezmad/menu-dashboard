const SESSION_COOKIE = "menu_dashboard_session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/login.html",
  "/api/login",
  "/style.css",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png"
]);

function textToBytes(text) {
  return new TextEncoder().encode(text);
}

function base64UrlToBytes(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function leerCookies(request) {
  const cabecera = request.headers.get("Cookie") || "";
  const cookies = {};

  cabecera.split(";").forEach(fragmento => {
    const separador = fragmento.indexOf("=");

    if (separador === -1) return;

    const nombre = fragmento.slice(0, separador).trim();
    const valor = fragmento.slice(separador + 1).trim();

    if (nombre) {
      cookies[nombre] = valor;
    }
  });

  return cookies;
}

async function crearFirma(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textToBytes(payload)
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

function comparacionSegura(valorA, valorB) {
  if (
    typeof valorA !== "string" ||
    typeof valorB !== "string" ||
    valorA.length !== valorB.length
  ) {
    return false;
  }

  let diferencia = 0;

  for (let index = 0; index < valorA.length; index++) {
    diferencia |=
      valorA.charCodeAt(index) ^
      valorB.charCodeAt(index);
  }

  return diferencia === 0;
}

async function validarToken(token, secret) {
  if (!token || !secret) return false;

  const partes = token.split(".");

  if (partes.length !== 2) return false;

  const [payloadEncoded, firmaRecibida] = partes;

  const firmaEsperada = await crearFirma(
    payloadEncoded,
    secret
  );

  if (!comparacionSegura(firmaRecibida, firmaEsperada)) {
    return false;
  }

  try {
    const payloadBytes = base64UrlToBytes(payloadEncoded);
    const payloadTexto = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadTexto);

    if (payload.authenticated !== true) {
      return false;
    }

    if (
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function respuestaApiNoAutorizada() {
  return new Response(
    JSON.stringify({
      error: "No autorizado."
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  const sessionSecret = context.env.SESSION_SECRET;

  if (!sessionSecret) {
    return new Response(
      "La protección del Dashboard no está configurada.",
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const cookies = leerCookies(context.request);
  const token = cookies[SESSION_COOKIE];

  const sesionValida = await validarToken(
    token,
    sessionSecret
  );

  if (PUBLIC_PATHS.has(pathname)) {
    if (
      sesionValida &&
      (pathname === "/login" || pathname === "/login.html")
    ) {
      return Response.redirect(
        new URL("/", url.origin).toString(),
        302
      );
    }

    return context.next();
  }

  if (!sesionValida) {
    if (pathname.startsWith("/api/")) {
      return respuestaApiNoAutorizada();
    }

    return Response.redirect(
      new URL("/login", url.origin).toString(),
      302
    );
  }

  const response = await context.next();

  const nuevaRespuesta = new Response(
    response.body,
    response
  );

  nuevaRespuesta.headers.set(
    "Cache-Control",
    "no-store"
  );

  return nuevaRespuesta;
}