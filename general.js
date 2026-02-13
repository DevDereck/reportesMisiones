import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, adminAuthConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const generalWelcome = document.getElementById("generalWelcome");
const generalLogoutBtn = document.getElementById("generalLogoutBtn");
const generalFilterForm = document.getElementById("generalFilterForm");
const generalMonth = document.getElementById("generalMonth");
const expectedAmount = document.getElementById("expectedAmount");
const offeredAmount = document.getElementById("offeredAmount");
const pendingAmount = document.getElementById("pendingAmount");
const generalTableBody = document.getElementById("generalTableBody");
const exportGeneralPdfBtn = document.getElementById("exportGeneralPdfBtn");

let currentRows = [];
let currentMonth = "";
let currentExpected = 0;
let currentOffered = 0;
let currentPending = 0;

function formatCurrency(value) {
  const num = Number(value || 0);
  return num.toLocaleString("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 });
}

function toMonthLabel(yyyymm) {
  if (!yyyymm) return "";
  const [year, month] = yyyymm.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-CR", { month: "long", year: "numeric" });
}

function getCurrentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function renderGeneralTable(rows) {
  if (!rows.length) {
    generalTableBody.innerHTML = "<tr><td colspan='5'>No hay personas registradas.</td></tr>";
    return;
  }

  generalTableBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const pendingLabel = row.pending > 0 ? formatCurrency(row.pending) : "";
    const statusLabel = row.pending > 0 ? "Con pendiente" : "Completo";
    const statusClass = row.pending > 0 ? "status-pending" : "status-ok";

    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${formatCurrency(row.promised)}</td>
      <td>${formatCurrency(row.paid)}</td>
      <td>${pendingLabel}</td>
      <td class="${statusClass}">${statusLabel}</td>
    `;

    generalTableBody.appendChild(tr);
  });
}

async function buildGeneralData(month) {
  const peopleRef = query(collection(db, "people"), orderBy("name", "asc"));
  const peopleSnap = await getDocs(peopleRef);

  const rows = await Promise.all(
    peopleSnap.docs.map(async (personDoc) => {
      const personData = personDoc.data();
      const promised = Number(personData.promisedAmount || 0);
      const contributionRef = doc(db, "people", personDoc.id, "contributions", month);
      const contributionSnap = await getDoc(contributionRef);
      const paid = contributionSnap.exists() ? Number(contributionSnap.data().amount || 0) : 0;
      const pending = promised - paid;

      return {
        name: personData.name || "Sin nombre",
        promised,
        paid,
        pending
      };
    })
  );

  const expected = rows.reduce((sum, row) => sum + row.promised, 0);
  const offered = rows.reduce((sum, row) => sum + row.paid, 0);
  const pending = rows.reduce((sum, row) => sum + Math.max(row.pending, 0), 0);

  currentRows = rows;
  currentMonth = month;
  currentExpected = expected;
  currentOffered = offered;
  currentPending = pending;

  expectedAmount.textContent = formatCurrency(expected);
  offeredAmount.textContent = formatCurrency(offered);
  pendingAmount.textContent = formatCurrency(pending);
  renderGeneralTable(rows);
}

async function loadLogoForPdf() {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "assets/icpa_l.png";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    return canvas.toDataURL("image/png");
  } catch (error) {
    return null;
  }
}

function exportGeneralPdf() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const pageWidth = pdf.internal.pageSize.getWidth();
  const monthLabel = toMonthLabel(currentMonth);

  const build = async () => {
    const logoData = await loadLogoForPdf();
    if (logoData) {
      pdf.addImage(logoData, "PNG", 14, 10, 26, 26);
    }

    pdf.setFontSize(18);
    pdf.text("Reporte general de misiones", pageWidth / 2, 20, { align: "center" });

    pdf.setFontSize(11);
    pdf.text(`Mes: ${monthLabel}`, 14, 44);
    pdf.text(`Monto esperado: ${formatCurrency(currentExpected)}`, 14, 51);
    pdf.text(`Total ofrendado: ${formatCurrency(currentOffered)}`, 14, 58);
    pdf.text(`Total pendiente del mes: ${formatCurrency(currentPending)}`, 14, 65);

    const body = currentRows.map((row) => {
      const pendingLabel = row.pending > 0 ? formatCurrency(row.pending) : "";
      return [
        row.name,
        formatCurrency(row.promised),
        formatCurrency(row.paid),
        pendingLabel,
        row.pending > 0 ? "Con pendiente" : "Completo"
      ];
    });

    pdf.autoTable({
      head: [["Persona", "Prometido", "Abonado", "Pendiente", "Estado"]],
      body,
      startY: 73,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [12, 119, 121] }
    });

    pdf.save(`reporte_general_misiones_${currentMonth}.pdf`);
  };

  build();
}

generalFilterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!generalMonth.value) return;
  await buildGeneralData(generalMonth.value);
});

generalMonth.addEventListener("change", async () => {
  if (!generalMonth.value) return;
  await buildGeneralData(generalMonth.value);
});

exportGeneralPdfBtn.addEventListener("click", () => {
  exportGeneralPdf();
});

generalLogoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  generalWelcome.textContent = `Administrador: ${adminAuthConfig.username}`;

  const month = getCurrentMonthValue();
  generalMonth.value = month;
  await buildGeneralData(month);
});
