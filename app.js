const MENU_URL = "https://raw.githubusercontent.com/mlopezmad/Menu-comedor/main/menu.json";
const $ = id => document.getElementById(id);

let menuPublicado = null;
let menuTrabajo = null;
let shaPublicado = null;
let fechaActiva = "";
let fechasSemanaActiva = [];
let modoEditor = "semana";
let hayCambios = false;
let borradorImportacion = null;
let comparacionImportacion = null;
let fuenteImportacion = null;
let urlPreviewImportacion = null;
let imagenReferenciaImportacion = null;
let fechasReferenciaImportacion = new Set();
let revisionGuiadaActiva = false;
let referenciaCeldaActiva = null;
let referenciaModo = "celda";
let campoRevisionActivo = null;
let limitesFilasDetectados = null;
const CALIBRATION_KEY = "menuDashboardCalibrationV6";
const REFERENCE_SESSION_KEY = "menuDashboardReferenceV113";

function guardarReferenciaSesion() {
  try {
    if (!imagenReferenciaImportacion) { sessionStorage.removeItem(REFERENCE_SESSION_KEY); return; }
    sessionStorage.setItem(REFERENCE_SESSION_KEY, JSON.stringify({
      imagen: imagenReferenciaImportacion,
      fechas: [...fechasReferenciaImportacion]
    }));
  } catch {}
}

function restaurarReferenciaSesion() {
  try {
    const datos = JSON.parse(sessionStorage.getItem(REFERENCE_SESSION_KEY) || "null");
    if (!datos?.imagen) return;
    imagenReferenciaImportacion = datos.imagen;
    fechasReferenciaImportacion = new Set(Array.isArray(datos.fechas) ? datos.fechas : []);
  } catch {}
}

function limpiarReferenciaSesion() {
  imagenReferenciaImportacion = null;
  fechasReferenciaImportacion = new Set();
  try { sessionStorage.removeItem(REFERENCE_SESSION_KEY); } catch {}
}

function fechaDesdeClave(clave) {
  const [year, month, day] = clave.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatearFecha(fecha) {
  const texto = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function clonar(valor) { return JSON.parse(JSON.stringify(valor)); }

function ponerEstado(tipo, titulo, detalle) {
  $("estado-titulo").textContent = titulo;
  $("estado-detalle").textContent = detalle;
  const punto = $("estado-punto");
  punto.className = `status-dot status-${tipo}`;
}

function mostrarMensaje(texto = "", tipo = "") {
  const el = $("editor-mensaje");
  el.textContent = texto;
  el.className = `editor-message${tipo ? ` message-${tipo}` : ""}`;
}

function agruparSemanasPublicadas(dias) {
  const grupos = new Map();
  for (const clave of Object.keys(dias || {}).sort()) {
    const fecha = fechaDesdeClave(clave);
    const lunes = new Date(fecha);
    const dia = (lunes.getDay() + 6) % 7;
    lunes.setDate(lunes.getDate() - dia);
    const claveLunes = claveFechaLocal(lunes);
    if (!grupos.has(claveLunes)) grupos.set(claveLunes, []);
    grupos.get(claveLunes).push(clave);
  }
  return [...grupos.entries()].map(([lunes, fechas]) => ({ lunes, fechas: fechas.sort() })).sort((a,b) => b.lunes.localeCompare(a.lunes));
}

function formatoRangoSemana(fechas) {
  const inicio = fechaDesdeClave(fechas[0]);
  const fin = fechaDesdeClave(fechas.at(-1));
  if (fechas.length === 1) return formatearFecha(inicio);
  const mismoMes = inicio.getMonth() === fin.getMonth() && inicio.getFullYear() === fin.getFullYear();
  const mesFin = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(fin);
  if (mismoMes) return `${inicio.getDate()}–${fin.getDate()} ${mesFin}`;
  const ini = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(inicio);
  const fi = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(fin);
  return `${ini}–${fi}`;
}

function abrirSemanaDesdeResumen(fecha) {
  const semana = agruparSemanasPublicadas(menuTrabajo?.dias || {}).find(item => item.fechas.includes(fecha));
  fechasSemanaActiva = semana?.fechas || [fecha];
  cambiarVista("vista-editor");
  $("selector-fecha").value = fecha;
  mostrarVistaEditor("semana");
}

function etiquetaEstadoSemana(fechas) {
  const laborables = fechas.filter(clave => !menuTrabajo?.dias?.[clave]?.festivo).length;
  if (fechas.length === 1) return { texto: "Día suelto", clase: "is-partial" };
  if (laborables >= 5 || fechas.length >= 5) return { texto: "Completa", clase: "is-complete" };
  return { texto: `${laborables}/5 días`, clase: "is-partial" };
}

function obtenerSemanaDeFecha(clave) {
  return agruparSemanasPublicadas(menuTrabajo?.dias || {}).find(item => item.fechas.includes(clave)) || { fechas: clave ? [clave] : [] };
}

function mostrarVistaEditor(modo) {
  modoEditor = modo;
  const semanal = modo === "semana";
  $("vista-semana-btn").classList.toggle("is-active", semanal);
  $("vista-dia-btn").classList.toggle("is-active", !semanal);
  $("editor-semana").hidden = !semanal;
  if (semanal) {
    $("editor-contenido").hidden = true;
    $("editor-vacio").hidden = true;
    renderizarVistaSemanal();
  } else {
    mostrarMenuDeFecha($("selector-fecha").value);
  }
  actualizarBotonReferenciaFlotante();
}

function renderizarVistaSemanal() {
  const claveBase = $("selector-fecha").value || fechasSemanaActiva[0] || "";
  const semana = obtenerSemanaDeFecha(claveBase);
  fechasSemanaActiva = semana.fechas;
  const contenedor = $("semana-dias");
  contenedor.innerHTML = "";
  if (!semana.fechas.length) {
    $("editor-semana").hidden = true;
    $("editor-vacio").hidden = false;
    return;
  }
  const estado = etiquetaEstadoSemana(semana.fechas);
  $("semana-titulo").textContent = formatoRangoSemana(semana.fechas);
  $("semana-detalle").textContent = `${semana.fechas.length} ${semana.fechas.length === 1 ? "fecha disponible" : "fechas disponibles"}. Revisa toda la semana y abre un día solo cuando necesites editarlo.`;
  $("semana-estado").textContent = estado.texto;
  $("semana-estado").className = `read-only-badge week-status ${estado.clase}`;
  actualizarBotonReferenciaFlotante();

  semana.fechas.forEach(clave => {
    const menu = normalizarMenuDia(menuTrabajo.dias[clave]);
    const card = document.createElement("article");
    card.className = "weekly-day-card";
    const contenido = menu.festivo
      ? '<p class="weekly-holiday">Festivo / sin servicio</p>'
      : [
          ["Primeros", menu.primeros],
          ["Segundos", menu.segundos],
          ["Dieta y plancha", menu.dieta]
        ].map(([titulo, platos]) => `<section><h4>${titulo}</h4><ul>${platos.map(plato => `<li>${escapeHtml(plato)}</li>`).join("")}</ul></section>`).join("");
    card.innerHTML = `<div class="weekly-day-heading"><div><p>${new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(fechaDesdeClave(clave))}</p><h3>${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(fechaDesdeClave(clave))}</h3></div><button type="button" class="secondary-action weekly-edit-day">Editar día</button></div>${contenido}`;
    card.querySelector(".weekly-edit-day").addEventListener("click", () => {
      $("selector-fecha").value = clave;
      mostrarVistaEditor("dia");
    });
    contenedor.appendChild(card);
  });
}

function escapeHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, caracter => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[caracter]);
}

function mostrarResumen(datos) {
  const dias = datos?.dias || {};
  const fechas = Object.keys(dias).sort();
  const lista = $("resumen-semanas");
  lista.innerHTML = "";
  if (!fechas.length) {
    $("resumen-titulo").textContent = "No hay días publicados";
    $("resumen-detalle").textContent = "El archivo menu.json no contiene menús.";
    lista.hidden = true;
    return;
  }
  const festivos = fechas.filter(clave => dias[clave]?.festivo).length;
  const semanas = agruparSemanasPublicadas(dias);
  $("resumen-titulo").textContent = `${semanas.length} ${semanas.length === 1 ? "semana" : "semanas"} · ${fechas.length - festivos} días`;
  $("resumen-detalle").textContent = `Desde ${formatearFecha(fechaDesdeClave(fechas[0]))} hasta ${formatearFecha(fechaDesdeClave(fechas.at(-1)))}.${festivos ? ` Incluye ${festivos} ${festivos === 1 ? "festivo" : "festivos"}.` : ""}`;
  semanas.forEach(semana => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "week-row";
    const festivosSemana = semana.fechas.filter(f => dias[f]?.festivo).length;
    const estadoSemana = etiquetaEstadoSemana(semana.fechas);
    const diasPublicados = semana.fechas.length - festivosSemana;
    boton.innerHTML = `<span><strong>${formatoRangoSemana(semana.fechas)}</strong><small>${diasPublicados} ${diasPublicados === 1 ? "día publicado" : "días publicados"}${festivosSemana ? ` · ${festivosSemana} festivo${festivosSemana === 1 ? "" : "s"}` : ""}</small></span><span class="week-row-side"><em class="week-state ${estadoSemana.clase}">${estadoSemana.texto}</em><span class="week-arrow">›</span></span>`;
    boton.addEventListener("click", () => abrirSemanaDesdeResumen(semana.fechas[0]));
    lista.appendChild(boton);
  });
  lista.hidden = false;
}

function cargarSelectorFechas(datos, seleccionar = fechaActiva) {
  const selector = $("selector-fecha");
  selector.innerHTML = '<option value="">Selecciona una fecha</option>';
  Object.keys(datos?.dias || {}).sort().reverse().forEach(clave => {
    const opcion = document.createElement("option");
    opcion.value = clave;
    opcion.textContent = formatearFecha(fechaDesdeClave(clave));
    selector.appendChild(opcion);
  });
  selector.disabled = selector.options.length === 1;
  if (seleccionar && datos?.dias?.[seleccionar]) selector.value = seleccionar;
}

function normalizarMenuDia(menu = {}) {
  return {
    ...(menu.festivo ? { festivo: true } : {}),
    primeros: Array.isArray(menu.primeros) ? menu.primeros : [],
    segundos: Array.isArray(menu.segundos) ? menu.segundos : [],
    dieta: Array.isArray(menu.dieta) ? menu.dieta : []
  };
}

