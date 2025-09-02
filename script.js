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
let pedidoAtual = []; // Array para gerenciar os copos do pedido

const menuContainer = document.getElementById('menu-container');
const adminPanel = document.getElementById('admin-panel');
const whatsappBar = document.getElementById('whatsapp-bar');
const adminLoginBtn = document.getElementById('admin-login-button');
const adminLogoutBtn = document.getElementById('admin-logout-button');
const modalContainer = document.getElementById('modal-container');
const sendOrderBtnMobile = document.getElementById('send-order-button-mobile');
const sendOrderBtnDesktop = document.getElementById('send-order-button-desktop');
const adicionarCopoBtn = document.getElementById('adicionar-copo-btn');
const listaCoposPedido = document.getElementById('lista-copos-pedido');

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

// --- LÓGICA DO MENU E PEDIDO ---

// CORREÇÃO ESTÁ AQUI: Esta função agora volta a renderizar os acompanhamentos na tela principal.
function renderMenu() {
    const containers = { tamanho: document.getElementById('tamanhos-container'), fruta: document.getElementById('frutas-container'), creme: document.getElementById('cremes-container'), outro: document.getElementById('outros-container') };
    Object.values(containers).forEach(c => c.innerHTML = ''); // Limpa todos os containers
    precosBase = {};
    const produtosVisiveis = produtos.filter(p => p.category !== 'insumo' && p.isActive !== false);
    if (produtosVisiveis.length === 0) { Object.values(containers).forEach(c => c.innerHTML = '<p class="text-red-500 text-sm col-span-2">Nenhum item.</p>'); return; }

    produtosVisiveis.forEach(p => {
        if (p.category === 'tamanho') {
            precosBase[p.name] = p.price;
            containers.tamanho.innerHTML += `<label class="flex items-center justify-between bg-purple-100 px-4 py-3 rounded-2xl shadow cursor-pointer hover:bg-purple-200 transition"><div><span class="font-medium text-gray-800">${p.name}</span><span class="ml-3 text-sm text-gray-600">R$${p.price.toFixed(2)}</span></div><input type="radio" name="tamanho" value="${p.name}" class="accent-pink-500"></label>`;
        } else { // Renderiza frutas, cremes, outros diretamente na página
            const bgColor = p.category === 'fruta' ? 'bg-pink-100 hover:bg-pink-200' : p.category === 'creme' ? 'bg-purple-100 hover:bg-purple-200' : 'bg-violet-200 hover:bg-violet-300';
            const accentColor = p.category === 'fruta' ? 'accent-purple-600' : 'accent-pink-600';
            if (containers[p.category]) {
                containers[p.category].innerHTML += `
                <label class="flex items-center ${bgColor} px-3 py-2 rounded-xl shadow cursor-pointer">
                    <img src="${p.iconUrl}" alt="${p.name}" class="card-img flex-shrink-0" onerror="this.style.display='none'">
                    <input type="checkbox" value="${p.name}" class="acompanhamento-check mx-2 ${accentColor} flex-shrink-0">
                    <span class="flex-grow truncate">${p.name}</span>
                </label>`;
            }
        }
    });
}

function renderPedido() {
    listaCoposPedido.innerHTML = '';
    if (pedidoAtual.length === 0) {
        listaCoposPedido.innerHTML = '<p class="text-gray-500 text-center italic">Nenhum copo no pedido.</p>';
        return;
    }

    pedidoAtual.forEach((cup, index) => {
        const acompanhamentosResumo = cup.acompanhamentos.length > 0
            ? cup.acompanhamentos.map(a => a.name).join(', ')
            : 'Nenhum (Apenas Açaí)';

        const cupHTML = `
            <div class="bg-purple-50 p-4 rounded-xl shadow-sm border border-purple-200">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-lg text-purple-800">Copo ${index + 1} - ${cup.tamanho}</h4>
                        <p class="text-sm text-gray-600">Acompanhamentos: ${acompanhamentosResumo}</p>
                    </div>
                    <div class="text-right">
                         <p class="font-bold text-lg text-green-600">R$${cup.preco.toFixed(2)}</p>
                    </div>
                </div>
                <div class="mt-3 flex justify-end gap-2">
                    <button onclick="removerCopo(${cup.id})" class="bg-red-100 text-red-700 text-xs font-bold py-1 px-3 rounded-full hover:bg-red-200">Remover</button>
                </div>
            </div>
        `;
        listaCoposPedido.innerHTML += cupHTML;
    });
}

