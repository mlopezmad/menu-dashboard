const MENU_URL = "https://raw.githubusercontent.com/mlopezmad/Menu-comedor/main/menu.json";
const $ = id => document.getElementById(id);

let menuPublicado = null;
let menuTrabajo = null;
let shaPublicado = null;
let fechaActiva = "";
let hayCambios = false;
let borradorImportacion = null;
let comparacionImportacion = null;

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
  const bloques = fechasSemana(lunes).map((fecha, indice) => `${nombreDiaDesdeIndice(indice)} ${fecha}\nPRIMEROS:\n- \nSEGUNDOS:\n- \nDIETA:\n- `);
  $("texto-ocr").value = bloques.join("\n\n");
  $("revision-ocr").hidden = false;
  $("resultado-importacion").hidden = true;
}

function limpiarLineaOcr(linea) {
  return linea
    .replace(/^[•·▪◦*-]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarEncabezado(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function detectarDia(linea) {
  const normal = normalizarEncabezado(linea);
  const dias = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES"];
  return dias.findIndex(dia => new RegExp(`(^|\\b)${dia}(\\b|$)`).test(normal));
}

function detectarSeccion(linea) {
  const normal = normalizarEncabezado(linea);
  if (/PRIMER(OS|O)|ENTRANTE/.test(normal)) return "primeros";
  if (/SEGUND(OS|O)|PRINCIPAL/.test(normal)) return "segundos";
  if (/DIETA|PLANCHA|SALUDABLE/.test(normal)) return "dieta";
  return null;
}

function parsearTextoSemana(texto, lunesClave) {
  const fechas = fechasSemana(lunesClave);
  const dias = Object.fromEntries(fechas.map(fecha => [fecha, { primeros: [], segundos: [], dieta: [] }]));
  const lineas = texto.split(/\r?\n/).map(limpiarLineaOcr).filter(Boolean);
  let indiceDia = -1;
  let seccion = null;

  for (const linea of lineas) {
    const diaDetectado = detectarDia(linea);
    if (diaDetectado >= 0) {
      indiceDia = diaDetectado;
      seccion = null;
      continue;
    }
    const seccionDetectada = detectarSeccion(linea);
    if (seccionDetectada) {
      seccion = seccionDetectada;
      const resto = linea.replace(/^.*?:/, "").trim();
      if (resto && resto !== linea && indiceDia >= 0) dias[fechas[indiceDia]][seccion].push(resto);
      continue;
    }
    if (indiceDia >= 0 && seccion) dias[fechas[indiceDia]][seccion].push(linea);
  }

  const errores = [];
  for (let i = 0; i < fechas.length; i++) {
    const dia = dias[fechas[i]];
    for (const tipo of ["primeros", "segundos", "dieta"]) {
      dia[tipo] = dia[tipo].map(limpiarLineaOcr).filter(Boolean);
      if (!dia[tipo].length) errores.push(`${nombreDiaDesdeIndice(i)}: falta ${tipo}.`);
    }
  }
  return { dias, errores };
}

function menusDiaIguales(a, b) {
  return JSON.stringify(normalizarMenuDia(a)) === JSON.stringify(normalizarMenuDia(b));
}

function compararBorrador(borrador) {
  const nuevos = [];
  const iguales = [];
  const modificados = [];
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
  const grupos = [
    ["new", "Días nuevos", comparacion.nuevos],
    ["same", "Ya publicados sin cambios", comparacion.iguales],
    ["changed", "Días publicados con diferencias", comparacion.modificados]
  ];
  grupos.forEach(([tipo, titulo, fechas]) => {
    const bloque = document.createElement("div");
    bloque.className = `comparison-item comparison-${tipo}`;
    const h = document.createElement("strong");
    h.textContent = `${titulo}: ${fechas.length}`;
    const p = document.createElement("p");
    p.textContent = fechas.length ? fechas.map(f => formatearFecha(fechaDesdeClave(f))).join(" · ") : "Ninguno";
    bloque.append(h, p);
    detalle.appendChild(bloque);
  });

  const sinCambios = !comparacion.nuevos.length && !comparacion.modificados.length;
  $("resultado-titulo").textContent = sinCambios ? "Esta semana ya está publicada" : "Semana preparada para revisar";
  $("permitir-actualizaciones-wrap").hidden = !comparacion.modificados.length;
  $("permitir-actualizaciones").checked = false;
  $("aplicar-semana").disabled = sinCambios || comparacion.modificados.length > 0;
  $("importador-mensaje").textContent = sinCambios
    ? "No se han detectado cambios. La actualización queda bloqueada y no se generará ninguna publicación."
    : comparacion.modificados.length
      ? "Hay fechas ya publicadas con diferencias. Revisa la foto y activa la autorización solo si deseas sustituir esos días."
      : "Los días nuevos se añadirán después de los existentes. Nada publicado será eliminado.";
  $("importador-mensaje").className = `editor-message ${sinCambios ? "message-info" : comparacion.modificados.length ? "message-error" : "message-success"}`;
}

function prepararSemanaDesdeTexto() {
  const lunes = $("lunes-semana").value;
  if (!lunes) return window.alert("Selecciona el lunes de la semana.");
  const { dias, errores } = parsearTextoSemana($("texto-ocr").value, lunes);
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

function aplicarSemanaAlEditor() {
  if (!borradorImportacion || !comparacionImportacion) return;
  if (comparacionImportacion.modificados.length && !$("permitir-actualizaciones").checked) return;
  if (comparacionImportacion.modificados.length && !window.confirm("Vas a sustituir días que ya estaban publicados. ¿Continuar con la revisión?")) return;

  const fechasAplicadas = [];
  for (const [fecha, dia] of Object.entries(borradorImportacion.dias)) {
    const existe = Boolean(menuTrabajo.dias[fecha]);
    if (!existe || $("permitir-actualizaciones").checked) {
      menuTrabajo.dias[fecha] = clonar(dia);
      fechasAplicadas.push(fecha);
    }
  }
  if (!fechasAplicadas.length) return;
  fechaActiva = fechasAplicadas.sort()[0];
  cargarSelectorFechas(menuTrabajo, fechaActiva);
  cambiarVista("vista-editor");
  mostrarMenuDeFecha(fechaActiva);
  actualizarEstadoCambios();
  mostrarMensaje(`Semana incorporada como borrador. Revisa los ${fechasAplicadas.length} días y pulsa Publicar cambios cuando esté correcto.`, "success");
}

async function leerFotoConOcr() {
  const archivo = $("foto-menu").files?.[0];
  if (!archivo) return;
  if (!window.Tesseract) {
    $("ocr-progreso").textContent = "No se pudo cargar el lector OCR gratuito. Comprueba la conexión e inténtalo de nuevo.";
    $("ocr-progreso").className = "editor-message message-error";
    return;
  }
  const boton = $("leer-foto");
  boton.disabled = true;
  boton.textContent = "Leyendo…";
  $("ocr-progreso").textContent = "Preparando la imagen…";
  $("ocr-progreso").className = "editor-message message-info";
  try {
    const resultado = await Tesseract.recognize(archivo, "spa", {
      logger: progreso => {
        if (progreso.status === "recognizing text") {
          const porcentaje = Math.round((progreso.progress || 0) * 100);
          $("ocr-progreso").textContent = `Leyendo texto… ${porcentaje}%`;
        }
      }
    });
    $("texto-ocr").value = resultado?.data?.text?.trim() || "";
    $("revision-ocr").hidden = false;
    $("resultado-importacion").hidden = true;
    $("ocr-progreso").textContent = "Lectura terminada. Corrige el texto y prepara la semana.";
    $("ocr-progreso").className = "editor-message message-success";
    $("revision-ocr").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    $("ocr-progreso").textContent = "No se pudo leer la foto. Prueba con una imagen más nítida o usa Crear plantilla para introducir la semana manualmente.";
    $("ocr-progreso").className = "editor-message message-error";
  } finally {
    boton.disabled = false;
    boton.textContent = "Leer foto";
  }
}

function fotoSeleccionada() {
  const archivo = $("foto-menu").files?.[0];
  $("leer-foto").disabled = !archivo;
  const preview = $("foto-preview");
  if (!archivo) {
    preview.hidden = true;
    preview.removeAttribute("src");
    return;
  }
  preview.src = URL.createObjectURL(archivo);
  preview.hidden = false;
  $("revision-ocr").hidden = true;
  $("resultado-importacion").hidden = true;
  $("ocr-progreso").textContent = "Foto lista. Pulsa Leer foto.";
  $("ocr-progreso").className = "editor-message message-info";
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
