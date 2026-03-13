import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, adminAuthConfig } from "./firebase-config.js";

const ADMIN_CONFIG = adminAuthConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const loginMessage = document.getElementById("loginMessage");
const welcomeText = document.getElementById("welcomeText");

const personForm = document.getElementById("personForm");
const personIdInput = document.getElementById("personId");
const personFormTitle = document.getElementById("personFormTitle");
const personName = document.getElementById("personName");
const personPhone = document.getElementById("personPhone");
const personPromised = document.getElementById("personPromised");
const personInitialPayment = document.getElementById("personInitialPayment");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const personMessage = document.getElementById("personMessage");

const peopleSearch = document.getElementById("peopleSearch");
const peopleList = document.getElementById("peopleList");
const togglePeopleBtn = document.getElementById("togglePeopleBtn");

const detailSection = document.getElementById("detailSection");
const detailName = document.getElementById("detailName");
const detailMeta = document.getElementById("detailMeta");
const monthlyForm = document.getElementById("monthlyForm");
const monthlyMonth = document.getElementById("monthlyMonth");
const monthlyAmount = document.getElementById("monthlyAmount");
const monthlySubmitBtn = document.getElementById("monthlySubmitBtn");
const cancelMonthlyEditBtn = document.getElementById("cancelMonthlyEditBtn");
const monthlyTableBody = document.getElementById("monthlyTableBody");
const viewTotalPendingBtn = document.getElementById("viewTotalPendingBtn");
const totalPendingInfo = document.getElementById("totalPendingInfo");
const exportPdfBtn = document.getElementById("exportPdfBtn");

let peopleCache = [];
let selectedPerson = null;
let selectedContributions = [];
let isShowingAllPeople = false;
let editingContributionMonth = "";

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

function showLoginError(text) {
  loginMessage.textContent = text;
}

function showPersonMessage(text, isError = false) {
  personMessage.style.color = isError ? "#a32929" : "#0c7779";
  personMessage.textContent = text;
  setTimeout(() => {
    if (personMessage.textContent === text) {
      personMessage.textContent = "";
    }
  }, 2500);
}

function clearPersonForm() {
  personForm.reset();
  personIdInput.value = "";
  personFormTitle.textContent = "Registrar persona";
  cancelEditBtn.classList.add("hidden");
}

function resetMonthlyForm() {
  monthlyForm.reset();
  editingContributionMonth = "";
  monthlyMonth.disabled = false;
  monthlySubmitBtn.textContent = "Guardar abono";
  cancelMonthlyEditBtn.classList.add("hidden");
}

