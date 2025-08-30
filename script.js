import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, getDoc, setDoc, runTransaction, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
let pedidoAtual = []; // Array para armazenar os copos do pedido (carrinho)
let unsubscribeVendas;
let unsubscribeFluxoCaixa;
let storeSettings = {};
let isStoreOpen = true;
let initialVendasLoadComplete = false;

const menuContainer = document.getElementById('menu-container');
const adminPanel = document.getElementById('admin-panel');
const whatsappBar = document.getElementById('whatsapp-bar');
const adminLoginBtn = document.getElementById('admin-login-button');
const adminLogoutBtn = document.getElementById('admin-logout-button');
const modalContainer = document.getElementById('modal-container');
const addCupBtn = document.getElementById('add-cup-button');
const updateCupBtn = document.getElementById('update-cup-button');
const sendOrderBtnMobile = document.getElementById('send-order-button-mobile');
const sendOrderBtnDesktop = document.getElementById('send-order-button-desktop');

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
window.closeModal = closeModal;

onAuthStateChanged(auth, user => {
    if (user) {
        adminLoginBtn.classList.add('hidden'); adminLogoutBtn.classList.remove('hidden'); menuContainer.classList.add('hidden'); whatsappBar.classList.add('hidden'); adminPanel.classList.remove('hidden');
        renderAdminPanel();
    } else {
        adminLoginBtn.classList.remove('hidden'); adminLogoutBtn.classList.add('hidden'); menuContainer.classList.remove('hidden'); whatsappBar.classList.remove('hidden'); adminPanel.classList.add('hidden');
        if (unsubscribeVendas) unsubscribeVendas();
        if (unsubscribeFluxoCaixa) unsubscribeFluxoCaixa();
        initialVendasLoadComplete = false;
    }
});

adminLoginBtn.addEventListener('click', () => {
    const loginFormHTML = `<h3 class="text-xl font-bold mb-4">Login Admin</h3><input type="email" id="email" placeholder="Email" class="w-full p-2 border rounded mb-2"><input type="password" id="password" placeholder="Senha" class="w-full p-2 border rounded mb-4"><button id="login-submit" class="bg-purple-600 text-white px-6 py-2 rounded-lg">Entrar</button><button onclick="window.closeModal()" class="bg-gray-300 px-4 py-2 rounded-lg ml-2">Cancelar</button>`;
    showModal(loginFormHTML, () => {
         document.getElementById('login-submit').addEventListener('click', async () => {
            try { await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); closeModal(); } catch (error) { console.error("Erro de login:", error); alert("Email ou senha inválidos."); }
        });
    });
});
adminLogoutBtn.addEventListener('click', () => signOut(auth));

function renderMenu() {
    const containers = { tamanho: document.getElementById('tamanhos-container'), fruta: document.getElementById('frutas-container'), creme: document.getElementById('cremes-container'), outro: document.getElementById('outros-container') };
    Object.values(containers).forEach(c => c.innerHTML = '');
    precosBase = {};
    const produtosVisiveis = produtos.filter(p => p.category !== 'insumo' && p.isActive !== false);
    if (produtosVisiveis.length === 0) { Object.values(containers).forEach(c => c.innerHTML = '<p class="text-red-500 text-sm col-span-2">Nenhum item. Faça login como admin para adicionar produtos.</p>'); return; }
    
    produtosVisiveis.forEach(p => {
        const pId = p.name.replace(/[^a-zA-Z0-9]/g, '');
        if (p.category === 'tamanho') {
            precosBase[p.name] = p.price;
            containers.tamanho.innerHTML += `<label class="flex items-center justify-between bg-purple-100 px-4 py-3 rounded-2xl shadow cursor-pointer hover:bg-purple-200 transition"><div><span class="font-medium text-gray-800">${p.name}</span><span class="ml-3 text-sm text-gray-600">R$${p.price.toFixed(2)}</span></div><input type="radio" name="tamanho" value="${p.name}" class="accent-pink-500"></label>`;
        } else {
            const bgColor = p.category === 'fruta' ? 'bg-pink-100 hover:bg-pink-200' : p.category === 'creme' ? 'bg-purple-100 hover:bg-purple-200' : 'bg-violet-200 hover:bg-violet-300';
            const accentColor = p.category === 'fruta' ? 'accent-purple-600' : 'accent-pink-600';
            if(containers[p.category]) { 
                containers[p.category].innerHTML += `
                <label class="flex items-center ${bgColor} px-3 py-2 rounded-xl shadow cursor-pointer">
                    <img src="${p.iconUrl}" alt="${p.name}" class="card-img flex-shrink-0" onerror="this.style.display='none'">
                    <input type="checkbox" value="${p.name}" data-qty-target="qty-${pId}" class="acompanhamento-check mx-2 ${accentColor} flex-shrink-0">
                    <span class="flex-grow truncate">${p.name}</span>
                    <input type="number" value="1" min="1" id="qty-${pId}" class="acompanhamento-qty w-14 text-center border rounded-md hidden p-1 ml-2 flex-shrink-0">
                </label>`;
            }
        }
    });

    document.querySelectorAll('.acompanhamento-check').forEach(check => {
        check.addEventListener('change', (e) => {
            const qtyInput = document.getElementById(e.target.dataset.qtyTarget);
            if (e.target.checked) {
                qtyInput.classList.remove('hidden');
                qtyInput.value = 1;
            } else {
                qtyInput.classList.add('hidden');
            }
            calcularValorCopo();
        });
    });
    document.querySelectorAll('input, textarea').forEach(el => { el.addEventListener("change", calcularValorCopo); el.addEventListener("input", calcularValorCopo); });
    document.getElementById('apenas-acai-check').addEventListener('change', calcularValorCopo);
}

