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

function pintarFormularioDias(dias) {
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
  ctx.strokeStyle = "rgba(227,6,19,.65)"; ctx.lineWidth = 2;
  for (let i=1;i<5;i++) { const xx=x+w*i/5; ctx.beginPath(); ctx.moveTo(xx,y); ctx.lineTo(xx,y+h); ctx.stroke(); }
}

function crearCanvasColumna(indice) {
  const r = valoresRecorte();
  const sx = fuenteImportacion.width * (r.left + (r.right-r.left)*indice/5);
  const sy = fuenteImportacion.height * r.top;
  const sw = fuenteImportacion.width * (r.right-r.left)/5;
  const sh = fuenteImportacion.height * (r.bottom-r.top);
  const escala = Math.max(2.2, 1500 / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * escala); canvas.height = Math.round(sh * escala);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fuenteImportacion, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0,0,canvas.width,canvas.height); const d=image.data;
  for (let i=0;i<d.length;i+=4) {
    const g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    const c = g > 205 ? 255 : g < 80 ? 0 : Math.max(0, Math.min(255, (g-128)*1.7+128));
    d[i]=d[i+1]=d[i+2]=c;
  }
  ctx.putImageData(image,0,0);
  return canvas;
}

async function leerFotoConOcr() {
  const archivo = $("foto-menu").files?.[0];
  if (!archivo || !fuenteImportacion) return;
  if (!window.Tesseract) return window.alert("No se pudo cargar el OCR gratuito.");
  const lunes = $("lunes-semana").value;
  if (!lunes) return window.alert("Selecciona el lunes de la semana.");
  const boton=$("leer-foto"); boton.disabled=true; boton.textContent="Leyendo 1/5…";
  $("ocr-progreso").className="editor-message message-info";
  let worker;
  try {
    worker = await Tesseract.createWorker("spa", 1, { logger: p => {
      if (p.status === "recognizing text") $("ocr-progreso").textContent = `OCR por columnas… ${Math.round((p.progress||0)*100)}%`;
    }});
    const textos=[];
    for (let i=0;i<5;i++) {
      boton.textContent=`Leyendo ${i+1}/5…`;
      $("ocr-progreso").textContent=`Leyendo ${nombreDiaDesdeIndice(i).toLowerCase()}…`;
      const { data } = await worker.recognize(crearCanvasColumna(i));
      textos.push((data?.text||"").trim());
    }
    pintarFormularioDias(textos.map(parsearTextoDia));
    $("revision-ocr").hidden=false; $("resultado-importacion").hidden=true;
    $("ocr-progreso").textContent="Lectura por días terminada. Revisa cada columna.";
    $("ocr-progreso").className="editor-message message-success";
    $("revision-ocr").scrollIntoView({behavior:"smooth",block:"start"});
  } catch(error) {
    console.error(error);
    $("ocr-progreso").textContent="No se pudo completar el OCR. Ajusta el recorte o crea una plantilla manual.";
    $("ocr-progreso").className="editor-message message-error";
  } finally {
    await worker?.terminate?.(); boton.disabled=false; boton.textContent="Leer 5 días";
  }
}

async function fotoSeleccionada() {
  const archivo=$("foto-menu").files?.[0];
  $("leer-foto").disabled=!archivo; $("revision-ocr").hidden=true; $("resultado-importacion").hidden=true;
  if (!archivo) { fuenteImportacion=null; $("recorte-panel").hidden=true; return; }
  $("ocr-progreso").textContent="Preparando vista previa…"; $("ocr-progreso").className="editor-message message-info";
  try {
    fuenteImportacion=await cargarFuenteImagen(archivo);
    $("recorte-panel").hidden=false; dibujarPreviewRecorte();
    $("ocr-progreso").textContent="Ajusta el marco a la tabla y pulsa Leer 5 días.";
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