function startMonthlyEdit(row) {
  editingContributionMonth = row.month;
  monthlyMonth.value = row.month;
  monthlyMonth.disabled = true;
  monthlyAmount.value = Number(row.amount || 0);
  monthlySubmitBtn.textContent = "Actualizar abono";
  cancelMonthlyEditBtn.classList.remove("hidden");
  monthlyAmount.focus();
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

function getCurrentYearJanuaryValue() {
  const year = new Date().getFullYear();
  return `${year}-01`;
}

function monthToIndex(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  return year * 12 + (month - 1);
}

function indexToMonth(index) {
  const year = Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
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
    return getCurrentYearJanuaryValue();
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

function getPromisedAmountForMonth(person, monthValue) {
  const fallbackAmount = Number(person?.promisedAmount || 0);
  const history = sanitizePromisedHistory(person?.promisedHistory);
  if (!history.length || !isValidMonthValue(monthValue)) {
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

function buildPromisedHistoryForUpdate(person, newPromisedAmount) {
  const previousPromisedAmount = Number(person?.promisedAmount || 0);
  const normalizedNewAmount = Number(newPromisedAmount || 0);
  const history = sanitizePromisedHistory(person?.promisedHistory);

  if (previousPromisedAmount === normalizedNewAmount) {
    return history;
  }

  const effectiveMonth = getCurrentMonthValue();
  const nextHistory = [...history];

  if (!nextHistory.length) {
    const startMonth = getStartMonthForPersonData(person);
    nextHistory.push({ month: startMonth, amount: previousPromisedAmount });
  }

  const currentMonthIndex = nextHistory.findIndex((entry) => entry.month === effectiveMonth);
  if (currentMonthIndex >= 0) {
    nextHistory[currentMonthIndex] = { month: effectiveMonth, amount: normalizedNewAmount };
  } else {
    nextHistory.push({ month: effectiveMonth, amount: normalizedNewAmount });
  }

  return sanitizePromisedHistory(nextHistory);
}

function getStartMonthForPerson() {
  const januaryMonth = getCurrentYearJanuaryValue();
  const startsFromRegistration = Boolean(selectedPerson?.useRegistrationStart);

  if (!startsFromRegistration) {
    return januaryMonth;
  }

  const createdAtDate = selectedPerson?.createdAt?.toDate?.();
  if (createdAtDate instanceof Date && !Number.isNaN(createdAtDate.getTime())) {
    const y = createdAtDate.getFullYear();
    const m = String(createdAtDate.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  if (selectedContributions.length) {
    const monthValues = selectedContributions.map((row) => row.month).filter(Boolean).sort();
    if (monthValues.length) {
      return monthValues[0];
    }
  }

  return getCurrentMonthValue();
}

function getAccumulatedPending() {
  if (!selectedPerson) {
    return { totalPending: 0, startMonth: "", endMonth: "" };
  }

  const startMonth = getStartMonthForPerson();
  const endMonth = getCurrentMonthValue();

  const startIndex = monthToIndex(startMonth);
  const endIndex = monthToIndex(endMonth);
  const finalIndex = Math.max(startIndex, endIndex);

  const paymentsByMonth = selectedContributions.reduce((accumulator, row) => {
    if (row.month) {
      accumulator[row.month] = Number(row.amount || 0);
    }
    return accumulator;
  }, {});

  let totalPending = 0;
  for (let index = startIndex; index <= finalIndex; index += 1) {
    const monthValue = indexToMonth(index);
    const promised = getPromisedAmountForMonth(selectedPerson, monthValue);
    const paid = Number(paymentsByMonth[monthValue] || 0);
    totalPending += Math.max(promised - paid, 0);
  }

  return { totalPending, startMonth, endMonth };
}

function showAccumulatedPending() {
  if (!selectedPerson) return;

  const { totalPending, startMonth, endMonth } = getAccumulatedPending();
  totalPendingInfo.textContent = `Pendiente acumulado de ${toMonthLabel(startMonth)} a ${toMonthLabel(endMonth)}: ${formatCurrency(totalPending)}`;
  totalPendingInfo.classList.remove("hidden");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function renderPeople() {
  const searchText = normalizeText((peopleSearch?.value || "").trim());
  const filteredPeople = !searchText
    ? peopleCache
    : peopleCache.filter((person) => normalizeText(person.name).includes(searchText));

  const canCollapse = !searchText && filteredPeople.length > 2;
  const visiblePeople = canCollapse && !isShowingAllPeople ? filteredPeople.slice(0, 2) : filteredPeople;

  if (canCollapse) {
    togglePeopleBtn.classList.remove("hidden");
    togglePeopleBtn.textContent = isShowingAllPeople ? "Ver menos" : "Ver todos";
  } else {
    togglePeopleBtn.classList.add("hidden");
  }

  if (!visiblePeople.length) {
    if (peopleCache.length) {
      peopleList.innerHTML = "<p class='person-meta'>No se encontraron personas con ese nombre.</p>";
      return;
    }

    peopleList.innerHTML = "<p class='person-meta'>No hay personas registradas todavía.</p>";
    return;
  }

  peopleList.innerHTML = "";
  visiblePeople.forEach((person) => {
    const item = document.createElement("article");
    item.className = "person-item";
    item.innerHTML = `
      <div>
        <strong>${person.name}</strong>
        <p class="person-meta">Tel: ${person.phone}</p>
        <p class="person-meta">Prometido: ${formatCurrency(person.promisedAmount)}</p>
      </div>
      <div class="person-actions">
        <button class="btn btn-ghost" data-action="select" data-id="${person.id}" type="button">Seleccionar</button>
        <button class="btn btn-ghost" data-action="edit" data-id="${person.id}" type="button">Editar</button>
        <button class="btn btn-danger" data-action="delete" data-id="${person.id}" type="button">Eliminar</button>
      </div>
    `;
    peopleList.appendChild(item);
  });
}

async function deletePerson(personId) {
  const contributionsRef = collection(db, "people", personId, "contributions");
  const contributionsSnap = await getDocs(contributionsRef);

  const deleteContributionTasks = contributionsSnap.docs.map((contributionDoc) =>
    deleteDoc(doc(db, "people", personId, "contributions", contributionDoc.id))
  );

  await Promise.all(deleteContributionTasks);
  await deleteDoc(doc(db, "people", personId));
}

function renderContributions() {
  if (!selectedPerson) {
    detailSection.classList.add("hidden");
    totalPendingInfo.classList.add("hidden");
    totalPendingInfo.textContent = "";
    resetMonthlyForm();
    return;
  }

  detailSection.classList.remove("hidden");
  detailName.textContent = selectedPerson.name;
  detailMeta.textContent = `Tel: ${selectedPerson.phone} | Prometido mensual: ${formatCurrency(selectedPerson.promisedAmount)}`;

  if (!selectedContributions.length) {
    monthlyTableBody.innerHTML = "<tr><td colspan='5'>No hay abonos registrados</td></tr>";
    return;
  }

  monthlyTableBody.innerHTML = "";
  selectedContributions.forEach((row) => {
    const promised = getPromisedAmountForMonth(selectedPerson, row.month);
    const paid = Number(row.amount || 0);
    const pending = promised - paid;
    const pendingLabel = pending > 0 ? formatCurrency(pending) : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${toMonthLabel(row.month)}</td>
      <td>${formatCurrency(promised)}</td>
      <td>${formatCurrency(paid)}</td>
      <td>${pendingLabel}</td>
      <td>
        <div class="inline-actions">
          <button class="btn btn-ghost" data-contribution-action="edit" data-month="${row.month}" type="button">Editar</button>
          <button class="btn btn-danger" data-contribution-action="delete" data-month="${row.month}" type="button">Eliminar</button>
        </div>
      </td>
    `;
    monthlyTableBody.appendChild(tr);
  });

  if (!totalPendingInfo.classList.contains("hidden")) {
    showAccumulatedPending();
  }
}

async function loadPeople() {
  const peopleRef = query(collection(db, "people"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(peopleRef);

  peopleCache = snapshot.docs.map((personDoc) => ({
    id: personDoc.id,
    ...personDoc.data()
  }));

  renderPeople();
}

peopleSearch.addEventListener("input", () => {
  isShowingAllPeople = false;
  renderPeople();
});

togglePeopleBtn.addEventListener("click", () => {
  isShowingAllPeople = !isShowingAllPeople;
  renderPeople();
});

viewTotalPendingBtn.addEventListener("click", () => {
  showAccumulatedPending();
});

async function loadPersonDetail(personId) {
  const personDocRef = doc(db, "people", personId);
  const personSnap = await getDoc(personDocRef);
  if (!personSnap.exists()) return;

  selectedPerson = { id: personId, ...personSnap.data() };

  const contributionsRef = query(
    collection(db, "people", personId, "contributions"),
    orderBy("month", "desc")
  );

  const contributionSnap = await getDocs(contributionsRef);
  selectedContributions = contributionSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  resetMonthlyForm();
  renderContributions();
}

async function loginWithAdmin(username, password) {
  if (username !== ADMIN_CONFIG.username || password !== ADMIN_CONFIG.password) {
    throw new Error("Credenciales incorrectas");
  }

  try {
    await signInWithEmailAndPassword(auth, ADMIN_CONFIG.email, password);
  } catch (error) {
    if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
      await createUserWithEmailAndPassword(auth, ADMIN_CONFIG.email, password);
      return;
    }
    throw error;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    await loginWithAdmin(username, password);
  } catch (error) {
    showLoginError(error.message || "Error al iniciar sesión");
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  selectedPerson = null;
  selectedContributions = [];
  detailSection.classList.add("hidden");
  totalPendingInfo.classList.add("hidden");
  totalPendingInfo.textContent = "";
  resetMonthlyForm();
});

personForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = personIdInput.value;
  const payload = {
    name: personName.value.trim(),
    phone: personPhone.value.trim(),
    promisedAmount: Number(personPromised.value)
  };

  if (!payload.name || !payload.phone || Number.isNaN(payload.promisedAmount)) {
    showPersonMessage("Completa los campos obligatorios", true);
    return;
  }

  try {
    if (id) {
      const personBeforeUpdate = peopleCache.find((item) => item.id === id) || selectedPerson || null;
      const promisedHistory = buildPromisedHistoryForUpdate(personBeforeUpdate, payload.promisedAmount);

      await updateDoc(doc(db, "people", id), {
        ...payload,
        promisedHistory,
        updatedAt: serverTimestamp()
      });
      showPersonMessage("Persona actualizada correctamente");
    } else {
      const currentMonth = getCurrentMonthValue();
      const created = await addDoc(collection(db, "people"), {
        ...payload,
        promisedHistory: [{ month: currentMonth, amount: payload.promisedAmount }],
        useRegistrationStart: true,
        createdAt: serverTimestamp()
      });

      const initialPayment = Number(personInitialPayment.value || 0);
      if (initialPayment > 0) {
        const currentMonth = new Date();
        const y = currentMonth.getFullYear();
        const m = String(currentMonth.getMonth() + 1).padStart(2, "0");
        const monthId = `${y}-${m}`;

        await setDoc(doc(db, "people", created.id, "contributions", monthId), {
          month: monthId,
          amount: initialPayment,
          updatedAt: serverTimestamp()
        });
      }

      showPersonMessage("Persona registrada correctamente");
    }

    clearPersonForm();
    await loadPeople();

    if (selectedPerson) {
      await loadPersonDetail(selectedPerson.id);
    }
  } catch (error) {
    showPersonMessage("Error guardando la persona", true);
  }
});

cancelEditBtn.addEventListener("click", () => {
  clearPersonForm();
});

peopleList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const action = target.dataset.action;
  const personId = target.dataset.id;
  if (!action || !personId) return;

  const person = peopleCache.find((item) => item.id === personId);
  if (!person) return;

  if (action === "select") {
    await loadPersonDetail(personId);
    return;
  }

  if (action === "edit") {
    personFormTitle.textContent = "Editar persona";
    personIdInput.value = person.id;
    personName.value = person.name || "";
    personPhone.value = person.phone || "";
    personPromised.value = person.promisedAmount || "";
    personInitialPayment.value = "";
    cancelEditBtn.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(`¿Eliminar a ${person.name}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
      await deletePerson(personId);

      if (selectedPerson?.id === personId) {
        selectedPerson = null;
        selectedContributions = [];
        detailSection.classList.add("hidden");
        totalPendingInfo.classList.add("hidden");
        totalPendingInfo.textContent = "";
      }

      if (personIdInput.value === personId) {
        clearPersonForm();
      }

      await loadPeople();
      showPersonMessage("Persona eliminada correctamente");
    } catch (error) {
      showPersonMessage("No se pudo eliminar la persona", true);
    }
  }
});

monthlyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedPerson) return;

  const month = monthlyMonth.value;
  const amount = Number(monthlyAmount.value);

  if (!month || Number.isNaN(amount) || amount < 0) return;

  try {
    if (editingContributionMonth) {
      const monthDocRef = doc(db, "people", selectedPerson.id, "contributions", editingContributionMonth);

      await setDoc(monthDocRef, {
        month: editingContributionMonth,
        amount,
        updatedAt: serverTimestamp()
      });

      showPersonMessage("Abono actualizado correctamente");
    } else {
      if (amount <= 0) return;

      const monthDocRef = doc(db, "people", selectedPerson.id, "contributions", month);
      const existingMonthSnap = await getDoc(monthDocRef);
      const currentPaid = existingMonthSnap.exists() ? Number(existingMonthSnap.data().amount || 0) : 0;
      const totalPaid = currentPaid + amount;

      await setDoc(monthDocRef, {
        month,
        amount: totalPaid,
        updatedAt: serverTimestamp()
      });

      showPersonMessage("Abono guardado correctamente");
    }

    resetMonthlyForm();
    await loadPersonDetail(selectedPerson.id);
  } catch (error) {
    showPersonMessage("Error guardando el abono mensual", true);
  }
});

cancelMonthlyEditBtn.addEventListener("click", () => {
  resetMonthlyForm();
});

monthlyTableBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const action = target.dataset.contributionAction;
  const month = target.dataset.month;
  if (!action || !month || !selectedPerson) return;

  const row = selectedContributions.find((contribution) => contribution.month === month);
  if (!row) return;

  if (action === "edit") {
    startMonthlyEdit(row);
    return;
  }

  if (action === "delete") {
    const monthLabel = toMonthLabel(month);
    const confirmed = window.confirm(
      `¿Eliminar el abono de ${monthLabel}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "people", selectedPerson.id, "contributions", month));
      if (editingContributionMonth === month) {
        resetMonthlyForm();
      }
      await loadPersonDetail(selectedPerson.id);
      showPersonMessage("Abono eliminado correctamente");
    } catch (error) {
      showPersonMessage("No se pudo eliminar el abono", true);
    }
  }
});

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

exportPdfBtn.addEventListener("click", async () => {
  if (!selectedPerson) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const logoData = await loadLogoForPdf();
  if (logoData) {
    pdf.addImage(logoData, "PNG", 14, 10, 26, 26);
  }

  pdf.setFontSize(20);
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.text("Reporte de misiones", pageWidth / 2, 20, { align: "center" });
  pdf.setFontSize(11);
  const { totalPending, startMonth, endMonth } = getAccumulatedPending();
  pdf.text(`Miembro: ${selectedPerson.name}`, 14, 44);
  pdf.text(`Teléfono: ${selectedPerson.phone}`, 14, 51);
  pdf.text(`Monto prometido mensual: ${formatCurrencyForPdf(selectedPerson.promisedAmount)}`, 14, 58);

  if (totalPending > 0) {
    pdf.setTextColor(163, 41, 41);
    pdf.setFont(undefined, "bold");
  } else {
    pdf.setTextColor(8, 53, 63);
    pdf.setFont(undefined, "normal");
  }

  pdf.text(
    `Pendiente acumulado (${toMonthLabel(startMonth)} - ${toMonthLabel(endMonth)}): ${formatCurrencyForPdf(totalPending)}`,
    14,
    65
  );

  pdf.setTextColor(8, 53, 63);
  pdf.setFont(undefined, "normal");

  const body = selectedContributions.map((row) => {
    const promised = getPromisedAmountForMonth(selectedPerson, row.month);
    const paid = Number(row.amount || 0);
    const pending = promised - paid;
    return [
      toMonthLabel(row.month),
      formatCurrencyForPdf(promised),
      formatCurrencyForPdf(paid),
      pending > 0 ? formatCurrencyForPdf(pending) : ""
    ];
  });

  pdf.autoTable({
    head: [["Mes", "Prometido", "Abonado", "Pendiente"]],
    body,
    startY: 73,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [12, 119, 121] }
  });

  const sanitizedName = selectedPerson.name.replace(/\s+/g, "_").toLowerCase();
  pdf.save(`reporte_misiones_${sanitizedName}.pdf`);
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    welcomeText.textContent = `Administrador: ${ADMIN_CONFIG.username}`;
    await loadPeople();
  } else {
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
    loginForm.reset();
    clearPersonForm();
    resetMonthlyForm();
    peopleList.innerHTML = "";
  }
});