function limparSelecaoAcompanhamentos() {
    document.querySelectorAll('.acompanhamento-check').forEach(check => check.checked = false);
    document.getElementById('apenas-acai-check').checked = false;
}

adicionarCopoBtn.addEventListener('click', () => {
    const tamanhoEl = document.querySelector('input[name="tamanho"]:checked');
    if (!tamanhoEl) {
        showModal("Por favor, selecione um tamanho antes de adicionar o copo.");
        return;
    }
    const tamanho = tamanhoEl.value;
    const precoBase = precosBase[tamanho] || 0;

    const acompanhamentosSelecionados = [];
    document.querySelectorAll('.acompanhamento-check:checked').forEach(check => {
        acompanhamentosSelecionados.push({ name: check.value, quantity: 1 });
    });

    const apenasAcai = document.getElementById('apenas-acai-check').checked;
    if (!apenasAcai && acompanhamentosSelecionados.length === 0) {
        showModal("Por favor, selecione ao menos 1 acompanhamento ou marque 'Somente Açaí'.");
        return;
    }

    let adicionais = 0;
    const totalPorcoes = acompanhamentosSelecionados.length;
    if (apenasAcai) {
        adicionais = totalPorcoes * 3;
    } else {
        adicionais = totalPorcoes > 3 ? (totalPorcoes - 3) * 3 : 0;
    }
    const precoFinalCopo = precoBase + adicionais;

    const novoCopo = {
        id: Date.now(),
        tamanho: tamanho,
        acompanhamentos: acompanhamentosSelecionados,
        preco: precoFinalCopo,
        apenasAcai: apenasAcai
    };
    pedidoAtual.push(novoCopo);
    renderPedido();
    calcularValorTotal();
    limparSelecaoAcompanhamentos();
});

function removerCopo(cupId) {
    pedidoAtual = pedidoAtual.filter(cup => cup.id !== cupId);
    renderPedido();
    calcularValorTotal();
}

function calcularValorTotal() {
    const total = pedidoAtual.reduce((sum, cup) => sum + cup.preco, 0);
    const totalText = "R$" + total.toFixed(2).replace(".", ",");
    document.getElementById("valor-mobile").innerText = totalText;
    document.getElementById("valor-desktop").innerText = totalText;
}

function resetarFormulario() {
    document.getElementById('nome-cliente').value = '';
    document.getElementById('telefone-cliente').value = '';
    document.getElementById('observacoes').value = '';
    pedidoAtual = [];
    renderPedido();
    calcularValorTotal();
    limparSelecaoAcompanhamentos();
}

function handleOrderAction() {
    if (isStoreOpen) { enviarPedido(); } else { showModal(storeSettings.mensagemFechado || "Desculpe, estamos fechados no momento."); }
}
sendOrderBtnMobile.addEventListener('click', handleOrderAction);
sendOrderBtnDesktop.addEventListener('click', handleOrderAction);

