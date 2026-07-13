const MENU_URL =
  "https://raw.githubusercontent.com/mlopezmad/Menu-comedor/main/menu.json";

const DRAFT_STORAGE_KEY = "menu_dashboard_v3_drafts";
const $ = (id) => document.getElementById(id);

let menuPublicado = null;
let borradores = {};
let fechaActiva = "";
let menuBaseActivo = null;
let menuEdicionActivo = null;
let cambiosPendientes = false;

function clonar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

function normalizarMenu(menu = {}) {
  if (menu.festivo) {
    return { festivo: true };
  }

  return {
    primeros: Array.isArray(menu.primeros) ? [...menu.primeros] : [],
    segundos: Array.isArray(menu.segundos) ? [...menu.segundos] : [],
    dieta: Array.isArray(menu.dieta) ? [...menu.dieta] : []
  };
}

function menusIguales(menuA, menuB) {
  return JSON.stringify(normalizarMenu(menuA)) === JSON.stringify(normalizarMenu(menuB));
}

function fechaDesdeClave(clave) {
  const [year, month, day] = clave.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatearFecha(fecha) {
  const texto = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(fecha);

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function ponerEstado(tipo, titulo, detalle) {
  const estadoTitulo = $("estado-titulo");
  const estadoDetalle = $("estado-detalle");
  const estadoPunto = $("estado-punto");

  if (!estadoTitulo || !estadoDetalle || !estadoPunto) return;

  estadoTitulo.textContent = titulo;
  estadoDetalle.textContent = detalle;
  estadoPunto.classList.remove("status-loading", "status-success", "status-error");
  estadoPunto.classList.add(`status-${tipo}`);
}

function mostrarResumen(datos) {
  const dias = datos?.dias || {};
  const fechas = Object.keys(dias).sort();

  if (fechas.length === 0) {
    $("resumen-titulo").textContent = "No hay días publicados";
    $("resumen-detalle").textContent = "El archivo menu.json no contiene menús.";
    return;
  }

  const primeraFecha = fechaDesdeClave(fechas[0]);
  const ultimaFecha = fechaDesdeClave(fechas[fechas.length - 1]);
  const festivos = fechas.filter(clave => dias[clave]?.festivo).length;
  const diasConMenu = fechas.length - festivos;

  $("resumen-titulo").textContent = `${diasConMenu} días con menú publicados`;
  $("resumen-detalle").textContent =
    `Desde ${formatearFecha(primeraFecha)} hasta ${formatearFecha(ultimaFecha)}.` +
    (festivos > 0
      ? ` Incluye ${festivos} ${festivos === 1 ? "festivo" : "festivos"}.`
      : "");
}

function cargarBorradoresLocales() {
  try {
    const guardado = localStorage.getItem(DRAFT_STORAGE_KEY);
    borradores = guardado ? JSON.parse(guardado) : {};

    if (!borradores || typeof borradores !== "object" || Array.isArray(borradores)) {
      borradores = {};
    }
  } catch (error) {
    console.warn("No se pudieron cargar los borradores:", error);
    borradores = {};
  }
}

function persistirBorradores() {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(borradores));
}

function crearOpcionFecha(clave) {
  const opcion = document.createElement("option");
  opcion.value = clave;
  opcion.textContent = formatearFecha(fechaDesdeClave(clave));

  if (borradores[clave]) {
    opcion.textContent += " · Borrador";
  }

  return opcion;
}

function cargarSelectorFechas(datos, mantenerClave = "") {
  const selector = $("selector-fecha");
  if (!selector) return;

  const claveAnterior = mantenerClave || selector.value;
  selector.innerHTML = "";

  const opcionInicial = document.createElement("option");
  opcionInicial.value = "";
  opcionInicial.textContent = "Selecciona una fecha";
  selector.appendChild(opcionInicial);

  const fechas = Object.keys(datos?.dias || {}).sort().reverse();
  fechas.forEach(clave => selector.appendChild(crearOpcionFecha(clave)));

  selector.disabled = fechas.length === 0;

  if (claveAnterior && fechas.includes(claveAnterior)) {
    selector.value = claveAnterior;
  }
}

function obtenerMenuInicial(clave) {
  if (borradores[clave]) {
    return normalizarMenu(borradores[clave]);
  }

  return normalizarMenu(menuPublicado?.dias?.[clave] || {});
}

function actualizarEstadoBorrador() {
  const estado = $("estado-borrador");
  const guardar = $("guardar-borrador");
  const cancelar = $("cancelar-cambios");

  if (!estado) return;

  const existeBorrador = Boolean(fechaActiva && borradores[fechaActiva]);

  estado.classList.remove("draft-clean", "draft-pending", "draft-saved");

  if (cambiosPendientes) {
    estado.textContent = "Cambios sin guardar";
    estado.classList.add("draft-pending");
  } else if (existeBorrador) {
    estado.textContent = "Borrador guardado";
    estado.classList.add("draft-saved");
  } else {
    estado.textContent = "Sin cambios";
    estado.classList.add("draft-clean");
  }

  if (guardar) guardar.disabled = !cambiosPendientes;
  if (cancelar) cancelar.disabled = !cambiosPendientes && !existeBorrador;
}

function marcarCambio() {
  cambiosPendientes = !menusIguales(menuEdicionActivo, menuBaseActivo);
  actualizarEstadoBorrador();
}

function crearFilaEditable(categoria, texto, indice) {
  const fila = document.createElement("div");
  fila.className = "editor-item-row";

  const input = document.createElement("input");
  input.type = "text";
  input.value = texto;
  input.className = "editor-item editor-item-editable";
  input.placeholder = "Nombre del plato";
  input.setAttribute("aria-label", `${categoria}, plato ${indice + 1}`);

  input.addEventListener("input", () => {
    menuEdicionActivo[categoria][indice] = input.value;
    marcarCambio();
  });

  const eliminar = document.createElement("button");
  eliminar.type = "button";
  eliminar.className = "remove-item-button";
  eliminar.setAttribute("aria-label", `Eliminar ${texto || "plato"}`);
  eliminar.textContent = "×";

  eliminar.addEventListener("click", () => {
    menuEdicionActivo[categoria].splice(indice, 1);
    pintarEditorCompleto();
    marcarCambio();
  });

  fila.append(input, eliminar);
  return fila;
}

function pintarListaEditable(categoria) {
  const contenedor = $(`editor-${categoria}`);
  if (!contenedor) return;

  contenedor.innerHTML = "";
  const platos = menuEdicionActivo?.[categoria] || [];

  if (platos.length === 0) {
    const mensaje = document.createElement("p");
    mensaje.className = "editor-empty-list";
    mensaje.textContent = "Sin platos. Pulsa Añadir para crear uno.";
    contenedor.appendChild(mensaje);
    return;
  }

  platos.forEach((plato, indice) => {
    contenedor.appendChild(crearFilaEditable(categoria, plato, indice));
  });
}

function pintarEditorCompleto() {
  const camposMenu = $("editor-campos-menu");
  const mensajeFestivo = $("editor-festivo-mensaje");
  const checkFestivo = $("editor-festivo");
  const esFestivo = Boolean(menuEdicionActivo?.festivo);

  if (checkFestivo) checkFestivo.checked = esFestivo;
  if (camposMenu) camposMenu.hidden = esFestivo;
  if (mensajeFestivo) mensajeFestivo.hidden = !esFestivo;

  if (!esFestivo) {
    pintarListaEditable("primeros");
    pintarListaEditable("segundos");
    pintarListaEditable("dieta");
  }
}

function cargarFechaEnEditor(clave) {
  const editorContenido = $("editor-contenido");
  const editorVacio = $("editor-vacio");
  const editorFecha = $("editor-fecha");

  if (!editorContenido || !editorVacio || !editorFecha) return;

  if (!clave || !menuPublicado?.dias?.[clave]) {
    fechaActiva = "";
    menuBaseActivo = null;
    menuEdicionActivo = null;
    cambiosPendientes = false;
    editorContenido.hidden = true;
    editorVacio.hidden = false;
    actualizarEstadoBorrador();
    return;
  }

  fechaActiva = clave;
  menuBaseActivo = obtenerMenuInicial(clave);
  menuEdicionActivo = clonar(menuBaseActivo);
  cambiosPendientes = false;

  editorFecha.textContent = formatearFecha(fechaDesdeClave(clave));
  pintarEditorCompleto();
  actualizarEstadoBorrador();

  editorVacio.hidden = true;
  editorContenido.hidden = false;
}

function confirmarPerdidaCambios() {
  if (!cambiosPendientes) return true;

  return window.confirm(
    "Hay cambios sin guardar. ¿Quieres descartarlos y continuar?"
  );
}

function abrirEditor() {
  const vistaInicio = $("vista-inicio");
  const vistaEditor = $("vista-editor");
  const selector = $("selector-fecha");

  if (!vistaInicio || !vistaEditor) return;

  vistaInicio.hidden = true;
  vistaEditor.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (selector && !selector.value && selector.options.length > 1) {
    selector.selectedIndex = 1;
  }

  if (selector?.value) cargarFechaEnEditor(selector.value);
}

function volverAlInicio() {
  if (!confirmarPerdidaCambios()) return;

  $("vista-editor").hidden = true;
  $("vista-inicio").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function añadirPlato(categoria) {
  if (!menuEdicionActivo || menuEdicionActivo.festivo) return;

  menuEdicionActivo[categoria].push("");
  pintarListaEditable(categoria);
  marcarCambio();

  const inputs = $(`editor-${categoria}`)?.querySelectorAll("input");
  inputs?.[inputs.length - 1]?.focus();
}

function cambiarFestivo(activado) {
  if (!menuEdicionActivo) return;

  if (activado) {
    menuEdicionActivo = { festivo: true };
  } else {
    const publicado = normalizarMenu(menuPublicado?.dias?.[fechaActiva] || {});
    const borrador = borradores[fechaActiva];
    const referencia = borrador && !borrador.festivo ? borrador : publicado;

    menuEdicionActivo = referencia.festivo
      ? { primeros: [], segundos: [], dieta: [] }
      : normalizarMenu(referencia);
  }

  pintarEditorCompleto();
  marcarCambio();
}

function guardarBorrador() {
  if (!fechaActiva || !menuEdicionActivo) return;

  const limpio = normalizarMenu(menuEdicionActivo);

  if (!limpio.festivo) {
    limpio.primeros = limpio.primeros.map(x => x.trim()).filter(Boolean);
    limpio.segundos = limpio.segundos.map(x => x.trim()).filter(Boolean);
    limpio.dieta = limpio.dieta.map(x => x.trim()).filter(Boolean);
  }

  borradores[fechaActiva] = limpio;
  persistirBorradores();

  menuBaseActivo = clonar(limpio);
  menuEdicionActivo = clonar(limpio);
  cambiosPendientes = false;

  cargarSelectorFechas(menuPublicado, fechaActiva);
  pintarEditorCompleto();
  actualizarEstadoBorrador();

  const nota = $("editor-nota");
  if (nota) {
    nota.textContent = "Borrador guardado en este dispositivo. El menú público no se ha modificado.";
  }
}

function cancelarCambios() {
  if (!fechaActiva) return;

  const hayBorrador = Boolean(borradores[fechaActiva]);
  const mensaje = hayBorrador
    ? "Se eliminará el borrador de esta fecha y se recuperará el menú publicado. ¿Continuar?"
    : "Se descartarán los cambios sin guardar. ¿Continuar?";

  if (!window.confirm(mensaje)) return;

  if (hayBorrador) {
    delete borradores[fechaActiva];
    persistirBorradores();
    cargarSelectorFechas(menuPublicado, fechaActiva);
  }

  menuBaseActivo = normalizarMenu(menuPublicado.dias[fechaActiva]);
  menuEdicionActivo = clonar(menuBaseActivo);
  cambiosPendientes = false;

  pintarEditorCompleto();
  actualizarEstadoBorrador();

  const nota = $("editor-nota");
  if (nota) {
    nota.textContent = "Cambios descartados. Se muestra de nuevo el menú publicado.";
  }
}

async function cerrarSesion() {
  if (!confirmarPerdidaCambios()) return;

  const boton = $("cerrar-sesion");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Saliendo…";
  }

  try {
    const respuesta = await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    });

    if (!respuesta.ok) throw new Error("No se pudo cerrar la sesión.");
    window.location.replace("/login");
  } catch (error) {
    console.error("Error al cerrar sesión:", error);

    if (boton) {
      boton.disabled = false;
      boton.textContent = "Salir";
    }

    window.alert("No se ha podido cerrar la sesión. Inténtalo de nuevo.");
  }
}

