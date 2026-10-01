const KEY = "prepa25_tutorias_v1";

function loadState() {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  const seed = JSON.parse(JSON.stringify(window.SEED));
  seed.asistencia = {};
  seed.tareas = {};
  seed.evidencias = {};
  seed.pias = {};
  seed.incidencias = {};
  seed.consideraciones = {};
  seed.incidenciasTutorial = {};
  seed.expedientes = [];
  seed.capturaAsistencia = {};
  seed.capturaEvidencias = {};
  return seed;
}
let S = loadState();
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

let session = null;

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:16px;right:16px;background:#084c29;color:#fff;padding:10px 14px;border-radius:10px;z-index:50";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function studentsOf(grupos) {
  return S.students.filter(s => grupos.includes(s.grupo));
}

function isRisk(st, materia = "005") {
  const motivos = [];
  if (st.nee) motivos.push("NEE / apoyos de aula");
  const cal = st.examen_indicativo;
  if (cal != null && Number(cal) < 70) motivos.push(`Indicativo ${cal} < 70`);
  // Proyección a mitad de semestre: si el ritmo se mantiene, la calificación
  // esperada se aproxima al indicativo (mismo comportamiento).
  if (cal != null && Number(cal) < 70) motivos.push("Proyección de cierre < 70");
  return { risk: motivos.length > 0, motivo: motivos.join(" · ") || "Sin alerta" };
}

function keyA(grupo, materia, fecha) { return `${grupo}|${materia}|${fecha}`; }

function login(emp, pass) {
  const u = S.users.find(x => x.empleado === emp && x.password === pass);
  if (!u) return false;
  session = u;
  renderApp();
  return true;
}

function logout() {
  session = null;
  renderLogin();
}

