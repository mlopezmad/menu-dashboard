const SESSION_COOKIE = "menu_dashboard_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

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

function textToBytes(text) {
  return new TextEncoder().encode(text);
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

async function crearToken(secret) {
  const payload = JSON.stringify({
    authenticated: true,
    expiresAt:
      Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  });

  const payloadEncoded = bytesToBase64Url(textToBytes(payload));
  const signature = await crearFirma(payloadEncoded, secret);

  return `${payloadEncoded}.${signature}`;
}

export async function onRequestPost(context) {
  try {
    const dashboardPassword = context.env.DASHBOARD_PASSWORD;
    const sessionSecret = context.env.SESSION_SECRET;

    if (!dashboardPassword || !sessionSecret) {
      return jsonResponse(
        {
          error:
            "La autenticación no está configurada correctamente."
        },
        500
      );
    }

    let body;

    try {
      body = await context.request.json();
    } catch {
      return jsonResponse(
        {
          error: "La solicitud no es válida."
        },
        400
      );
    }

    const password =
      typeof body?.password === "string"
        ? body.password
        : "";

    if (!password) {
      return jsonResponse(
        {
          error: "Introduce la contraseña."
        },
        400
      );
    }

    if (password !== dashboardPassword) {
      await new Promise(resolve => setTimeout(resolve, 500));

      return jsonResponse(
        {
          error: "La contraseña no es correcta."
        },
        401
      );
    }

    const token = await crearToken(sessionSecret);

    const cookie = [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      `Max-Age=${SESSION_DURATION_SECONDS}`
    ].join("; ");

    return jsonResponse(
      {
        ok: true
      },
      200,
      {
        "Set-Cookie": cookie
      }
    );

  } catch (error) {
    console.error("Error en el inicio de sesión:", error);

    return jsonResponse(
      {
        error: "No se ha podido iniciar sesión."
      },
      500
    );
  }
}

export function onRequest() {
  return jsonResponse(
    {
      error: "Método no permitido."
    },
    405,
    {
      Allow: "POST"
    }
  );
}