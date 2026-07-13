const GITHUB_OWNER = "mlopezmad";
const GITHUB_REPO = "Menu-comedor";
const GITHUB_BRANCH = "main";
const MENU_PATH = "menu.json";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "menu-dashboard"
  };
}

async function obtenerMenuActual(token) {
  const url =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${MENU_PATH}?ref=${GITHUB_BRANCH}`;

  const response = await fetch(url, {
    headers: githubHeaders(token)
  });

  if (!response.ok) {
    const detalle = await response.text();

    throw new Error(
      `GitHub no pudo leer menu.json (${response.status}): ${detalle}`
    );
  }

  const archivo = await response.json();

  if (!archivo?.content || !archivo?.sha) {
    throw new Error(
      "GitHub no ha devuelto el contenido o el SHA de menu.json."
    );
  }

  const contenidoBase64 = archivo.content.replace(/\n/g, "");
  const contenidoTexto = decodeURIComponent(
    Array.from(atob(contenidoBase64))
      .map(caracter =>
        `%${caracter.charCodeAt(0).toString(16).padStart(2, "0")}`
      )
      .join("")
  );

  const menu = JSON.parse(contenidoTexto);

  if (
    !menu ||
    typeof menu !== "object" ||
    !menu.dias ||
    typeof menu.dias !== "object"
  ) {
    throw new Error(
      "El menu.json actual no tiene la estructura esperada."
    );
  }

  return {
    menu,
    sha: archivo.sha
  };
}

export async function onRequestGet(context) {
  const token = context.env.GITHUB_TOKEN;

  if (!token) {
    return jsonResponse(
      {
        ok: false,
        error: "El secreto GITHUB_TOKEN no está configurado."
      },
      500
    );
  }

  try {
    const { menu, sha } = await obtenerMenuActual(token);
    const fechas = Object.keys(menu.dias).sort();

    return jsonResponse({
      ok: true,
      repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      branch: GITHUB_BRANCH,
      path: MENU_PATH,
      sha,
      totalDates: fechas.length,
      firstDate: fechas[0] || null,
      lastDate: fechas[fechas.length - 1] || null
    });
  } catch (error) {
    console.error("Error comprobando GitHub:", error);

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo comprobar GitHub."
      },
      500
    );
  }
}

export function onRequest() {
  return jsonResponse(
    {
      ok: false,
      error: "Método no permitido."
    },
    405
  );
}