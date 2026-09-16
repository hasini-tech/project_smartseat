const API = "/api";
let currentStaff = null;

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, options = {}) => {
  const requestUrl = typeof input === "string" ? input : input.url;
  const isAuthRequest = requestUrl.includes("/api/auth/");
  return nativeFetch(input, { ...options, credentials: "same-origin" }).then((res) => {
    if (res.status === 401 && !isAuthRequest) showAuthScreen("Your session has expired. Please sign in again.");
    return res;
  });
};

function setAuthMode(mode) {
  const isRegister = mode === "register";
  document.getElementById("login-form").hidden = isRegister;
  document.getElementById("register-form").hidden = !isRegister;
  document.getElementById("auth-switch-login").hidden = isRegister;
  document.getElementById("auth-switch-register").hidden = !isRegister;
  document.getElementById("auth-title").textContent = isRegister ? "Create your workspace account" : "Welcome back";
  document.getElementById("auth-subtitle").textContent = isRegister
    ? "Set up a staff account to manage examination seating securely."
    : "Sign in to manage your department's examination seating.";
  document.getElementById("auth-message").hidden = true;
}

function setAuthMessage(message, type = "error") {
  const messageEl = document.getElementById("auth-message");
  messageEl.textContent = message || "";
  messageEl.classList.toggle("success", type === "success");
  messageEl.hidden = !message;
}

function initials(name) {
  return String(name || "SS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "SS";
}

function applyRoleUI() {
  const hallForm = document.getElementById("hall-form");
  if (hallForm) hallForm.closest(".panel").hidden = !currentStaff?.isTenantAdmin;
  const departmentInput = document.getElementById("s-dept");
  if (departmentInput && currentStaff) {
    departmentInput.readOnly = !currentStaff.isTenantAdmin;
    if (!currentStaff.isTenantAdmin) departmentInput.value = currentStaff.departmentName;
  }
}

function showAppScreen(staff) {
  currentStaff = { ...staff, isTenantAdmin: staff.role === "tenant_admin" };
  document.getElementById("auth-shell").hidden = true;
  document.getElementById("app-shell").hidden = false;
  document.getElementById("current-staff-name").textContent = currentStaff.staffName;
  document.getElementById("current-department-name").textContent = currentStaff.departmentName;
  document.getElementById("user-avatar").textContent = initials(currentStaff.staffName);
  document.getElementById("dashboard-welcome").textContent = `Welcome back, ${currentStaff.staffName}. You are viewing the ${currentStaff.departmentName} workspace.`;
  applyRoleUI();
  renderDashboardLoading();
  loadDashboard().catch(showDashboardError);
}

function showAuthScreen(message = "", messageType = "error") {
  currentStaff = null;
  document.getElementById("app-shell").hidden = true;
  document.getElementById("auth-shell").hidden = false;
  setAuthMode("login");
  setAuthMessage(message, messageType);
}

function showDashboardError() {
  const statRow = document.getElementById("stat-row");
  if (statRow) {
    statRow.innerHTML = `<div class="panel" style="grid-column: 1 / -1; margin: 0; color: var(--danger)">Dashboard data is unavailable. Check the server and database connection, then refresh this page.</div>`;
  }
}

function renderDashboardLoading() {
  const statRow = document.getElementById("stat-row");
  if (!statRow) return;
  statRow.innerHTML = Array.from({ length: 5 }, () => `
    <div class="stat-card stat-skeleton" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>`).join("");
}

function showToast(message, type = "success") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

function bindViewTargets(root = document) {
  root.querySelectorAll("[data-view-target]").forEach((button) => {
    if (button.dataset.viewBound) return;
    button.dataset.viewBound = "true";
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
    if (button.tagName !== "BUTTON") {
      button.tabIndex = 0;
      button.setAttribute("role", "button");
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showView(button.dataset.viewTarget);
        }
      });
    }
  });
}