async function enviarPedido() {
    if (!isStoreOpen) return;
    if (pedidoAtual.length === 0) {
        showModal("Por favor, adicione pelo menos um copo ao pedido!");
        return;
    }
    const nomeCliente = document.getElementById('nome-cliente').value.trim();
    if (!nomeCliente) { showModal("Por favor, digite seu nome!"); return; }
    const telefoneCliente = document.getElementById('telefone-cliente').value.trim();
    if (!telefoneCliente) { showModal("Por favor, digite seu telefone!"); return; }

    const observacoesGerais = document.getElementById("observacoes").value;
    const numero = storeSettings.whatsappNumber || "5514991962607";
    let mensagemCompletaWhatsApp = `*Novo Pedido de ${nomeCliente}*\n*Telefone:* ${telefoneCliente}\n\n`;
    let valorTotalPedido = 0;

    for (const [index, copo] of pedidoAtual.entries()) {
        const valorCopo = `R$${copo.preco.toFixed(2).replace('.', ',')}`;
        valorTotalPedido += copo.preco;
        
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
                return `${displayDate}-${String(newCount).padStart(3, '0')}`;
            });
        } catch (e) {
            console.error("Transaction failed: ", e);
            showModal("Não foi possível gerar o ID do pedido. Tente novamente.");
            return;
        }
        
        try {
            await addDoc(collection(db, "vendas"), {
                orderId,
                nomeCliente,
                telefoneCliente,
                tamanho: copo.tamanho,
                quantidade: 1,
                acompanhamentos: copo.acompanhamentos,
                observacoes: observacoesGerais || "Nenhuma",
                total: valorCopo,
                status: "pendente",
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("Erro ao salvar venda individual: ", e);
        }

        const acompanhamentosText = copo.acompanhamentos.length > 0
            ? copo.acompanhamentos.map(a => `${a.name} (x${a.quantity})`).join("\n- ")
            : 'Nenhum (Somente Açaí)';
            
        mensagemCompletaWhatsApp += `*COPO ${index + 1}: Açaí ${copo.tamanho} (${valorCopo})*\n`;
        mensagemCompletaWhatsApp += `*Acompanhamentos:*\n- ${acompanhamentosText}\n\n`;
    }

    mensagemCompletaWhatsApp += `📝 *Observações Gerais:* ${observacoesGerais || "Nenhuma"}\n`;
    mensagemCompletaWhatsApp += `💰 *Valor Total do Pedido: R$${valorTotalPedido.toFixed(2).replace('.', ',')}*`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagemCompletaWhatsApp)}`, "_blank");

    showModal("Pedido enviado com sucesso! Agradecemos a preferência.");
    resetarFormulario();
}

window.closeModal = closeModal;
window.removerCopo = removerCopo;

// --- Restante do código (Combos, Painel Admin, etc.) ---

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
            return `${displayDate}-${String(newCount).padStart(3, '0')}`;
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
        await addDoc(collection(db, "vendas"), {
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
        });
        showModal("Pedido do combo enviado com sucesso! Agradecemos a preferência.");
    } catch (e) {
        console.error("Erro ao salvar venda do combo: ", e);
        showModal("Ocorreu um erro ao salvar seu pedido no nosso sistema, mas você pode enviá-lo pelo WhatsApp.");
    }
};

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

function renderProdutosAdmin() {
    document.getElementById('content-produtos').innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Adicionar / Editar Produto</h3><div class="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6 p-4 border rounded-lg"><input type="hidden" id="produto-id"><input type="text" id="produto-nome" placeholder="Nome" class="p-2 border rounded"><input type="number" id="produto-preco" placeholder="Preço Venda" step="0.01" class="p-2 border rounded"><input type="number" id="produto-custo" placeholder="Preço Custo" step="0.01" class="p-2 border rounded"><input type="text" id="produto-unidade" placeholder="Unidade (g, ml, un)" class="p-2 border rounded"><input type="text" id="produto-icone" placeholder="URL do Ícone" class="p-2 border rounded"><select id="produto-categoria" class="p-2 border rounded"><option value="tamanho">Tamanho</option><option value="fruta">Fruta</option><option value="creme">Creme</option><option value="outro">Outro</option><option value="insumo">Insumo</option></select><button id="salvar-produto-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600 col-span-full">Salvar</button></div><div id="lista-produtos-admin"></div></div>`;
    document.getElementById('salvar-produto-btn').addEventListener('click', salvarProduto);
    carregarProdutosAdmin();
}