function crearFila(tipo, texto = "") {
  const fila = document.createElement("div");
  fila.className = "editor-row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = texto;
  input.className = "editor-item";
  input.placeholder = "Escribe un plato";
  input.dataset.tipo = tipo;
  input.addEventListener("input", sincronizarDesdeFormulario);
  const borrar = document.createElement("button");
  borrar.type = "button";
  borrar.className = "remove-item";
  borrar.setAttribute("aria-label", "Eliminar plato");
  borrar.textContent = "×";
  borrar.addEventListener("click", () => { fila.remove(); sincronizarDesdeFormulario(); });
  fila.append(input, borrar);
  return fila;
}

function pintarLista(tipo, platos) {
  const contenedor = $(`editor-${tipo}`);
  contenedor.innerHTML = "";
  (platos.length ? platos : [""]).forEach(plato => contenedor.appendChild(crearFila(tipo, plato)));
}

function actualizarFestivoUI() {
  const festivo = $("editor-festivo").checked;
  $("grupos-menu").classList.toggle("is-disabled", festivo);
  $("grupos-menu").querySelectorAll("input, button").forEach(el => { el.disabled = festivo; });
}

function mostrarMenuDeFecha(clave) {
  if (!clave || !menuTrabajo?.dias?.[clave]) {
    fechaActiva = "";
    $("editor-contenido").hidden = true;
    $("editor-vacio").hidden = false;
    return;
  }
  fechaActiva = clave;
  const menu = normalizarMenuDia(menuTrabajo.dias[clave]);
  menuTrabajo.dias[clave] = menu;
  $("editor-fecha").textContent = formatearFecha(fechaDesdeClave(clave));
  $("editor-festivo").checked = Boolean(menu.festivo);
  pintarLista("primeros", menu.primeros);
  pintarLista("segundos", menu.segundos);
  pintarLista("dieta", menu.dieta);
  actualizarFestivoUI();
  actualizarReferenciaEditor();
  mostrarMensaje();
  $("editor-vacio").hidden = true;
  $("editor-contenido").hidden = false;
  actualizarEstadoCambios();
}

function leerLista(tipo) {
  return [...$(`editor-${tipo}`).querySelectorAll("input")]
    .map(input => input.value.trim())
    .filter(Boolean);
}

function sincronizarDesdeFormulario() {
  if (!fechaActiva) return;
  const festivo = $("editor-festivo").checked;
  menuTrabajo.dias[fechaActiva] = festivo
    ? { festivo: true, primeros: [], segundos: [], dieta: [] }
    : { primeros: leerLista("primeros"), segundos: leerLista("segundos"), dieta: leerLista("dieta") };
  actualizarEstadoCambios();
}

function actualizarEstadoCambios() {
  hayCambios = JSON.stringify(menuTrabajo) !== JSON.stringify(menuPublicado);
  $("cambios-badge").textContent = hayCambios ? "Cambios pendientes" : "Sin cambios";
  $("cambios-badge").classList.toggle("has-changes", hayCambios);
  $("publicar-menu").disabled = !hayCambios;
  $("descartar-cambios").disabled = !hayCambios;
}

function validarMenu() {
  const fechas = Object.keys(menuTrabajo?.dias || {});
  if (!fechas.length) throw new Error("El menú debe contener al menos una fecha.");
  for (const clave of fechas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) throw new Error(`La fecha ${clave} no es válida.`);
    const dia = menuTrabajo.dias[clave];
    if (dia.festivo) continue;
    for (const tipo of ["primeros", "segundos", "dieta"]) {
      if (!Array.isArray(dia[tipo])) throw new Error(`${formatearFecha(fechaDesdeClave(clave))}: ${tipo} no tiene un formato válido.`);
      if (!dia[tipo].length) throw new Error(`${formatearFecha(fechaDesdeClave(clave))}: falta al menos un plato en ${tipo}.`);
    }
  }
}

async function obtenerEstadoGitHub() {
  const respuesta = await fetch("/api/publish", { credentials: "same-origin", cache: "no-store" });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo comprobar GitHub.");
  return datos;
}

async function cargarMenuPublicado() {
  ponerEstado("loading", "Comprobando menú…", "Conectando con el archivo publicado.");
  try {
    const [respuesta, estadoGitHub] = await Promise.all([
      fetch(`${MENU_URL}?t=${Date.now()}`, { cache: "no-store" }),
      obtenerEstadoGitHub()
    ]);
    if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    if (!datos?.dias || typeof datos.dias !== "object") throw new Error("El archivo no tiene la estructura esperada.");
    menuPublicado = clonar(datos);
    menuTrabajo = clonar(datos);
    shaPublicado = estadoGitHub.sha;
    mostrarResumen(datos);
    cargarSelectorFechas(datos);
    ponerEstado("success", "Menú conectado", `GitHub preparado · ${estadoGitHub.totalDates} fechas disponibles.`);
  } catch (error) {
    console.error(error);
    menuPublicado = menuTrabajo = null;
    $("resumen-titulo").textContent = "No se pudo cargar el menú";
    $("resumen-detalle").textContent = "Comprueba la conexión y la configuración de GitHub.";
    $("selector-fecha").innerHTML = '<option value="">No se pudieron cargar las fechas</option>';
    $("selector-fecha").disabled = true;
    ponerEstado("error", "Error de conexión", error.message || "El Dashboard no ha podido leer el menú.");
  }
}

function abrirEditor() {
  cambiarVista("vista-editor");
  const selector = $("selector-fecha");
  if (!selector.value && selector.options.length > 1) selector.selectedIndex = 1;
  fechasSemanaActiva = obtenerSemanaDeFecha(selector.value).fechas;
  mostrarVistaEditor("semana");
}

function volverAlInicio() {
  if (hayCambios && !window.confirm("Hay cambios sin publicar. ¿Quieres volver igualmente?")) return;
  cambiarVista("vista-inicio");
}

function crearFecha() {
  const clave = $("nueva-fecha").value;
  if (!clave) return mostrarMensaje("Selecciona una fecha para crearla.", "error");
  if (menuTrabajo.dias[clave]) {
    $("selector-fecha").value = clave;
    mostrarMenuDeFecha(clave);
    return mostrarMensaje("Esa fecha ya existe; la he abierto.", "info");
  }
  menuTrabajo.dias[clave] = {
    primeros: ["Primer plato"],
    segundos: ["Segundo plato"],
    dieta: ["Primero de dieta", "Carne plancha", "Pescado plancha"]
  };
  fechaActiva = clave;
  cargarSelectorFechas(menuTrabajo, clave);
  fechasSemanaActiva = obtenerSemanaDeFecha(clave).fechas;
  mostrarVistaEditor("dia");
  actualizarEstadoCambios();
  mostrarMensaje("Fecha creada. Revisa los textos antes de publicar.", "success");
}

function descartarCambios() {
  if (!hayCambios || !window.confirm("¿Descartar todos los cambios pendientes?")) return;
  menuTrabajo = clonar(menuPublicado);
  cargarSelectorFechas(menuTrabajo, fechaActiva);
  mostrarMenuDeFecha(fechaActiva && menuTrabajo.dias[fechaActiva] ? fechaActiva : "");
  mostrarMensaje("Cambios descartados.", "info");
}

function eliminarFecha() {
  if (!fechaActiva) return;
  if (!window.confirm(`¿Eliminar ${formatearFecha(fechaDesdeClave(fechaActiva))} del menú?`)) return;
  delete menuTrabajo.dias[fechaActiva];
  fechaActiva = "";
  cargarSelectorFechas(menuTrabajo);
  mostrarMenuDeFecha("");
  actualizarEstadoCambios();
}

async function publicarMenu() {
  sincronizarDesdeFormulario();
  try { validarMenu(); } catch (error) { return mostrarMensaje(error.message, "error"); }
  if (!window.confirm("¿Publicar ahora todos los cambios en el menú?")) return;
  const boton = $("publicar-menu");
  boton.disabled = true;
  boton.textContent = "Publicando…";
  mostrarMensaje("Comprobando la versión de GitHub…", "info");
  try {
    const respuesta = await fetch("/api/publish", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu: menuTrabajo, sha: shaPublicado })
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo publicar el menú.");
    menuPublicado = clonar(menuTrabajo);
    shaPublicado = datos.sha;
    mostrarResumen(menuPublicado);
    actualizarEstadoCambios();
    ponerEstado("success", "Menú publicado", `Actualizado correctamente a las ${new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date())}.`);
    mostrarMensaje("Menú publicado correctamente. Puede tardar unos segundos en aparecer en la app.", "success");
  } catch (error) {
    console.error(error);
    mostrarMensaje(error.message || "No se pudo publicar el menú.", "error");
  } finally {
    boton.textContent = "Publicar cambios";
    boton.disabled = !hayCambios;
  }
}