function copyRegistrationIdentityToLogin() {
  document.getElementById("login-organization").value = document.getElementById("register-organization").value;
  document.getElementById("login-staff-name").value = document.getElementById("register-staff-name").value;
  document.getElementById("login-department").value = document.getElementById("register-department").value;
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  setAuthMessage("");
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: document.getElementById("login-organization").value,
        staffName: document.getElementById("login-staff-name").value,
        departmentName: document.getElementById("login-department").value,
        password: document.getElementById("login-password").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(res.status === 401
        ? "Sign-in failed. Check the organization, staff name, department, and password."
        : (data.error || "Could not sign in"));
    }
    form.reset();
    showAppScreen(data.staff);
  } catch (err) {
    setAuthMessage(err.message);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  setAuthMessage("");
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: document.getElementById("register-organization").value,
        staffName: document.getElementById("register-staff-name").value,
        departmentName: document.getElementById("register-department").value,
        password: document.getElementById("register-password").value,
        confirmPassword: document.getElementById("register-confirm-password").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) {
        copyRegistrationIdentityToLogin();
        setAuthMode("login");
        setAuthMessage("This staff account already exists. Sign in with its existing password.");
        return;
      }
      throw new Error(data.error || "Could not create account");
    }
    form.reset();
    showAppScreen(data.staff);
  } catch (err) {
    setAuthMessage(err.message);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("logout-button").addEventListener("click", async () => {
  await fetch(`${API}/auth/logout`, { method: "POST" });
  showAuthScreen("You have been signed out.", "success");
});

async function bootstrapAuth() {
  try {
    const res = await fetch(`${API}/auth/me`);
    if (!res.ok) return showAuthScreen();
    const data = await res.json();
    showAppScreen(data.staff);
  } catch (err) {
    showAuthScreen("The server is unavailable. Start SmartSeat and try again.");
  }
}

// ---------- Navigation ----------
const viewLabels = {
  dashboard: "Dashboard",
  students: "Students",
  halls: "Halls",
  exam: "Exam setup",
  generate: "Generate seating",
  seating: "View seating",
  search: "Search",
};

function showView(view) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  const breadcrumb = document.getElementById("breadcrumb-current");
  if (breadcrumb) breadcrumb.textContent = viewLabels[view] || "Workspace";
  Promise.resolve(onViewShown(view)).catch((err) => showToast(err.message || "Could not load this view.", "error"));
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

bindViewTargets();

document.getElementById("refresh-dashboard").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const activeView = document.querySelector(".view.active")?.id.replace("view-", "") || "dashboard";
  button.classList.add("is-loading");
  try {
    await onViewShown(activeView);
  } finally {
    window.setTimeout(() => button.classList.remove("is-loading"), 350);
  }
});

async function onViewShown(view) {
  if (view === "dashboard") return loadDashboard();
  if (view === "students") return loadStudents();
  if (view === "halls") return loadHalls();
  if (view === "exam") return Promise.all([loadExams(), loadHallsForAssignment()]);
  if (view === "generate") return loadExamOptions("gen-exam-select");
  if (view === "seating") return loadExamOptions("seat-exam-select");
  if (view === "search") return loadExamOptions("search-exam-select");
}