function renderLogin() {
  document.body.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand">UANL · Preparatoria 25</div>
      <h1>App Proceso Tutorial</h1>
      <p class="hint">Unidad Escobedo · AD 2026. Tres pantallas según el rol.</p>
      <label>Número de empleado (usuario)</label>
      <input id="emp" placeholder="Ej. 900001">
      <label>Contraseña</label>
      <input id="pass" type="password">
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-primary" id="go">Ingresar</button>
      </div>
      <div class="demo">
        <b>Accesos de demostración</b><br>
        Tutorías: <code>900001</code> / <code>Tutorias2026</code><br>
        Docente Armida: <code>2026001172</code> / <code>Armida2026</code><br>
        Docente Isabel: <code>800101</code> / <code>Isabel2026</code><br>
        Tutor grupo 101: <code>T101</code> / <code>Tutor101</code>
      </div>
    </div>
  </div>`;
  $("#go").onclick = () => {
    if (!login($("#emp").value.trim(), $("#pass").value)) alert("Usuario o contraseña incorrectos");
  };
  $("#pass").addEventListener("keydown", e => { if (e.key === "Enter") $("#go").click(); });
  $("#emp").addEventListener("keydown", e => { if (e.key === "Enter") $("#pass").focus(); });
}

function layout(navItems, content) {
  document.body.innerHTML = `
  <div class="app">
    <aside class="side">
      <small>Preparatoria 25 · Escobedo</small>
      <h2>${session.nombre}</h2>
      <small>${session.rol.toUpperCase()} · ${session.empleado}</small>
      <div id="nav" style="margin-top:12px;display:flex;flex-direction:column;gap:4px"></div>
      <div style="margin-top:auto">
        <button class="nav-btn" id="out">Cerrar sesión</button>
      </div>
    </aside>
    <main class="main">
      <div class="top">
        <div>
          <div class="chip">${S.meta.semestre}</div>
          <h1 id="title" style="margin:8px 0 0;font-size:1.35rem"></h1>
        </div>
      </div>
      <div id="view"></div>
    </main>
  </div>`;
  const nav = $("#nav");
  navItems.forEach((it, i) => {
    const b = document.createElement("button");
    b.className = "nav-btn" + (i === 0 ? " active" : "");
    b.textContent = it.label;
    b.onclick = () => {
      $$(".nav-btn", nav).forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      it.fn();
    };
    nav.appendChild(b);
  });
  $("#out").onclick = logout;
  navItems[0].fn();
}

function setTitle(t) { $("#title").textContent = t; }

function groupSelect(grupos, id = "gSel") {
  return `<select id="${id}">${grupos.map(g => `<option value="${g}">Grupo ${g}</option>`).join("")}</select>`;
}

function materiaSelect(id = "mSel") {
  const mats = (session && session.materias && session.materias.length)
    ? S.materias.filter(m => session.materias.includes(m.nombre) || session.materias.includes(m.clave))
    : S.materias;
  const list = mats.length ? mats : S.materias;
  return `<select id="${id}">${list.map(m => `<option value="${m.clave}">${m.nombre}</option>`).join("")}</select>`;
}

/* ---------- DOCENTE / TUTOR views ---------- */
function viewAsistencia(grupos, extraTutorial = false) {
  setTitle("Asistencia");
  $("#view").innerHTML = `
    <div class="card">
      <div class="grid">
        <div><label>Grupo</label>${groupSelect(grupos)}</div>
        <div><label>Materia</label>${materiaSelect()}</div>
        <div><label>Fecha</label><input type="date" id="fecha" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="row-actions" style="margin-top:10px">
        <button class="btn btn-primary" id="cargar">Cargar lista</button>
        <button class="btn btn-ghost" id="printA">Imprimir lista</button>
      </div>
    </div>
    <div id="lista"></div>`;
  const draw = () => {
    const g = $("#gSel").value, m = $("#mSel").value, f = $("#fecha").value;
    const k = keyA(g, m, f);
    const list = studentsOf([g]);
    S.capturaAsistencia[`${session.empleado}|${g}|${m}`] = f;
    let html = `<div class="card"><table><thead><tr><th>#</th><th>Matrícula</th><th>Nombre</th><th>Asistencia</th><th>Alerta</th></tr></thead><tbody>`;
    list.forEach((s, i) => {
      const r = isRisk(s);
      const rec = (S.asistencia[k] || {})[s.matricula] || "";
      html += `<tr>
        <td>${i + 1}</td><td>${s.matricula}</td><td>${s.nombre}${s.nee ? ' <span class="badge b-nee">NEE</span>' : ""}</td>
        <td>
          <select data-mat="${s.matricula}" class="as">
            <option value="" ${rec === "" ? "selected" : ""}>—</option>
            <option value="." ${rec === "." ? "selected" : ""}>. Asistió</option>
            <option value="|" ${rec === "|" ? "selected" : ""}>| Falta</option>
            <option value="R" ${rec === "R" ? "selected" : ""}>R Retardo</option>
            <option value="J" ${rec === "J" ? "selected" : ""}>J Justificante</option>
          </select>
        </td>
        <td>${r.risk ? `<span class="badge b-risk">Alumno en riesgo</span> <small>${r.motivo}</small>` : `<span class="badge b-ok">Sin alerta</span>`}</td>
      </tr>`;
    });
    html += `</tbody></table>
      <div class="row-actions" style="margin-top:10px"><button class="btn btn-gold" id="guardarA">Guardar asistencia</button></div></div>`;
    $("#lista").innerHTML = html;
    $("#guardarA").onclick = () => {
      S.asistencia[k] = S.asistencia[k] || {};
      $$(".as").forEach(sel => { S.asistencia[k][sel.dataset.mat] = sel.value; });
      save(); toast("Asistencia guardada");
    };
  };
  $("#cargar").onclick = draw;
  $("#printA").onclick = () => window.print();
  draw();
}