async function salvarProduto() {
    const id = document.getElementById('produto-id').value;
    const produto = { 
        name: document.getElementById('produto-nome').value, 
        price: parseFloat(document.getElementById('produto-preco').value) || 0,
        cost: parseFloat(document.getElementById('produto-custo').value) || 0,
        unit: document.getElementById('produto-unidade').value,
        iconUrl: document.getElementById('produto-icone').value, 
        category: document.getElementById('produto-categoria').value,
        isActive: true
    };
    if (!produto.name || !produto.unit) { showModal("Nome e Unidade são obrigatórios."); return; }
    if (produto.category === 'tamanho') {
        produto.recipe = [];
    }
    try {
        if (id) { 
            const existingProd = produtos.find(p => p.id === id);
            if (existingProd) {
                produto.recipe = existingProd.recipe || [];
                produto.isActive = existingProd.isActive;
            }
            await updateDoc(doc(db, "produtos", id), produto); 
        } else { 
            await addDoc(collection(db, "produtos"), produto); 
        }
        document.getElementById('produto-id').value = ''; document.getElementById('produto-nome').value = ''; document.getElementById('produto-preco').value = ''; document.getElementById('produto-custo').value = ''; document.getElementById('produto-unidade').value = ''; document.getElementById('produto-icone').value = '';
    } catch (error) { console.error("Erro ao salvar produto:", error); showModal("Não foi possível salvar o produto."); }
}

function carregarProdutosAdmin() {
    const container = document.getElementById('lista-produtos-admin');
    onSnapshot(collection(db, "produtos"), (snapshot) => {
        const produtosPorCategoria = { tamanho: [], fruta: [], creme: [], outro: [], insumo: [] };
        snapshot.docs.forEach(docSnap => { const p = { id: docSnap.id, ...docSnap.data() }; if(produtosPorCategoria[p.category]) produtosPorCategoria[p.category].push(p); });
        
        container.innerHTML = '';
        for (const categoria in produtosPorCategoria) {
            container.innerHTML += `<h4 class="text-xl font-medium mt-6 mb-2 capitalize text-purple-600">${categoria}s</h4>`;
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
            produtosPorCategoria[categoria].forEach(p => {
                const isInactive = p.isActive === false;
                const activeBtnClass = isInactive ? 'bg-gray-400' : 'bg-green-500';
                const activeBtnIcon = isInactive ? '🚫' : '👁️';

                grid.innerHTML += `
                <div class="border p-3 rounded-lg flex justify-between items-center ${isInactive ? 'opacity-50' : ''}">
                    <div>
                        <p class="font-bold">${p.name}</p>
                        <p class="text-sm text-gray-600">Venda: R$${(p.price || 0).toFixed(2)} | Custo: R$${(p.cost || 0).toFixed(2)} / ${p.unit}</p>
                    </div>
                    <div class="flex items-center">
                        ${p.category !== 'tamanho' && p.category !== 'insumo' ? `<button class="toggle-active-btn p-1 text-white rounded ${activeBtnClass}" data-id="${p.id}">${activeBtnIcon}</button>` : ''}
                        ${p.category === 'tamanho' ? `<button class="recipe-btn p-1 text-green-500" data-id="${p.id}">⚙️</button>` : ''}
                        <button class="edit-produto-btn p-1 text-blue-500" data-id="${p.id}">✏️</button>
                        <button class="delete-produto-btn p-1 text-red-500" data-id="${p.id}">🗑️</button>
                    </div>
                </div>`;
            });
            container.appendChild(grid);
        }

        document.querySelectorAll('.edit-produto-btn').forEach(btn => btn.addEventListener('click', (e) => editarProduto(e.currentTarget.dataset.id)));
        document.querySelectorAll('.delete-produto-btn').forEach(btn => btn.addEventListener('click', (e) => deletarProduto(e.currentTarget.dataset.id)));
        document.querySelectorAll('.recipe-btn').forEach(btn => btn.addEventListener('click', (e) => openRecipeModal(e.currentTarget.dataset.id)));
        document.querySelectorAll('.toggle-active-btn').forEach(btn => btn.addEventListener('click', (e) => toggleProductStatus(e.currentTarget.dataset.id)));
    });
}