// ---------- Dashboard ----------
async function loadDashboard() {
  const res = await fetch(`${API}/dashboard`);
  if (!res.ok) throw new Error("Could not load dashboard data");
  const d = await res.json();

  document.getElementById("stat-row").innerHTML = `
    <button class="stat-card stat-link" type="button" data-view-target="students" aria-label="Open students">
      <div class="num" data-value="${d.totalStudents}">0</div><div class="label">Total students</div><small class="stat-caption">Current database · View list →</small>
    </button>
    <button class="stat-card stat-link" type="button" data-view-target="halls" aria-label="Open halls">
      <div class="num" data-value="${d.totalHalls}">0</div><div class="label">Total halls</div><small class="stat-caption">Configured spaces · View halls →</small>
    </button>
    <button class="stat-card stat-link" type="button" data-view-target="halls" aria-label="View available seats">
      <div class="num" data-value="${d.totalSeats}">0</div><div class="label">Total seats</div><small class="stat-caption">Available capacity</small>
    </button>
    <button class="stat-card stat-link" type="button" data-view-target="seating" aria-label="View allocated seating">
      <div class="num" data-value="${d.allocated}">0</div><div class="label">Allocated seats</div><small class="stat-caption">Latest generated plan · View →</small>
    </button>
    <button class="stat-card stat-link warn" type="button" data-view-target="generate" aria-label="Generate seating">
      <div class="num" data-value="${d.remaining}">0</div><div class="label">Remaining</div><small class="stat-caption">Needs allocation · Start →</small>
    </button>
  `;
  bindViewTargets(document.getElementById("stat-row"));
  animateStatNumbers();
  updateWorkflow(d);

  const utilEl = document.getElementById("hall-utilization");
  const utilizationStatus = document.getElementById("utilization-status");
  if (!d.hallUtilization.length) {
    if (utilizationStatus) utilizationStatus.textContent = "No plan yet";
    utilEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">▦</span>
        <div class="empty-state-copy">
          <strong>Your hall overview will appear here</strong>
          <p>Assign halls to an exam, then generate a seating plan.</p>
          <button class="btn secondary small" type="button" data-view-target="generate">Generate a plan →</button>
        </div>
      </div>`;
    bindViewTargets(utilEl);
  } else {
    if (utilizationStatus) utilizationStatus.textContent = d.latestExam?.name || "Latest exam";
    utilEl.innerHTML = d.hallUtilization
      .map(
        (h) => `
      <div class="util-row">
        <span class="name">${h.hallName}</span>
        <div class="util-bar-bg"><div class="util-bar-fill" style="width:${h.percent}%"></div></div>
        <span class="util-pct">${h.percent}%</span>
      </div>`
      )
      .join("");
  }
}

function animateStatNumbers() {
  document.querySelectorAll(".stat-card .num[data-value]").forEach((number) => {
    const target = Number(number.dataset.value) || 0;
    const started = performance.now();
    const duration = 550;
    const tick = (now) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      number.textContent = Math.round(target * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function updateWorkflow(data) {
  const completed = {
    students: data.totalStudents > 0,
    halls: data.totalHalls > 0,
    exam: data.totalExams > 0,
    seating: data.allocated > 0,
  };
  const steps = Array.from(document.querySelectorAll(".workflow-step"));
  const completedCount = Object.values(completed).filter(Boolean).length;
  const progressCount = document.getElementById("workflow-progress");
  const progressBar = document.getElementById("workflow-progress-bar");
  if (progressCount) progressCount.textContent = `${completedCount} / 4`;
  if (progressBar) progressBar.style.width = `${completedCount * 25}%`;

  let currentFound = false;
  steps.forEach((step) => {
    const key = step.dataset.step;
    const done = completed[key];
    step.classList.toggle("complete", done);
    step.classList.remove("current");
    const state = step.querySelector(".step-state");
    if (done) {
      if (state) state.textContent = "Complete";
    } else if (!currentFound) {
      currentFound = true;
      step.classList.add("current");
      if (state) state.textContent = "Start here";
    } else if (state) {
      state.textContent = "Next";
    }
  });
}

// ---------- Students ----------
async function loadStudents() {
  const res = await fetch(`${API}/students`);
  const students = await res.json();
  document.getElementById("student-count").textContent = `${students.length} students`;
  const tbody = document.querySelector("#students-table tbody");
  tbody.innerHTML = students
    .map(
      (s) => `
    <tr>
      <td>${s.rollNo}</td><td>${s.name}</td><td>${s.class}</td><td>${s.dept}</td>
      <td><button class="btn danger small" onclick="deleteStudent('${s._id}')">Remove</button></td>
    </tr>`
    )
    .join("");
}

document.getElementById("student-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    rollNo: document.getElementById("s-rollNo").value.trim(),
    name: document.getElementById("s-name").value.trim(),
    class: document.getElementById("s-class").value.trim(),
    dept: document.getElementById("s-dept").value.trim(),
  };
  const res = await fetch(`${API}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    e.target.reset();
    applyRoleUI();
    loadStudents();
    showToast("Student added to your workspace.");
  } else {
    const err = await res.json();
    showToast("Could not add student: " + err.error, "error");
  }
});