function viewTareas(grupos) {
  setTitle("Tareas requisito y evidencias");
  $("#view").innerHTML = `
    <div class="card">
      <div class="grid">
        <div><label>Grupo</label>${groupSelect(grupos)}</div>
        <div><label>Materia</label>${materiaSelect()}</div>
        <div><label>Etapa</label><select id="etapa"><option>1</option><option>2</option><option>3</option><option>4</option></select></div>
      </div>
      <button class="btn btn-primary" id="cargar" style="margin-top:10px">Cargar</button>
    </div><div id="lista"></div>`;
  const draw = () => {
    const g = $("#gSel").value, m = $("#mSel").value, e = $("#etapa").value;
    const list = studentsOf([g]);
    const tk = `${g}|${m}|${e}`;
    S.capturaEvidencias[`${session.empleado}|${g}|${m}`] = new Date().toISOString().slice(0,10);
    let html = `<div class="card"><p class="hint">Tareas requisito no tienen calificación numérica. Evidencia sí. Máximo 80 si hay requisito pendiente recuperado.</p>
      <table><thead><tr><th>Alumno</th><th>T1</th><th>T2</th><th>T3</th><th>Evidencia</th><th>Tardía</th><th>Obs.</th></tr></thead><tbody>`;
    list.forEach(s => {
      const rec = ((S.tareas[tk] || {})[s.matricula]) || { t1: "no", t2: "no", t3: "no", ev: "", tardia: false, obs: "" };
      html += `<tr>
        <td>${s.nombre}<br><small>${s.matricula}${s.nee ? " · NEE" : ""}</small></td>
        ${["t1","t2","t3"].map(t => `<td><select data-k="${s.matricula}.${t}" class="fld"><option value="si" ${rec[t]==="si"?"selected":""}>Entregó</option><option value="no" ${rec[t]==="no"?"selected":""}>No</option></select></td>`).join("")}
        <td><input style="width:70px" data-k="${s.matricula}.ev" class="fld" value="${rec.ev}"></td>
        <td><input type="checkbox" data-k="${s.matricula}.tardia" class="fld" ${rec.tardia?"checked":""}></td>
        <td><input data-k="${s.matricula}.obs" class="fld" value="${rec.obs||""}"></td>
      </tr>`;
    });
    html += `</tbody></table><button class="btn btn-gold" id="saveT" style="margin-top:10px">Guardar etapa</button></div>`;
    $("#lista").innerHTML = html;
    $("#saveT").onclick = () => {
      S.tareas[tk] = S.tareas[tk] || {};
      list.forEach(s => {
        const get = k => $(`[data-k="${s.matricula}.${k}"]`);
        let ev = get("ev").value;
        const t1 = get("t1").value, t2 = get("t2").value, t3 = get("t3").value;
        if (ev !== "" && (t1 === "no" || t2 === "no" || t3 === "no")) {
          const n = Number(ev);
          if (!isNaN(n) && n > 80) ev = "80";
        }
        S.tareas[tk][s.matricula] = { t1, t2, t3, ev, tardia: get("tardia").checked, obs: get("obs").value };
      });
      save(); toast("Etapa guardada (tope 80 si faltó requisito)");
    };
  };
  $("#cargar").onclick = draw; draw();
}

function viewPIA(grupos) {
  setTitle("Producto Integrador de Aprendizaje");
  $("#view").innerHTML = `
    <div class="card">
      <div class="grid">
        <div><label>Grupo</label>${groupSelect(grupos)}</div>
        <div><label>Materia</label>${materiaSelect()}</div>
      </div>
      <button class="btn btn-primary" id="cargar" style="margin-top:10px">Cargar</button>
    </div><div id="lista"></div>`;
  $("#cargar").onclick = () => {
    const g = $("#gSel").value, m = $("#mSel").value;
    const k = `${g}|${m}`;
    const list = studentsOf([g]);
    let html = `<div class="card"><table><thead><tr><th>Alumno</th><th>Calificación PIA</th><th>Observaciones</th></tr></thead><tbody>`;
    list.forEach(s => {
      const rec = (S.pias[k] || {})[s.matricula] || { cal: "", obs: "" };
      html += `<tr><td>${s.nombre}<br><small>${s.matricula}</small></td>
        <td><input data-m="${s.matricula}" class="pcal" value="${rec.cal}" style="width:80px"></td>
        <td><input data-m="${s.matricula}" class="pobs" value="${rec.obs||""}"></td></tr>`;
    });
    html += `</tbody></table><button class="btn btn-gold" id="sp" style="margin-top:10px">Guardar PIA</button></div>`;
    $("#lista").innerHTML = html;
    $("#sp").onclick = () => {
      S.pias[k] = {};
      $$(".pcal").forEach(inp => {
        S.pias[k][inp.dataset.m] = { cal: inp.value, obs: $(`.pobs[data-m="${inp.dataset.m}"]`).value };
      });
      save(); toast("PIA guardado");
    };
  };
}

