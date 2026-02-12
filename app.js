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

const peopleList = document.getElementById("peopleList");

const detailSection = document.getElementById("detailSection");
const detailName = document.getElementById("detailName");
const detailMeta = document.getElementById("detailMeta");
const monthlyForm = document.getElementById("monthlyForm");
const monthlyMonth = document.getElementById("monthlyMonth");
const monthlyAmount = document.getElementById("monthlyAmount");
const monthlyTableBody = document.getElementById("monthlyTableBody");
const exportPdfBtn = document.getElementById("exportPdfBtn");

let peopleCache = [];
let selectedPerson = null;
let selectedContributions = [];

function formatCurrency(value) {
  const num = Number(value || 0);
  return num.toLocaleString("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 });
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

function toMonthLabel(yyyymm) {
  if (!yyyymm) return "";
  const [year, month] = yyyymm.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-CR", { month: "long", year: "numeric" });
}

function renderPeople() {
  if (!peopleCache.length) {
    peopleList.innerHTML = "<p class='person-meta'>No hay personas registradas todavía.</p>";
    return;
  }

  peopleList.innerHTML = "";
  peopleCache.forEach((person) => {
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
      </div>
    `;
    peopleList.appendChild(item);
  });
}

function renderContributions() {
  if (!selectedPerson) {
    detailSection.classList.add("hidden");
    return;
  }

  detailSection.classList.remove("hidden");
  detailName.textContent = selectedPerson.name;
  detailMeta.textContent = `Tel: ${selectedPerson.phone} | Prometido mensual: ${formatCurrency(selectedPerson.promisedAmount)}`;

  if (!selectedContributions.length) {
    monthlyTableBody.innerHTML = "<tr><td colspan='4'>No hay abonos registrados</td></tr>";
    return;
  }

  monthlyTableBody.innerHTML = "";
  selectedContributions.forEach((row) => {
    const promised = Number(selectedPerson.promisedAmount || 0);
    const paid = Number(row.amount || 0);
    const balance = promised - paid;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${toMonthLabel(row.month)}</td>
      <td>${formatCurrency(promised)}</td>
      <td>${formatCurrency(paid)}</td>
      <td>${formatCurrency(balance)}</td>
    `;
    monthlyTableBody.appendChild(tr);
  });
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
      await updateDoc(doc(db, "people", id), {
        ...payload,
        updatedAt: serverTimestamp()
      });
      showPersonMessage("Persona actualizada correctamente");
    } else {
      const created = await addDoc(collection(db, "people"), {
        ...payload,
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
  }
});

monthlyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedPerson) return;

  const month = monthlyMonth.value;
  const amount = Number(monthlyAmount.value);

  if (!month || Number.isNaN(amount)) return;

  try {
    await setDoc(doc(db, "people", selectedPerson.id, "contributions", month), {
      month,
      amount,
      updatedAt: serverTimestamp()
    });

    monthlyForm.reset();
    await loadPersonDetail(selectedPerson.id);
  } catch (error) {
    showPersonMessage("Error guardando el abono mensual", true);
  }
});

async function loadLogoForPdf() {
  try {
    const response = await fetch("assets/icpa_l.png");
    const svgText = await response.text();
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.src = url;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

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

  pdf.setFontSize(18);
  pdf.text("Reporte de misiones", 48, 20);
  pdf.setFontSize(11);
  pdf.text(`Persona: ${selectedPerson.name}`, 14, 44);
  pdf.text(`Teléfono: ${selectedPerson.phone}`, 14, 51);
  pdf.text(`Monto prometido mensual: ${formatCurrency(selectedPerson.promisedAmount)}`, 14, 58);

  const body = selectedContributions.map((row) => {
    const promised = Number(selectedPerson.promisedAmount || 0);
    const paid = Number(row.amount || 0);
    return [
      toMonthLabel(row.month),
      formatCurrency(promised),
      formatCurrency(paid),
      formatCurrency(promised - paid)
    ];
  });

  pdf.autoTable({
    head: [["Mes", "Prometido", "Abonado", "Saldo"]],
    body,
    startY: 66,
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
    peopleList.innerHTML = "";
  }
});
