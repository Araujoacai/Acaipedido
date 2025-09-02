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

document.addEventListener('DOMContentLoaded', () => {

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
        setTimeout(() => {
            const modalBox = document.getElementById('modal-box');
            if (modalBox) modalBox.classList.remove('scale-95', 'opacity-0');
            onOpen();
        }, 10);
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
            adminLoginBtn.classList.add('hidden');
            adminLogoutBtn.classList.remove('hidden');
            menuContainer.classList.add('hidden');
            whatsappBar.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            renderAdminPanel();
        } else {
            adminLoginBtn.classList.remove('hidden');
            adminLogoutBtn.classList.add('hidden');
            menuContainer.classList.remove('hidden');
            whatsappBar.classList.remove('hidden');
            adminPanel.classList.add('hidden');
            if (unsubscribeVendas) unsubscribeVendas();
            if (unsubscribeFluxoCaixa) unsubscribeFluxoCaixa();
            initialVendasLoadComplete = false;
        }
    });

    adminLoginBtn.addEventListener('click', () => {
        const loginFormHTML = `<h3 class="text-xl font-bold mb-4">Login Admin</h3><input type="email" id="email" placeholder="Email" class="w-full p-2 border rounded mb-2"><input type="password" id="password" placeholder="Senha" class="w-full p-2 border rounded mb-4"><button id="login-submit" class="bg-purple-600 text-white px-6 py-2 rounded-lg">Entrar</button><button onclick="window.closeModal()" class="bg-gray-300 px-4 py-2 rounded-lg ml-2">Cancelar</button>`;
        showModal(loginFormHTML, () => {
            document.getElementById('login-submit').addEventListener('click', async () => {
                try {
                    await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
                    closeModal();
                } catch (error) {
                    console.error("Erro de login:", error);
                    alert("Email ou senha inválidos.");
                }
            });
        });
    });

    adminLogoutBtn.addEventListener('click', () => signOut(auth));

    function renderMenu() {
        const containers = {
            tamanho: document.getElementById('tamanhos-container'),
            fruta: document.getElementById('frutas-container'),
            creme: document.getElementById('cremes-container'),
            outro: document.getElementById('outros-container')
        };
        Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });
        precosBase = {};
        const produtosVisiveis = produtos.filter(p => p.category !== 'insumo' && p.isActive !== false);
        if (produtosVisiveis.length === 0) { Object.values(containers).forEach(c => { if (c) c.innerHTML = '<p class="text-red-500 text-sm col-span-2">Nenhum item.</p>'; }); return; }

        produtosVisiveis.forEach(p => {
            if (p.category === 'tamanho') {
                precosBase[p.name] = p.price;
                if (containers.tamanho) containers.tamanho.innerHTML += `<label class="flex items-center justify-between bg-purple-100 px-4 py-3 rounded-2xl shadow cursor-pointer hover:bg-purple-200 transition"><div><span class="font-medium text-gray-800">${p.name}</span><span class="ml-3 text-sm text-gray-600">R$${p.price.toFixed(2)}</span></div><input type="radio" name="tamanho" value="${p.name}" class="accent-pink-500"></label>`;
            } else {
                const bgColor = p.category === 'fruta' ? 'bg-pink-100 hover:bg-pink-200' : p.category === 'creme' ? 'bg-purple-100 hover:bg-purple-200' : 'bg-violet-200 hover:bg-violet-300';
                const accentColor = p.category === 'fruta' ? 'accent-purple-600' : 'accent-pink-600';
                if (containers[p.category]) {
                    containers[p.category].innerHTML += `
                    <label class="flex items-center ${bgColor} px-3 py-2 rounded-xl shadow cursor-pointer">
                        <img src="${p.iconUrl || ''}" alt="${p.name}" class="w-6 h-6 mr-2 object-contain" onerror="this.style.display='none'">
                        <input type="checkbox" value="${p.name}" class="acompanhamento-check mx-2 ${accentColor} flex-shrink-0">
                        <span class="flex-grow truncate">${p.name}</span>
                    </label>`;
                }
            }
        });
    }

    function renderPedido() {
        if (!listaCoposPedido) return;
        listaCoposPedido.innerHTML = '';
        if (pedidoAtual.length === 0) {
            listaCoposPedido.innerHTML = '<p class="text-gray-500 text-center italic">Nenhum copo no pedido.</p>';
            return;
        }

        pedidoAtual.forEach((cup, index) => {
            const acompanhamentosResumo = cup.acompanhamentos.length > 0 ?
                cup.acompanhamentos.map(a => a.name).join(', ') :
                'Nenhum (Apenas Açaí)';

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
                        <button onclick="window.removerCopo(${cup.id})" class="bg-red-100 text-red-700 text-xs font-bold py-1 px-3 rounded-full hover:bg-red-200">Remover</button>
                    </div>
                </div>
            `;
            listaCoposPedido.innerHTML += cupHTML;
        });
    }
    window.removerCopo = (cupId) => {
        pedidoAtual = pedidoAtual.filter(cup => cup.id !== cupId);
        renderPedido();
        calcularValorTotal();
    }

    // --- PAINEL DE ADMINISTRAÇÃO COMPLETO ---
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
            if (tabs[key]) {
                tabs[key].addEventListener('click', () => {
                    Object.values(tabs).forEach(t => t.classList.remove('tab-active', 'border-purple-500', 'text-purple-600'));
                    Object.values(contents).forEach(c => c.classList.add('hidden'));
                    tabs[key].classList.add('tab-active', 'border-purple-500', 'text-purple-600');
                    contents[key].classList.remove('hidden');
                });
            }
        });
    }

    // Seção de Produtos
    function renderProdutosAdmin() {
        const contentEl = document.getElementById('content-produtos');
        if (!contentEl) return;
        contentEl.innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Adicionar / Editar Produto</h3><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg"><input type="hidden" id="produto-id"><input type="text" id="produto-nome" placeholder="Nome" class="p-2 border rounded"><input type="number" id="produto-preco" placeholder="Preço Venda" step="0.01" class="p-2 border rounded"><input type="number" id="produto-custo" placeholder="Preço Custo" step="0.01" class="p-2 border rounded"><input type="text" id="produto-unidade" placeholder="Unidade (g, ml, un)" class="p-2 border rounded"><input type="text" id="produto-icone" placeholder="URL do Ícone" class="p-2 border rounded col-span-1 md:col-span-2 lg:col-span-1"><select id="produto-categoria" class="p-2 border rounded"><option value="tamanho">Tamanho</option><option value="fruta">Fruta</option><option value="creme">Creme</option><option value="outro">Outro</option><option value="insumo">Insumo</option></select></div><button id="salvar-produto-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600 w-full mb-6">Salvar Produto</button><div id="lista-produtos-admin"></div></div>`;
        document.getElementById('salvar-produto-btn').addEventListener('click', salvarProduto);
        carregarProdutosAdmin();
    }
    
    async function salvarProduto() { /* ... implementation ... */ }
    function carregarProdutosAdmin() { /* ... implementation ... */ }

    // Seção de Combos
    function renderCombosAdmin() {
        const contentEl = document.getElementById('content-combos');
        if (!contentEl) return;
        contentEl.innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Adicionar / Editar Combo</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg"><input type="hidden" id="combo-id"><input type="text" id="combo-nome" placeholder="Nome do Combo" class="p-2 border rounded"><input type="number" id="combo-preco" placeholder="Preço" step="0.01" class="p-2 border rounded"><textarea id="combo-descricao" placeholder="Descrição do Combo" class="p-2 border rounded col-span-1 md:col-span-2" rows="3"></textarea><input type="text" id="combo-imagem" placeholder="URL da Imagem" class="p-2 border rounded col-span-1 md:col-span-2"></div><button id="salvar-combo-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600 w-full mb-6">Salvar Combo</button><div id="lista-combos-admin"></div></div>`;
        document.getElementById('salvar-combo-btn').addEventListener('click', salvarCombo);
        carregarCombosAdmin();
    }

    async function salvarCombo() { /* ... implementation ... */ }
    function carregarCombosAdmin() { /* ... implementation ... */ }

    // Seção de Vendas
    function renderVendasAdmin() {
        const contentEl = document.getElementById('content-vendas');
        if (!contentEl) return;
        contentEl.innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Relatório de Vendas</h3><div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-3">ID</th><th class="p-3">Data</th><th class="p-3">Cliente</th><th class="p-3">Pedido</th><th class="p-3">Financeiro</th><th class="p-3">Status</th><th class="p-3">Ações</th></tr></thead><tbody id="vendas-table-body"></tbody></table></div><div class="mt-4 text-right"><h4 class="text-xl font-bold">Total: <span id="total-vendas">R$0,00</span></h4></div></div>`;
        carregarVendasAdmin();
    }
    
    function carregarVendasAdmin() { /* ... implementation ... */ }

    // Seção de Fluxo de Caixa
    function renderCaixaAdmin() {
        const contentEl = document.getElementById('content-caixa');
        if(!contentEl) return;
        contentEl.innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Fluxo de Caixa</h3><div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg"><input type="hidden" id="transacao-id"><input type="text" id="transacao-descricao" placeholder="Descrição" class="p-2 border rounded md:col-span-2"><input type="number" id="transacao-valor" placeholder="Valor" step="0.01" class="p-2 border rounded"><select id="transacao-tipo" class="p-2 border rounded"><option value="entrada">Entrada</option><option value="saida">Saída</option></select><button id="salvar-transacao-btn" class="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 md:col-span-4">Adicionar Lançamento</button></div><div class="grid grid-cols-3 gap-4 mb-4 text-center"><div class="bg-green-100 p-4 rounded-lg"><h4 class="font-semibold">Entradas</h4><p id="total-entradas" class="text-lg font-bold text-green-700">R$0,00</p></div><div class="bg-red-100 p-4 rounded-lg"><h4 class="font-semibold">Saídas</h4><p id="total-saidas" class="text-lg font-bold text-red-700">R$0,00</p></div><div class="bg-blue-100 p-4 rounded-lg"><h4 class="font-semibold">Saldo</h4><p id="saldo-atual" class="text-lg font-bold text-blue-700">R$0,00</p></div></div><div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-3">Data</th><th class="p-3">Descrição</th><th class="p-3">Tipo</th><th class="p-3">Valor</th><th class="p-3">Ações</th></tr></thead><tbody id="caixa-table-body"></tbody></table></div></div>`;
        document.getElementById('salvar-transacao-btn').addEventListener('click', salvarTransacao);
        carregarFluxoCaixa();
    }

    async function salvarTransacao() { /* ... implementation ... */ }
    function carregarFluxoCaixa() { /* ... implementation ... */ }

    // Seção de Configurações
    function renderConfigAdmin() {
        const contentEl = document.getElementById('content-config');
        if(!contentEl) return;
        let diasSemanaHTML = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].map(dia => `<div class="grid grid-cols-4 items-center gap-2 border-b py-2 capitalize"><label class="font-semibold">${dia}</label><input type="checkbox" id="${dia}-aberto" class="justify-self-center h-5 w-5"><input type="time" id="${dia}-abertura" class="p-1 border rounded"><input type="time" id="${dia}-fechamento" class="p-1 border rounded"></div>`).join('');
        contentEl.innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Configurações da Loja</h3><div class="space-y-4"><div><label class="font-semibold block mb-1">Número do WhatsApp (com 55)</label><input type="text" id="whatsapp-number" class="w-full p-2 border rounded"></div><div><label class="font-semibold block mb-1">Mensagem (Loja Fechada)</label><textarea id="mensagem-fechado" class="w-full p-2 border rounded" rows="3"></textarea></div><div><h4 class="text-lg font-semibold mt-4 mb-2">Horário de Funcionamento</h4><div class="grid grid-cols-4 gap-2 font-bold text-sm text-center mb-2 px-2"><span class="col-start-2">Aberto?</span><span>Abertura</span><span>Fechamento</span></div>${diasSemanaHTML}</div><button id="salvar-config-btn" class="bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 w-full mt-6">Salvar Configurações</button></div></div>`;
        document.getElementById('salvar-config-btn').addEventListener('click', salvarConfiguracoes);
        carregarConfiguracoesAdmin();
    }

    async function salvarConfiguracoes() { /* ... implementation ... */ }
    async function carregarConfiguracoesAdmin() { /* ... implementation ... */ }
    
    // Listeners do Firebase
    onSnapshot(doc(db, "configuracoes", "horarios"), (doc) => {
        if (doc.exists()) { storeSettings = doc.data(); } else { storeSettings = { mensagemFechado: "Horário não configurado." }; }
        checkStoreOpen();
    });

    onSnapshot(collection(db, "produtos"), (snapshot) => {
        produtos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMenu();
    });

    onSnapshot(collection(db, "combos"), (snapshot) => {
        combos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCombosMenu();
    });
});