function cambiarVista(idVista) {
  ["vista-inicio", "vista-editor", "vista-importador"].forEach(id => {
    const vista = $(id);
    if (vista) vista.hidden = id !== idVista;
  });
  actualizarBotonReferenciaFlotante();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function abrirImportador() {
  if (!menuTrabajo) {
    window.alert("Espera a que termine de cargar el menú publicado.");
    return;
  }
  cambiarVista("vista-importador");
}

function volverDesdeImportador() {
  cambiarVista("vista-inicio");
}

function claveFechaLocal(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fechasSemana(lunesClave) {
  const lunes = fechaDesdeClave(lunesClave);
  return Array.from({ length: 5 }, (_, i) => {
    const fecha = new Date(lunes);
    fecha.setDate(lunes.getDate() + i);
    return claveFechaLocal(fecha);
  });
}

function nombreDiaDesdeIndice(indice) {
  return ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"][indice];
}

function crearPlantillaSemana() {
  const lunes = $("lunes-semana").value;
  if (!lunes) {
    $("ocr-progreso").textContent = "Selecciona primero el lunes de la semana.";
    $("ocr-progreso").className = "editor-message message-error";
    return;
  }
  pintarFormularioDias(Array.from({ length: 5 }, () => ({ primeros: ["", "", ""], segundos: ["", "", ""] })));
  $("revision-ocr").hidden = false;
  actualizarReferenciaRevision();
  $("resultado-importacion").hidden = true;
}

function normalizarOcr(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function limpiarLineaOcr(linea) {
  return String(linea || "")
    .replace(/[\[\]{}<>]/g, " ")
    .replace(/^[•·▪◦*_=|\\/\-–—.:;,()0-9]+\s*/, "")
    .replace(/\s+[•·▪◦*_=|\\/\-–—.:;,()0-9]+$/g, "")
    .replace(/\b(?:ED|EZ|EO|OE|EE|EC|CE|EJ|GG|UC)\)?\b/gi, " ")
    .replace(/\([^)]{0,5}\)/g, " ")
    .replace(/[|_=~^`´“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esRuidoOcr(linea) {
  const texto = limpiarLineaOcr(linea);
  if (!texto || texto.length < 3) return true;
  const normal = normalizarOcr(texto);
  if (!/[A-Z]/.test(normal)) return true;
  const letras = (normal.match(/[A-Z]/g) || []).length;
  const palabras = normal.match(/[A-Z]{2,}/g) || [];
  if (letras < 3 || !palabras.length) return true;
  if (/^(MAHOU|SANMIGUEL|SEMANA|MENU|MENÚ|DIETA|PLANCHA)$/.test(normal)) return true;
  if (/^(E|EO|OE|EE|ED|EZ|GG|UC|SA|M|C|O)$/.test(normal)) return true;
  return false;
}

function normalizarEncabezado(texto) {
  return normalizarOcr(texto);
}

function detectarSeccion(linea) {
  const normal = normalizarEncabezado(linea);
  if (/PRIMER/.test(normal)) return "primeros";
  if (/SEGUND|SEGU.D|SE.GUND/.test(normal)) return "segundos";
  if (/DIETA|SALUDABLE/.test(normal)) return "fin";
  return null;
}

function distanciaLevenshtein(a, b) {
  const x = normalizarOcr(a), y = normalizarOcr(b);
  const fila = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let anterior = fila[0]; fila[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const temp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (x[i - 1] === y[j - 1] ? 0 : 1));
      anterior = temp;
    }
  }
  return fila[y.length];
}


const OCR_APRENDIZAJE_KEY = "menu-dashboard-ocr-aprendizaje-v1";

function cargarAprendizajeOcr() {
  try {
    const datos = JSON.parse(localStorage.getItem(OCR_APRENDIZAJE_KEY) || "{}");
    return datos && typeof datos === "object" ? datos : {};
  } catch {
    return {};
  }
}

function guardarAprendizajeOcr(datos) {
  try { localStorage.setItem(OCR_APRENDIZAJE_KEY, JSON.stringify(datos)); } catch {}
}

function aprenderCorreccionOcr(original, corregido) {
  const clave = normalizarOcr(original).replace(/\s+/g, " ").trim();
  const valor = String(corregido || "").trim();
  if (clave.length < 3 || valor.length < 4 || clave === normalizarOcr(valor)) return;
  const datos = cargarAprendizajeOcr();
  datos[clave] = valor;
  guardarAprendizajeOcr(datos);
}

function platosPorTipo(tipo) {
  const base = diccionarioPlatos();
  const delMenu = [];
  for (const dia of Object.values(menuPublicado?.dias || {})) {
    for (const plato of dia?.[tipo] || []) delMenu.push(plato);
  }
  const aprendidos = Object.values(cargarAprendizajeOcr());
  return [...new Set([...delMenu, ...aprendidos, ...base].map(x => String(x).trim()).filter(Boolean))];
}

function similitudTokens(a, b) {
  const ta = new Set(normalizarOcr(a).split(/\s+/).filter(x => x.length > 1));
  const tb = new Set(normalizarOcr(b).split(/\s+/).filter(x => x.length > 1));
  if (!ta.size || !tb.size) return 0;
  let comun = 0;
  for (const x of ta) if (tb.has(x)) comun += 1;
  return comun / Math.max(ta.size, tb.size);
}

function esTextoOcrCoherente(texto) {
  const valor = String(texto || "").trim();
  const normal = normalizarOcr(valor).replace(/\s+/g, " ").trim();
  const palabras = normal.split(" ").filter(Boolean);
  const letras = (normal.match(/[A-ZÑ]/g) || []).length;
  const raros = (valor.match(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'’.-]/g) || []).length;
  const truncado = /(?:\.{2,}|…)$/.test(valor) || /\b(?:A|AL|DE|DEL|CON|EN|LA|LAS|LOS|Y)$/i.test(valor);
  const tieneVocal = /[AEIOUÁÉÍÓÚÜ]/i.test(valor);
  return !truncado && tieneVocal && letras >= 9 && palabras.length >= 2 && raros <= 1;
}


function analizarAnomaliasOcr(texto) {
  const valor = String(texto || "").trim();
  const normal = normalizarOcr(valor).replace(/\s+/g, " ").trim();
  const palabras = normal.split(" ").filter(Boolean);
  if (!normal) return { sospechoso: true, motivos: ["vacio"] };

  const motivos = [];
  const raros = (valor.match(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'’.-]/g) || []).length;
  if (raros > 0) motivos.push("simbolos");
  if (/(?:\.{2,}|…)$/i.test(valor)) motivos.push("truncado");
  if (/\b(?:A|AL|DE|DEL|CON|EN|LA|LAS|LOS|Y)$/i.test(valor)) motivos.push("final-incompleto");
  if (/\b[A-ZÑ]{1,2}\b/.test(normal) && palabras.length <= 3) motivos.push("fragmento-corto");

  const deformaciones = [
    /\b(?:HAC|MS|MUA|COP0|COPO|ATUSM|TOMAJE|HORNI|ESPUIACIS|ESPUIACAS|SAJOMIA|PECCHUGA|MARMITAKODEL?)\b/,
    /[BCDFGHJKLMNPQRSTVWXYZÑ]{5,}/,
    /\b[A-ZÑ]{2,4}(?:M|J|C|G|Q|X|Z)\b/
  ];
  if (deformaciones.some(r => r.test(normal))) motivos.push("palabra-deformada");

  for (const palabra of palabras) {
    if (palabra.length >= 5) {
      const vocales = (palabra.match(/[AEIOUÁÉÍÓÚÜ]/g) || []).length;
      if (vocales === 0 || vocales / palabra.length < 0.16) motivos.push("palabra-improbable");
      if (/(.)\1\1/.test(palabra)) motivos.push("repeticion");
    }
  }
  return { sospechoso: motivos.length > 0, motivos: [...new Set(motivos)] };
}

function interpretarTextoOcr(texto, confianza = 0, tipo = "primeros") {
  const limpio = limpiarLineaOcr(texto);
  const normal = normalizarOcr(limpio).replace(/\s+/g, " ").trim();
  const aprendido = cargarAprendizajeOcr()[normal];
  if (aprendido) {
    return { texto: aprendido, original: limpio, sugerencia: aprendido, nivel: "alta", puntuacion: 100, aprendido: true };
  }
  if (!limpio) return { texto: "", original: "", sugerencia: "", nivel: "baja", puntuacion: 0 };

  let mejor = "", mejorPuntuacion = 0, mejorRatio = 1;
  let coincidenciaExacta = "";
  for (const plato of platosPorTipo(tipo)) {
    const np = normalizarOcr(plato).replace(/\s+/g, " ").trim();
    if (np === normal) coincidenciaExacta = plato;
    const ratio = distanciaLevenshtein(normal, np) / Math.max(normal.length, np.length, 1);
    const lev = 1 - ratio;
    const tokens = similitudTokens(limpio, plato);
    const contiene = normal.length >= 5 && (np.includes(normal) || normal.includes(np)) ? 0.18 : 0;
    const puntuacion = Math.min(1, lev * 0.72 + tokens * 0.28 + contiene);
    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion; mejorRatio = ratio; mejor = plato;
    }
  }

  if (coincidenciaExacta) {
    return { texto: coincidenciaExacta, original: limpio, sugerencia: "", nivel: "alta", puntuacion: Math.max(92, Math.round(confianza)), aprendido: false };
  }

  const palabras = normal.split(/\s+/).filter(Boolean);
  const letras = (normal.match(/[A-ZÑ]/g) || []).length;
  const demasiadoCorto = letras < 5 || palabras.length < 2;
  const coherente = esTextoOcrCoherente(limpio);
  const anomalias = analizarAnomaliasOcr(limpio);
  const autoCorregir = !demasiadoCorto && !anomalias.sospechoso && (mejorPuntuacion >= 0.76 || mejorRatio <= 0.25);
  const sugerir = !demasiadoCorto && (mejorPuntuacion >= 0.60 || mejorRatio <= 0.40);
  const textoBase = autoCorregir ? mejor : limpio;
  const textoFinal = textoBase
    .toLocaleLowerCase("es-ES")
    .replace(/(^|\s)([a-záéíóúüñ])/g, (_, a, b) => a + b.toLocaleUpperCase("es-ES"));
  let puntuacion = Math.round(Math.max(0, Math.min(100, confianza * 0.42 + mejorPuntuacion * 58)));
  if (coherente && !anomalias.sospechoso) puntuacion = Math.max(puntuacion, 78);
  if (anomalias.sospechoso) puntuacion = Math.min(puntuacion, 45);
  if (autoCorregir) puntuacion = Math.max(puntuacion, 86);

  let nivel;
  if (!textoFinal || demasiadoCorto) nivel = "baja";
  else if (anomalias.sospechoso) nivel = mejorPuntuacion >= 0.70 ? "media" : "baja";
  else if (coherente && !(sugerir && !autoCorregir && mejorRatio > 0.32)) nivel = "alta";
  else if (puntuacion >= 76 || autoCorregir) nivel = "alta";
  else if (puntuacion >= 48) nivel = "media";
  else nivel = "baja";

  return { texto: textoFinal, original: limpio, sugerencia: sugerir ? mejor : "", nivel, puntuacion, aprendido: false, motivosRevision: anomalias.motivos };
}

function diccionarioPlatos() {
  const base = [
    "Lentejas castellanas", "Menestra de verduras", "Ensalada de temporada", "Libritos de lomo con jamón y queso",
    "Contra de ternera asada", "Merluza al horno con verduras asadas", "Brócoli rehogado", "Falso risotto con setas",
    "Ensalada de queso", "Pechuga de pollo a la plancha", "Albóndigas con tomate", "Boquerones a la andaluza",
    "Sopa castellana", "Guisantes a la portuguesa", "Ensalada mixta", "Secreto a la plancha", "Ternera con setas",
    "Lubina a la plancha", "Fabada asturiana", "Revuelto de morcilla", "Ensaladilla alemana", "Musaka",
    "Filete de cerdo a la madrileña", "Dorada a la plancha", "Arroz campero", "Crema de verduras",
    "Empanada de atún", "Callos a la madrileña", "Atún plancha", "Fideuá marinera", "Crema de calabacín",
    "Huevos rotos con torreznillos", "Salchichas frescas encebolladas", "Colitas de rape en salsa",
    "Panache de verduras", "Pasta con espinacas y bacon", "Ensalada italiana", "Lomo de Sajonia al horno",
    "Pechuga de pollo al horno", "Salmón al horno", "Marmitako de calamar", "Acelgas rehogadas",
    "Entrecot a la parrilla", "Salchichas a la mostaza y miel", "Merluza al horno", "Sopa de cocido",
    "Alcachofas con jamón", "Ensalada de escarola", "Cocido completo", "Tortilla de patata",
    "Arroz valenciano", "Chuletas de aguja al horno", "Burritos de pollo", "Atún con tomate"
  ];
  for (const dia of Object.values(menuPublicado?.dias || {})) {
    for (const tipo of ["primeros", "segundos"]) for (const plato of dia?.[tipo] || []) base.push(plato);
  }
  return [...new Set(base.map(x => String(x).trim()).filter(Boolean))];
}

function corregirConDiccionario(texto) {
  const limpio = limpiarLineaOcr(texto);
  if (!limpio) return "";
  const normal = normalizarOcr(limpio);
  let mejor = null, ratio = 1;
  for (const plato of diccionarioPlatos()) {
    const d = distanciaLevenshtein(normal, plato);
    const r = d / Math.max(normal.length, normalizarOcr(plato).length, 1);
    if (r < ratio) { ratio = r; mejor = plato; }
  }
  return ratio <= 0.24 ? mejor : limpio
    .toLocaleLowerCase("es-ES")
    .replace(/(^|\s)([a-záéíóúüñ])/g, (_, a, b) => a + b.toLocaleUpperCase("es-ES"));
}

function esContinuacion(linea, anterior) {
  const n = normalizarOcr(linea), a = normalizarOcr(anterior);
  const palabras = n.split(/\s+/).filter(Boolean);
  if (palabras.length <= 1) return true;
  if (/\b(A|AL|DE|DEL|CON|EN|LA|LAS|LOS|Y)$/.test(a)) return true;
  if (/^(A|AL|DE|DEL|CON|EN|LA|LAS|LOS|Y)\b/.test(n)) return true;
  return false;
}

function compactarLineas(lineas) {
  const salida = [];
  for (const original of lineas) {
    const linea = limpiarLineaOcr(original);
    if (esRuidoOcr(linea)) continue;
    if (salida.length && esContinuacion(linea, salida[salida.length - 1])) salida[salida.length - 1] += ` ${linea}`;
    else salida.push(linea);
  }
  return salida;
}

function costeGrupo(lineas) {
  const texto = limpiarLineaOcr(lineas.join(" "));
  if (!texto) return 100;
  let mejor = 1;
  for (const plato of diccionarioPlatos()) {
    const r = distanciaLevenshtein(texto, plato) / Math.max(normalizarOcr(texto).length, normalizarOcr(plato).length, 1);
    mejor = Math.min(mejor, r);
  }
  const palabras = texto.split(/\s+/).length;
  const longitud = texto.length < 5 ? 3 : texto.length > 75 ? 2 : 0;
  return mejor * 4 + Math.abs(palabras - 4) * 0.05 + longitud;
}

function dividirEnTres(lineas) {
  const limpias = compactarLineas(lineas);
  if (limpias.length <= 3) return [...limpias, "", ""].slice(0, 3).map(corregirConDiccionario);
  let mejor = null;
  for (let i = 1; i < limpias.length - 1; i++) {
    for (let j = i + 1; j < limpias.length; j++) {
      const grupos = [limpias.slice(0, i), limpias.slice(i, j), limpias.slice(j)];
      const coste = grupos.reduce((s, g) => s + costeGrupo(g), 0);
      if (!mejor || coste < mejor.coste) mejor = { coste, grupos };
    }
  }
  return mejor.grupos.map(g => corregirConDiccionario(g.join(" ")));
}

function parsearTextoDia(texto) {
  const lineasBase = String(texto || "").split(/\r?\n/).map(limpiarLineaOcr);
  const lineas = lineasBase.filter(linea => !esRuidoOcr(linea));
  const porSeccion = { primeros: [], segundos: [] };
  let seccion = null;
  for (const linea of lineas) {
    const detectada = detectarSeccion(linea);
    if (detectada === "fin") break;
    if (detectada) { seccion = detectada; continue; }
    const normal = normalizarOcr(linea);
    if (/^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES)\b/.test(normal)) continue;
    if (seccion) porSeccion[seccion].push(linea);
  }
  return {
    primeros: dividirEnTres(porSeccion.primeros),
    segundos: dividirEnTres(porSeccion.segundos),
    dieta: ["Primero de dieta", "Carne plancha", "Pescado plancha"]
  };
}

function leerFormularioDias() {
  return Array.from(document.querySelectorAll(".ocr-day-card")).map(card => ({
    primeros: Array.from(card.querySelectorAll('[data-tipo="primeros"]')).map(el => el.value.trim()),
    segundos: Array.from(card.querySelectorAll('[data-tipo="segundos"]')).map(el => el.value.trim()),
    dieta: ["Primero de dieta", "Carne plancha", "Pescado plancha"]
  }));
}


function marcarCampoComoRevisado(input, { aprender = true } = {}) {
  const fila = input?.closest(".ocr-structured-row");
  if (!fila || !input.value.trim()) return false;
  const estabaPendiente = fila.classList.contains("ocr-needs-review");
  fila.classList.remove("ocr-needs-review", "ocr-confidence-media", "ocr-confidence-baja");
  fila.classList.add("ocr-confidence-alta");
  fila.querySelector(".ocr-confidence-badge")?.remove();
  if (aprender) aprenderCorreccionOcr(input.dataset.ocrOriginal || "", input.value);
  actualizarEstadoRevision({ animarFila: estabaPendiente ? fila : null });
  return estabaPendiente;
}

function enfocarCampoRevision(input, { seleccionar = true } = {}) {
  if (!input) return;
  campoRevisionActivo = input;
  actualizarReferenciaCeldaActiva(input);
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    input.focus({ preventScroll: true });
    if (seleccionar) input.select();
    mostrarBarraRevisionGuiada();
  }, 320);
}

function siguienteCampoPendiente(desde = campoRevisionActivo) {
  const pendientes = camposPendientesRevision();
  if (!pendientes.length) {
    cerrarRevisionGuiada(true);
    return null;
  }
  const indice = desde ? pendientes.indexOf(desde) : -1;
  return pendientes[indice >= 0 && indice < pendientes.length - 1 ? indice + 1 : 0];
}

function confirmarYSiguiente(input = campoRevisionActivo) {
  if (!input) return;
  if (!input.value.trim()) {
    input.focus();
    input.classList.remove("ocr-field-shake");
    void input.offsetWidth;
    input.classList.add("ocr-field-shake");
    return;
  }
  marcarCampoComoRevisado(input);
  const siguiente = siguienteCampoPendiente(input);
  if (siguiente) enfocarCampoRevision(siguiente);
}

function asegurarBarraRevisionGuiada() {
  let barra = document.getElementById("guided-review-bar");
  if (barra) return barra;
  barra = document.createElement("div");
  barra.id = "guided-review-bar";
  barra.className = "guided-review-bar";
  barra.hidden = true;
  barra.innerHTML = `
    <div class="guided-review-copy">
      <strong id="guided-review-title">Revisión guiada</strong>
      <span id="guided-review-progress"></span>
    </div>
    <div class="guided-review-actions">
      <button type="button" id="guided-review-close" class="secondary-action">Cerrar</button>
      <button type="button" id="guided-review-next" class="primary-action">Aceptar y siguiente</button>
    </div>`;
  document.body.appendChild(barra);
  barra.querySelector("#guided-review-close").addEventListener("click", () => cerrarRevisionGuiada(false));
  barra.querySelector("#guided-review-next").addEventListener("click", () => confirmarYSiguiente());
  return barra;
}

function mostrarBarraRevisionGuiada() {
  if (!revisionGuiadaActiva) return;
  const barra = asegurarBarraRevisionGuiada();
  const pendientes = camposPendientesRevision();
  const total = Number(barra.dataset.total || pendientes.length);
  const resueltos = Math.max(0, total - pendientes.length);
  barra.querySelector("#guided-review-progress").textContent = pendientes.length
    ? `${resueltos + 1} de ${total} · ${pendientes.length} pendientes`
    : `${total} de ${total} · completado`;
  barra.hidden = false;
  document.body.classList.add("guided-review-open");
}

function iniciarRevisionGuiada(inputInicial = null) {
  const pendientes = camposPendientesRevision();
  if (!pendientes.length) return;
  revisionGuiadaActiva = true;
  const barra = asegurarBarraRevisionGuiada();
  barra.dataset.total = String(pendientes.length);
  enfocarCampoRevision(inputInicial || pendientes[0]);
}

function cerrarRevisionGuiada(completada = false) {
  revisionGuiadaActiva = false;
  campoRevisionActivo = null;
  referenciaCeldaActiva = null;
  const botonRef = $("referencia-flotante");
  if (botonRef && $("revision-ocr") && !$("revision-ocr").hidden) botonRef.hidden = true;
  const barra = document.getElementById("guided-review-bar");
  if (barra) barra.hidden = true;
  document.body.classList.remove("guided-review-open");
  if (completada) {
    const resumen = $("ocr-resumen");
    resumen?.classList.add("review-complete-pop");
    window.setTimeout(() => resumen?.classList.remove("review-complete-pop"), 700);
    if (navigator.vibrate) navigator.vibrate(35);
  }
}

function actualizarEstadoRevision({ animarFila = null } = {}) {
  const filas = Array.from(document.querySelectorAll(".ocr-structured-row"));
  if (!filas.length) return;

  let pendientes = 0;
  filas.forEach(fila => {
    const input = fila.querySelector("input");
    const vacio = !input?.value.trim();
    if (vacio) {
      fila.classList.add("ocr-needs-review", "ocr-confidence-baja");
      fila.classList.remove("ocr-confidence-alta", "ocr-confidence-media");
      let badge = fila.querySelector(".ocr-confidence-badge");
      if (!badge) {
        badge = document.createElement("small");
        badge.className = "ocr-confidence-badge";
        badge.textContent = "Revisar";
        fila.appendChild(badge);
      }
    }
    if (fila.classList.contains("ocr-needs-review")) pendientes += 1;
  });

  const total = filas.length;
  const correctos = Math.max(0, total - pendientes);
  const porcentaje = total ? Math.round((correctos / total) * 100) : 0;
  const resumen = $("ocr-resumen");
  if (resumen) {
    resumen.classList.toggle("is-ready", pendientes === 0);
    resumen.innerHTML = `
      <div class="ocr-summary-copy">
        <strong>${pendientes === 0 ? "Menú listo para preparar" : `${total} platos detectados`}</strong>
        <span>${correctos} correctos</span>
        <span class="summary-review">${pendientes} para revisar</span>
      </div>
      <div class="ocr-progress" aria-label="Revisión completada al ${porcentaje}%">
        <span style="width:${porcentaje}%"></span>
      </div>
    `;
  }

  const boton = $("preparar-semana");
  if (boton) {
    boton.classList.toggle("is-ready", pendientes === 0);
    boton.textContent = pendientes === 0 ? "✓ Menú listo · Preparar semana" : `Preparar semana · ${pendientes} pendientes`;
  }

  if (revisionGuiadaActiva) {
    if (pendientes === 0) cerrarRevisionGuiada(true);
    else mostrarBarraRevisionGuiada();
  }

  if (animarFila) {
    animarFila.classList.remove("ocr-row-resolved");
    void animarFila.offsetWidth;
    animarFila.classList.add("ocr-row-resolved");
    window.setTimeout(() => animarFila.classList.remove("ocr-row-resolved"), 450);
  }
}

function pintarFormularioDias(dias, diagnostico = null) {
  const contenedor = $("ocr-dias");
  contenedor.innerHTML = "";

  const revision = $("revision-ocr");
  let resumen = $("ocr-resumen");
  if (!resumen) {
    resumen = document.createElement("div");
    resumen.id = "ocr-resumen";
    resumen.className = "ocr-summary";
    revision?.insertBefore(resumen, contenedor);
  }

  const niveles = { alta: 0, media: 0, baja: 0 };
  if (diagnostico) {
    diagnostico.forEach(dia => {
      for (const tipo of ["primeros", "segundos"]) {
        (dia?.[tipo] || []).forEach(info => {
          const nivel = info?.nivel || (info?.revisar ? "media" : "alta");
          niveles[nivel] = (niveles[nivel] || 0) + 1;
        });
      }
    });
  } else {
    niveles.alta = dias.length * 6;
  }
  const total = niveles.alta + niveles.media + niveles.baja;
  resumen.innerHTML = `
    <div class="ocr-summary-copy">
      <strong>${total} platos detectados</strong>
      <span>${niveles.alta} correctos</span>
      <span class="summary-review">${niveles.media + niveles.baja} para revisar</span>
    </div>
    <div class="ocr-progress" aria-label="Progreso de revisión"><span></span></div>
  `;

  dias.forEach((dia, indice) => {
    const bloque = document.createElement("article");
    bloque.className = "ocr-day-card";
    const titulo = document.createElement("h3"); titulo.textContent = nombreDiaDesdeIndice(indice);
    bloque.appendChild(titulo);
    for (const tipo of ["primeros", "segundos"]) {
      const subtitulo = document.createElement("h4"); subtitulo.textContent = tipo === "primeros" ? "Primeros" : "Segundos";
      bloque.appendChild(subtitulo);
      const lista = document.createElement("div"); lista.className = "ocr-structured-list";
      for (let i = 0; i < 3; i++) {
        const fila = document.createElement("label"); fila.className = "ocr-structured-row";
        const numero = document.createElement("span"); numero.textContent = `${i + 1}`;
        const input = document.createElement("input"); input.type = "text"; input.dataset.tipo = tipo;
        input.dataset.diaIndice = String(indice);
        input.dataset.platoIndice = String((tipo === "primeros" ? 0 : 3) + i);
        input.value = dia?.[tipo]?.[i] || ""; input.placeholder = `${tipo === "primeros" ? "Primer" : "Segundo"} plato ${i + 1}`;
        const info = diagnostico?.[indice]?.[tipo]?.[i];
        if (info) {
          const nivel = info.nivel || (info.revisar ? "media" : "alta");
          fila.classList.add(`ocr-confidence-${nivel}`);
          if (nivel !== "alta") fila.classList.add("ocr-needs-review");
          input.dataset.ocrOriginal = info.original || info.textoOriginal || "";
          input.dataset.ocrSugerencia = info.sugerencia || "";
          const detalle = info.sugerencia && info.sugerencia !== input.value ? ` · Sugerencia: ${info.sugerencia}` : "";
          input.title = `Confianza ${info.puntuacion ?? Math.round(info.confianza || 0)}%${detalle}`;
          input.setAttribute("aria-label", `${input.placeholder}. Confianza ${nivel}${detalle}`);
          if (nivel !== "alta") {
            const badge = document.createElement("button");
            badge.type = "button";
            badge.className = "ocr-confidence-badge";
            badge.textContent = "Revisar";
            badge.setAttribute("aria-label", `Revisar ${input.placeholder}`);
            badge.addEventListener("click", event => {
              event.preventDefault();
              iniciarRevisionGuiada(input);
            });
            input.dataset.confidenceLabel = badge.textContent;
            fila._confidenceBadge = badge;
          }
        }
        input.addEventListener("input", () => {
          if (input.value.trim()) {
            marcarCampoComoRevisado(input, { aprender: false });
          } else {
            fila.classList.add("ocr-needs-review", "ocr-confidence-baja");
            actualizarEstadoRevision();
          }
          mostrarBarraRevisionGuiada();
        });
        input.addEventListener("focus", () => {
          campoRevisionActivo = input;
          actualizarReferenciaCeldaActiva(input);
          mostrarBarraRevisionGuiada();
        });
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!revisionGuiadaActiva && fila.classList.contains("ocr-needs-review")) iniciarRevisionGuiada(input);
            confirmarYSiguiente(input);
          }
        });
        input.addEventListener("change", () => aprenderCorreccionOcr(input.dataset.ocrOriginal || "", input.value));
        fila.append(numero, input);
        if (fila._confidenceBadge) fila.appendChild(fila._confidenceBadge);
        lista.appendChild(fila);
      }
      bloque.appendChild(lista);
    }
    contenedor.appendChild(bloque);
  });
  actualizarEstadoRevision();
}


function camposPendientesRevision() {
  return Array.from(document.querySelectorAll(".ocr-structured-row.ocr-needs-review input"));
}

function abrirAsistenteRevision() {
  const pendientes = camposPendientesRevision();
  if (!pendientes.length) return false;

  let dialogo = document.getElementById("review-assistant-dialog");
  if (!dialogo) {
    dialogo = document.createElement("dialog");
    dialogo.id = "review-assistant-dialog";
    dialogo.className = "review-assistant-dialog";
    dialogo.innerHTML = `
      <form method="dialog" class="review-assistant-card">
        <p class="eyebrow">Revisión pendiente</p>
        <h2>Hay platos que conviene revisar</h2>
        <p id="review-assistant-copy"></p>
        <div class="review-assistant-actions">
          <button value="cancel" class="secondary-action" type="submit">Seguir después</button>
          <button id="review-assistant-start" value="default" class="primary-action" type="button">Revisar ahora</button>
        </div>
      </form>`;
    document.body.appendChild(dialogo);
  }

  const copy = dialogo.querySelector("#review-assistant-copy");
  copy.textContent = `Se han detectado ${pendientes.length} platos para revisar antes de preparar la semana.`;
  const boton = dialogo.querySelector("#review-assistant-start");
  boton.onclick = () => {
    dialogo.close();
    const primero = camposPendientesRevision()[0];
    iniciarRevisionGuiada(primero);
  };
  dialogo.showModal();
  return true;
}

function prepararSemanaDesdeTexto() {
  if (abrirAsistenteRevision()) return;
  const lunes = $("lunes-semana").value;
  if (!lunes) return window.alert("Selecciona el lunes de la semana.");
  const fechas = fechasSemana(lunes);
  const diasFormulario = leerFormularioDias();
  if (diasFormulario.length !== 5) return window.alert("Primero lee la foto o crea una plantilla.");
  const dias = {}, errores = [];
  diasFormulario.forEach((dia, i) => {
    dias[fechas[i]] = dia;
    for (const tipo of ["primeros", "segundos"]) {
      if (dia[tipo].some(x => !x)) errores.push(`${nombreDiaDesdeIndice(i)}: completa los 3 ${tipo}.`);
    }
  });
  if (errores.length) {
    $("ocr-progreso").textContent = `Revisión necesaria: ${errores.join(" ")}`;
    $("ocr-progreso").className = "editor-message message-error";
    return;
  }
  document.querySelectorAll(".ocr-structured-row input").forEach(input => {
    aprenderCorreccionOcr(input.dataset.ocrOriginal || "", input.value);
  });
  borradorImportacion = { dias };
  comparacionImportacion = compararBorrador(borradorImportacion);
  pintarComparacion(comparacionImportacion);
  $("resultado-importacion").hidden = false;
  $("resultado-importacion").scrollIntoView({ behavior: "smooth", block: "start" });
}

function menusDiaIguales(a, b) {
  return JSON.stringify(normalizarMenuDia(a)) === JSON.stringify(normalizarMenuDia(b));
}

function compararBorrador(borrador) {
  const nuevos = [], iguales = [], modificados = [];
  for (const [fecha, dia] of Object.entries(borrador.dias)) {
    const actual = menuPublicado?.dias?.[fecha];
    if (!actual) nuevos.push(fecha);
    else if (menusDiaIguales(actual, dia)) iguales.push(fecha);
    else modificados.push(fecha);
  }
  return { nuevos, iguales, modificados };
}

function pintarComparacion(comparacion) {
  const detalle = $("resultado-detalle");
  detalle.innerHTML = "";
  [["new", "Días nuevos", comparacion.nuevos], ["same", "Ya publicados sin cambios", comparacion.iguales], ["changed", "Días publicados con diferencias", comparacion.modificados]].forEach(([tipo, titulo, fechas]) => {
    const bloque = document.createElement("div");
    bloque.className = `comparison-item comparison-${tipo}`;
    const h = document.createElement("strong"); h.textContent = `${titulo}: ${fechas.length}`;
    const p = document.createElement("p"); p.textContent = fechas.length ? fechas.map(f => formatearFecha(fechaDesdeClave(f))).join(" · ") : "Ninguno";
    bloque.append(h, p); detalle.appendChild(bloque);
  });
  const sinCambios = !comparacion.nuevos.length && !comparacion.modificados.length;
  $("resultado-titulo").textContent = sinCambios ? "Esta semana ya está publicada" : "Semana preparada para revisar";
  $("permitir-actualizaciones-wrap").hidden = !comparacion.modificados.length;
  $("permitir-actualizaciones").checked = false;
  $("aplicar-semana").disabled = sinCambios || comparacion.modificados.length > 0;
  $("importador-mensaje").textContent = sinCambios
    ? "No se han detectado cambios. La actualización queda bloqueada."
    : comparacion.modificados.length
      ? "Hay fechas publicadas con diferencias. Activa la autorización únicamente si son cambios reales."
      : "Los días nuevos se añadirán sin eliminar nada publicado.";
  $("importador-mensaje").className = `editor-message ${sinCambios ? "message-info" : comparacion.modificados.length ? "message-error" : "message-success"}`;
}

function aplicarSemanaAlEditor() {
  if (!borradorImportacion || !comparacionImportacion) return;
  if (comparacionImportacion.modificados.length && !$("permitir-actualizaciones").checked) return;
  if (comparacionImportacion.modificados.length && !window.confirm("Vas a sustituir días ya publicados. ¿Continuar?")) return;
  const fechasAplicadas = [];
  for (const [fecha, dia] of Object.entries(borradorImportacion.dias)) {
    const existe = Boolean(menuTrabajo.dias[fecha]);
    if (!existe || $("permitir-actualizaciones").checked) { menuTrabajo.dias[fecha] = clonar(dia); fechasAplicadas.push(fecha); }
  }
  if (!fechasAplicadas.length) return;
  fechasReferenciaImportacion = new Set(fechasAplicadas);
  guardarReferenciaSesion();
  fechaActiva = fechasAplicadas.sort()[0];
  cargarSelectorFechas(menuTrabajo, fechaActiva);
  cambiarVista("vista-editor"); mostrarMenuDeFecha(fechaActiva); actualizarEstadoCambios();
  mostrarMensaje(`Semana incorporada como borrador. Revisa los ${fechasAplicadas.length} días antes de publicar.`, "success");
}

function prepararImagenReferencia() {
  if (!fuenteImportacion) return;
  try {
    const max = 1800;
    const escala = Math.min(1, max / Math.max(fuenteImportacion.width, fuenteImportacion.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(fuenteImportacion.width * escala));
    canvas.height = Math.max(1, Math.round(fuenteImportacion.height * escala));
    canvas.getContext("2d", { alpha: false }).drawImage(fuenteImportacion, 0, 0, canvas.width, canvas.height);
    imagenReferenciaImportacion = canvas.toDataURL("image/jpeg", 0.86);
    guardarReferenciaSesion();
    actualizarReferenciaRevision();
  } catch { imagenReferenciaImportacion = null; }
}

function referenciaDisponibleEnContexto() {
  if (!imagenReferenciaImportacion) return false;
  const revisionVisible = $("revision-ocr") && !$("revision-ocr").hidden;
  const editorVisible = $("vista-editor") && !$("vista-editor").hidden;
  if (revisionVisible) return true;
  if (!editorVisible) return false;
  if (modoEditor === "semana") {
    const semana = obtenerSemanaDeFecha($("selector-fecha").value || fechasSemanaActiva[0] || "");
    return semana.fechas.some(fecha => fechasReferenciaImportacion.has(fecha));
  }
  return Boolean(fechaActiva && fechasReferenciaImportacion.has(fechaActiva));
}

function actualizarBotonReferenciaFlotante() {
  const boton = $("referencia-flotante");
  if (!boton) return;
  boton.hidden = !referenciaDisponibleEnContexto();
  document.body.classList.toggle("reference-floating-open", !boton.hidden);
}

function actualizarReferenciaEditor() {
  actualizarBotonReferenciaFlotante();
}

function actualizarReferenciaRevision() {
  actualizarBotonReferenciaFlotante();
  const tarjeta = $("referencia-compacta");
  const imagen = $("referencia-compacta-img");
  if (!tarjeta || !imagen) return;
  const visible = Boolean(imagenReferenciaImportacion && $("revision-ocr") && !$("revision-ocr").hidden);
  tarjeta.hidden = !visible;
  if (visible && imagen.src !== imagenReferenciaImportacion) imagen.src = imagenReferenciaImportacion;
}

function contextoCeldaReferencia(input = campoRevisionActivo) {
  if (!input?.dataset) return null;
  const dia = Number(input.dataset.diaIndice);
  const plato = Number(input.dataset.platoIndice);
  if (!Number.isInteger(dia) || !Number.isInteger(plato)) return null;
  const seccion = plato < 3 ? "Primeros" : "Segundos";
  const posicion = (plato % 3) + 1;
  return { dia, plato, seccion, posicion, titulo: `${nombreDiaDesdeIndice(dia)} · ${seccion} ${posicion}` };
}

function crearImagenCeldaReferencia(dia, plato) {
  if (!fuenteImportacion) return null;
  const g = geometriaCelda(dia, plato);
  const margenX = Math.max(12, g.sw * .16);
  const margenY = Math.max(10, g.sh * 1.15);
  const sx = Math.max(0, g.sx - margenX);
  const sy = Math.max(0, g.sy - margenY);
  const sw = Math.min(fuenteImportacion.width - sx, g.sw + margenX * 2);
  const sh = Math.min(fuenteImportacion.height - sy, g.sh + margenY * 2);
  const escala = Math.min(3.2, Math.max(1.45, 900 / Math.max(sw, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(640, Math.round(sw * escala));
  canvas.height = Math.max(360, Math.round(sh * escala));
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fuenteImportacion, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const rx = ((g.sx - sx) / sw) * canvas.width;
  const ry = ((g.sy - sy) / sh) * canvas.height;
  const rw = (g.sw / sw) * canvas.width;
  const rh = (g.sh / sh) * canvas.height;
  ctx.strokeStyle = "#e30613";
  ctx.lineWidth = Math.max(7, canvas.width / 150);
  ctx.setLineDash([18, 12]);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.setLineDash([]);
  return canvas.toDataURL("image/jpeg", .94);
}

function actualizarReferenciaCeldaActiva(input = campoRevisionActivo) {
  referenciaCeldaActiva = contextoCeldaReferencia(input);
  const boton = $("referencia-flotante");
  const texto = boton?.querySelector("span:last-child");
  if (texto) texto.textContent = referenciaCeldaActiva ? "Ver original" : "Ver menú";
  if (boton && $("revision-ocr") && !$("revision-ocr").hidden) {
    boton.hidden = !imagenReferenciaImportacion || !referenciaCeldaActiva;
    document.body.classList.toggle("reference-floating-open", !boton.hidden);
  }
}

function mostrarModoReferencia(modo = referenciaModo) {
  if (!imagenReferenciaImportacion) return;
  referenciaModo = modo;
  const contexto = referenciaCeldaActiva || contextoCeldaReferencia();
  const usarCelda = modo === "celda" && contexto && fuenteImportacion;
  const src = usarCelda ? crearImagenCeldaReferencia(contexto.dia, contexto.plato) : imagenReferenciaImportacion;
  $("reference-dialog-img").src = src || imagenReferenciaImportacion;
  $("reference-dialog-context").textContent = usarCelda ? "Celda detectada" : "Menú original";
  $("reference-dialog-title").textContent = usarCelda ? contexto.titulo : "Foto completa";
  $("reference-show-cell").classList.toggle("is-active", Boolean(usarCelda));
  $("reference-show-full").classList.toggle("is-active", !usarCelda);
  $("reference-show-cell").disabled = !contexto || !fuenteImportacion;
  const stage = $("reference-dialog").querySelector(".reference-dialog-stage");
  stage.scrollTop = 0; stage.scrollLeft = 0;
}

function abrirReferencia() {
  if (!imagenReferenciaImportacion) return;
  const dialogo = $("reference-dialog");
  referenciaCeldaActiva = contextoCeldaReferencia() || referenciaCeldaActiva;
  mostrarModoReferencia(referenciaCeldaActiva ? "celda" : "completo");
  dialogo.showModal();
}

function cerrarReferencia() {
  const dialogo = $("reference-dialog");
  if (dialogo.open) dialogo.close();
}

async function cargarFuenteImagen(archivo) {
  const esPdf = archivo.type === "application/pdf" || archivo.name.toLowerCase().endsWith(".pdf");
  if (esPdf) {
    if (!window.pdfjsLib) throw new Error("No se pudo cargar el lector de PDF.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: await archivo.arrayBuffer() }).promise;
    const pagina = await pdf.getPage(1);
    const viewport = pagina.getViewport({ scale: 2.4 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await pagina.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport }).promise;
    return canvas;
  }
  const bitmap = await createImageBitmap(archivo);
  const canvas = document.createElement("canvas");
  const max = 2200;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * escala); canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

function valoresRecorte() {
  let top = Number($("crop-top").value), bottom = Number($("crop-bottom").value), left = Number($("crop-left").value), right = Number($("crop-right").value);
  if (bottom <= top + 8) bottom = top + 8;
  if (right <= left + 20) right = left + 20;
  return { top: top / 100, bottom: Math.min(bottom, 100) / 100, left: left / 100, right: Math.min(right, 100) / 100 };
}

function calibracionActual() {
  const verticales = ["cal-v1", "cal-v2", "cal-v3", "cal-v4"].map(id => Number($(id).value) / 100);
  const horizontales = ["cal-h1", "cal-h2", "cal-h3", "cal-h4", "cal-h5", "cal-h6"].map(id => Number($(id).value) / 100);
  return { verticales, horizontales };
}

function aplicarCalibracion(calibracion) {
  if (!calibracion) return;
  (calibracion.verticales || []).slice(0, 4).forEach((valor, i) => { const el = $(`cal-v${i + 1}`); if (el) el.value = Math.round(valor * 100); });
  (calibracion.horizontales || []).slice(0, 6).forEach((valor, i) => { const el = $(`cal-h${i + 1}`); if (el) el.value = Math.round(valor * 100); });
}

function cargarCalibracionGuardada() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || "null");
    if (guardada) {
      aplicarCalibracion(guardada);
      $("calibracion-estado").textContent = "Guardada";
      $("calibracion-estado").classList.remove("has-changes");
    }
  } catch {}
}

function normalizarSeparadores(ids, minGap = 0.035) {
  const els = ids.map(id => $(id));
  const valores = els.map(el => Number(el.value) / 100);
  for (let i = 1; i < valores.length; i++) valores[i] = Math.max(valores[i], valores[i - 1] + minGap);
  for (let i = valores.length - 2; i >= 0; i--) valores[i] = Math.min(valores[i], valores[i + 1] - minGap);
  valores.forEach((v, i) => { els[i].value = Math.round(Math.max(0.03, Math.min(0.97, v)) * 100); });
}

function calibracionModificada(tipo) {
  normalizarSeparadores(tipo === "v" ? ["cal-v1", "cal-v2", "cal-v3", "cal-v4"] : ["cal-h1", "cal-h2", "cal-h3", "cal-h4", "cal-h5", "cal-h6"], tipo === "v" ? 0.06 : 0.045);
  $("calibracion-estado").textContent = "Sin guardar";
  $("calibracion-estado").classList.add("has-changes");
  dibujarPreviewRecorte();
}

function guardarCalibracion() {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibracionActual()));
  $("calibracion-estado").textContent = "Guardada";
  $("calibracion-estado").classList.remove("has-changes");
}

function restablecerCalibracion() {
  aplicarCalibracion({ verticales: [.20,.40,.60,.80], horizontales: [.15,.29,.43,.52,.68,.84] });
  localStorage.removeItem(CALIBRATION_KEY);
  $("calibracion-estado").textContent = "Sin guardar";
  $("calibracion-estado").classList.add("has-changes");
  dibujarPreviewRecorte();
}

function dibujarPreviewRecorte() {
  if (!fuenteImportacion) return;
  const preview = $("recorte-preview");
  const ctx = preview.getContext("2d");
  const maxW = 900;
  const escala = Math.min(1, maxW / fuenteImportacion.width);
  preview.width = Math.round(fuenteImportacion.width * escala);
  preview.height = Math.round(fuenteImportacion.height * escala);
  ctx.drawImage(fuenteImportacion, 0, 0, preview.width, preview.height);
  const r = valoresRecorte();
  const x = r.left * preview.width, y = r.top * preview.height, w = (r.right-r.left)*preview.width, h = (r.bottom-r.top)*preview.height;
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.fillRect(0,0,preview.width,y); ctx.fillRect(0,y,x,h); ctx.fillRect(x+w,y,preview.width-x-w,h); ctx.fillRect(0,y+h,preview.width,preview.height-y-h);
  ctx.strokeStyle = "#e30613"; ctx.lineWidth = Math.max(3, preview.width/250); ctx.strokeRect(x,y,w,h);

  const { verticales, horizontales } = calibracionActual();
  ctx.lineWidth = Math.max(1.5, preview.width / 500);
  ctx.strokeStyle = "rgba(227,6,19,.9)";
  verticales.forEach(v => { const xx = x + w * v; ctx.beginPath(); ctx.moveTo(xx,y); ctx.lineTo(xx,y+h); ctx.stroke(); });
  horizontales.forEach((v, i) => {
    const yy = y + h * v;
    ctx.strokeStyle = i === 2 || i === 3 ? "rgba(255,149,0,.95)" : "rgba(227,6,19,.9)";
    ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+w,yy); ctx.stroke();
  });
  const segundosTop = y + h * horizontales[2];
  const segundosBottom = y + h * horizontales[3];
  ctx.fillStyle = "rgba(255,149,0,.18)";
  ctx.fillRect(x, segundosTop, w, segundosBottom - segundosTop);
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = `700 ${Math.max(11, preview.width/60)}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText("SEGUNDOS · NO SE LEE", x + w/2, segundosTop + Math.max(15, (segundosBottom-segundosTop)/2 + 5));
}

function limitesColumnasCalibrados() {
  const { verticales } = calibracionActual();
  return [0, ...verticales, 1];
}

function limitesFilasCalibrados() {
  const { horizontales } = calibracionActual();
  return [0, ...horizontales, 1];
}

function geometriaCelda(indiceDia, indicePlato) {
  const r = valoresRecorte();
  const columnas = limitesColumnasCalibrados();
  const filas = limitesFilasCalibrados();
  const bandasPlato = [0, 1, 2, 4, 5, 6];
  const banda = bandasPlato[indicePlato];
  const x0 = columnas[indiceDia], x1 = columnas[indiceDia + 1];
  const y0 = filas[banda], y1 = filas[banda + 1];
  const anchoTabla = fuenteImportacion.width * (r.right-r.left);
  const altoTabla = fuenteImportacion.height * (r.bottom-r.top);
  const margenXIzq = 0.025, margenXDer = 0.075, margenY = 0.08;
  return {
    sx: fuenteImportacion.width*r.left + anchoTabla*(x0 + (x1-x0)*margenXIzq),
    sy: fuenteImportacion.height*r.top + altoTabla*(y0 + (y1-y0)*margenY),
    sw: anchoTabla*(x1-x0)*(1-margenXIzq-margenXDer),
    sh: altoTabla*(y1-y0)*(1-margenY*2)
  };
}

function crearCanvasCelda(indiceDia, indicePlato, modo = "binario") {
  const { sx, sy, sw, sh } = geometriaCelda(indiceDia, indicePlato);
  const procesar = modo !== "preview";
  const escala = procesar ? Math.max(4.2, 1650 / Math.max(sw, 1)) : Math.max(1.2, 420 / Math.max(sw, 1));
  const margen = procesar ? Math.max(22, Math.round(escala * 6)) : 0;
  const anchoInterior = Math.max(procesar ? 720 : 260, Math.round(sw * escala));
  const altoInterior = Math.max(procesar ? 210 : 90, Math.round(sh * escala));
  const canvas = document.createElement("canvas");
  canvas.width = anchoInterior + margen * 2;
  canvas.height = altoInterior + margen * 2;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fuenteImportacion, sx, sy, sw, sh, margen, margen, anchoInterior, altoInterior);
  if (!procesar) return canvas;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const grises = new Uint8ClampedArray(d.length / 4);
  let suma = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    // Contraste suave antes de binarizar. Conserva mejor las letras finas.
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
    grises[p] = g;
    suma += g;
  }
  const media = suma / grises.length;

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let c;
    if (modo === "gris") {
      c = grises[p];
    } else {
      // Umbral más conservador que evita convertir trazos finos en blanco.
      const umbral = Math.max(150, Math.min(215, media - 10));
      c = grises[p] > umbral ? 255 : 0;
    }
    d[i] = d[i + 1] = d[i + 2] = c;
    d[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // Borra posibles restos de las líneas de la tabla en el perímetro.
  if (modo !== "gris") {
    const borde = Math.max(8, Math.round(canvas.height * 0.035));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, borde);
    ctx.fillRect(0, canvas.height - borde, canvas.width, borde);
    ctx.fillRect(0, 0, borde, canvas.height);
    ctx.fillRect(canvas.width - borde, 0, borde, canvas.height);
  }
  return canvas;
}

function textoSospechosoOcr(texto, confianza = 0) {
  const limpio = limpiarTextoCelda(texto);
  const letras = (limpio.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (!limpio || letras < 5 || palabras.length < 2) return true;
  if (confianza < 58) return true;
  if (/^(O|NG|AA|NT|MII|MAI|AO)$/i.test(normalizarOcr(limpio))) return true;
  return false;
}

function puntuacionCandidatoOcr(texto, confianza = 0) {
  const limpio = limpiarTextoCelda(texto);
  if (!limpio) return -1000;
  const normal = normalizarOcr(limpio);
  const palabras = normal.split(/\s+/).filter(Boolean).length;
  let mejorRatio = 1;
  for (const plato of diccionarioPlatos()) {
    const r = distanciaLevenshtein(normal, plato) / Math.max(normal.length, normalizarOcr(plato).length, 1);
    mejorRatio = Math.min(mejorRatio, r);
  }
  const longitudUtil = Math.min(1, normal.length / 24);
  return confianza * 0.55 + (1 - mejorRatio) * 42 + palabras * 1.5 + longitudUtil * 5;
}

async function reconocerCelda(worker, dia, plato, tipo) {
  const intento1 = await worker.recognize(crearCanvasCelda(dia, plato, "binario"));
  const candidato1 = {
    texto: limpiarTextoCelda(intento1?.data?.text || ""),
    confianza: Number(intento1?.data?.confidence || 0),
    modo: "binario"
  };

  let candidatos = [candidato1];
  if (textoSospechosoOcr(candidato1.texto, candidato1.confianza)) {
    // Un segundo intento en grises recupera trazos finos que la binarización puede perder.
    const intento2 = await worker.recognize(crearCanvasCelda(dia, plato, "gris"));
    candidatos.push({
      texto: limpiarTextoCelda(intento2?.data?.text || ""),
      confianza: Number(intento2?.data?.confidence || 0),
      modo: "gris"
    });
  }

  candidatos.sort((a, b) => puntuacionCandidatoOcr(b.texto, b.confianza) - puntuacionCandidatoOcr(a.texto, a.confianza));
  const mejor = candidatos[0] || { texto: "", confianza: 0, modo: "binario" };
  const interpretado = interpretarTextoOcr(mejor.texto, mejor.confianza, tipo);
  return {
    texto: interpretado.texto,
    textoOriginal: mejor.texto,
    original: interpretado.original,
    sugerencia: interpretado.sugerencia,
    confianza: mejor.confianza,
    puntuacion: interpretado.puntuacion,
    nivel: interpretado.nivel,
    revisar: interpretado.nivel !== "alta",
    aprendido: interpretado.aprendido,
    modo: mejor.modo
  };
}

function verTreintaRecortes() {
  if (!fuenteImportacion) return;
  const grid = $("recortes-grid"); grid.innerHTML = "";
  const nombres = ["Primero 1","Primero 2","Primero 3","Segundo 1","Segundo 2","Segundo 3"];
  for (let dia=0; dia<5; dia++) {
    for (let plato=0; plato<6; plato++) {
      const card=document.createElement("article"); card.className="cut-card";
      const title=document.createElement("strong"); title.textContent=`${nombreDiaDesdeIndice(dia)} · ${nombres[plato]}`;
      const canvas=crearCanvasCelda(dia,plato,"preview"); card.append(title,canvas); grid.appendChild(card);
    }
  }
  $("vista-recortes").hidden=false;
  $("vista-recortes").scrollIntoView({behavior:"smooth",block:"start"});
}

function limpiarTextoCelda(texto) {
  let limpio = String(texto || "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/[\[\]{}<>|_=~^`´“”•·▪◦*]+/g, " ")
    .replace(/\([^)]{0,8}\)/g, " ")
    .replace(/(^|\s)[0-9]{1,2}(?=\s|$)/g, " ")
    .replace(/\b(?:ED|EZ|EO|OE|EE|EC|CE|EJ|GG|UC|ES)\)?\b/gi, " ")
    .replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/, "")
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Restos cortos producidos por iconos al principio/final.
  const palabras = limpio.split(/\s+/).filter(Boolean);
  while (palabras.length > 1 && palabras[0].length <= 2 && !/^(A|AL|DE|DEL|EN|LA|LAS|LOS|Y)$/i.test(palabras[0])) palabras.shift();
  while (palabras.length > 1 && palabras.at(-1).length <= 2 && !/^(A|AL|DE|DEL|EN|LA|LAS|LOS|Y)$/i.test(palabras.at(-1))) palabras.pop();
  limpio = palabras.join(" ");
  return corregirConDiccionario(limpio);
}

