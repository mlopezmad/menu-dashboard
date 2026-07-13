const MENU_URL =
  "https://raw.githubusercontent.com/mlopezmad/Menu-comedor/main/menu.json";

const $ = (id) => document.getElementById(id);

let menuPublicado = null;

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

  if (!estadoTitulo || !estadoDetalle || !estadoPunto) {
    return;
  }

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
    $("resumen-titulo").textContent =
      "No hay días publicados";

    $("resumen-detalle").textContent =
      "El archivo menu.json no contiene menús.";

    return;
  }

  const primeraFecha = fechaDesdeClave(fechas[0]);
  const ultimaFecha = fechaDesdeClave(
    fechas[fechas.length - 1]
  );

  const festivos = fechas.filter(
    clave => dias[clave]?.festivo
  ).length;

  const diasConMenu = fechas.length - festivos;

  $("resumen-titulo").textContent =
    `${diasConMenu} días con menú publicados`;

  $("resumen-detalle").textContent =
    `Desde ${formatearFecha(primeraFecha)} hasta ` +
    `${formatearFecha(ultimaFecha)}.` +
    (
      festivos > 0
        ? ` Incluye ${festivos} ${
            festivos === 1 ? "festivo" : "festivos"
          }.`
        : ""
    );
}

function crearOpcionFecha(clave) {
  const opcion = document.createElement("option");

  opcion.value = clave;
  opcion.textContent = formatearFecha(
    fechaDesdeClave(clave)
  );

  return opcion;
}

function cargarSelectorFechas(datos) {
  const selector = $("selector-fecha");

  if (!selector) {
    return;
  }

  selector.innerHTML = "";

  const opcionInicial = document.createElement("option");

  opcionInicial.value = "";
  opcionInicial.textContent = "Selecciona una fecha";

  selector.appendChild(opcionInicial);

  const fechas = Object.keys(datos?.dias || {})
    .sort()
    .reverse();

  fechas.forEach(clave => {
    selector.appendChild(
      crearOpcionFecha(clave)
    );
  });

  selector.disabled = fechas.length === 0;
}

function crearElementoLectura(texto) {
  const input = document.createElement("input");

  input.type = "text";
  input.value = texto;
  input.readOnly = true;
  input.className = "editor-item";
  input.setAttribute(
    "aria-label",
    `Plato publicado: ${texto}`
  );

  return input;
}

function pintarLista(idContenedor, platos) {
  const contenedor = $(idContenedor);

  if (!contenedor) {
    return;
  }

  contenedor.innerHTML = "";

  if (!Array.isArray(platos) || platos.length === 0) {
    const mensaje = document.createElement("p");

    mensaje.className = "editor-empty-list";
    mensaje.textContent = "Sin platos publicados.";

    contenedor.appendChild(mensaje);

    return;
  }

  platos.forEach(plato => {
    contenedor.appendChild(
      crearElementoLectura(plato)
    );
  });
}

function mostrarMenuDeFecha(clave) {
  const editorContenido = $("editor-contenido");
  const editorVacio = $("editor-vacio");
  const editorFecha = $("editor-fecha");

  if (
    !editorContenido ||
    !editorVacio ||
    !editorFecha
  ) {
    return;
  }

  if (
    !clave ||
    !menuPublicado?.dias?.[clave]
  ) {
    editorContenido.hidden = true;
    editorVacio.hidden = false;

    return;
  }

  const menu = menuPublicado.dias[clave];

  editorFecha.textContent = formatearFecha(
    fechaDesdeClave(clave)
  );

  if (menu.festivo) {
    pintarLista(
      "editor-primeros",
      ["Festivo · No hay servicio de comedor"]
    );

    pintarLista("editor-segundos", []);
    pintarLista("editor-dieta", []);
  } else {
    pintarLista(
      "editor-primeros",
      menu.primeros || []
    );

    pintarLista(
      "editor-segundos",
      menu.segundos || []
    );

    pintarLista(
      "editor-dieta",
      menu.dieta || []
    );
  }

  editorVacio.hidden = true;
  editorContenido.hidden = false;
}

function abrirEditor() {
  const vistaInicio = $("vista-inicio");
  const vistaEditor = $("vista-editor");
  const selector = $("selector-fecha");

  if (!vistaInicio || !vistaEditor) {
    return;
  }

  vistaInicio.hidden = true;
  vistaEditor.hidden = false;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (
    selector &&
    !selector.value &&
    selector.options.length > 1
  ) {
    selector.selectedIndex = 1;

    mostrarMenuDeFecha(selector.value);
  }
}

function volverAlInicio() {
  const vistaInicio = $("vista-inicio");
  const vistaEditor = $("vista-editor");

  if (!vistaInicio || !vistaEditor) {
    return;
  }

  vistaEditor.hidden = true;
  vistaInicio.hidden = false;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function cerrarSesion() {
  const boton = $("cerrar-sesion");

  if (boton) {
    boton.disabled = true;
    boton.textContent = "Saliendo…";
  }

  try {
    const respuesta = await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!respuesta.ok) {
      throw new Error("No se pudo cerrar la sesión.");
    }

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
  const botonAbrirEditor = $("abrir-editor");
  const botonVolver = $("volver-inicio");
  const selector = $("selector-fecha");
  const botonCerrarSesion = $("cerrar-sesion");

  if (botonAbrirEditor) {
    botonAbrirEditor.addEventListener(
      "click",
      abrirEditor
    );
  }

  if (botonVolver) {
    botonVolver.addEventListener(
      "click",
      volverAlInicio
    );
  }

  if (botonCerrarSesion) {
    botonCerrarSesion.addEventListener(
      "click",
      cerrarSesion
    );
  }

  if (selector) {
    selector.addEventListener(
      "change",
      event => {
        mostrarMenuDeFecha(
          event.target.value
        );
      }
    );
  }
}

async function cargarMenuPublicado() {
  ponerEstado(
    "loading",
    "Comprobando menú…",
    "Conectando con el archivo publicado."
  );

  try {
    const respuesta = await fetch(
      `${MENU_URL}?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

    if (!respuesta.ok) {
      throw new Error(
        `Error HTTP ${respuesta.status}`
      );
    }

    const datos = await respuesta.json();

    if (
      !datos ||
      typeof datos !== "object" ||
      !datos.dias ||
      typeof datos.dias !== "object"
    ) {
      throw new Error(
        "El archivo no tiene la estructura esperada."
      );
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
    console.error(
      "Error al cargar el menú:",
      error
    );

    menuPublicado = null;

    $("resumen-titulo").textContent =
      "No se pudo cargar el menú";

    $("resumen-detalle").textContent =
      "Comprueba que el repositorio, la rama y el archivo menu.json existen.";

    const selector = $("selector-fecha");

    if (selector) {
      selector.innerHTML =
        '<option value="">No se pudieron cargar las fechas</option>';

      selector.disabled = true;
    }

    ponerEstado(
      "error",
      "Error de conexión",
      "El Dashboard no ha podido leer el menú publicado."
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    prepararEventos();
    cargarMenuPublicado();
  }
);