function editarProduto(id) {
    const p = produtos.find(prod => prod.id === id);
    if (p) { 
        document.getElementById('produto-id').value = p.id; 
        document.getElementById('produto-nome').value = p.name; 
        document.getElementById('produto-preco').value = p.price; 
        document.getElementById('produto-custo').value = p.cost; 
        document.getElementById('produto-unidade').value = p.unit; 
        document.getElementById('produto-icone').value = p.iconUrl; 
        document.getElementById('produto-categoria').value = p.category; 
    }
}

function deletarProduto(id) {
    const confirmationHTML = `<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir este produto?</p><button id="confirm-delete-produto-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 px-4 py-2 rounded-lg ml-2">Cancelar</button>`;
    showModal(confirmationHTML, () => {
        document.getElementById('confirm-delete-produto-btn').addEventListener('click', async () => {
            try { await deleteDoc(doc(db, "produtos", id)); closeModal(); } catch (error) { console.error("Erro ao excluir produto:", error); closeModal(); showModal('Ocorreu um erro ao excluir o produto.'); }
        });
    });
}

async function toggleProductStatus(id) {
    const product = produtos.find(p => p.id === id);
    if (product) {
        const newStatus = !(product.isActive !== false);
        try {
            await updateDoc(doc(db, "produtos", id), { isActive: newStatus });
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            showModal("Não foi possível atualizar o status do produto.");
        }
    }
}

function showToast(message) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-notification bg-green-500 text-white p-4 rounded-lg shadow-lg';
    toast.innerText = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function playNotificationSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 1);
}