async function leerFotoConOcr() {
  const archivo = $("foto-menu").files?.[0];
  if (!archivo || !fuenteImportacion) return;
  if (!window.Tesseract) return window.alert("No se pudo cargar el OCR gratuito.");
  const lunes = $("lunes-semana").value;
  if (!lunes) return window.alert("Selecciona el lunes de la semana.");

  const boton = $("leer-foto");
  boton.disabled = true;
  boton.textContent = "Leyendo 1/30…";
  $("ocr-progreso").className = "editor-message message-info";
  let worker;
  try {
    worker = await Tesseract.createWorker("spa", 1, {
      logger: p => {
        if (p.status === "recognizing text") {
          $("ocr-progreso").textContent = `Leyendo celda… ${Math.round((p.progress || 0) * 100)}%`;
        }
      }
    });
    await worker.setParameters({
      tessedit_pageseg_mode: "7",
      preserve_interword_spaces: "1"
    });

    $("ocr-progreso").textContent = "Usando la calibración visual guardada…";

    const dias = Array.from({ length: 5 }, () => ({
      primeros: ["", "", ""],
      segundos: ["", "", ""],
      dieta: ["Primero de dieta", "Carne plancha", "Pescado plancha"]
    }));
    const diagnostico = Array.from({ length: 5 }, () => ({
      primeros: [null, null, null],
      segundos: [null, null, null]
    }));

    let paso = 0;
    for (let dia = 0; dia < 5; dia++) {
      for (let plato = 0; plato < 6; plato++) {
        paso += 1;
        boton.textContent = `Leyendo ${paso}/30…`;
        const grupo = plato < 3 ? "primeros" : "segundos";
        const posicion = plato % 3;
        $("ocr-progreso").textContent = `${nombreDiaDesdeIndice(dia)} · ${grupo === "primeros" ? "primer" : "segundo"} ${posicion + 1}`;
        const lectura = await reconocerCelda(worker, dia, plato, grupo);
        dias[dia][grupo][posicion] = lectura.texto;
        diagnostico[dia][grupo][posicion] = lectura;
      }
    }

    pintarFormularioDias(dias, diagnostico);
    $("revision-ocr").hidden = false;
    actualizarReferenciaRevision();
    $("resultado-importacion").hidden = true;
    const vacios = dias.reduce((total, dia) => total + [...dia.primeros, ...dia.segundos].filter(x => !x).length, 0);
    const dudosos = diagnostico.reduce((total, dia) => total + [...dia.primeros, ...dia.segundos].filter(x => x?.revisar).length, 0);
    $("ocr-progreso").textContent = vacios
      ? `Lectura terminada. Quedan ${vacios} campos sin reconocer y ${dudosos} marcados para revisar.`
      : dudosos
        ? `Lectura terminada. Revisa los ${dudosos} campos resaltados antes de preparar la semana.`
        : "Lectura terminada con buena confianza. Revisa los 30 platos antes de preparar la semana.";
    $("ocr-progreso").className = vacios || dudosos ? "editor-message message-info" : "editor-message message-success";
    $("revision-ocr").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    $("ocr-progreso").textContent = "No se pudo completar el OCR. Ajusta el recorte o crea una plantilla manual.";
    $("ocr-progreso").className = "editor-message message-error";
  } finally {
    await worker?.terminate?.();
    boton.disabled = false;
    boton.textContent = "Leer 30 celdas";
  }
}