function viewIncidencias(grupos, tipo = "conducta") {
  setTitle(tipo === "tutorial" ? "Incidencias de hora tutorial" : "Incidencias de conducta");
  const store = tipo === "tutorial" ? "incidenciasTutorial" : "incidencias";
  $("#view").innerHTML = `
    <div class="card">
      <div class="grid">
        <div><label>Grupo</label>${groupSelect(grupos)}</div>
        <div><label>Matrícula</label><input id="mat"></div>
        <div><label>Fecha</label><input type="date" id="fecha" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <label>Descripción</label><textarea id="desc" rows="3"></textarea>
      <button class="btn btn-primary" id="add" style="margin-top:10px">Registrar</button>
    </div><div class="card" id="hist"></div>`;
  const refresh = () => {
    const items = (S[store][$("#gSel").value] || []);
    $("#hist").innerHTML = "<h3>Historial del grupo</h3>" + (items.length ? `<table><tr><th>Fecha</th><th>Matrícula</th><th>Descripción</th><th></th></tr>${items.map((it,i)=>`<tr><td>${it.fecha}</td><td>${it.matricula}</td><td>${it.desc}</td><td><button class="btn btn-danger" data-i="${i}">Quitar</button></td></tr>`).join("")}</table>` : "<p>Sin incidencias.</p>");
    $$("#hist [data-i]").forEach(b => b.onclick = () => { S[store][$("#gSel").value].splice(+b.dataset.i,1); save(); refresh(); });
  };
  $("#add").onclick = () => {
    const g = $("#gSel").value;
    S[store][g] = S[store][g] || [];
    S[store][g].push({ fecha: $("#fecha").value, matricula: $("#mat").value.trim(), desc: $("#desc").value, autor: session.empleado });
    save(); toast("Incidencia registrada"); refresh();
  };
  $("#gSel").onchange = refresh; refresh();
}

function viewConsideraciones(grupos) {
  setTitle("Consideraciones NEE / ajustes");
  $("#view").innerHTML = `
    <div class="card">
      <p class="hint">Solo se muestran apoyos pedagógicos autorizados. Los diagnósticos completos quedan reservados a Tutorías.</p>
      <div class="grid"><div><label>Grupo</label>${groupSelect(grupos)}</div></div>
    </div><div id="lista"></div>`;
  const draw = () => {
    const list = studentsOf([$("#gSel").value]).filter(s => s.nee);
    if (!list.length) { $("#lista").innerHTML = `<div class="card">No hay estudiantes NEE precargados en este grupo.</div>`; return; }
    $("#lista").innerHTML = list.map(s => {
      const c = (S.consideraciones[s.matricula] || {});
      return `<div class="card">
        <b>${s.nombre}</b> · ${s.matricula} · Grupo ${s.grupo} <span class="badge b-nee">NEE</span>
        <p><b>Estrategias de aula autorizadas:</b> ${s.estrategias || "Coordinar con Tutorías."}</p>
        ${session.rol === "tutorias" ? `<p><b>Situación (solo Tutorías):</b> ${s.situacion||""}</p><p><b>Análisis:</b> ${s.analisis||""}</p>` : `<p class="hint">El diagnóstico clínico no se muestra en esta pantalla. Solo los apoyos de aula.</p>`}
        <label>Ajuste de estrategia / ponderación o requisito</label>
        <textarea id="c-${s.matricula}" rows="2">${c.ajuste || ""}</textarea>
        <button class="btn btn-gold saveC" data-m="${s.matricula}" style="margin-top:8px">Guardar ajuste</button>
      </div>`;
    }).join("");
    $$(".saveC").forEach(b => b.onclick = () => {
      S.consideraciones[b.dataset.m] = { ajuste: $(`#c-${b.dataset.m}`).value, autor: session.empleado };
      save(); toast("Ajuste guardado");
    });
  };
  $("#gSel").onchange = draw; draw();
}

