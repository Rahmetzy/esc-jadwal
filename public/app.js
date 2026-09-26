import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "/firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---------- Constants ----------
const DAYS = [
  { key: "senin", label: "SENIN" },
  { key: "selasa", label: "SELASA" },
  { key: "rabu", label: "RABU" },
  { key: "kamis", label: "KAMIS" },
  { key: "jumat", label: "JUMAT" },
  { key: "sabtu", label: "SABTU" },
  { key: "minggu", label: "MINGGU" },
];
const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

// ---------- State ----------
let currentMonday = getMonday(new Date());
let employees = []; // {id, nama, aktif}
let schedule = {};  // {senin: {shift1: [], shift2: []}, ...}
let unsubSchedule = null;
let previewResult = null; // computed by auto-assign, applied on demand

// ---------- Date helpers ----------
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function weekId(monday) {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatDayDate(date) {
  return `${date.getDate()} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`;
}
function formatWeekLabel(monday) {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const left = `${monday.getDate()}`;
  const right = sameMonth
    ? `${sunday.getDate()} ${MONTHS_ID[sunday.getMonth()]} ${sunday.getFullYear()}`
    : `${sunday.getDate()} ${MONTHS_ID[sunday.getMonth()]} ${sunday.getFullYear()}`;
  return `${left}–${right}`;
}
function emptySchedule() {
  const obj = {};
  DAYS.forEach((d) => (obj[d.key] = { shift1: [], shift2: [] }));
  return obj;
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ---------- Week navigation ----------
document.getElementById("prevWeek").addEventListener("click", () => changeWeek(-7));
document.getElementById("nextWeek").addEventListener("click", () => changeWeek(7));

function changeWeek(deltaDays) {
  currentMonday = addDays(currentMonday, deltaDays);
  loadWeek();
}

function loadWeek() {
  document.getElementById("weekLabel").textContent = formatWeekLabel(currentMonday);
  if (unsubSchedule) unsubSchedule();
  const ref = doc(db, "schedules", weekId(currentMonday));
  unsubSchedule = onSnapshot(ref, (snap) => {
    schedule = snap.exists() ? snap.data() : emptySchedule();
    DAYS.forEach((d) => {
      if (!schedule[d.key]) schedule[d.key] = { shift1: [], shift2: [] };
      schedule[d.key].shift1 = schedule[d.key].shift1 || [];
      schedule[d.key].shift2 = schedule[d.key].shift2 || [];
    });
    renderScheduleTable();
  });
}

async function saveScheduleDay(dayKey, shiftKey, names) {
  const ref = doc(db, "schedules", weekId(currentMonday));
  const current = schedule[dayKey] || { shift1: [], shift2: [] };
  current[shiftKey] = names;
  schedule[dayKey] = current;
  await setDoc(ref, schedule, { merge: true });
}

// ---------- Schedule table rendering ----------
function renderScheduleTable() {
  const tbody = document.getElementById("scheduleBody");
  tbody.innerHTML = "";
  DAYS.forEach((day, idx) => {
    const date = addDays(currentMonday, idx);
    const tr = document.createElement("tr");

    const dayTd = document.createElement("td");
    dayTd.innerHTML = `<span class="day-cell">${day.label}<span class="day-date">${formatDayDate(date)}</span></span>`;
    tr.appendChild(dayTd);

    ["shift1", "shift2"].forEach((shiftKey) => {
      const td = document.createElement("td");
      td.className = "shift-cell";
      const names = (schedule[day.key] && schedule[day.key][shiftKey]) || [];
      td.innerHTML = renderChips(names);
      td.addEventListener("click", (e) => openCellEditor(e, day.key, shiftKey));
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  renderShiftSummary();
}

function renderChips(names) {
  if (!names || names.length === 0) {
    return `<div class="chip-row"><span class="empty-cell">Kosong</span></div>`;
  }
  return `<div class="chip-row">${names.map((n) => `<span class="chip">${n}</span>`).join("")}</div>`;
}

// ---------- Ringkasan total shift per karyawan (nggak ikut export PDF) ----------
function renderShiftSummary() {
  const counts = {};
  DAYS.forEach((day) => {
    const cell = schedule[day.key] || { shift1: [], shift2: [] };
    [...cell.shift1, ...cell.shift2].forEach((name) => {
      counts[name] = (counts[name] || 0) + 1;
    });
  });

  const ul = document.getElementById("shiftSummary");
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    ul.innerHTML = `<li class="empty-cell">Belum ada jadwal minggu ini</li>`;
    return;
  }
  ul.innerHTML = entries
    .map(
      ([name, count]) => `
      <li class="summary-row">
        <span>${name}</span>
        <span class="summary-count">${count} shift</span>
      </li>`
    )
    .join("");
}

// ---------- Cell editor popover ----------
function openCellEditor(evt, dayKey, shiftKey) {
  closePopover();
  const activeEmployees = employees.filter((e) => e.aktif !== false);
  if (activeEmployees.length === 0) {
    toast("Tambahkan karyawan dulu di tab Karyawan");
    return;
  }
  const current = new Set((schedule[dayKey] && schedule[dayKey][shiftKey]) || []);

  const backdrop = document.createElement("div");
  backdrop.className = "popover-backdrop";
  backdrop.addEventListener("click", closePopover);

  const pop = document.createElement("div");
  pop.className = "popover";
  pop.innerHTML = activeEmployees
    .map(
      (emp) => `
      <label class="popover-option">
        <input type="checkbox" value="${emp.nama}" ${current.has(emp.nama) ? "checked" : ""} />
        ${emp.nama}
      </label>`
    )
    .join("");

  document.body.appendChild(backdrop);
  document.body.appendChild(pop);

  const rect = evt.currentTarget.getBoundingClientRect();
  const top = Math.min(rect.bottom + 6, window.innerHeight - 260);
  const left = Math.min(rect.left, window.innerWidth - 246);
  pop.style.top = `${Math.max(10, top)}px`;
  pop.style.left = `${Math.max(10, left)}px`;

  pop.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", async () => {
      const checked = [...pop.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
      await saveScheduleDay(dayKey, shiftKey, checked);
    });
  });
}
function closePopover() {
  document.querySelectorAll(".popover, .popover-backdrop").forEach((el) => el.remove());
}

// ---------- Employees ----------
function listenEmployees() {
  onSnapshot(collection(db, "employees"), (snap) => {
    employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    employees.sort((a, b) => a.nama.localeCompare(b.nama));
    renderEmployeeList();
    renderAutoAssignAll();
    renderScheduleTable();
  });
}

function renderEmployeeList() {
  const ul = document.getElementById("employeeList");
  ul.innerHTML = "";
  if (employees.length === 0) {
    ul.innerHTML = `<li class="employee-row"><span class="empty-cell">Belum ada karyawan</span></li>`;
    return;
  }
  employees.forEach((emp) => {
    const li = document.createElement("li");
    li.className = "employee-row" + (emp.aktif === false ? " inactive" : "");
    li.innerHTML = `
      <span class="employee-name">${emp.nama}</span>
      <span class="employee-actions">
        <button class="mini-btn" data-action="toggle">${emp.aktif === false ? "Aktifkan" : "Nonaktifkan"}</button>
        <button class="mini-btn" data-action="delete">Hapus</button>
      </span>`;
    li.querySelector('[data-action="toggle"]').addEventListener("click", () =>
      updateDoc(doc(db, "employees", emp.id), { aktif: emp.aktif === false })
    );
    li.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (confirm(`Hapus ${emp.nama} dari daftar karyawan?`)) {
        deleteDoc(doc(db, "employees", emp.id));
      }
    });
    ul.appendChild(li);
  });
}

