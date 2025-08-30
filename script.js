// ===================== CONFIGURAÇÃO FIREBASE =====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===================== VARIÁVEIS GLOBAIS =====================
let pedidos = [];
let combos = [];
let acompanhamentos = [];
let vendas = [];
let caixa = [];

// ===================== FUNÇÕES DE UI =====================
function renderCombosMenu() {
  const container = document.getElementById('combos-container');
  const section = document.getElementById('combos-section');
  container.innerHTML = '';

  const combosAtivos = combos.filter(c => c.isActive !== false);

  if (combosAtivos.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  combosAtivos.forEach(combo => {
    container.innerHTML += `
      <div class="bg-gradient-to-br from-purple-100 to-pink-100 p-4 rounded-2xl shadow-md flex flex-col">
          <img src="${combo.imageUrl || 'https://placehold.co/600x400/f3e8ff/9333ea?text=Combo'}" 
               alt="${combo.name}" 
               class="combo-img mb-3">
          <h4 class="text-lg font-bold text-purple-800">${combo.name}</h4>
          <p class="text-sm text-gray-600 flex-grow">${combo.description}</p>
          <div class="flex justify-between items-center mt-3">
              <span class="text-xl font-bold text-green-600">R$${(combo.price || 0).toFixed(2).replace('.', ',')}</span>
              <button onclick="window.pedirCombo('${combo.id}')" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition">Pedir</button>
          </div>
      </div>
    `;
  });
}

// ===================== PEDIDOS =====================
window.pedirCombo = async (comboId) => {
  const combo = combos.find(c => c.id === comboId);
  if (!combo) return;

  const pedido = {
    id: Date.now().toString(),
    tipo: "combo",
    nome: combo.name,
    preco: combo.price,
    itens: combo.description,
    status: "pendente",
    data: new Date().toISOString()
  };

  pedidos.push(pedido);
  await addDoc(collection(db, "pedidos"), pedido);
  atualizarResumoPedidos();
  mostrarToast(`Pedido adicionado: ${combo.name}`);
};

function atualizarResumoPedidos() {
  const total = pedidos.reduce((acc, p) => acc + (p.preco || 0), 0);
  document.getElementById("valor-mobile").innerText = `R$${total.toFixed(2).replace('.', ',')}`;
}

// ===================== TOAST =====================
function mostrarToast(mensagem) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast-notification bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg mb-2";
  toast.innerText = mensagem;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===================== ADMIN - COMBOS =====================
async function carregarCombos() {
  const querySnapshot = await getDocs(collection(db, "combos"));
  combos = [];
  querySnapshot.forEach((docSnap) => {
    combos.push({ id: docSnap.id, ...docSnap.data() });
  });
  renderCombosMenu();
}

// ===================== ADMIN - PEDIDOS =====================
async function carregarPedidos() {
  const querySnapshot = await getDocs(collection(db, "pedidos"));
  pedidos = [];
  querySnapshot.forEach((docSnap) => {
    pedidos.push({ id: docSnap.id, ...docSnap.data() });
  });
  atualizarResumoPedidos();
}

// ===================== ADMIN - VENDAS =====================
async function carregarVendas() {
  const querySnapshot = await getDocs(collection(db, "vendas"));
  vendas = [];
  querySnapshot.forEach((docSnap) => {
    vendas.push({ id: docSnap.id, ...docSnap.data() });
  });
}

// ===================== ADMIN - CAIXA =====================
async function carregarCaixa() {
  const querySnapshot = await getDocs(collection(db, "caixa"));
  caixa = [];
  querySnapshot.forEach((docSnap) => {
    caixa.push({ id: docSnap.id, ...docSnap.data() });
  });
}

// ===================== EXPORTAÇÃO =====================
function exportarRelatorio() {
  const conteudo = JSON.stringify({ pedidos, vendas, caixa }, null, 2);
  const blob = new Blob([conteudo], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ===================== INICIALIZAÇÃO =====================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarCombos();
  await carregarPedidos();
  await carregarVendas();
  await carregarCaixa();

  // Botão de exportação visível
  const exportBtn = document.createElement("button");
  exportBtn.innerText = "Exportar Relatório";
  exportBtn.className = "fixed bottom-4 left-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow";
  exportBtn.onclick = exportarRelatorio;
  document.body.appendChild(exportBtn);
});
