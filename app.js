const MENU_URL =
  "https://raw.githubusercontent.com/mlopezmad/Menu-comedor/main/menu.json";

const $ = (id) => document.getElementById(id);

function fechaDesdeClave(clave) {
  const [year, month, day] = clave.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatearFecha(fecha) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(fecha);
}

function ponerEstado(tipo, titulo, detalle) {
  const estadoTitulo = $("estado-titulo");
  const estadoDetalle = $("estado-detalle");
  const estadoPunto = $("estado-punto");

  estadoTitulo.textContent = titulo;
  estadoDetalle.textContent = detalle;

  estadoPunto.classList.remove(
    "status-loading",
    "status-success",
    "status-error"
  );

  estadoPunto.classList.add(`status-${tipo}`);
}

function mostrarResumen(datos) {
  const dias = datos?.dias || {};
  const fechas = Object.keys(dias).sort();

  if (fechas.length === 0) {
    $("resumen-titulo").textContent = "No hay días publicados";
    $("resumen-detalle").textContent =
      "El archivo menu.json no contiene menús.";
    return;
  }

  const primeraFecha = fechaDesdeClave(fechas[0]);
  const ultimaFecha = fechaDesdeClave(fechas[fechas.length - 1]);

  const festivos = fechas.filter(clave => dias[clave]?.festivo).length;
  const diasConMenu = fechas.length - festivos;

  $("resumen-titulo").textContent =
    `${diasConMenu} días con menú publicados`;

  $("resumen-detalle").textContent =
    `Desde ${formatearFecha(primeraFecha)} hasta ` +
    `${formatearFecha(ultimaFecha)}.` +
    (festivos > 0
      ? ` Incluye ${festivos} ${festivos === 1 ? "festivo" : "festivos"}.`
      : "");
}

async function cargarMenuPublicado() {
  ponerEstado(
    "loading",
    "Comprobando menú…",
    "Conectando con el archivo publicado."
  );

  try {
    const respuesta = await fetch(`${MENU_URL}?t=${Date.now()}`, {
      cache: "no-store"
    });

    if (!respuesta.ok) {
      throw new Error(`Error HTTP ${respuesta.status}`);
    }

    const datos = await respuesta.json();

    if (!datos || typeof datos !== "object" || !datos.dias) {
      throw new Error("El archivo no tiene la estructura esperada.");
    }

    mostrarResumen(datos);

    ponerEstado(
      "success",
      "Menú conectado",
      "El Dashboard puede leer correctamente el menu.json publicado."
    );

  } catch (error) {
    console.error("Error al cargar el menú:", error);

    $("resumen-titulo").textContent = "No se pudo cargar el menú";
    $("resumen-detalle").textContent =
      "Comprueba que el repositorio, la rama y el archivo menu.json existen.";

    ponerEstado(
      "error",
      "Error de conexión",
      "El Dashboard no ha podido leer el menú publicado."
    );
  }
}

document.addEventListener("DOMContentLoaded", cargarMenuPublicado);