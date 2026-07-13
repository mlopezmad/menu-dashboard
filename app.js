const $ = id => document.getElementById(id);
let menuPublicado = null;
let menuTrabajo = null;
let shaPublicado = "";
let fechaActiva = "";
let hayCambios = false;

function clonar(valor) { return JSON.parse(JSON.stringify(valor)); }
function fechaDesdeClave(clave) { const [y,m,d]=clave.split("-").map(Number); return new Date(y,m-1,d); }
function formatearFecha(fecha) { const t=new Intl.DateTimeFormat("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(fecha); return t.charAt(0).toUpperCase()+t.slice(1); }
function esClaveFecha(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(fechaDesdeClave(v).getTime()); }

function ponerEstado(tipo,titulo,detalle){ $("estado-titulo").textContent=titulo; $("estado-detalle").textContent=detalle; const p=$("estado-punto"); p.className=`status-dot status-${tipo}`; }
function mensaje(texto,tipo=""){ const e=$("editor-mensaje"); e.textContent=texto; e.className=`editor-message ${tipo}`.trim(); }

function mostrarResumen(datos){ const dias=datos?.dias||{}; const fechas=Object.keys(dias).sort(); if(!fechas.length){ $("resumen-titulo").textContent="No hay días publicados"; $("resumen-detalle").textContent="menu.json no contiene menús."; return; } const festivos=fechas.filter(f=>dias[f]?.festivo).length; $("resumen-titulo").textContent=`${fechas.length-festivos} días con menú publicados`; $("resumen-detalle").textContent=`Desde ${formatearFecha(fechaDesdeClave(fechas[0]))} hasta ${formatearFecha(fechaDesdeClave(fechas.at(-1)))}.${festivos?` Incluye ${festivos} ${festivos===1?"festivo":"festivos"}.`:""}`; }

function cargarSelector(seleccionar=fechaActiva){ const s=$("selector-fecha"); s.innerHTML='<option value="">Selecciona una fecha</option>'; Object.keys(menuTrabajo?.dias||{}).sort().reverse().forEach(clave=>{ const o=document.createElement("option"); o.value=clave; o.textContent=formatearFecha(fechaDesdeClave(clave)); s.appendChild(o); }); s.disabled=s.options.length===1; if(seleccionar && menuTrabajo?.dias?.[seleccionar]) s.value=seleccionar; }

function normalizarDia(dia={}){ return {festivo:Boolean(dia.festivo),primeros:Array.isArray(dia.primeros)?dia.primeros:[],segundos:Array.isArray(dia.segundos)?dia.segundos:[],dieta:Array.isArray(dia.dieta)?dia.dieta:[]}; }
function actualizarCambios(){ hayCambios=JSON.stringify(menuTrabajo)!==JSON.stringify(menuPublicado); $("cambios-badge").textContent=hayCambios?"Cambios pendientes":"Sin cambios"; $("cambios-badge").classList.toggle("pending-badge",hayCambios); $("publicar-menu").disabled=!hayCambios; $("descartar-cambios").disabled=!hayCambios; }

function crearFila(tipo,texto,index){ const fila=document.createElement("div"); fila.className="editor-row"; const input=document.createElement("input"); input.className="editor-item"; input.value=texto; input.placeholder="Escribe un plato"; input.addEventListener("input",()=>{ menuTrabajo.dias[fechaActiva][tipo][index]=input.value; actualizarCambios(); }); const borrar=document.createElement("button"); borrar.type="button"; borrar.className="remove-item"; borrar.setAttribute("aria-label","Eliminar plato"); borrar.textContent="×"; borrar.addEventListener("click",()=>{ menuTrabajo.dias[fechaActiva][tipo].splice(index,1); pintarDia(); actualizarCambios(); }); fila.append(input,borrar); return fila; }
function pintarLista(tipo){ const c=$("editor-"+tipo); c.innerHTML=""; const platos=menuTrabajo.dias[fechaActiva][tipo]; if(!platos.length){ const p=document.createElement("p"); p.className="editor-empty-list"; p.textContent="Sin platos. Pulsa Añadir."; c.appendChild(p); return; } platos.forEach((p,i)=>c.appendChild(crearFila(tipo,p,i))); }
function pintarDia(){ const contenido=$("editor-contenido"), vacio=$("editor-vacio"); if(!fechaActiva||!menuTrabajo?.dias?.[fechaActiva]){ contenido.hidden=true; vacio.hidden=false; return; } menuTrabajo.dias[fechaActiva]=normalizarDia(menuTrabajo.dias[fechaActiva]); const dia=menuTrabajo.dias[fechaActiva]; $("editor-fecha").textContent=formatearFecha(fechaDesdeClave(fechaActiva)); $("editor-festivo").checked=dia.festivo; $("grupos-menu").hidden=dia.festivo; pintarLista("primeros"); pintarLista("segundos"); pintarLista("dieta"); contenido.hidden=false; vacio.hidden=true; actualizarCambios(); }

function abrirEditor(){ $("vista-inicio").hidden=true; $("vista-editor").hidden=false; window.scrollTo({top:0,behavior:"smooth"}); if(!fechaActiva){ const primera=Object.keys(menuTrabajo?.dias||{}).sort().at(-1)||""; fechaActiva=primera; cargarSelector(fechaActiva); } pintarDia(); }
function volverAlInicio(){ if(hayCambios&&!confirm("Hay cambios sin publicar. ¿Volver igualmente?")) return; $("vista-editor").hidden=true; $("vista-inicio").hidden=false; window.scrollTo({top:0,behavior:"smooth"}); }

function nuevaFecha(){ const propuesta=prompt("Introduce la fecha (AAAA-MM-DD):",new Date().toISOString().slice(0,10)); if(propuesta===null)return; const clave=propuesta.trim(); if(!esClaveFecha(clave)){ alert("La fecha debe tener formato AAAA-MM-DD."); return; } if(menuTrabajo.dias[clave]&&!confirm("Esa fecha ya existe. ¿Abrirla?"))return; if(!menuTrabajo.dias[clave]) menuTrabajo.dias[clave]=normalizarDia(); fechaActiva=clave; cargarSelector(clave); pintarDia(); actualizarCambios(); }
function agregarPlato(tipo){ if(!fechaActiva)return; menuTrabajo.dias[fechaActiva][tipo].push(""); pintarDia(); actualizarCambios(); const inputs=$("editor-"+tipo).querySelectorAll("input"); inputs[inputs.length-1]?.focus(); }
function cambiarFestivo(){ menuTrabajo.dias[fechaActiva].festivo=$("editor-festivo").checked; $("grupos-menu").hidden=menuTrabajo.dias[fechaActiva].festivo; actualizarCambios(); }
function eliminarFecha(){ if(!fechaActiva)return; if(!confirm(`¿Eliminar ${formatearFecha(fechaDesdeClave(fechaActiva))}?`))return; delete menuTrabajo.dias[fechaActiva]; fechaActiva=Object.keys(menuTrabajo.dias).sort().at(-1)||""; cargarSelector(fechaActiva); pintarDia(); actualizarCambios(); }
function descartar(){ if(!hayCambios)return; if(!confirm("¿Descartar todos los cambios pendientes?"))return; menuTrabajo=clonar(menuPublicado); cargarSelector(fechaActiva); pintarDia(); mensaje("Cambios descartados."); }

function limpiarMenuParaPublicar(){ const copia=clonar(menuTrabajo); for(const [clave,dia] of Object.entries(copia.dias)){ const n=normalizarDia(dia); n.primeros=n.primeros.map(x=>String(x).trim()).filter(Boolean); n.segundos=n.segundos.map(x=>String(x).trim()).filter(Boolean); n.dieta=n.dieta.map(x=>String(x).trim()).filter(Boolean); copia.dias[clave]=n; } return copia; }
async function publicar(){ if(!hayCambios)return; if(!confirm("¿Publicar estos cambios en Menú Hoy?"))return; const boton=$("publicar-menu"); boton.disabled=true; boton.textContent="Publicando…"; mensaje("Enviando cambios a GitHub…"); try{ const response=await fetch("/api/publish",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({menu:limpiarMenuParaPublicar(),sha:shaPublicado})}); const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||"No se pudo publicar."); menuPublicado=clonar(data.menu); menuTrabajo=clonar(data.menu); shaPublicado=data.sha; mostrarResumen(menuPublicado); cargarSelector(fechaActiva); pintarDia(); ponerEstado("success","Menú publicado","Los cambios se han guardado correctamente en GitHub."); mensaje("Publicado correctamente.","message-success"); }catch(error){ mensaje(error.message||"No se pudo publicar.","message-error"); ponerEstado("error","Error al publicar",error.message||"Revisa la configuración de GitHub."); actualizarCambios(); }finally{ boton.textContent="Publicar cambios"; boton.disabled=!hayCambios; } }