async function fotoSeleccionada() {
  const archivo=$("foto-menu").files?.[0];
  $("leer-foto").disabled=!archivo; $("revision-ocr").hidden=true; $("resultado-importacion").hidden=true; actualizarReferenciaRevision();
  if (!archivo) { fuenteImportacion=null; limpiarReferenciaSesion(); limitesFilasDetectados=null; $("recorte-panel").hidden=true; actualizarReferenciaRevision(); return; }
  $("ocr-progreso").textContent="Preparando vista previa…"; $("ocr-progreso").className="editor-message message-info";
  try {
    fuenteImportacion=await cargarFuenteImagen(archivo); limitesFilasDetectados=null;
    prepararImagenReferencia();
    fechasReferenciaImportacion = new Set();
    $("recorte-panel").hidden=false; cargarCalibracionGuardada(); dibujarPreviewRecorte();
    $("ocr-progreso").textContent="Ajusta el marco a la tabla y pulsa Leer 30 celdas.";
  } catch(error) {
    console.error(error); fuenteImportacion=null; $("leer-foto").disabled=true;
    $("ocr-progreso").textContent="No se pudo preparar el archivo."; $("ocr-progreso").className="editor-message message-error";
  }
}

async function cerrarSesion() {
  const boton = $("cerrar-sesion");
  boton.disabled = true; boton.textContent = "Saliendo…";
  try {
    const respuesta = await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    if (!respuesta.ok) throw new Error();
    window.location.replace("/login");
  } catch {
    boton.disabled = false; boton.textContent = "Salir";
    window.alert("No se ha podido cerrar la sesión. Inténtalo de nuevo.");
  }
}

