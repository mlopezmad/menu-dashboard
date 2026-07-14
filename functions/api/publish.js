const GITHUB_OWNER = "mlopezmad";
const GITHUB_REPO = "Menu-comedor";
const GITHUB_BRANCH = "main";
const MENU_PATH = "menu.json";

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store", ...extraHeaders }
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

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function validarMenu(menu) {
  if (!menu || typeof menu !== "object" || !menu.dias || typeof menu.dias !== "object" || Array.isArray(menu.dias)) {
    throw new Error("El menú recibido no tiene la estructura esperada.");
  }
  const fechas = Object.keys(menu.dias);
  if (!fechas.length) throw new Error("El menú debe contener al menos una fecha.");
  for (const fecha of fechas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`La fecha ${fecha} no es válida.`);
    const dia = menu.dias[fecha];
    if (!dia || typeof dia !== "object") throw new Error(`El menú de ${fecha} no es válido.`);
    if (dia.festivo === true) continue;
    for (const tipo of ["primeros", "segundos", "dieta"]) {
      if (!Array.isArray(dia[tipo]) || !dia[tipo].length) throw new Error(`${fecha}: la lista ${tipo} está vacía.`);
      if (dia[tipo].some(plato => typeof plato !== "string" || !plato.trim())) throw new Error(`${fecha}: hay un plato vacío o no válido en ${tipo}.`);
    }
  }
}

async function obtenerMenuActual(token) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${MENU_PATH}?ref=${GITHUB_BRANCH}`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    const detalle = await response.text();
    throw new Error(`GitHub no pudo leer menu.json (${response.status}): ${detalle}`);
  }
  const archivo = await response.json();
  if (!archivo?.content || !archivo?.sha) throw new Error("GitHub no ha devuelto el contenido o el SHA de menu.json.");
  const menu = JSON.parse(decodeBase64Utf8(archivo.content));
  validarMenu(menu);
  return { menu, sha: archivo.sha };
}

export async function onRequestGet(context) {
  const token = context.env.GITHUB_TOKEN;
  if (!token) return jsonResponse({ ok: false, error: "El secreto GITHUB_TOKEN no está configurado." }, 500);
  try {
    const { menu, sha } = await obtenerMenuActual(token);
    const fechas = Object.keys(menu.dias).sort();
    return jsonResponse({ ok: true, repository: `${GITHUB_OWNER}/${GITHUB_REPO}`, branch: GITHUB_BRANCH, path: MENU_PATH, sha, totalDates: fechas.length, firstDate: fechas[0] || null, lastDate: fechas.at(-1) || null });
  } catch (error) {
    console.error("Error comprobando GitHub:", error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "No se pudo comprobar GitHub." }, 500);
  }
}

export async function onRequestPost(context) {
  const token = context.env.GITHUB_TOKEN;
  if (!token) return jsonResponse({ ok: false, error: "El secreto GITHUB_TOKEN no está configurado." }, 500);
  try {
    const body = await context.request.json();
    const menu = body?.menu;
    const shaRecibido = body?.sha;
    validarMenu(menu);
    if (!shaRecibido || typeof shaRecibido !== "string") return jsonResponse({ ok: false, error: "Falta la versión actual del archivo. Recarga el Dashboard." }, 400);

    const actual = await obtenerMenuActual(token);
    if (actual.sha !== shaRecibido) {
      return jsonResponse({ ok: false, error: "El menú cambió en GitHub desde que abriste el editor. Recarga antes de publicar para no sobrescribir cambios." }, 409);
    }

    const contenidoOrdenado = {
      ...menu,
      dias: Object.fromEntries(Object.entries(menu.dias).sort(([a], [b]) => a.localeCompare(b)))
    };
    const contenido = `${JSON.stringify(contenidoOrdenado, null, 2)}\n`;
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${MENU_PATH}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Actualizar menú desde Dashboard V4",
        content: encodeBase64Utf8(contenido),
        sha: actual.sha,
        branch: GITHUB_BRANCH
      })
    });
    const resultado = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(resultado?.message ? `GitHub rechazó la publicación: ${resultado.message}` : `GitHub rechazó la publicación (${response.status}).`);
    const nuevoSha = resultado?.content?.sha;
    if (!nuevoSha) throw new Error("GitHub publicó el archivo, pero no devolvió el nuevo SHA.");
    return jsonResponse({ ok: true, sha: nuevoSha, commitSha: resultado?.commit?.sha || null, totalDates: Object.keys(contenidoOrdenado.dias).length });
  } catch (error) {
    console.error("Error publicando en GitHub:", error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "No se pudo publicar el menú." }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ ok: false, error: "Método no permitido." }, 405, { Allow: "GET, POST" });
}