function renderCombosMenu() {
    const container = document.getElementById('combos-container');
    const section = document.getElementById('combos-section');
    container.innerHTML = '';
    const combosAtivos = combos.filter(c => c.isActive !== false);

    if(combosAtivos.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    combosAtivos.forEach(combo => {
        container.innerHTML += `
            <div class="bg-gradient-to-br from-purple-100 to-pink-100 p-4 rounded-2xl shadow-md flex flex-col">
                <img src="${combo.imageUrl || 'https://placehold.co/600x400/f3e8ff/9333ea?text=Combo'}" alt="${combo.name}" class="w-full h-32 object-cover rounded-lg mb-3">
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

function calcularValorCopo() {
    const tamanhoEl = document.querySelector('input[name="tamanho"]:checked');
    const apenasAcai = document.getElementById('apenas-acai-check').checked;
    const rulesText = document.getElementById('acompanhamentos-rules');
    let total = 0;

    if (tamanhoEl) {
        const tamanho = tamanhoEl.value;
        let totalPorcoes = 0;
        document.querySelectorAll('.acompanhamento-check:checked').forEach(check => {
            const qtyInput = document.getElementById(check.dataset.qtyTarget);
            totalPorcoes += parseInt(qtyInput.value) || 0;
        });

        let precoBase = precosBase[tamanho] || 0;
        let adicionais = 0;
        
        if (apenasAcai) {
            adicionais = totalPorcoes * 3;
            rulesText.textContent = 'Todos os acompanhamentos são cobrados como extra (R$3 cada).';
        } else {
            adicionais = totalPorcoes > 3 ? (totalPorcoes - 3) * 3 : 0;
            rulesText.textContent = '3 porções por copo | Adicional R$3 por porção extra';
        }
        total = precoBase + adicionais;
    }
    document.getElementById("valor-copo").innerText = "R$" + total.toFixed(2).replace(".", ",");
    return total;
}

function calcularValorTotalPedido() {
    const total = pedidoAtual.reduce((acc, copo) => acc + copo.valor, 0);
    const totalText = "R$" + total.toFixed(2).replace(".", ",");
    document.getElementById("valor-mobile").innerText = totalText;
    document.getElementById("valor-desktop").innerText = totalText;

    const hasItems = pedidoAtual.length > 0;
    sendOrderBtnMobile.disabled = !hasItems;
    sendOrderBtnDesktop.disabled = !hasItems;
}

function resetarFormularioCopo() {
    document.querySelector('#cup-builder').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('editing-cup-index').value = '';
    document.querySelectorAll('input[name="tamanho"]:checked').forEach(el => el.checked = false);
    document.querySelectorAll('.acompanhamento-check:checked').forEach(el => {
        el.checked = false;
        const qtyInput = document.getElementById(el.dataset.qtyTarget);
        if (qtyInput) {
             qtyInput.classList.add('hidden');
             qtyInput.value = 1;
        }
    });
    document.getElementById('observacoes').value = '';
    document.getElementById('apenas-acai-check').checked = false;
    
    document.getElementById('builder-title').innerText = `Monte seu ${pedidoAtual.length + 1}º Copo`;
    addCupBtn.classList.remove('hidden');
    updateCupBtn.classList.add('hidden');
    
    calcularValorCopo();
}

function renderizarPedidoAtual() {
    const container = document.getElementById('order-summary-container');
    container.innerHTML = '';
    if (pedidoAtual.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Seu pedido está vazio. Monte um copo e clique em "Adicionar ao Pedido".</p>';
    } else {
        pedidoAtual.forEach((copo, index) => {
            const acompanhamentosText = copo.acompanhamentos.map(a => `${a.name}(x${a.quantity})`).join(', ') || (copo.apenasAcai ? 'Apenas Açaí' : 'Nenhum');
            container.innerHTML += `
                <div class="bg-white p-3 rounded-lg shadow-sm border border-purple-200">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-bold text-purple-800">${index + 1}. ${copo.tamanho}</p>
                            <p class="text-xs text-gray-600">${acompanhamentosText}</p>
                            ${copo.observacoes ? `<p class="text-xs text-blue-600 italic">Obs: ${copo.observacoes}</p>` : ''}
                        </div>
                        <div class="flex items-center">
                            <span class="font-semibold text-gray-800 mr-3">R$${copo.valor.toFixed(2).replace('.',',')}</span>
                            <button onclick="window.editarCopo(${index})" class="text-blue-500 hover:text-blue-700 p-1">✏️</button>
                            <button onclick="window.deletarCopo(${index})" class="text-red-500 hover:text-red-700 p-1">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    calcularValorTotalPedido();
}

addCupBtn.addEventListener('click', () => {
    const tamanhoEl = document.querySelector('input[name="tamanho"]:checked');
    if (!tamanhoEl) { showModal("Por favor, selecione o tamanho do copo!"); return; }

    const apenasAcai = document.getElementById('apenas-acai-check').checked;
    const acompanhamentos = Array.from(document.querySelectorAll('.acompanhamento-check:checked')).map(check => ({
        name: check.value,
        quantity: parseInt(document.getElementById(check.dataset.qtyTarget).value)
    }));
    
    if (!apenasAcai && acompanhamentos.length === 0) { showModal("Por favor, selecione ao menos 1 acompanhamento ou marque 'Somente Açaí'."); return; }
    
    const novoCopo = {
        tamanho: tamanhoEl.value,
        acompanhamentos: acompanhamentos,
        observacoes: document.getElementById('observacoes').value.trim(),
        apenasAcai: apenasAcai,
        valor: calcularValorCopo()
    };
    
    pedidoAtual.push(novoCopo);
    renderizarPedidoAtual();
    resetarFormularioCopo();
});

updateCupBtn.addEventListener('click', () => {
    const index = parseInt(document.getElementById('editing-cup-index').value);
    if (index < 0 || index >= pedidoAtual.length) return;
    
    const tamanhoEl = document.querySelector('input[name="tamanho"]:checked');
    if (!tamanhoEl) { showModal("Por favor, selecione o tamanho do copo!"); return; }

    const apenasAcai = document.getElementById('apenas-acai-check').checked;
    const acompanhamentos = Array.from(document.querySelectorAll('.acompanhamento-check:checked')).map(check => ({
        name: check.value,
        quantity: parseInt(document.getElementById(check.dataset.qtyTarget).value)
    }));
    
    if (!apenasAcai && acompanhamentos.length === 0) { showModal("Por favor, selecione ao menos 1 acompanhamento ou marque 'Somente Açaí'."); return; }
    
    pedidoAtual[index] = {
        tamanho: tamanhoEl.value,
        acompanhamentos: acompanhamentos,
        observacoes: document.getElementById('observacoes').value.trim(),
        apenasAcai: apenasAcai,
        valor: calcularValorCopo()
    };

    renderizarPedidoAtual();
    resetarFormularioCopo();
});


window.editarCopo = (index) => {
    const copo = pedidoAtual[index];
    if (!copo) return;

    document.querySelector('#cup-builder').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('editing-cup-index').value = index;

    // Resetar campos antes de popular
    resetarFormularioCopo();
    document.getElementById('editing-cup-index').value = index; // Manter o index

    // Popular
    document.querySelector(`input[name="tamanho"][value="${copo.tamanho}"]`).checked = true;
    document.getElementById('apenas-acai-check').checked = copo.apenasAcai;
    document.getElementById('observacoes').value = copo.observacoes;

    copo.acompanhamentos.forEach(acomp => {
        const check = document.querySelector(`.acompanhamento-check[value="${acomp.name}"]`);
        if (check) {
            check.checked = true;
            const qtyInput = document.getElementById(check.dataset.qtyTarget);
            qtyInput.value = acomp.quantity;
            qtyInput.classList.remove('hidden');
        }
    });

    document.getElementById('builder-title').innerText = `Editando Copo ${index + 1}`;
    addCupBtn.classList.add('hidden');
    updateCupBtn.classList.remove('hidden');
    calcularValorCopo();
}

window.deletarCopo = (index) => {
    pedidoAtual.splice(index, 1);
    renderizarPedidoAtual();
    resetarFormularioCopo();
}


function handleOrderAction() {
    if (isStoreOpen) { enviarPedido(); } else { showModal(storeSettings.mensagemFechado || "Desculpe, estamos fechados no momento."); }
}
sendOrderBtnMobile.addEventListener('click', handleOrderAction);
sendOrderBtnDesktop.addEventListener('click', handleOrderAction);

async function enviarPedido() {
    if (!isStoreOpen || pedidoAtual.length === 0) return;
    
    const nomeCliente = document.getElementById('nome-cliente').value.trim();
    if (!nomeCliente) { showModal("Por favor, digite seu nome!"); return; }
    const telefoneCliente = document.getElementById('telefone-cliente').value.trim();
    if (!telefoneCliente) { showModal("Por favor, digite seu telefone!"); return; }
    
    const counterRef = doc(db, "configuracoes", "dailyCounter");
    let orderId;
    try {
        orderId = await runTransaction(db, async (transaction) => {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;
            const displayDate = `${dd}${mm}`;

            const counterDoc = await transaction.get(counterRef);
            let newCount = 1;
            if (counterDoc.exists() && counterDoc.data().lastOrderDate === todayStr) {
                newCount = counterDoc.data().lastOrderNumber + 1;
            }
            
            transaction.set(counterRef, { lastOrderNumber: newCount, lastOrderDate: todayStr });
            const paddedCount = String(newCount).padStart(3, '0');
            return `${displayDate}-${paddedCount}`;
        });
    } catch (e) {
        console.error("Transaction failed: ", e);
        showModal("Não foi possível gerar o ID do pedido. Tente novamente.");
        return;
    }

    const numero = storeSettings.whatsappNumber || "5514991962607";
    let coposText = "";
    pedidoAtual.forEach((copo, index) => {
        const acompanhamentosText = copo.acompanhamentos.map(a => `- ${a.name} (x${a.quantity})`).join("\n") || "- Nenhum (Somente Açaí)";
        coposText += `\n\n*COPO ${index + 1}: Açaí ${copo.tamanho} (R$${copo.valor.toFixed(2).replace('.',',')})*`
                   + `\n*Acompanhamentos:*\n${acompanhamentosText}`
                   + `${copo.observacoes ? `\n📝 *Observações:* ${copo.observacoes}` : ''}`;
    });

    const valorTotal = document.getElementById("valor-mobile").innerText;
    const msg = `*Novo Pedido: ${orderId}*\n\n*Cliente:* ${nomeCliente}\n*Telefone:* ${telefoneCliente}`
              + `${coposText}`
              + `\n\n-----------------------\n*💰 VALOR TOTAL: ${valorTotal}*`;
    
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");

    try { 
        const batch = writeBatch(db);
        const timestamp = serverTimestamp();

        pedidoAtual.forEach(copo => {
            const vendaRef = doc(collection(db, "vendas"));
            batch.set(vendaRef, {
                orderId,
                nomeCliente,
                telefoneCliente,
                tamanho: copo.tamanho,
                quantidade: 1, // Sempre 1 pois cada copo é um doc
                acompanhamentos: copo.acompanhamentos,
                observacoes: copo.observacoes || "Nenhuma",
                total: `R$${copo.valor.toFixed(2)}`, // Salva o valor individual do copo
                status: "pendente",
                timestamp: timestamp
            });
        });

        await batch.commit();
        showModal("Pedido enviado com sucesso! Agradecemos a preferência.");
        
        // Resetar tudo após o envio
        pedidoAtual = [];
        document.getElementById('nome-cliente').value = '';
        document.getElementById('telefone-cliente').value = '';
        renderizarPedidoAtual();
        resetarFormularioCopo();
        
    } catch (e) { 
        console.error("Erro ao salvar venda: ", e); 
        showModal("Ocorreu um erro ao salvar seu pedido no nosso sistema, mas você pode enviá-lo pelo WhatsApp."); 
    }
}
    
window.pedirCombo = async (comboId) => {
    if (!isStoreOpen) {
        showModal(storeSettings.mensagemFechado || "Desculpe, estamos fechados no momento.");
        return;
    }
    const combo = combos.find(c => c.id === comboId);
    if (!combo) return;

    const nomeCliente = document.getElementById('nome-cliente').value.trim();
    if (!nomeCliente) { showModal("Por favor, preencha seu nome no formulário principal antes de pedir um combo!"); return; }
    const telefoneCliente = document.getElementById('telefone-cliente').value.trim();
    if (!telefoneCliente) { showModal("Por favor, preencha seu telefone no formulário principal antes de pedir um combo!"); return; }
    
    const counterRef = doc(db, "configuracoes", "dailyCounter");
    let orderId;
    try {
        orderId = await runTransaction(db, async (transaction) => {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;
            const displayDate = `${dd}${mm}`;

            const counterDoc = await transaction.get(counterRef);
            let newCount = 1;
            if (counterDoc.exists() && counterDoc.data().lastOrderDate === todayStr) {
                newCount = counterDoc.data().lastOrderNumber + 1;
            }
            
            transaction.set(counterRef, { lastOrderNumber: newCount, lastOrderDate: todayStr });
            const paddedCount = String(newCount).padStart(3, '0');
            return `${displayDate}-${paddedCount}`;
        });
    } catch (e) {
        console.error("Transaction failed: ", e);
        showModal("Não foi possível gerar o ID do pedido. Tente novamente.");
        return;
    }

    const numero = storeSettings.whatsappNumber || "5514991962607";
    const valor = `R$${(combo.price || 0).toFixed(2).replace('.', ',')}`;
    const msg = `*Pedido de Combo: ${orderId}*\n\n*Cliente:* ${nomeCliente}\n*Telefone:* ${telefoneCliente}\n\nOlá! Gostaria de pedir o *${combo.name}*.\n\n*Descrição:* ${combo.description || ''}\n\n💰 *Valor Total: ${valor}*`;
    
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");

    try {
        const vendaData = {
            orderId,
            nomeCliente,
            telefoneCliente,
            pedidoCombo: combo.name,
            observacoes: combo.description || "",
            total: valor,
            status: "pendente",
            timestamp: serverTimestamp(),
            tamanho: "",
            quantidade: 1,
            acompanhamentos: []
        };
        await addDoc(collection(db, "vendas"), vendaData);
        showModal("Pedido do combo enviado com sucesso! Agradecemos a preferência.");
    } catch (e) {
        console.error("Erro ao salvar venda do combo: ", e);
        showModal("Ocorreu um erro ao salvar seu pedido no nosso sistema, mas você pode enviá-lo pelo WhatsApp.");
    }
};

// ... O restante do seu código JS (funções do painel admin, etc.) permanece aqui...
// A única função que precisa de uma grande mudança é a carregarVendasAdmin()

// ==========================================================
// PAINEL ADMIN - INÍCIO
// ==========================================================
function renderAdminPanel() {
    adminPanel.innerHTML = `
        <h2 class="text-3xl font-bold text-center text-purple-800 mb-6">Painel de Administração</h2>
        <div class="flex border-b mb-4 overflow-x-auto no-scrollbar">
            <button id="tab-produtos" class="tab-btn py-2 px-4 font-semibold border-b-2 tab-active flex-shrink-0">Gerenciar Produtos</button>
            <button id="tab-combos" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Gerenciar Combos</button>
            <button id="tab-vendas" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Relatório de Vendas</button>
            <button id="tab-caixa" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Fluxo de Caixa</button>
            <button id="tab-config" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Configurações</button>
        </div>
        <div id="content-produtos"></div>
        <div id="content-combos" class="hidden"></div>
        <div id="content-vendas" class="hidden"></div>
        <div id="content-caixa" class="hidden"></div>
        <div id="content-config" class="hidden"></div>
    `;
    renderProdutosAdmin();
    renderCombosAdmin();
    renderVendasAdmin();
    renderCaixaAdmin();
    renderConfigAdmin();
    
    const tabs = { produtos: document.getElementById('tab-produtos'), combos: document.getElementById('tab-combos'), vendas: document.getElementById('tab-vendas'), caixa: document.getElementById('tab-caixa'), config: document.getElementById('tab-config') };
    const contents = { produtos: document.getElementById('content-produtos'), combos: document.getElementById('content-combos'), vendas: document.getElementById('content-vendas'), caixa: document.getElementById('content-caixa'), config: document.getElementById('content-config') };

    Object.keys(tabs).forEach(key => {
        tabs[key].addEventListener('click', () => {
            Object.values(tabs).forEach(t => t.classList.remove('tab-active'));
            Object.values(contents).forEach(c => c.classList.add('hidden'));
            tabs[key].classList.add('tab-active');
            contents[key].classList.remove('hidden');
        });
    });
}

// ... (renderProdutosAdmin, renderCombosAdmin, e todas as funções de salvar/carregar/deletar produtos e combos continuam as mesmas)
// COLE SEU CÓDIGO EXISTENTE PARA ESSAS FUNÇÕES AQUI

// ATUALIZAÇÃO NECESSÁRIA PARA A FUNÇÃO carregarVendasAdmin E CONFIRM/DELETE
function renderVendasAdmin() {
    document.getElementById('content-vendas').innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Relatório de Vendas</h3><div class="flex flex-wrap gap-4 items-center mb-4 p-4 border rounded-lg"><label for="start-date">De:</label><input type="date" id="start-date" class="p-2 border rounded"><label for="end-date">Até:</label><input type="date" id="end-date" class="p-2 border rounded"><button id="gerar-relatorio-btn" class="bg-blue-500 text-white p-2 rounded hover:bg-blue-600">Gerar Relatório</button></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-gray-100"><tr><th class="p-3">Pedido</th><th class="p-3">Item</th><th class="p-3">Financeiro</th><th class="p-3">Status</th><th class="p-3">Ações</th></tr></thead><tbody id="vendas-table-body"></tbody></table></div><div class="mt-4 text-right pr-4"><h4 class="text-xl font-bold text-gray-800">Total das Vendas (Período): <span id="total-vendas" class="text-purple-700">R$0,00</span></h4></div></div>`;
    document.getElementById('gerar-relatorio-btn').addEventListener('click', () => carregarVendasAdmin(document.getElementById('start-date').value, document.getElementById('end-date').value));
    carregarVendasAdmin();
}


function calcularCustoPedido(venda) {
    let custoTotal = 0;
    const tamanhoProduto = produtos.find(p => p.name === venda.tamanho && p.category === 'tamanho');

    if (tamanhoProduto) {
        custoTotal += tamanhoProduto.cost || 0;
        if (tamanhoProduto.recipe) {
            tamanhoProduto.recipe.forEach(ingrediente => {
                const insumoData = produtos.find(p => p.name === ingrediente.name && p.category === 'insumo');
                if (insumoData) {
                    custoTotal += (ingrediente.quantity || 0) * (insumoData.cost || 0);
                }
            });
        }
    }

    if (venda.acompanhamentos) {
        venda.acompanhamentos.forEach(itemPedido => {
            const acompanhamentoProduto = produtos.find(p => p.name === itemPedido.name);
            if (acompanhamentoProduto) {
                custoTotal += (itemPedido.quantity || 0) * (acompanhamentoProduto.cost || 0);
            }
        });
    }
    
    custoTotal *= (venda.quantidade || 1);

    const valorVenda = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
    const lucro = valorVenda - custoTotal;

    return { custoTotal, lucro };
}


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
        if (initialVendasLoadComplete && snapshot.docChanges().some(change => change.type === 'added')) {
            playNotificationSound();
            showToast("Novo Pedido Recebido!");
            document.getElementById('tab-vendas').click();
        }
        
        let totalVendas = 0;
        const pedidosAgrupados = new Map();

        snapshot.docs.forEach(docSnap => {
            const venda = { id: docSnap.id, ...docSnap.data() };
            const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
            if (!isNaN(valorNumerico)) { totalVendas += valorNumerico; }

            if (!pedidosAgrupados.has(venda.orderId)) {
                pedidosAgrupados.set(venda.orderId, {
                    cliente: venda.nomeCliente,
                    telefone: venda.telefoneCliente,
                    timestamp: venda.timestamp,
                    itens: [],
                    status: 'pendente', // Assume pendente, muda se algum item for concluído
                    valorTotal: 0
                });
            }
            const pedido = pedidosAgrupados.get(venda.orderId);
            pedido.itens.push(venda);
            if(venda.status === 'concluida') pedido.status = 'concluida';
            pedido.valorTotal += valorNumerico;
        });

        tableBody.innerHTML = '';
        if (pedidosAgrupados.size === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Nenhuma venda encontrada.</td></tr>';
        } else {
            for (const [orderId, pedido] of pedidosAgrupados.entries()) {
                const data = pedido.timestamp ? new Date(pedido.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'N/A';
                const statusClass = pedido.status === 'pendente' ? 'text-yellow-600' : 'text-green-600';
                
                const masterRowHTML = `
                    <tr class="bg-gray-50 border-b-2 border-gray-300">
                        <td class="p-3 font-bold">
                            <span class="block text-purple-800">${orderId || 'N/A'}</span>
                            <span class="block text-sm font-semibold">${pedido.cliente || 'N/A'}</span>
                            <span class="block text-xs font-normal text-gray-500">${data}</span>
                        </td>
                        <td colspan="2" class="p-3 text-right font-bold text-lg text-purple-800">
                            Total Pedido: R$${pedido.valorTotal.toFixed(2).replace('.',',')}
                        </td>
                         <td class="p-3 font-semibold ${statusClass} capitalize">${pedido.status}</td>
                        <td class="p-3">
                            ${pedido.status === 'pendente' ? `<button class="confirm-venda-btn bg-green-500 text-white px-2 py-1 rounded text-xs" data-order-id="${orderId}">✔️ Confirmar</button>` : ''}
                            <button class="delete-venda-btn bg-red-500 text-white px-2 py-1 rounded text-xs ml-1" data-order-id="${orderId}">🗑️ Excluir</button>
                        </td>
                    </tr>
                `;
                tableBody.innerHTML += masterRowHTML;
                
                pedido.itens.forEach(item => {
                    let itemHTML = '';
                    let financeiroHTML = '';
                    if (item.tamanho) { // É um copo
                        itemHTML = `${item.tamanho}<br><small class="text-gray-500">${(item.acompanhamentos || []).map(a => `${a.name}(x${a.quantity})`).join(', ')}</small><br><small class="text-blue-500 font-semibold">Obs: ${item.observacoes}</small>`;
                        const { custoTotal, lucro } = calcularCustoPedido(item);
                        financeiroHTML = `Venda: ${item.total}<br><small class="text-red-500">Custo: R$${custoTotal.toFixed(2)}</small><br><strong class="text-green-600">Lucro: R$${lucro.toFixed(2)}</strong>`;
                    } else if (item.pedidoCombo) { // É um combo
                        itemHTML = `<strong>Combo:</strong> ${item.pedidoCombo}<br><small class="text-gray-500">${item.observacoes}</small>`;
                        financeiroHTML = `Venda: ${item.total}<br><small class="text-gray-500">Custo/Lucro não aplicável</small>`;
                    }

                    tableBody.innerHTML += `
                        <tr class="border-b">
                            <td class="p-3"></td>
                            <td class="p-3 text-sm">${itemHTML}</td>
                            <td class="p-3 font-medium">${financeiroHTML}</td>
                            <td colspan="2"></td>
                        </tr>
                    `;
                });
            }
        }
        
        document.getElementById('total-vendas').innerText = `R$${totalVendas.toFixed(2).replace('.', ',')}`;

        document.querySelectorAll('.confirm-venda-btn').forEach(btn => btn.addEventListener('click', e => confirmarVenda(e.currentTarget.dataset.orderId)));
        document.querySelectorAll('.delete-venda-btn').forEach(btn => btn.addEventListener('click', e => deletarVenda(e.currentTarget.dataset.orderId)));
        
        if (!initialVendasLoadComplete) {
            setTimeout(() => { initialVendasLoadComplete = true; }, 2000);
        }
    });
}

async function confirmarVenda(orderId) {
    if(!orderId) return;

    const q = query(collection(db, "vendas"), where("orderId", "==", orderId), where("status", "==", "pendente"));
    const querySnapshot = await getDocs(q);
    
    if(querySnapshot.empty) return;

    let valorTotalPedido = 0;
    let descricaoPedido = `Venda Pedido #${orderId}`;

    querySnapshot.forEach(docSnap => {
        const venda = docSnap.data();
        const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
        if(!isNaN(valorNumerico)) valorTotalPedido += valorNumerico;
    });

    try {
        await addDoc(collection(db, "fluxoCaixa"), {
            descricao: descricaoPedido,
            valor: valorTotalPedido,
            tipo: 'entrada',
            timestamp: serverTimestamp()
        });

        const batch = writeBatch(db);
        querySnapshot.forEach(docSnap => {
            batch.update(docSnap.ref, { status: 'concluida' });
        });
        await batch.commit();
    } catch (error) {
        console.error("Erro ao confirmar venda: ", error);
        showModal("Ocorreu um erro ao confirmar a venda.");
    }
}

async function deletarVenda(orderId) {
    if(!orderId) return;

    const confirmationHTML = `<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir TODOS os itens do pedido ${orderId}?</p><button id="confirm-delete-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 px-4 py-2 rounded-lg ml-2">Cancelar</button>`;
    
    showModal(confirmationHTML, () => {
        document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
            try {
                const q = query(collection(db, "vendas"), where("orderId", "==", orderId));
                const querySnapshot = await getDocs(q);
                
                const batch = writeBatch(db);
                querySnapshot.forEach(docSnap => {
                    batch.delete(docSnap.ref);
                });
                await batch.commit();
                
                closeModal();
            } catch (error) {
                console.error("Erro ao excluir venda:", error);
                closeModal();
                showModal('Ocorreu um erro ao excluir a venda.');
            }
        });
    });
}
// ==========================================================
// COLE AQUI O RESTANTE DAS SUAS FUNÇÕES DO PAINEL ADMIN
// Ex: renderConfigAdmin, renderCaixaAdmin, salvarProduto, carregarProdutosAdmin, etc.
// Elas não precisam de alterações.
// ==========================================================
 async function salvarConfiguracoes() {
        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const settings = { 
            mensagemFechado: document.getElementById('mensagem-fechado').value,
            whatsappNumber: document.getElementById('whatsapp-number').value
        };
        dias.forEach(dia => { settings[dia] = { aberto: document.getElementById(`${dia}-aberto`).checked, abertura: document.getElementById(`${dia}-abertura`).value, fechamento: document.getElementById(`${dia}-fechamento`).value, }; });
        try { 
            await setDoc(doc(db, "configuracoes", "horarios"), settings); 
            storeSettings = settings;
            checkStoreOpen();
            showModal('Configurações salvas com sucesso!'); 
        } catch (error) { console.error("Erro ao salvar configurações:", error); showModal('Erro ao salvar as configurações.'); }
    }

    async function carregarConfiguracoesAdmin() {
        const docRef = doc(db, "configuracoes", "horarios");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const settings = docSnap.data();
            document.getElementById('whatsapp-number').value = settings.whatsappNumber || '';
            document.getElementById('mensagem-fechado').value = settings.mensagemFechado || '';
            const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
            dias.forEach(dia => {
                if (settings[dia]) {
                    document.getElementById(`${dia}-aberto`).checked = settings[dia].aberto;
                    document.getElementById(`${dia}-abertura`).value = settings[dia].abertura;
                    document.getElementById(`${dia}-fechamento`).value = settings[dia].fechamento;
                }
            });
        }
    }

    async function salvarTransacao() {
        const id = document.getElementById('transacao-id').value;
        const transacao = {
            descricao: document.getElementById('transacao-descricao').value,
            valor: parseFloat(document.getElementById('transacao-valor').value),
            tipo: document.getElementById('transacao-tipo').value,
            timestamp: serverTimestamp()
        };
        if (!transacao.descricao || isNaN(transacao.valor) || transacao.valor <= 0) { showModal("Descrição e valor válido são obrigatórios."); return; }
        try {
            if (id) { await updateDoc(doc(db, "fluxoCaixa", id), { descricao: transacao.descricao, valor: transacao.valor, tipo: transacao.tipo }); } 
            else { await addDoc(collection(db, "fluxoCaixa"), transacao); }
            document.getElementById('transacao-id').value = ''; document.getElementById('transacao-descricao').value = ''; document.getElementById('transacao-valor').value = '';
        } catch (error) { console.error("Erro ao salvar transação:", error); showModal("Não foi possível salvar a transação."); }
    }

    function carregarFluxoCaixa(startDate, endDate) {
        const tableBody = document.getElementById('caixa-table-body');
        let q = query(collection(db, "fluxoCaixa"), orderBy("timestamp", "desc"));

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            q = query(collection(db, "fluxoCaixa"), where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "desc"));
        }
        
        if (unsubscribeFluxoCaixa) unsubscribeFluxoCaixa();

        unsubscribeFluxoCaixa = onSnapshot(q, (snapshot) => {
            tableBody.innerHTML = '';
            let totalEntradas = 0, totalSaidas = 0;

            if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Nenhum lançamento encontrado.</td></tr>'; }
            
            snapshot.docs.forEach(docSnap => {
                const t = { id: docSnap.id, ...docSnap.data() };
                const valor = t.valor || 0;
                if (t.tipo === 'entrada') totalEntradas += valor; else totalSaidas += valor;

                const data = t.timestamp ? new Date(t.timestamp.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A';
                const tipoClass = t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600';
                tableBody.innerHTML += `
                    <tr class="border-b">
                        <td class="p-3 text-sm">${data}</td><td class="p-3">${t.descricao}</td>
                        <td class="p-3 font-semibold ${tipoClass} capitalize">${t.tipo}</td>
                        <td class="p-3 font-medium">R$${valor.toFixed(2).replace('.', ',')}</td>
                        <td class="p-3"><button class="delete-transacao-btn bg-red-500 text-white px-2 py-1 rounded text-xs" data-id="${t.id}">🗑️</button></td>
                    </tr>`;
            });
            
            document.getElementById('total-entradas').innerText = `R$${totalEntradas.toFixed(2).replace('.', ',')}`;
            document.getElementById('total-saidas').innerText = `R$${totalSaidas.toFixed(2).replace('.', ',')}`;
            document.getElementById('saldo-atual').innerText = `R$${(totalEntradas - totalSaidas).toFixed(2).replace('.', ',')}`;

            document.querySelectorAll('.delete-transacao-btn').forEach(btn => btn.addEventListener('click', e => deletarTransacao(e.currentTarget.dataset.id)));
        });
    }

    function deletarTransacao(id) {
        const confirmationHTML = `<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir este lançamento?</p><button id="confirm-delete-transacao-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 px-4 py-2 rounded-lg ml-2">Cancelar</button>`;
        showModal(confirmationHTML, () => {
            document.getElementById('confirm-delete-transacao-btn').addEventListener('click', async () => {
                try { await deleteDoc(doc(db, "fluxoCaixa", id)); closeModal(); } catch (error) { console.error("Erro ao excluir transação:", error); closeModal(); showModal('Ocorreu um erro ao excluir.'); }
            });
        });
    }

    function checkStoreOpen() {
        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const agora = new Date();
        const diaSemana = dias[agora.getDay()];
        const horaAtual = agora.getHours() * 60 + agora.getMinutes();
        const configDia = storeSettings[diaSemana];
        
        const avisoLojaFechada = document.getElementById('loja-fechada-aviso');
        const msgLojaFechada = document.getElementById('mensagem-loja-fechada');

        if (!configDia || !configDia.aberto || !configDia.abertura || !configDia.fechamento) { 
            isStoreOpen = true;
        } else {
            const [aberturaH, aberturaM] = configDia.abertura.split(':').map(Number);
            const [fechamentoH, fechamentoM] = configDia.fechamento.split(':').map(Number);
            const aberturaTotal = aberturaH * 60 + aberturaM;
            const fechamentoTotal = fechamentoH * 60 + fechamentoM;
            isStoreOpen = horaAtual >= aberturaTotal && horaAtual < fechamentoTotal;
        }
        
        const buttons = [sendOrderBtnMobile, sendOrderBtnDesktop];
        buttons.forEach(btn => {
            if (btn) {
                if (isStoreOpen) { 
                    btn.disabled = false; 
                    btn.classList.remove('bg-gray-400', 'cursor-not-allowed'); 
                    btn.classList.add('bg-green-500', 'hover:bg-green-600'); 
                    avisoLojaFechada.classList.add('hidden');
                } else { 
                    btn.disabled = true; 
                    btn.classList.add('bg-gray-400', 'cursor-not-allowed'); 
                    btn.classList.remove('bg-green-500', 'hover:bg-green-600'); 
                    avisoLojaFechada.classList.remove('hidden');
                    msgLojaFechada.innerText = storeSettings.mensagemFechado || "Estamos fechados no momento.";
                }
            }
        });
    }

    function openRecipeModal(id) {
        const produtoTamanho = produtos.find(p => p.id === id);
        if (!produtoTamanho) return;

        const insumos = produtos.filter(p => p.category === 'insumo');
        let insumosHTML = insumos.map(insumo => {
            const itemReceita = produtoTamanho.recipe?.find(r => r.name === insumo.name);
            const quantidade = itemReceita ? itemReceita.quantity : 0;
            return `
                <div class="flex justify-between items-center mb-2">
                    <label for="recipe-${insumo.id}">${insumo.name} (${insumo.unit})</label>
                    <input type="number" id="recipe-${insumo.id}" data-name="${insumo.name}" value="${quantidade}" class="w-24 p-1 border rounded text-center" placeholder="Qtd.">
                </div>
            `;
        }).join('');

        const modalContent = `
            <div class="text-left">
                <h3 class="text-xl font-bold mb-4 text-purple-700">Ficha Técnica para ${produtoTamanho.name}</h3>
                <div id="recipe-form" class="max-h-96 overflow-y-auto p-2">${insumosHTML}</div>
                <div class="mt-6 text-right">
                    <button id="save-recipe-btn" class="bg-green-500 text-white px-6 py-2 rounded-lg">Salvar Receita</button>
                    <button onclick="window.closeModal()" class="bg-gray-300 px-4 py-2 rounded-lg ml-2">Cancelar</button>
                </div>
            </div>
        `;

        showModal(modalContent, () => {
            document.getElementById('save-recipe-btn').addEventListener('click', () => salvarReceita(id));
        });
    }

    async function salvarReceita(id) {
        const recipe = [];
        document.querySelectorAll('#recipe-form input').forEach(input => {
            const quantity = parseFloat(input.value);
            if (quantity > 0) {
                recipe.push({
                    name: input.dataset.name,
                    quantity: quantity
                });
            }
        });

        try {
            await updateDoc(doc(db, "produtos", id), { recipe: recipe });
            closeModal();
            showModal("Receita salva com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar receita:", error);
            showModal("Não foi possível salvar a receita.");
        }
    }

    onSnapshot(doc(db, "configuracoes", "horarios"), (doc) => {
        if (doc.exists()) { storeSettings = doc.data(); } else { storeSettings = { mensagemFechado: "Horário não configurado." }; }
        checkStoreOpen();
    }, (error) => {
        console.error("Erro ao carregar configurações:", error.message);
        storeSettings = { mensagemFechado: "Não foi possível verificar o horário." };
        isStoreOpen = true; 
        checkStoreOpen();
    });

    onSnapshot(collection(db, "produtos"), (snapshot) => {
        produtos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMenu();
        calcularValor();
    }, (error) => {
        console.error("Erro ao carregar produtos:", error);
        document.getElementById('menu-container').innerHTML = '<p class="text-red-600 text-center">Não foi possível carregar o cardápio.</p>';
    });

    onSnapshot(collection(db, "combos"), (snapshot) => {
        combos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCombosMenu();
    }, (error) => {
        console.error("Erro ao carregar combos:", error);
        document.getElementById('combos-section').classList.add('hidden');
    });


// ... (o restante do seu código, como salvarConfiguracoes, carregarFluxoCaixa, checkStoreOpen, etc., continua aqui)
// ... Certifique-se de colar TODO o resto do seu código original para que nada se perca.