document.getElementById("addEmployeeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("newEmployeeName");
  const nama = input.value.trim();
  if (!nama) return;
  await addDoc(collection(db, "employees"), { nama, aktif: true });
  input.value = "";
  toast(`${nama} ditambahkan`);
});

// ---------- Auto-assign (live, semua karyawan, setting permanen) ----------
function renderAutoAssignAll() {
  const wrap = document.getElementById("employeeAvailability");
  const active = employees.filter((e) => e.aktif !== false);

  // Simpan dulu kartu siapa aja yang lagi kebuka, biar nggak balik tertutup tiap re-render
  const openIds = new Set(
    [...wrap.querySelectorAll("details.avail-card[open]")].map((d) => d.dataset.empId)
  );

  if (active.length === 0) {
    wrap.innerHTML = `<p class="empty-cell">Tambahkan karyawan dulu di tab Karyawan.</p>`;
  } else {
    wrap.innerHTML = active
      .map((emp) => {
        const unavail = emp.unavailable || {};
        const isOpen = openIds.has(emp.id);
        return `
        <details class="avail-card" data-emp-id="${emp.id}" ${isOpen ? "open" : ""}>
          <summary>${emp.nama}</summary>
          <div class="day-checks">
            ${DAYS.map(
              (d) => `
              <div class="day-row">
                <span class="day-row-label">${capitalize(d.label)}</span>
                <div class="day-row-shifts">
                  <label class="shift-check">
                    <input type="checkbox" data-emp="${emp.id}" data-day="${d.key}" data-shift="shift1" ${
                unavail[d.key] && unavail[d.key].shift1 ? "checked" : ""
              } /> Shift 1
                  </label>
                  <label class="shift-check">
                    <input type="checkbox" data-emp="${emp.id}" data-day="${d.key}" data-shift="shift2" ${
                unavail[d.key] && unavail[d.key].shift2 ? "checked" : ""
              } /> Shift 2
                  </label>
                </div>
              </div>`
            ).join("")}
          </div>
        </details>`;
      })
      .join("");

    wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", async (e) => {
        const { emp, day, shift } = e.target.dataset;
        await updateDoc(doc(db, "employees", emp), {
          [`unavailable.${day}.${shift}`]: e.target.checked,
        });
        // Firestore onSnapshot akan trigger renderAutoAssignAll() lagi otomatis
      });
    });
  }

  renderAutoPreview();
}
function capitalize(label) {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function computeAutoSchedule() {
  const working = emptySchedule();
  const active = employees.filter((e) => e.aktif !== false);
  if (active.length === 0) return working;

  // Kapasitas maksimal per shift: normalnya 1 orang, kecuali Shift 2 Sabtu (malam Minggu)
  // dan Shift 2 Minggu (malam Senin) yang boleh sampai 2 orang.
  const capacity = (dayKey, shiftKey) => {
    if (shiftKey === "shift2" && (dayKey === "sabtu" || dayKey === "minggu")) return 2;
    return 1;
  };

  // Hitung berapa shift yang udah didapat tiap karyawan sepanjang minggu ini,
  // dipakai buat nentuin siapa yang paling "berhak" diisi duluan di tiap slot kosong.
  const shiftCount = {};
  active.forEach((emp) => (shiftCount[emp.nama] = 0));

  // Proses SLOT per SLOT (bukan karyawan per karyawan), biar nggak ada yang
  // "keburu ambil semua" sebelum karyawan lain kebagian giliran.
  DAYS.forEach((day) => {
    const cell = working[day.key];
    ["shift1", "shift2"].forEach((shiftKey) => {
      const cap = capacity(day.key, shiftKey);
      for (let i = 0; i < cap; i++) {
        const eligible = active.filter((emp) => {
          const unavail = emp.unavailable || {};
          const dayUnavail = unavail[day.key] || {};
          if (dayUnavail[shiftKey]) return false; // dia emang gabisa slot ini
          if (cell.shift1.includes(emp.nama) || cell.shift2.includes(emp.nama)) return false; // udah kerja hari itu
          return true;
        });
        if (eligible.length === 0) continue; // nggak ada yang bisa isi slot ini

        // Pilih yang paling sedikit jumlah shift-nya sejauh ini; kalau seri, urutan nama yang menang
        eligible.sort((a, b) => shiftCount[a.nama] - shiftCount[b.nama] || a.nama.localeCompare(b.nama));
        const chosen = eligible[0];
        cell[shiftKey] = [...cell[shiftKey], chosen.nama];
        shiftCount[chosen.nama] += 1;
      }
    });
  });

  return working;
}

function renderAutoPreview() {
  previewResult = computeAutoSchedule();
  const tbody = document.getElementById("previewBody");
  tbody.innerHTML = "";
  DAYS.forEach((day) => {
    const cell = previewResult[day.key] || { shift1: [], shift2: [] };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="day-cell">${day.label}</span></td>
      <td>${renderChips(cell.shift1)}</td>
      <td>${renderChips(cell.shift2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById("applyBtn").addEventListener("click", async () => {
  if (!previewResult) return;
  const ref = doc(db, "schedules", weekId(currentMonday));
  await setDoc(ref, previewResult, { merge: true });
  toast(`Jadwal otomatis diterapkan ke minggu ${formatWeekLabel(currentMonday)}`);
});

// ---------- Copy last week's schedule ----------
document.getElementById("copyLastWeekBtn").addEventListener("click", async () => {
  const prevMonday = addDays(currentMonday, -7);
  const prevRef = doc(db, "schedules", weekId(prevMonday));
  const prevSnap = await getDoc(prevRef);
  if (!prevSnap.exists()) {
    toast("Jadwal minggu lalu belum ada");
    return;
  }
  const ok = confirm("Salin jadwal minggu lalu ke minggu ini? Jadwal yang sudah ada di minggu ini akan ditimpa.");
  if (!ok) return;
  const ref = doc(db, "schedules", weekId(currentMonday));
  await setDoc(ref, prevSnap.data());
  toast("Jadwal minggu lalu berhasil disalin");
});

// ---------- PDF export ----------
document.getElementById("exportPdfBtn").addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(11, 61, 46);
  pdf.text("JADWAL SHIFT ESC", 40, 46);

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(80, 80, 80);
  pdf.text(`Minggu: ${formatWeekLabel(currentMonday)}`, 40, 64);

  const rows = DAYS.map((day, idx) => {
    const date = addDays(currentMonday, idx);
    const cell = schedule[day.key] || { shift1: [], shift2: [] };
    return [
      `${day.label}\n${formatDayDate(date)}`,
      cell.shift1.join(", ") || "-",
      cell.shift2.join(", ") || "-",
    ];
  });

  pdf.autoTable({
    startY: 80,
    head: [["Hari", "Shift 1 (07.00–15.00)", "Shift 2 (14.00–22.00)"]],
    body: rows,
    styles: { font: "helvetica", fontSize: 10, cellPadding: 8, valign: "middle" },
    headStyles: { fillColor: [11, 61, 46], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [234, 243, 238] },
    columnStyles: { 0: { fontStyle: "bold", textColor: [11, 61, 46] } },
  });

  pdf.save(`jadwal-shift-esc-${weekId(currentMonday)}.pdf`);
});

// ---------- Init ----------
listenEmployees();
loadWeek();