function prepararEventos() {
  $("abrir-editor")?.addEventListener("click", abrirEditor);
  $("volver-inicio")?.addEventListener("click", volverAlInicio);
  $("cerrar-sesion")?.addEventListener("click", cerrarSesion);
  $("guardar-borrador")?.addEventListener("click", guardarBorrador);
  $("cancelar-cambios")?.addEventListener("click", cancelarCambios);

  $("selector-fecha")?.addEventListener("change", event => {
    if (!confirmarPerdidaCambios()) {
      event.target.value = fechaActiva;
      return;
    }

    cargarFechaEnEditor(event.target.value);
  });

  $("editor-festivo")?.addEventListener("change", event => {
    cambiarFestivo(event.target.checked);
  });

  document.querySelectorAll("[data-add-category]").forEach(boton => {
    boton.addEventListener("click", () => añadirPlato(boton.dataset.addCategory));
  });

  window.addEventListener("beforeunload", event => {
    if (!cambiosPendientes) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function cargarMenuPublicado() {
  ponerEstado("loading", "Comprobando menú…", "Conectando con el archivo publicado.");

  try {
    const respuesta = await fetch(`${MENU_URL}?t=${Date.now()}`, {
      cache: "no-store"
    });

    if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);

    const datos = await respuesta.json();

    if (!datos || typeof datos !== "object" || !datos.dias || typeof datos.dias !== "object") {
      throw new Error("El archivo no tiene la estructura esperada.");
    }

    menuPublicado = datos;
    mostrarResumen(datos);
    cargarSelectorFechas(datos);

    ponerEstado(
      "success",
      "Menú conectado",
      "El Dashboard puede leer correctamente el menu.json publicado."
    );
  } catch (error) {
    console.error("Error al cargar el menú:", error);
    menuPublicado = null;

    $("resumen-titulo").textContent = "No se pudo cargar el menú";
    $("resumen-detalle").textContent =
      "Comprueba que el repositorio, la rama y el archivo menu.json existen.";

    const selector = $("selector-fecha");
    if (selector) {
      selector.innerHTML = '<option value="">No se pudieron cargar las fechas</option>';
      selector.disabled = true;
    }

    ponerEstado("error", "Error de conexión", "El Dashboard no ha podido leer el menú publicado.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  cargarBorradoresLocales();
  prepararEventos();
  cargarMenuPublicado();
});