async function cerrarSesion(){ const b=$("cerrar-sesion"); b.disabled=true; b.textContent="Saliendo…"; try{ const r=await fetch("/api/logout",{method:"POST",credentials:"same-origin"}); if(!r.ok)throw new Error(); location.replace("/login"); }catch{ b.disabled=false; b.textContent="Salir"; alert("No se ha podido cerrar la sesión."); } }

async function cargarMenu(){ ponerEstado("loading","Comprobando menú…","Conectando con GitHub."); try{ const r=await fetch(`/api/publish?t=${Date.now()}`,{cache:"no-store",credentials:"same-origin"}); const data=await r.json().catch(()=>({})); if(!r.ok||!data.ok)throw new Error(data.error||"No se pudo cargar el menú."); menuPublicado=clonar(data.menu); menuTrabajo=clonar(data.menu); shaPublicado=data.sha; mostrarResumen(menuPublicado); cargarSelector(); ponerEstado("success","Menú conectado","El Dashboard está conectado con menu.json."); }catch(error){ $("resumen-titulo").textContent="No se pudo cargar el menú"; $("resumen-detalle").textContent=error.message; ponerEstado("error","Error de conexión",error.message); }
}

document.addEventListener("DOMContentLoaded",()=>{
  $("abrir-editor").addEventListener("click",abrirEditor); $("volver-inicio").addEventListener("click",volverAlInicio); $("cerrar-sesion").addEventListener("click",cerrarSesion);
  $("selector-fecha").addEventListener("change",e=>{fechaActiva=e.target.value;pintarDia();}); $("nueva-fecha").addEventListener("click",nuevaFecha); $("editor-festivo").addEventListener("change",cambiarFestivo); $("eliminar-fecha").addEventListener("click",eliminarFecha); $("descartar-cambios").addEventListener("click",descartar); $("publicar-menu").addEventListener("click",publicar);
  document.querySelectorAll(".add-item").forEach(b=>b.addEventListener("click",()=>agregarPlato(b.dataset.list)));
  window.addEventListener("beforeunload",e=>{if(hayCambios){e.preventDefault();e.returnValue="";}});
  cargarMenu();
});