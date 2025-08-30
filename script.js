import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, getDoc, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCKZ-9QMY5ziW7uJIano6stDzHDKm8KqnE",
    authDomain: "salvapropagandas.firebaseapp.com",
    projectId: "salvapropagandas",
    storageBucket: "salvapropagandas.appspot.com",
    messagingSenderId: "285635693052",
    appId: "1:285635693052:web:260476698696d303be0a79"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let produtos = [];
let combos = [];
let precosBase = {};
let unsubscribeVendas;
let unsubscribeFluxoCaixa;
let storeSettings = {};
let isStoreOpen = true;
let initialVendasLoadComplete = false;

// --- NOVA ESTRUTURA PARA GERENCIAR O PEDIDO ---
let pedidoAtual = []; // Array para guardar os objetos de cada copo
let copoAtualIndex = 0; // Índice do copo que está sendo editado

const menuContainer = document.getElementById('menu-container');
const adminPanel = document.getElementById('admin-panel');
const whatsappBar = document.getElementById('whatsapp-bar');
const adminLoginBtn = document.getElementById('admin-login-button');
const adminLogoutBtn = document.getElementById('admin-logout-button');
const modalContainer = document.getElementById('modal-container');
const sendOrderBtnMobile = document.getElementById('send-order-button-mobile');
const sendOrderBtnDesktop = document.getElementById('send-order-button-desktop');

// Função para inicializar o pedido com um copo
function inicializarPedido() {
    pedidoAtual = [{
        tamanho: null,
        acompanhamentos: [],
        apenasAcai: false,
        observacoes: '',
        preco: 0
    }];
    copoAtualIndex = 0;
    document.getElementById('quantidade').value = 1;
    atualizarFormularioParaCopoAtual();
    renderizarResumoPedido();
    calcularValor();
}

function showModal(content, onOpen = () => {}) {
    let modalContent = content;
    if (typeof content === 'string') {
        modalContent = `<p class="text-lg text-gray-800 mb-6">${content}</p><button onclick="window.closeModal()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-8 rounded-lg transition-colors">OK</button>`;
    }
    modalContainer.innerHTML = `<div class="bg-white rounded-2xl p-6 w-full max-w-md text-center shadow-xl transform transition-all scale-95 opacity-0" id="modal-box">${modalContent}</div>`;
    modalContainer.classList.remove('hidden');
    setTimeout(() => { document.getElementById('modal-box').classList.remove('scale-95', 'opacity-0'); onOpen(); }, 10);
}

function closeModal() {
    const modalBox = document.getElementById('modal-box');
    if (modalBox) {
        modalBox.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { modalContainer.classList.add('hidden'); modalContainer.innerHTML = ''; }, 200);
    }
}

// ...
// (mesmo conteúdo anterior das funções principais de pedido e cálculo)
// ...

// 🔹 Atualização do relatório de vendas Admin
function carregarVendasAdmin(startDate, endDate) {
    initialVendasLoadComplete = false;
    const tableBody = document.getElementById('vendas-table-body');
    let q = query(collection(db, "vendas"), orderBy("timestamp", "desc"));

    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q = query(collection(db, "vendas"), where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "desc"));
    }

    if (unsubscribeVendas) unsubscribeVendas();

    unsubscribeVendas = onSnapshot(q, (snapshot) => {
        tableBody.innerHTML = '';
        let totalVendas = 0;

        snapshot.docs.forEach(docSnap => {
            const venda = { id: docSnap.id, ...docSnap.data() };
            const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
            if (!isNaN(valorNumerico)) totalVendas += valorNumerico;

            const data = venda.timestamp ? new Date(venda.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'N/A';
            const statusClass = venda.status === 'pendente' ? 'text-yellow-600' : 'text-green-600';

            let pedidoHTML = '';
            if (venda.itens && Array.isArray(venda.itens)) {
                pedidoHTML = venda.itens.map((item, index) => {
                    const acompText = (item.acompanhamentos || []).map(a => `${a.name}(x${a.quantity})`).join(', ');

                    let resumoAcomp = "";
                    if (item.acompanhamentos && item.acompanhamentos.length > 0) {
                        const totalPorcoes = item.acompanhamentos.reduce((sum, a) => sum + (a.quantity || 0), 0);
                        if (item.apenasAcai) {
                            resumoAcomp = `${totalPorcoes} extras`;
                        } else {
                            const inclusos = Math.min(totalPorcoes, 3);
                            const extras = Math.max(totalPorcoes - 3, 0);
                            resumoAcomp = `${inclusos} inclusos` + (extras > 0 ? ` + ${extras} extra(s)` : "");
                        }
                    } else {
                        resumoAcomp = item.apenasAcai ? "Somente Açaí" : "Nenhum acompanhamento";
                    }

                    const precoCopo = item.preco ? `R$${item.preco.toFixed(2).replace(".", ",")}` : "—";

                    return `
                        <div class="mb-2">
                            <strong>Copo ${index + 1} (${item.tamanho}):</strong><br>
                            <small class="text-gray-500">${acompText || resumoAcomp}</small><br>
                            <small class="text-blue-600 italic">Resumo: ${resumoAcomp}</small><br>
                            <small class="text-green-700 font-semibold">Valor: ${precoCopo}</small>
                        </div>
                    `;
                }).join('<hr class="my-1">');
            }

            tableBody.innerHTML += `
                <tr class="border-b">
                    <td class="p-3 text-sm font-mono">${venda.orderId || 'N/A'}</td>
                    <td class="p-3 text-sm">${data}</td>
                    <td class="p-3 text-sm font-semibold">${venda.nomeCliente || 'N/A'}<br><small class="text-gray-500 font-normal">${venda.telefoneCliente || ''}</small></td>
                    <td class="p-3 text-sm">${pedidoHTML}</td>
                    <td class="p-3 font-medium">${venda.total}</td>
                    <td class="p-3 font-semibold ${statusClass} capitalize">${venda.status}</td>
                </tr>`;
        });

        document.getElementById('total-vendas').innerText = `R$${totalVendas.toFixed(2).replace('.', ',')}`;
    });
}