async function deleteStudent(id) {
  if (!confirm("Remove this student?")) return;
  const res = await fetch(`${API}/students/${id}`, { method: "DELETE" });
  if (!res.ok) return showToast("Could not remove student.", "error");
  loadStudents();
  showToast("Student removed.");
}

document.getElementById("csv-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById("import-status");
  statusEl.textContent = "Importing...";
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/students/import`, { method: "POST", body: fd });
  const data = await res.json();
  if (res.ok) {
    statusEl.textContent = `Imported ${data.imported} rows (${data.inserted} new, ${data.updated} updated).`;
    loadStudents();
    showToast(`${data.imported} student rows imported.`);
  } else {
    statusEl.textContent = "Import failed: " + data.error;
    showToast("Student import failed: " + data.error, "error");
  }
  e.target.value = "";
});

// ---------- Halls ----------
async function loadHalls() {
  const res = await fetch(`${API}/halls`);
  const halls = await res.json();
  document.getElementById("hall-total").textContent = `${halls.length} halls`;
  const tbody = document.querySelector("#halls-table tbody");
  const actions = (hall) => currentStaff?.isTenantAdmin
    ? `<button class="btn danger small" onclick="deleteHall('${hall._id}')">Remove</button>`
    : `<span class="muted small">View only</span>`;
  tbody.innerHTML = halls
    .map(
      (h) => `
    <tr>
      <td>${h.name}</td><td>${h.rows}</td><td>${h.columns}</td><td>${h.rows * h.columns}</td>
      <td>${actions(h)}</td>
    </tr>`
    )
    .join("");
}

document.getElementById("hall-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById("h-name").value.trim(),
    rows: Number(document.getElementById("h-rows").value),
    columns: Number(document.getElementById("h-columns").value),
  };
  const res = await fetch(`${API}/halls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    e.target.reset();
    loadHalls();
    showToast("Hall added successfully.");
  } else {
    const err = await res.json();
    showToast("Could not add hall: " + err.error, "error");
  }
});

async function deleteHall(id) {
  if (!confirm("Remove this hall?")) return;
  const res = await fetch(`${API}/halls/${id}`, { method: "DELETE" });
  if (!res.ok) return showToast("Could not remove hall.", "error");
  loadHalls();
  showToast("Hall removed.");
}

// ---------- Exam setup ----------
async function loadExams() {
  const res = await fetch(`${API}/exams`);
  const exams = await res.json();
  const tbody = document.querySelector("#exams-table tbody");
  tbody.innerHTML = exams
    .map(
      (e) => `
    <tr>
      <td>${e.name}</td><td>${e.subject}</td><td>${e.date}</td><td>${e.startTime}-${e.endTime}</td>
      <td>${(e.hallIds || []).length} hall(s)</td>
      <td>${e.status}</td>
      <td><button class="btn secondary small" onclick="openAssign('${e._id}','${e.name}')">Assign halls</button></td>
    </tr>`
    )
    .join("");
}