function prepararEventos() {
  $("abrir-editor").addEventListener("click", abrirEditor);
  $("abrir-importador").addEventListener("click", abrirImportador);
  $("volver-importador").addEventListener("click", volverDesdeImportador);
  $("foto-menu").addEventListener("change", fotoSeleccionada);
  ["crop-top", "crop-bottom", "crop-left", "crop-right"].forEach(id => $(id).addEventListener("input", dibujarPreviewRecorte));
  ["cal-v1", "cal-v2", "cal-v3", "cal-v4"].forEach(id => $(id).addEventListener("input", () => calibracionModificada("v")));
  ["cal-h1", "cal-h2", "cal-h3", "cal-h4", "cal-h5", "cal-h6"].forEach(id => $(id).addEventListener("input", () => calibracionModificada("h")));
  $("guardar-calibracion").addEventListener("click", guardarCalibracion);
  $("restablecer-calibracion").addEventListener("click", restablecerCalibracion);
  $("ver-recortes").addEventListener("click", verTreintaRecortes);
  $("cerrar-recortes").addEventListener("click", () => { $("vista-recortes").hidden = true; });
  $("leer-foto").addEventListener("click", leerFotoConOcr);
  $("plantilla-semana").addEventListener("click", crearPlantillaSemana);
  $("preparar-semana").addEventListener("click", prepararSemanaDesdeTexto);
  $("permitir-actualizaciones").addEventListener("change", event => {
    $("aplicar-semana").disabled = comparacionImportacion?.modificados?.length ? !event.target.checked : false;
  });
  $("aplicar-semana").addEventListener("click", aplicarSemanaAlEditor);
  $("volver-inicio").addEventListener("click", volverAlInicio);
  $("cerrar-sesion").addEventListener("click", cerrarSesion);
  $("selector-fecha").addEventListener("change", event => {
    fechasSemanaActiva = obtenerSemanaDeFecha(event.target.value).fechas;
    if (modoEditor === "semana") renderizarVistaSemanal(); else mostrarMenuDeFecha(event.target.value);
  });
  $("vista-semana-btn").addEventListener("click", () => mostrarVistaEditor("semana"));
  $("vista-dia-btn").addEventListener("click", () => mostrarVistaEditor("dia"));
  $("crear-fecha").addEventListener("click", crearFecha);
  $("editor-festivo").addEventListener("change", () => { actualizarFestivoUI(); sincronizarDesdeFormulario(); });
  document.querySelectorAll(".add-item").forEach(boton => boton.addEventListener("click", () => {
    const tipo = boton.dataset.list;
    const fila = crearFila(tipo);
    $(`editor-${tipo}`).appendChild(fila);
    fila.querySelector("input").focus();
    sincronizarDesdeFormulario();
  }));
  $("descartar-cambios").addEventListener("click", descartarCambios);
  $("eliminar-fecha").addEventListener("click", eliminarFecha);
  $("publicar-menu").addEventListener("click", publicarMenu);
  $("referencia-flotante").addEventListener("click", abrirReferencia);
  $("cerrar-referencia").addEventListener("click", cerrarReferencia);
  $("reference-show-cell")?.addEventListener("click", () => mostrarModoReferencia("celda"));
  $("reference-show-full")?.addEventListener("click", () => mostrarModoReferencia("completo"));
  $("reference-dialog").addEventListener("click", event => { if (event.target === $("reference-dialog")) cerrarReferencia(); });
  $("ampliar-referencia-compacta")?.addEventListener("click", abrirReferencia);
  $("abrir-referencia-compacta")?.addEventListener("click", abrirReferencia);
  window.addEventListener("beforeunload", event => { if (hayCambios) { event.preventDefault(); event.returnValue = ""; } });
}

document.addEventListener("DOMContentLoaded", () => { restaurarReferenciaSesion(); prepararEventos(); actualizarReferenciaRevision(); cargarMenuPublicado(); });