// 🔹 Exportar relatório CSV
function exportarCSV(vendas) {
    let csvContent = "OrderID;Cliente;Telefone;Data;Copo;Resumo;Valor\n";

    vendas.forEach(venda => {
        if (venda.itens) {
            venda.itens.forEach((item, index) => {
                let resumoAcomp = "";
                if (item.acompanhamentos && item.acompanhamentos.length > 0) {
                    const totalPorcoes = item.acompanhamentos.reduce((sum, a) => sum + (a.quantity || 0), 0);
                    if (item.apenasAcai) {
                        resumoAcomp = `${totalPorcoes} extras`;
                    } else {
                        const inclusos = Math.min(totalPorcoes, 3);
                        const extras = Math.max(totalPorcoes - 3, 0);
                        resumoAcomp = `${inclusos} inclusos` + (extras > 0 ? ` + ${extras} extra(s)` : "");
                    }
                } else {
                    resumoAcomp = item.apenasAcai ? "Somente Açaí" : "Nenhum acompanhamento";
                }

                const precoCopo = item.preco ? `R$${item.preco.toFixed(2).replace(".", ",")}` : "—";
                const data = venda.timestamp ? new Date(venda.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'N/A';
                csvContent += `${venda.orderId};${venda.nomeCliente};${venda.telefoneCliente};${data};Copo ${index + 1} (${item.tamanho});${resumoAcomp};${precoCopo}\n`;
            });
        }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_vendas.csv`;
    link.click();
}

// 🔹 Exportar relatório PDF
async function exportarPDF(vendas) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("Relatório de Vendas", 10, 10);

    let y = 20;
    vendas.forEach(venda => {
        doc.setFontSize(10);
        doc.text(`Pedido: ${venda.orderId} | Cliente: ${venda.nomeCliente} | Telefone: ${venda.telefoneCliente}`, 10, y);
        y += 6;

        if (venda.itens) {
            venda.itens.forEach((item, index) => {
                let resumoAcomp = "";
                if (item.acompanhamentos && item.acompanhamentos.length > 0) {
                    const totalPorcoes = item.acompanhamentos.reduce((sum, a) => sum + (a.quantity || 0), 0);
                    if (item.apenasAcai) {
                        resumoAcomp = `${totalPorcoes} extras`;
                    } else {
                        const inclusos = Math.min(totalPorcoes, 3);
                        const extras = Math.max(totalPorcoes - 3, 0);
                        resumoAcomp = `${inclusos} inclusos` + (extras > 0 ? ` + ${extras} extra(s)` : "");
                    }
                } else {
                    resumoAcomp = item.apenasAcai ? "Somente Açaí" : "Nenhum acompanhamento";
                }

                const precoCopo = item.preco ? `R$${item.preco.toFixed(2).replace(".", ",")}` : "—";
                doc.text(`Copo ${index + 1} (${item.tamanho}) - ${resumoAcomp} - ${precoCopo}`, 15, y);
                y += 6;
            });
        }

        y += 4;
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
    });

    doc.save("relatorio_vendas.pdf");
}