document.getElementById("exam-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById("e-name").value.trim(),
    subject: document.getElementById("e-subject").value.trim(),
    date: document.getElementById("e-date").value,
    startTime: document.getElementById("e-start").value,
    endTime: document.getElementById("e-end").value,
    college: document.getElementById("e-college").value.trim() || "ABC COLLEGE",
  };
  const res = await fetch(`${API}/exams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    e.target.reset();
    document.getElementById("e-college").value = "ABC COLLEGE";
    loadExams();
    showToast("Exam created. Assign halls to continue.");
  } else {
    const err = await res.json();
    showToast("Could not create exam: " + err.error, "error");
  }
});

let allHallsCache = [];
async function loadHallsForAssignment() {
  const res = await fetch(`${API}/halls`);
  allHallsCache = await res.json();
}

let currentAssignExamId = null;
async function openAssign(examId, examName) {
  currentAssignExamId = examId;
  document.getElementById("assign-exam-name").textContent = examName;
  document.getElementById("assign-halls-panel").style.display = "block";

  const examRes = await fetch(`${API}/exams/${examId}`);
  const exam = await examRes.json();
  const assignedIds = new Set((exam.hallIds || []).map((h) => h._id));

  const listEl = document.getElementById("assign-halls-list");
  listEl.innerHTML = allHallsCache
    .map(
      (h) => `
    <div class="checkbox-chip ${assignedIds.has(h._id) ? "checked" : ""}" data-id="${h._id}">
      ${h.name} (${h.rows * h.columns} seats)
    </div>`
    )
    .join("");

  listEl.querySelectorAll(".checkbox-chip").forEach((chip) => {
    chip.addEventListener("click", () => chip.classList.toggle("checked"));
  });

  document.getElementById("assign-halls-panel").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("save-hall-assignment").addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll("#assign-halls-list .checkbox-chip.checked")).map(
    (c) => c.dataset.id
  );
  const res = await fetch(`${API}/exams/${currentAssignExamId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hallIds: ids }),
  });
  if (!res.ok) {
    const data = await res.json();
    return showToast("Could not save hall assignment: " + data.error, "error");
  }
  document.getElementById("assign-halls-panel").style.display = "none";
  loadExams();
  showToast("Hall assignment saved.");
});

// ---------- Shared: exam dropdowns ----------
async function loadExamOptions(selectId) {
  const res = await fetch(`${API}/exams`);
  const exams = await res.json();
  const sel = document.getElementById(selectId);
  sel.innerHTML = exams
    .map((e) => `<option value="${e._id}">${e.name} — ${e.subject} (${e.date})</option>`)
    .join("");
}

// ---------- Generate ----------
document.getElementById("generate-btn").addEventListener("click", async () => {
  const examId = document.getElementById("gen-exam-select").value;
  const resultEl = document.getElementById("generate-result");
  if (!examId) { resultEl.innerHTML = `<p class="err">Create an exam first.</p>`; return; }
  resultEl.innerHTML = `<p class="muted">Generating...</p>`;

  let res;
  let data;
  try {
    res = await fetch(`${API}/exams/${examId}/generate`, { method: "POST" });
    data = await res.json();
  } catch (err) {
    resultEl.innerHTML = `<div class="generate-error"><p class="err">SmartSeat is unavailable. Start the server and try again.</p></div>`;
    showToast("Could not reach the SmartSeat server.", "error");
    return;
  }

  if (!res.ok) {
    const nextView = /hall/i.test(data.error || "") ? "exam" : "students";
    resultEl.innerHTML = `
      <div class="generate-error">
        <p class="err">${data.error || "Could not generate seating"}</p>
        <button class="btn secondary small" type="button" data-view-target="${nextView}">
          ${nextView === "exam" ? "Assign halls in Exam setup →" : "Add students →"}
        </button>
      </div>`;
    bindViewTargets(resultEl);
    showToast(data.error || "Could not generate seating", "error");
    return;
  }

  resultEl.innerHTML = `
    <p class="ok">Seating generated: ${data.totalStudents} students across ${data.halls.length} hall(s), capacity ${data.totalCapacity}.
    ${data.unseatedCount > 0 ? `<br><span class="err">${data.unseatedCount} students could not be seated (capacity exceeded).</span>` : ""}</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Hall</th><th>Capacity</th><th>Seated</th></tr></thead>
        <tbody>
          ${data.halls.map((h) => `<tr><td>${h.hallName}</td><td>${h.capacity}</td><td>${h.seated}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  showToast(data.unseatedCount > 0 ? "Seating generated with unseated students." : "Seating plan generated successfully.");
});

