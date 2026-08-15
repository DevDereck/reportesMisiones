import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

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
const achievedPercentage = document.getElementById("achievedPercentage");
const pendingPercentage = document.getElementById("pendingPercentage");
const generalTableBody = document.getElementById("generalTableBody");
const exportGeneralPdfBtn = document.getElementById("exportGeneralPdfBtn");

let currentRows = [];
let currentMonth = "";
let currentExpected = 0;
let currentOffered = 0;
let currentPending = 0;

function formatCurrency(value) {
  const num = Number(value || 0);
  const formattedNumber = num
    .toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u00A0\u202F]/g, " ");
  return `₡${formattedNumber}`;
}

function formatCurrencyForPdf(value) {
  const num = Number(value || 0);
  const formattedNumber = num
    .toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u00A0\u202F]/g, " ");
  return `CRC ${formattedNumber}`;
}

function formatPercentage(value) {
  const num = Number(value || 0);
  return `${num.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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

function isValidMonthValue(monthValue) {
  return /^\d{4}-\d{2}$/.test(String(monthValue || ""));
}

function getRegistrationMonthValue(person) {
  const createdAtDate = person?.createdAt?.toDate?.();
  if (createdAtDate instanceof Date && !Number.isNaN(createdAtDate.getTime())) {
    const y = createdAtDate.getFullYear();
    const m = String(createdAtDate.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  return getCurrentMonthValue();
}

function getStartMonthForPersonData(person) {
  const startsFromRegistration = Boolean(person?.useRegistrationStart);
  if (!startsFromRegistration) {
    const year = new Date().getFullYear();
    return `${year}-01`;
  }
  return getRegistrationMonthValue(person);
}

function sanitizePromisedHistory(history) {
  if (!Array.isArray(history)) return [];

  const entriesByMonth = history.reduce((accumulator, entry) => {
    if (!isValidMonthValue(entry?.month)) return accumulator;
    const amount = Number(entry?.amount);
    if (Number.isNaN(amount)) return accumulator;
    accumulator[entry.month] = amount;
    return accumulator;
  }, {});

  return Object.keys(entriesByMonth)
    .sort()
    .map((month) => ({ month, amount: entriesByMonth[month] }));
}

function inferLegacyPromisedAmount(person, contributions, beforeMonth = "") {
  const fallbackAmount = Number(person?.promisedAmount || 0);
  const upperBoundMonth = isValidMonthValue(beforeMonth) ? beforeMonth : getCurrentMonthValue();

  const historicalAmounts = (Array.isArray(contributions) ? contributions : [])
    .filter((row) => isValidMonthValue(row?.month) && row.month < upperBoundMonth)
    .map((row) => Number(row?.amount || 0))
    .filter((amount) => amount > 0);

  if (!historicalAmounts.length) {
    return null;
  }

  const occurrences = historicalAmounts.reduce((accumulator, amount) => {
    accumulator[amount] = (accumulator[amount] || 0) + 1;
    return accumulator;
  }, {});

  const inferredAmount = Number(
    Object.keys(occurrences).sort((a, b) => {
      const countDiff = occurrences[b] - occurrences[a];
      if (countDiff !== 0) return countDiff;
      return Number(b) - Number(a);
    })[0]
  );

  if (Number.isNaN(inferredAmount) || inferredAmount === fallbackAmount) {
    return null;
  }

  return inferredAmount;
}

function getPromisedAmountForMonth(person, monthValue, contributions) {
  if (isValidMonthValue(monthValue)) {
    const startMonth = getStartMonthForPersonData(person);
    if (monthValue < startMonth) {
      return 0;
    }
  }

  const fallbackAmount = Number(person?.promisedAmount || 0);
  const history = sanitizePromisedHistory(person?.promisedHistory);

  if (!isValidMonthValue(monthValue)) {
    return fallbackAmount;
  }

  if (!history.length) {
    const currentMonth = getCurrentMonthValue();
    if (monthValue < currentMonth) {
      const inferredLegacyAmount = inferLegacyPromisedAmount(person, contributions, currentMonth);
      if (typeof inferredLegacyAmount === "number") {
        return inferredLegacyAmount;
      }
    }
    return fallbackAmount;
  }

  const firstHistoryMonth = history[0].month;
  if (monthValue < firstHistoryMonth) {
    const inferredLegacyAmount = inferLegacyPromisedAmount(person, contributions, firstHistoryMonth);
    if (typeof inferredLegacyAmount === "number") {
      return inferredLegacyAmount;
    }
    return fallbackAmount;
  }

  let promised = history[0].amount;
  history.forEach((entry) => {
    if (entry.month <= monthValue) {
      promised = entry.amount;
    }
  });

  return promised;
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
      const contributionsRef = query(
        collection(db, "people", personDoc.id, "contributions"),
        orderBy("month", "asc")
      );
      const contributionsSnap = await getDocs(contributionsRef);
      const contributions = contributionsSnap.docs.map((item) => item.data());

      const promised = getPromisedAmountForMonth(personData, month, contributions);
      const monthContribution = contributions.find((item) => item?.month === month);
      const paid = monthContribution ? Number(monthContribution.amount || 0) : 0;
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

  const pendingPercent = expected > 0 ? (pending / expected) * 100 : 0;
  const achievedPercent = expected > 0 ? (offered / expected) * 100 : 0;

  expectedAmount.textContent = formatCurrency(expected);
  offeredAmount.textContent = formatCurrency(offered);
  pendingAmount.textContent = formatCurrency(pending);
  achievedPercentage.textContent = formatPercentage(achievedPercent);
  pendingPercentage.textContent = formatPercentage(pendingPercent);
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
    const pendingPercent = currentExpected > 0 ? (currentPending / currentExpected) * 100 : 0;
    const achievedPercent = currentExpected > 0 ? (currentOffered / currentExpected) * 100 : 0;
    pdf.text(`Mes: ${monthLabel}`, 14, 44);
    pdf.text(`Monto esperado: ${formatCurrencyForPdf(currentExpected)}`, 14, 51);
    pdf.text(`Total ofrendado: ${formatCurrencyForPdf(currentOffered)}`, 14, 58);
    pdf.setTextColor(14, 130, 53);
    pdf.text(`Porcentaje alcanzado: ${formatPercentage(achievedPercent)}`, 14, 65);
    pdf.setTextColor(163, 41, 41);
    pdf.text(`Total pendiente del mes: ${formatCurrencyForPdf(currentPending)}`, 14, 72);
    pdf.text(`Porcentaje adeudado: ${formatPercentage(pendingPercent)}`, 14, 79);
    pdf.setTextColor(8, 53, 63);

    const body = currentRows.map((row) => {
      const pendingLabel = row.pending > 0 ? formatCurrencyForPdf(row.pending) : "";
      return [
        row.name,
        formatCurrencyForPdf(row.promised),
        formatCurrencyForPdf(row.paid),
        pendingLabel,
        row.pending > 0 ? "Con pendiente" : "Completo"
      ];
    });

    pdf.autoTable({
      head: [["Persona", "Prometido", "Abonado", "Pendiente", "Estado"]],
      body,
      startY: 87,
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

  generalWelcome.textContent = `Administrador: ${user.email}`;

  const month = getCurrentMonthValue();
  generalMonth.value = month;
  await buildGeneralData(month);
});