function calcularCustoPedido(venda) {
    let custoTotal = 0;
    const tamanhoProduto = produtos.find(p => p.name === venda.tamanho && p.category === 'tamanho');
    if (tamanhoProduto && tamanhoProduto.recipe) {
        tamanhoProduto.recipe.forEach(ingrediente => {
            const insumoData = produtos.find(p => p.name === ingrediente.name && p.category === 'insumo');
            if (insumoData) {
                custoTotal += (ingrediente.quantity || 0) * (insumoData.cost || 0);
            }
        });
    }

    if (venda.acompanhamentos) {
        venda.acompanhamentos.forEach(itemPedido => {
            const acompanhamentoProduto = produtos.find(p => p.name === itemPedido.name);
            if (acompanhamentoProduto) {
                custoTotal += (itemPedido.quantity || 0) * (acompanhamentoProduto.cost || 0);
            }
        });
    }
    
    custoTotal *= venda.quantidade;
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
        
        tableBody.innerHTML = '';
        let totalVendas = 0;

        if (snapshot.empty) { 
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4">Nenhuma venda encontrada.</td></tr>';
            document.getElementById('total-vendas').innerText = 'R$0,00';
        } else {
            snapshot.docs.forEach(docSnap => {
                const venda = { id: docSnap.id, ...docSnap.data() };
                const isCombo = venda.pedidoCombo && !venda.tamanho;
                const { custoTotal, lucro } = isCombo ? { custoTotal: 0, lucro: 0 } : calcularCustoPedido(venda);
                
                const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
                if (!isNaN(valorNumerico)) { totalVendas += valorNumerico; }

                const data = venda.timestamp ? new Date(venda.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'N/A';
                const statusClass = venda.status === 'pendente' ? 'text-yellow-600' : 'text-green-600';
                
                const pedidoHTML = isCombo 
                    ? `<strong>Combo:</strong> ${venda.pedidoCombo}<br><small class="text-gray-500">${venda.observacoes}</small>`
                    : `${venda.quantidade}x ${venda.tamanho}<br><small class="text-gray-500">${(venda.acompanhamentos || []).map(a => `${a.name} (x${a.quantity})`).join(', ')}</small><br><small class="text-blue-500 font-semibold">Obs: ${venda.observacoes}</small>`;

                const financeiroHTML = isCombo
                    ? `Venda: ${venda.total}<br><small class="text-gray-500">Custo/Lucro não aplicável</small>`
                    : `Venda: ${venda.total}<br><small class="text-red-500">Custo: R$${custoTotal.toFixed(2)}</small><br><strong class="text-green-600">Lucro: R$${lucro.toFixed(2)}</strong>`;

                tableBody.innerHTML += `
                    <tr class="border-b">
                        <td class="p-3 text-sm font-mono">${venda.orderId || 'N/A'}</td>
                        <td class="p-3 text-sm">${data}</td>
                        <td class="p-3 text-sm font-semibold">${venda.nomeCliente || 'N/A'}<br><small class="text-gray-500 font-normal">${venda.telefoneCliente || ''}</small></td>
                        <td class="p-3 text-sm">${pedidoHTML}</td>
                        <td class="p-3 font-medium">${financeiroHTML}</td>
                        <td class="p-3 font-semibold ${statusClass} capitalize">${venda.status}</td>
                        <td class="p-3">
                            ${venda.status === 'pendente' ? `<button class="confirm-venda-btn bg-green-500 text-white px-2 py-1 rounded text-xs" data-id="${venda.id}">✔️</button>` : ''}
                            <button class="delete-venda-btn bg-red-500 text-white px-2 py-1 rounded text-xs ml-1" data-id="${venda.id}">🗑️</button>
                        </td>
                    </tr>`;
            });
            document.getElementById('total-vendas').innerText = `R$${totalVendas.toFixed(2).replace('.', ',')}`;
        }

        document.querySelectorAll('.confirm-venda-btn').forEach(btn => btn.addEventListener('click', e => confirmarVenda(e.currentTarget.dataset.id)));
        document.querySelectorAll('.delete-venda-btn').forEach(btn => btn.addEventListener('click', e => deletarVenda(e.currentTarget.dataset.id)));
        
        if (!initialVendasLoadComplete) {
            setTimeout(() => { initialVendasLoadComplete = true; }, 2000);
        }
    });
}

async function confirmarVenda(id) {
    const vendaRef = doc(db, "vendas", id);
    const vendaSnap = await getDoc(vendaRef);
    if (vendaSnap.exists()) {
        const venda = vendaSnap.data();
        const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
        await addDoc(collection(db, "fluxoCaixa"), {
            descricao: `Venda Pedido #${venda.orderId}`,
            valor: valorNumerico,
            tipo: 'entrada',
            timestamp: serverTimestamp()
        });
        await updateDoc(vendaRef, { status: 'concluida' });
    }
}

function deletarVenda(id) {
    const confirmationHTML = `<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir esta venda?</p><button id="confirm-delete-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 px-4 py-2 rounded-lg ml-2">Cancelar</button>`;
    showModal(confirmationHTML, () => {
        document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
            try { await deleteDoc(doc(db, "vendas", id)); closeModal(); } catch (error) { console.error("Erro ao excluir venda:", error); closeModal(); showModal('Ocorreu um erro ao excluir a venda.'); }
        });
    });
}

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
        isStoreOpen = (horaAtual >= (aberturaH * 60 + aberturaM)) && (horaAtual < (fechamentoH * 60 + fechamentoM));
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
            recipe.push({ name: input.dataset.name, quantity: quantity });
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