function viewControlEval(grupos) {
  setTitle("Control de Evaluación Formativa");
  $("#view").innerHTML = `
    <div class="card no-print">
      <div class="grid">
        <div><label>Grupo</label>${groupSelect(grupos)}</div>
        <div><label>Materia</label>${materiaSelect()}</div>
      </div>
      <button class="btn btn-primary" id="ver" style="margin-top:10px">Generar</button>
      <button class="btn btn-ghost" onclick="window.print()">Imprimir</button>
    </div><div id="rep"></div>`;
  $("#ver").onclick = () => {
    const g = $("#gSel").value, m = $("#mSel").value;
    const mat = S.materias.find(x => x.clave === m);
    const pond = S.ponderacion[mat.tipo];
    const list = studentsOf([g]);
    let rows = list.map((s,i) => {
      const evs = [1,2,3,4].map(e => ((S.tareas[`${g}|${m}|${e}`]||{})[s.matricula]||{}).ev || "");
      const pia = ((S.pias[`${g}|${m}`]||{})[s.matricula]||{}).cal || "";
      return `<tr><td>${i+1}</td><td>${s.matricula}</td><td>${s.nombre}</td>
        <td>${s.examen_indicativo ?? "—"}</td><td>${evs[0]}</td><td>${evs[1]}</td><td>${evs[2]}</td><td>${evs[3]}</td><td>${pia}</td>
        <td>${s.nee?"Sí":"No"}</td></tr>`;
    }).join("");
    $("#rep").innerHTML = `<div class="card">
      <div class="print-only"><b>Preparatoria 25 · Control de Evaluación Formativa</b><br>Grupo ${g} · ${mat.nombre}</div>
      <p>Ponderación vigente: Indicativo ${pond.indicativo}% · Parcial ${pond.parcial}% · Global ${pond.global}% · Ev1-3 ${pond.ev1}% · PIA ${pond.pia}%</p>
      <table><thead><tr><th>#</th><th>Matrícula</th><th>Nombre</th><th>Indicativo</th><th>Ev1</th><th>Ev2</th><th>Ev3</th><th>Ev4</th><th>PIA</th><th>NEE</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  };
}

function viewPanorama(grupos) {
  setTitle("Panorama del grupo (tutor)");
  const list = studentsOf(grupos);
  const risk = list.filter(s => isRisk(s).risk);
  $("#view").innerHTML = `
    <div class="grid">
      <div class="kpi"><small>Estudiantes</small><b>${list.length}</b></div>
      <div class="kpi"><small>En riesgo (indicativo &lt; 70)</small><b>${risk.length}</b></div>
      <div class="kpi"><small>Con NEE</small><b>${list.filter(s=>s.nee).length}</b></div>
    </div>
    <div class="card"><table><thead><tr><th>Grupo</th><th>Matrícula</th><th>Nombre</th><th>Indicativo</th><th>Estado</th></tr></thead>
    <tbody>${list.map(s=>{const r=isRisk(s);return `<tr><td>${s.grupo}</td><td>${s.matricula}</td><td>${s.nombre}</td><td>${s.examen_indicativo??"—"}</td><td>${r.risk?`<span class="badge b-risk">Riesgo</span>`:`<span class="badge b-ok">OK</span>`}</td></tr>`;}).join("")}</tbody></table>
    <p class="hint">El tutor no consulta contactos familiares ni notas reservadas de citas.</p></div>`;
}

/* ---------- TUTORIAS ---------- */
function viewUsuarios() {
  setTitle("Cuentas y asignaciones (control total)");
  $("#view").innerHTML = `
    <div class="card">
      <h3>Alta de docente</h3>
      <div class="grid">
        <div><label>Núm. empleado</label><input id="nemp"></div>
        <div><label>Contraseña inicial</label><input id="npass"></div>
        <div><label>Nombre</label><input id="nnom"></div>
        <div><label>Rol</label><select id="nrol"><option value="docente">Docente de materia</option><option value="tutor">Docente tutor</option><option value="tutorias">Tutorías</option></select></div>
        <div><label>Grupos (coma)</label><input id="ngru" placeholder="120,121"></div>
        <div><label>Materias</label><input id="nmat" placeholder="Expresión Oral y Escrita"></div>
      </div>
      <button class="btn btn-primary" id="addU" style="margin-top:10px">Crear / actualizar cuenta</button>
    </div>
    <div class="card"><table><thead><tr><th>Empleado</th><th>Nombre</th><th>Rol</th><th>Grupos</th><th>Contraseña</th></tr></thead>
    <tbody>${S.users.map(u=>`<tr><td>${u.empleado}</td><td>${u.nombre}</td><td>${u.rol}</td><td>${(u.grupos||[]).join(", ")}</td><td><code>${u.password}</code></td></tr>`).join("")}</tbody></table>
    <p class="hint">El usuario es el número de empleado. Tutorías genera y consulta las contraseñas.</p></div>`;
  $("#addU").onclick = () => {
    const emp = $("#nemp").value.trim();
    if (!emp) return alert("Indique número de empleado");
    const rec = {
      empleado: emp, password: $("#npass").value || "Cambio123",
      nombre: $("#nnom").value || emp, rol: $("#nrol").value,
      grupos: $("#ngru").value.split(",").map(x=>x.trim()).filter(Boolean),
      materias: $("#nmat").value ? [$("#nmat").value] : []
    };
    const i = S.users.findIndex(u => u.empleado === emp);
    if (i >= 0) S.users[i] = rec; else S.users.push(rec);
    save(); toast("Cuenta guardada"); viewUsuarios();
  };
}

function viewPonderacion() {
  setTitle("Ponderaciones");
  const p = S.ponderacion;
  $("#view").innerHTML = `
    <div class="card">
      <h3>Materias con examen (default EOyE)</h3>
      ${["indicativo","parcial","global","ev1","ev2","ev3","pia"].map(k=>`<label>${k}</label><input id="c-${k}" type="number" value="${p.con_examen[k]}">`).join("")}
      <h3>Desarrollo Humano</h3>
      ${["ev1","ev2","ev3","ev4","pia"].map(k=>`<label>${k}</label><input id="d-${k}" type="number" value="${p.desarrollo_humano[k]}">`).join("")}
      <button class="btn btn-gold" id="sv" style="margin-top:10px">Guardar ponderaciones</button>
    </div>`;
  $("#sv").onclick = () => {
    ["indicativo","parcial","global","ev1","ev2","ev3","pia"].forEach(k => p.con_examen[k] = Number($(`#c-${k}`).value));
    ["ev1","ev2","ev3","ev4","pia"].forEach(k => p.desarrollo_humano[k] = Number($(`#d-${k}`).value));
    save(); toast("Ponderaciones actualizadas");
  };
}