// ---------- View seating ----------
const CLASS_COLOR_CLASSES = ["c0", "c1", "c2", "c3", "c4", "c5"];
function classColorClass(className, classIndexMap) {
  if (!classIndexMap.has(className)) classIndexMap.set(className, classIndexMap.size);
  return CLASS_COLOR_CLASSES[classIndexMap.get(className) % CLASS_COLOR_CLASSES.length];
}

async function renderSeating(examId) {
  const container = document.getElementById("seating-halls");
  container.innerHTML = `<p class="muted">Loading...</p>`;
  const res = await fetch(`${API}/exams/${examId}/seating`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || "Could not load seating");
  }
  const halls = await res.json();

  if (!halls.length) {
    container.innerHTML = `<p class="muted">No seating generated yet for this exam. Go to "Generate Seating".</p>`;
    return;
  }

  const classIndexMap = new Map();

  container.innerHTML = `
    <div style="margin-bottom:16px"><button class="btn secondary" onclick="window.print()">Print seating plan</button></div>
    ${halls
      .map((h) => {
        const grid = h.grid.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));
        const cells = grid
          .map((c) => {
            if (c.empty) return `<div class="seat empty">—</div>`;
            const colorClass = classColorClass(c.class, classIndexMap);
            return `<div class="seat ${colorClass}"><div class="roll">${c.seatLabel}</div>${c.rollNo}<div class="cls">${c.class}</div></div>`;
          })
          .join("");
        return `
        <div class="hall-block print-target">
          <h3>${h.hallName}</h3>
          <div class="hall-meta">Rows: ${h.rows} · Columns: ${h.columns} · Seated: ${h.seatedCount}/${h.rows * h.columns}</div>
          <div class="seat-grid" style="grid-template-columns: repeat(${h.columns}, 1fr);">${cells}</div>
        </div>`;
      })
      .join("")}
  `;
}

document.getElementById("seat-exam-select").addEventListener("change", (e) => {
  if (e.target.value) {
    renderSeating(e.target.value).catch((err) => {
      document.getElementById("seating-halls").innerHTML = `<p class="err">${err.message}</p>`;
    });
  }
});

// re-render when the seating view is opened, if an exam is already selected
const originalOnViewShown = onViewShown;
onViewShown = async function (view) {
  const result = await originalOnViewShown(view);
  if (view === "seating") {
    const sel = document.getElementById("seat-exam-select");
    if (sel.value) await renderSeating(sel.value);
  }
  return result;
};

// ---------- Search ----------
document.getElementById("search-btn").addEventListener("click", doSearch);
document.getElementById("search-roll").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

async function doSearch() {
  const examId = document.getElementById("search-exam-select").value;
  const roll = document.getElementById("search-roll").value.trim();
  const resultEl = document.getElementById("search-result");
  if (!examId || !roll) {
    resultEl.innerHTML = `<p class="err">Choose an exam and enter a roll number.</p>`;
    return;
  }
  const res = await fetch(`${API}/exams/${examId}/search?rollNo=${encodeURIComponent(roll)}`);
  const data = await res.json();
  if (!res.ok) {
    resultEl.innerHTML = `<p class="err">${data.error}</p>`;
    return;
  }
  resultEl.innerHTML = `
    <div class="result-card">
      <dl>
        <dt>Roll No</dt><dd>${data.student.rollNo}</dd>
        <dt>Name</dt><dd>${data.student.name}</dd>
        <dt>Class</dt><dd>${data.student.class}</dd>
        <dt>Department</dt><dd>${data.student.dept}</dd>
        <dt>Hall</dt><dd>${data.hallName}</dd>
        <dt>Row</dt><dd>${data.row}</dd>
        <dt>Column</dt><dd>${data.col}</dd>
        <dt>Seat No.</dt><dd>${data.seatLabel}</dd>
      </dl>
    </div>`;
}

// ---------- Init ----------
bootstrapAuth();
