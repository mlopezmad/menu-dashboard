const MENU_URL = "https://raw.githubusercontent.com/mlopezmad/Menu-comedor/main/menu.json";
const $ = id => document.getElementById(id);

let menuPublicado = null;
let menuTrabajo = null;
let shaPublicado = null;
let fechaActiva = "";
let hayCambios = false;
let borradorImportacion = null;
let comparacionImportacion = null;
let fuenteImportacion = null;
let urlPreviewImportacion = null;
let limitesFilasDetectados = null;
const CALIBRATION_KEY = "menuDashboardCalibrationV6";

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

function mostrarResumen(datos) {
  const dias = datos?.dias || {};
  const fechas = Object.keys(dias).sort();
  if (!fechas.length) {
    $("resumen-titulo").textContent = "No hay días publicados";
    $("resumen-detalle").textContent = "El archivo menu.json no contiene menús.";
    return;
  }
  const festivos = fechas.filter(clave => dias[clave]?.festivo).length;
  $("resumen-titulo").textContent = `${fechas.length - festivos} días con menú publicados`;
  $("resumen-detalle").textContent = `Desde ${formatearFecha(fechaDesdeClave(fechas[0]))} hasta ${formatearFecha(fechaDesdeClave(fechas.at(-1)))}.${festivos ? ` Incluye ${festivos} ${festivos === 1 ? "festivo" : "festivos"}.` : ""}`;
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
  mostrarMenuDeFecha(selector.value);
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
  mostrarMenuDeFecha(clave);
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

function interpretarTextoOcr(texto, confianza = 0, tipo = "primeros") {
  const limpio = limpiarLineaOcr(texto);
  const normal = normalizarOcr(limpio).replace(/\s+/g, " ").trim();
  const aprendido = cargarAprendizajeOcr()[normal];
  if (aprendido) {
    return { texto: aprendido, original: limpio, sugerencia: aprendido, nivel: "alta", puntuacion: 100, aprendido: true };
  }
  if (!limpio) return { texto: "", original: "", sugerencia: "", nivel: "baja", puntuacion: 0 };

  let mejor = "", mejorPuntuacion = 0, mejorRatio = 1;
  for (const plato of platosPorTipo(tipo)) {
    const np = normalizarOcr(plato);
    const ratio = distanciaLevenshtein(normal, np) / Math.max(normal.length, np.length, 1);
    const lev = 1 - ratio;
    const tokens = similitudTokens(limpio, plato);
    const contiene = normal.length >= 5 && (np.includes(normal) || normal.includes(np)) ? 0.18 : 0;
    const puntuacion = Math.min(1, lev * 0.72 + tokens * 0.28 + contiene);
    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion;
      mejorRatio = ratio;
      mejor = plato;
    }
  }

  const letras = (normal.match(/[A-Z]/g) || []).length;
  const demasiadoCorto = letras < 5 || normal.split(/\s+/).filter(Boolean).length < 2;
  const autoCorregir = !demasiadoCorto && (mejorPuntuacion >= 0.79 || mejorRatio <= 0.28);
  const sugerir = !demasiadoCorto && (mejorPuntuacion >= 0.62 || mejorRatio <= 0.42);
  const textoFinal = autoCorregir ? mejor : limpio
    .toLocaleLowerCase("es-ES")
    .replace(/(^|\s)([a-záéíóúüñ])/g, (_, a, b) => a + b.toLocaleUpperCase("es-ES"));
  const puntuacion = Math.round(Math.max(0, Math.min(100, confianza * 0.48 + mejorPuntuacion * 52)));
  const nivel = !textoFinal || demasiadoCorto || puntuacion < 48 ? "baja" : puntuacion < 76 || (sugerir && !autoCorregir) ? "media" : "alta";
  return { texto: textoFinal, original: limpio, sugerencia: sugerir ? mejor : "", nivel, puntuacion, aprendido: false };
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
    "Huevos rotos con torreznillos", "Salchichas frescas encebolladas", "Colitas de rape en salsa"
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

function pintarFormularioDias(dias, diagnostico = null) {
  const contenedor = $("ocr-dias");
  contenedor.innerHTML = "";
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
          const badge = document.createElement("small");
          badge.className = "ocr-confidence-badge";
          badge.textContent = nivel === "alta" ? "Alta" : nivel === "media" ? "Revisar" : "Baja";
          fila.appendChild(badge);
        }
        input.addEventListener("input", () => {
          fila.classList.remove("ocr-needs-review", "ocr-confidence-media", "ocr-confidence-baja");
          fila.classList.add("ocr-confidence-alta");
          fila.querySelector(".ocr-confidence-badge")?.remove();
        });
        input.addEventListener("change", () => aprenderCorreccionOcr(input.dataset.ocrOriginal || "", input.value));
        fila.append(numero, input); lista.appendChild(fila);
      }
      bloque.appendChild(lista);
    }
    contenedor.appendChild(bloque);
  });
}

function prepararSemanaDesdeTexto() {
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
  fechaActiva = fechasAplicadas.sort()[0];
  cargarSelectorFechas(menuTrabajo, fechaActiva);
  cambiarVista("vista-editor"); mostrarMenuDeFecha(fechaActiva); actualizarEstadoCambios();
  mostrarMensaje(`Semana incorporada como borrador. Revisa los ${fechasAplicadas.length} días antes de publicar.`, "success");
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
  $("leer-foto").disabled=!archivo; $("revision-ocr").hidden=true; $("resultado-importacion").hidden=true;
  if (!archivo) { fuenteImportacion=null; limitesFilasDetectados=null; $("recorte-panel").hidden=true; return; }
  $("ocr-progreso").textContent="Preparando vista previa…"; $("ocr-progreso").className="editor-message message-info";
  try {
    fuenteImportacion=await cargarFuenteImagen(archivo); limitesFilasDetectados=null;
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
  $("selector-fecha").addEventListener("change", event => mostrarMenuDeFecha(event.target.value));
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
  window.addEventListener("beforeunload", event => { if (hayCambios) { event.preventDefault(); event.returnValue = ""; } });
}

document.addEventListener("DOMContentLoaded", () => { prepararEventos(); cargarMenuPublicado(); });