function viewNEE() {
  setTitle("Estudiantes con NEE");
  $("#view").innerHTML = `<div class="card"><table><thead><tr><th>Grupo</th><th>Matrícula</th><th>Nombre</th><th>Situación</th><th>Estrategias de aula</th></tr></thead><tbody>
    ${S.students.filter(s=>s.nee).map(s=>`<tr><td>${s.grupo}</td><td>${s.matricula}</td><td>${s.nombre}</td><td>${s.situacion}</td><td>${s.estrategias}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function viewExpedientes() {
  setTitle("Expedientes de atención");
  $("#view").innerHTML = `
    <div class="card">
      <div class="grid">
        <div><label>Núm. consulta</label><input id="ncons" value="${String(S.expedientes.length+1).padStart(4,"0")}"></div>
        <div><label>Matrícula</label><input id="emat"></div>
        <div><label>Motivo</label><select id="mot"><option>Bajo desempeño académico</option><option>Inasistencias</option><option>Riesgo de abandono</option><option>Disciplina</option><option>Situación emocional</option><option>NEE</option><option>Cita familiar</option></select></div>
        <div><label>NEE</label><select id="enee"><option>No</option><option>Sí</option></select></div>
      </div>
      <label>Situación breve</label><textarea id="esit" rows="2"></textarea>
      <label>Acuerdos</label><textarea id="eac" rows="2"></textarea>
      <label>Seguimiento</label><input id="eseg">
      <label>Observaciones (reservadas a Tutorías)</label><textarea id="eobs" rows="2"></textarea>
      <button class="btn btn-primary" id="addE" style="margin-top:10px">Abrir expediente</button>
    </div>
    <div class="card" id="exl"></div>`;
  const draw = () => {
    $("#exl").innerHTML = S.expedientes.length ? `<table><tr><th>Consulta</th><th>Matrícula</th><th>Motivo</th><th>NEE</th><th>Seguimiento</th></tr>
      ${S.expedientes.map(e=>`<tr><td>${e.consulta}</td><td>${e.matricula}</td><td>${e.motivo}</td><td>${e.nee}</td><td>${e.seguimiento}</td></tr>`).join("")}</table>` : "<p>Sin expedientes.</p>";
  };
  $("#addE").onclick = () => {
    S.expedientes.push({
      consulta: $("#ncons").value, matricula: $("#emat").value.trim(), motivo: $("#mot").value,
      situacion: $("#esit").value, acuerdos: $("#eac").value, nee: $("#enee").value,
      seguimiento: $("#eseg").value, observaciones: $("#eobs").value, fecha: new Date().toISOString().slice(0,10), autor: session.empleado
    });
    save(); toast("Expediente abierto"); viewExpedientes();
  };
  draw();
}

function viewAlertasTutorias() {
  setTitle("Alertas de captura y riesgo");
  const docentes = S.users.filter(u => u.rol === "docente");
  const sinAsis = docentes.filter(d => !Object.keys(S.capturaAsistencia).some(k => k.startsWith(d.empleado + "|")));
  const sinEv = docentes.filter(d => !Object.keys(S.capturaEvidencias).some(k => k.startsWith(d.empleado + "|")));
  const risk = S.students.filter(s => isRisk(s).risk);
  $("#view").innerHTML = `
    <div class="grid">
      <div class="kpi"><small>Docentes sin asistencia registrada</small><b>${sinAsis.length}</b></div>
      <div class="kpi"><small>Docentes sin evidencias</small><b>${sinEv.length}</b></div>
      <div class="kpi"><small>Alumnos en riesgo (indicativo)</small><b>${risk.length}</b></div>
    </div>
    <div class="card"><h3>Docentes que no han registrado asistencia</h3>
      ${sinAsis.map(d=>`<div>${d.nombre} · ${d.empleado} · grupos ${(d.grupos||[]).join(", ")}</div>`).join("") || "<p>Todos tienen al menos un registro en esta sesión.</p>"}
    </div>
    <div class="card"><h3>Docentes sin calificación de evidencias</h3>
      ${sinEv.map(d=>`<div>${d.nombre} · ${d.empleado}</div>`).join("") || "<p>Hay registros de evidencia en esta sesión.</p>"}
    </div>`;
}

function viewRiesgoGrupos() {
  setTitle("Alumnos con riesgo académico por grupo");
  const byG = {};
  S.students.forEach(s => {
    const r = isRisk(s);
    if (!r.risk) return;
    byG[s.grupo] = byG[s.grupo] || [];
    byG[s.grupo].push(s);
  });
  $("#view").innerHTML = Object.keys(byG).sort().map(g => `
    <div class="card"><h3>Grupo ${g} · ${byG[g].length} en riesgo</h3>
    <table><tr><th>Matrícula</th><th>Nombre</th><th>Indicativo</th><th>Criterio</th></tr>
    ${byG[g].map(s=>`<tr><td>${s.matricula}</td><td>${s.nombre}</td><td>${s.examen_indicativo??"—"}</td><td>A mitad de semestre el indicativo no alcanza 70; si el resto del semestre se comporta igual no aprueba.</td></tr>`).join("")}
    </table></div>`).join("") || `<div class="card">Sin alumnos en riesgo con el criterio actual.</div>`;
}

function viewStats() {
  setTitle("Estadísticas e incidencias");
  const cond = Object.values(S.incidencias).reduce((n,a)=>n+a.length,0);
  const tut = Object.values(S.incidenciasTutorial).reduce((n,a)=>n+a.length,0);
  const citas = S.expedientes.filter(e => /famili|padre|madre|tutor legal/i.test(e.motivo||"")).length;
  const motivos = {};
  S.expedientes.forEach(e => { motivos[e.motivo] = (motivos[e.motivo]||0)+1; });
  const riskN = S.students.filter(s => isRisk(s).risk).length;
  const byG = {};
  Object.entries(S.incidencias).forEach(([g,arr]) => { byG[g] = (byG[g]||0)+arr.length; });
  Object.entries(S.incidenciasTutorial).forEach(([g,arr]) => { byG[g] = (byG[g]||0)+arr.length; });
  const byDoc = {};
  [...Object.values(S.incidencias).flat(), ...Object.values(S.incidenciasTutorial).flat()].forEach(it => {
    const a = it.autor || "—"; byDoc[a] = (byDoc[a]||0)+1;
  });
  const bar = (label, v, color="#0b6b3a") => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:220px">${label}</span><div style="height:10px;background:${color};width:${Math.max(8,v*28)}px;border-radius:6px"></div> ${v}</div>`;
  $("#view").innerHTML = `
    <div class="grid">
      <div class="kpi"><small>Incidencias de conducta</small><b>${cond}</b></div>
      <div class="kpi"><small>Incidencias hora tutorial</small><b>${tut}</b></div>
      <div class="kpi"><small>Expedientes</small><b>${S.expedientes.length}</b></div>
      <div class="kpi"><small>Citas con madres y padres</small><b>${citas}</b></div>
      <div class="kpi"><small>Alumnos en riesgo</small><b>${riskN}</b></div>
    </div>
    <div class="card">
      <h3>Expedientes por motivo</h3>
      ${Object.entries(motivos).map(([k,v])=>bar(k,v)).join("") || "<p>Aún no hay expedientes. Regístrelos en Tutorías.</p>"}
    </div>
    <div class="card">
      <h3>Incidencias por grupo</h3>
      ${Object.keys(byG).sort().map(g=>bar("Grupo "+g, byG[g], "#c9a227")).join("") || "<p>Sin incidencias capturadas.</p>"}
    </div>
    <div class="card">
      <h3>Incidencias por docente (número de empleado)</h3>
      ${Object.entries(byDoc).map(([k,v])=>bar(k,v,"#3730a3")).join("") || "<p>Sin captura por docente.</p>"}
    </div>
    <div class="card">
      <h3>Seguimiento de expedientes</h3>
      <p>Casos abiertos: ${S.expedientes.filter(e=>!/cerr/.test((e.seguimiento||"").toLowerCase())).length}. Solo Tutorías cierra el expediente.</p>
    </div>`;
}

function renderApp() {
  if (session.rol === "tutorias") {
    layout([
      { label: "Inicio y alertas", fn: viewAlertasTutorias },
      { label: "Cuentas y contraseñas", fn: viewUsuarios },
      { label: "Ponderaciones", fn: viewPonderacion },
      { label: "Estudiantes NEE", fn: viewNEE },
      { label: "Expedientes", fn: viewExpedientes },
      { label: "Riesgo por grupo", fn: viewRiesgoGrupos },
      { label: "Estadísticas", fn: viewStats },
      { label: "Control formativo", fn: () => viewControlEval(S.students.map(s=>s.grupo).filter((v,i,a)=>a.indexOf(v)===i)) },
    ]);
  } else if (session.rol === "tutor") {
    const g = session.grupos;
    layout([
      { label: "Panorama del grupo", fn: () => viewPanorama(g) },
      { label: "Asistencia", fn: () => viewAsistencia(g, true) },
      { label: "Tareas y evidencias", fn: () => viewTareas(g) },
      { label: "PIA", fn: () => viewPIA(g) },
      { label: "Conducta", fn: () => viewIncidencias(g, "conducta") },
      { label: "Hora tutorial", fn: () => viewIncidencias(g, "tutorial") },
      { label: "Consideraciones NEE", fn: () => viewConsideraciones(g) },
      { label: "Control formativo", fn: () => viewControlEval(g) },
    ]);
  } else {
    const g = session.grupos;
    layout([
      { label: "Asistencia", fn: () => viewAsistencia(g) },
      { label: "Tareas y evidencias", fn: () => viewTareas(g) },
      { label: "PIA", fn: () => viewPIA(g) },
      { label: "Incidencias de conducta", fn: () => viewIncidencias(g) },
      { label: "Consideraciones NEE", fn: () => viewConsideraciones(g) },
      { label: "Control formativo", fn: () => viewControlEval(g) },
    ]);
  }
}

renderLogin();
