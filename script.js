import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, getDoc, setDoc, runTransaction, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
let unsubscribeDashboardVendas;
let unsubscribeDashboardCaixa;
let storeSettings = {};
let isStoreOpen = true;
let initialVendasLoadComplete = false;

const menuContainer = document.getElementById('menu-container');
const adminPanel = document.getElementById('admin-panel');
const whatsappBar = document.getElementById('whatsapp-bar');
const adminLoginBtn = document.getElementById('admin-login-button');
const adminLogoutBtn = document.getElementById('admin-logout-button');
const modalContainer = document.getElementById('modal-container');
const sendOrderBtnMobile = document.getElementById('send-order-button-mobile');
const sendOrderBtnDesktop = document.getElementById('send-order-button-desktop');

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
}

function showModal(content, onOpen = () => { }) {
    let modalContent = content;
    if (typeof content === 'string') {
        modalContent = `<p class="text-lg text-gray-800 mb-6 font-medium">${content}</p><button onclick="window.closeModal()" class="bg-brand-purple hover:bg-brand-light text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl">OK</button>`;
    }
    modalContainer.innerHTML = `<div class="glass bg-white/90 text-gray-800 rounded-3xl p-8 w-full max-w-md text-center shadow-2xl transform transition-all scale-95 opacity-0 border border-white/50" id="modal-box">${modalContent}</div>`;
    modalContainer.classList.remove('hidden');
    setTimeout(() => {
        const modalBox = document.getElementById('modal-box');
        if (modalBox) {
            modalBox.classList.remove('scale-95', 'opacity-0');
            modalBox.classList.add('scale-100', 'opacity-100');
        }
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

onAuthStateChanged(auth, user => {
    if (user) {
        adminLoginBtn.classList.add('hidden'); adminLogoutBtn.classList.remove('hidden'); menuContainer.classList.add('hidden'); whatsappBar.classList.add('hidden'); adminPanel.classList.remove('hidden');
        renderAdminPanel();
    } else {
        adminLoginBtn.classList.remove('hidden'); adminLogoutBtn.classList.add('hidden'); menuContainer.classList.remove('hidden');
        if (document.body.clientWidth < 1024) {
            whatsappBar.classList.remove('hidden');
        }
        adminPanel.classList.add('hidden');
        if (unsubscribeVendas) unsubscribeVendas();
        if (unsubscribeFluxoCaixa) unsubscribeFluxoCaixa();
        if (unsubscribeDashboardVendas) unsubscribeDashboardVendas(); // <-- ADICIONE ESTA LINHA
        if (unsubscribeDashboardCaixa) unsubscribeDashboardCaixa(); // <-- ADICIONE ESTA LINHA
        initialVendasLoadComplete = false;
    }
});

// Sistema de Rate Limiting para login
const loginAttempts = {
    count: 0,
    lastAttempt: null,
    blockedUntil: null
};

// Verificar se está bloqueado por tentativas excessivas
function isLoginBlocked() {
    if (!loginAttempts.blockedUntil) return false;
    if (Date.now() < loginAttempts.blockedUntil) {
        const remainingMinutes = Math.ceil((loginAttempts.blockedUntil - Date.now()) / 60000);
        return remainingMinutes;
    }
    // Bloqueio expirado, resetar
    loginAttempts.count = 0;
    loginAttempts.blockedUntil = null;
    return false;
}

// Validar força da senha (requisitos mínimos)
function validatePasswordStrength(password) {
    const requirements = {
        minLength: password.length >= 8,
        hasUpperCase: /[A-Z]/.test(password),
        hasLowerCase: /[a-z]/.test(password),
        hasNumber: /\d/.test(password)
    };

    const isStrong = Object.values(requirements).every(req => req);

    return { isStrong, requirements };
}

// Mostrar requisitos de senha
function showPasswordRequirements() {
    return `
    <div class="text-left mt-2 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
      <p class="font-semibold mb-1 text-blue-800">A senha deve conter:</p>
      <ul class="list-disc list-inside space-y-0.5">
        <li>Mínimo 8 caracteres</li>
        <li>Pelo menos 1 letra maiúscula</li>
        <li>Pelo menos 1 letra minúscula</li>
        <li>Pelo menos 1 número</li>
      </ul>
    </div>
  `;
}

adminLoginBtn.addEventListener('click', () => {
    // Verificar se está bloqueado
    const blockedMinutes = isLoginBlocked();
    if (blockedMinutes) {
        showModal(`
      <div class="text-center">
        <div class="text-red-500 text-5xl mb-4">⛔</div>
        <h3 class="text-xl font-bold mb-2">Acesso Temporariamente Bloqueado</h3>
        <p class="text-gray-600 mb-4">Muitas tentativas de login falhadas.</p>
        <p class="text-red-600 font-semibold">Tente novamente em ${blockedMinutes} minuto(s).</p>
        <button onclick="window.closeModal()" class="mt-4 bg-gray-300 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-400 transition">OK</button>
      </div>
    `);
        return;
    }

    const loginFormHTML = `
    <h3 class="text-2xl font-bold mb-6 text-purple-700">🔐 Login Admin</h3>
    <div class="text-left space-y-4">
      <div>
        <label for="email" class="block text-sm font-semibold text-gray-700 mb-1">Email</label>
        <input type="email" id="email" placeholder="admin@acaiaraujo.com" 
          class="w-full p-3 border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition outline-none">
      </div>
      <div>
        <label for="password" class="block text-sm font-semibold text-gray-700 mb-1">Senha</label>
        <div class="relative">
          <input type="password" id="password" placeholder="••••••••" 
            class="w-full p-3 border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition outline-none pr-12">
          <button type="button" id="toggle-password" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
            <svg id="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
              <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
              <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
            </svg>
          </button>
        </div>
        <div id="password-strength" class="mt-2 hidden"></div>
      </div>
      <div class="flex items-center text-xs text-gray-500 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
        <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
        <span>Tentativas restantes: <strong>${5 - loginAttempts.count}</strong></span>
      </div>
    </div>
    <div class="flex gap-3 mt-6">
      <button id="login-submit" class="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all">
        Entrar
      </button>
      <button onclick="window.closeModal()" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-6 py-3 rounded-xl transition">
        Cancelar
      </button>
    </div>
  `;

    showModal(loginFormHTML, () => {
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const togglePasswordBtn = document.getElementById('toggle-password');
        const eyeIcon = document.getElementById('eye-icon');

        // Toggle mostrar/ocultar senha
        if (togglePasswordBtn) {
            togglePasswordBtn.addEventListener('click', () => {
                const type = passwordInput.type === 'password' ? 'text' : 'password';
                passwordInput.type = type;

                // Trocar ícone
                eyeIcon.innerHTML = type === 'password'
                    ? '<path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>'
                    : '<path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>';
            });
        }

        // Botão de login
        document.getElementById('login-submit').addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                showModal('⚠️ Por favor, preencha email e senha.');
                return;
            }

            // Validar formato de email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showModal('⚠️ Email inválido. Por favor, insira um email válido.');
                return;
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);

                // Sucesso: resetar tentativas
                loginAttempts.count = 0;
                loginAttempts.lastAttempt = null;
                loginAttempts.blockedUntil = null;

                closeModal();
            } catch (error) {
                console.error("Erro de login:", error);

                // Incrementar tentativas
                loginAttempts.count++;
                loginAttempts.lastAttempt = Date.now();

                // Bloquear após 5 tentativas (5 minutos)
                if (loginAttempts.count >= 5) {
                    loginAttempts.blockedUntil = Date.now() + (5 * 60 * 1000); // 5 minutos
                    closeModal();
                    showModal(`
            <div class="text-center">
              <div class="text-red-500 text-5xl mb-4">⛔</div>
              <h3 class="text-xl font-bold mb-2">Conta Bloqueada Temporariamente</h3>
              <p class="text-gray-600 mb-4">Você excedeu o número máximo de tentativas de login.</p>
              <p class="text-red-600 font-semibold">Tente novamente em 5 minutos.</p>
              <button onclick="window.closeModal()" class="mt-4 bg-gray-300 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-400 transition">OK</button>
            </div>
          `);
                    return;
                }

                // Mensagem de erro amigável
                let errorMessage = "Email ou senha inválidos.";
                if (error.code === 'auth/user-not-found') {
                    errorMessage = "Usuário não encontrado. Verifique o email.";
                } else if (error.code === 'auth/wrong-password') {
                    errorMessage = "Senha incorreta. Tente novamente.";
                } else if (error.code === 'auth/too-many-requests') {
                    errorMessage = "Muitas tentativas. Aguarde alguns minutos.";
                }

                closeModal();
                showModal(`
          <div class="text-center">
            <div class="text-yellow-500 text-5xl mb-4">⚠️</div>
            <h3 class="text-xl font-bold mb-2">Falha no Login</h3>
            <p class="text-gray-700 mb-4">${errorMessage}</p>
            <p class="text-sm text-gray-500">Tentativas restantes: <strong>${5 - loginAttempts.count}</strong></p>
            <button onclick="window.closeModal()" class="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition">Tentar Novamente</button>
          </div>
        `);
            }
        });

        // Enter para submeter
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('login-submit').click();
            }
        });
    });
});

adminLogoutBtn.addEventListener('click', () => signOut(auth));

function renderMenu() {
    const containers = { tamanho: document.getElementById('tamanhos-container'), fruta: document.getElementById('frutas-container'), creme: document.getElementById('cremes-container'), outro: document.getElementById('outros-container') };
    Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });
    precosBase = {};
    const produtosVisiveis = produtos.filter(p => p.category !== 'insumo' && p.isActive !== false);
    if (produtosVisiveis.length === 0) { Object.values(containers).forEach(c => { if (c) c.innerHTML = '<p class="text-red-500 text-sm col-span-full">Nenhum item. Faça login como admin para adicionar produtos.</p>'; }); return; }

    produtosVisiveis.forEach(p => {
        const pId = p.name.replace(/[^a-zA-Z0-9]/g, '');
        if (p.category === 'tamanho' && containers.tamanho) {
            precosBase[p.name] = p.price;
            containers.tamanho.innerHTML += `
                <div>
                    <input type="radio" name="tamanho" value="${p.name}" id="tamanho-${pId}" class="peer hidden">
                    <label for="tamanho-${pId}" class="block cursor-pointer p-4 border-2 border-gray-100 rounded-2xl text-center bg-white peer-checked:border-brand-purple peer-checked:bg-purple-50 transition-all hover:shadow-md h-full flex flex-col justify-center gap-1">
                        <span class="font-bold text-gray-800 block text-lg">${p.name}</span>
                        <span class="text-sm font-semibold text-brand-purple">R$${p.price.toFixed(2)}</span>
                    </label>
                </div>`;
        } else {
            if (containers[p.category]) {
                containers[p.category].innerHTML += `
                <div class="relative group">
                  <input type="checkbox" value="${p.name}" data-qty-target="qty-${pId}" id="check-${pId}" class="acompanhamento-check peer hidden">
                   <label for="check-${pId}" class="cursor-pointer flex items-center bg-white p-3 border border-gray-100 rounded-xl hover:shadow-md transition-all peer-checked:border-brand-purple peer-checked:bg-purple-50">
                      <img src="${p.iconUrl || 'https://placehold.co/40x40/f3e8ff/9333ea?text=' + p.name.charAt(0)}" alt="${p.name}" class="w-10 h-10 object-cover mr-3 flex-shrink-0 rounded-full shadow-sm bg-gray-100" onerror="this.src='https://placehold.co/40x40/f3e8ff/9333ea?text=' + this.alt.charAt(0)">
                      <div class="flex-grow min-w-0">
                        <span class="block font-semibold text-gray-700 truncate text-sm">${p.name}</span>
                        <span class="text-xs text-gray-400">R$${(p.cost || 0).toFixed(2)}</span>
                      </div>
                   </label>
                   <div class="absolute right-2 top-1/2 -translate-y-1/2 hidden peer-checked:flex items-center gap-1 bg-white rounded-lg shadow-sm border border-purple-100 p-1">
                        <input type="number" value="1" min="1" id="qty-${pId}" class="acompanhamento-qty w-12 text-center text-sm font-bold text-brand-purple outline-none bg-transparent">
                   </div>
                </div>`;
            }
        }
    });

    document.querySelectorAll('.acompanhamento-check').forEach(check => {
        check.addEventListener('change', (e) => {
            const qtyInput = document.getElementById(e.target.dataset.qtyTarget);
            if (e.target.checked) {
                qtyInput.parentElement.querySelector('.absolute').classList.remove('hidden'); // Show qty container
                qtyInput.value = 1;
            } else {
                qtyInput.parentElement.querySelector('.absolute').classList.add('hidden'); // Hide qty container
            }
            calcularValor();
        });
    });
    document.querySelectorAll('input, textarea').forEach(el => { el.addEventListener("change", calcularValor); el.addEventListener("input", calcularValor); });
    document.getElementById('apenas-acai-check').addEventListener('change', calcularValor);
}

function renderCombosMenu() {
    const container = document.getElementById('combos-container');
    const section = document.getElementById('combos-section');
    if (!container || !section) return;
    container.innerHTML = '';
    const combosAtivos = combos.filter(c => c.isActive !== false);

    if (combosAtivos.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    combosAtivos.forEach(combo => {
        container.innerHTML += `
            <div class="glass bg-white/80 p-0 rounded-3xl shadow-lg flex flex-col border border-white/50 overflow-hidden hover:scale-[1.02] transition-transform duration-300">
                <div class="h-40 w-full bg-gray-200 relative">
                    <img src="${combo.imageUrl || 'https://placehold.co/600x400/f3e8ff/9333ea?text=Combo'}" alt="${combo.name}" class="w-full h-full object-cover">
                    <div class="absolute top-3 right-3 bg-brand-green text-white font-bold px-3 py-1 rounded-full text-sm shadow-md">
                        R$${(combo.price || 0).toFixed(2).replace('.', ',')}
                    </div>
                </div>
                <div class="p-5 flex flex-col flex-grow">
                    <h4 class="text-xl font-display font-bold text-brand-purple mb-2">${combo.name}</h4>
                    <p class="text-sm text-gray-600 flex-grow mb-4 leading-relaxed">${combo.description}</p>
                    <button onclick="window.pedirCombo('${combo.id}')" class="w-full bg-brand-purple hover:bg-brand-light text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2">
                        <span>Pedir Agora</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 7a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 0 1H-0.5A.5.5 0 0 1-1 7z"/></svg>
                    </button>
                </div>
            </div>
        `;
    });
}

function calcularValor() {
    const tamanhoEl = document.querySelector('input[name="tamanho"]:checked');
    const apenasAcai = document.getElementById('apenas-acai-check').checked;
    const rulesText = document.getElementById('acompanhamentos-rules');

    let totalText = "R$0,00";
    if (tamanhoEl) {
        const tamanho = tamanhoEl.value;
        const quantidade = parseInt(document.getElementById("quantidade").value) || 0;

        let totalPorcoes = 0;
        document.querySelectorAll('.acompanhamento-check:checked').forEach(check => {
            const qtyInput = document.getElementById(check.dataset.qtyTarget);
            totalPorcoes += parseInt(qtyInput.value) || 0;
        });

        let precoBase = precosBase[tamanho] || 0;
        let adicionais = 0;

        if (apenasAcai) {
            adicionais = totalPorcoes * 3;
            if (rulesText) rulesText.textContent = 'Todos os acompanhamentos são cobrados como extra (R$3 cada).';
        } else {
            adicionais = totalPorcoes > 3 ? (totalPorcoes - 3) * 3 : 0;
            if (rulesText) rulesText.textContent = '3 porções por copo | Adicional R$3 por porção extra';
        }

        let total = (precoBase + adicionais) * quantidade;
        totalText = "R$" + total.toFixed(2).replace(".", ",");
    }
    const valorMobileEl = document.getElementById("valor-mobile");
    const valorDesktopEl = document.getElementById("valor-desktop");
    if (valorMobileEl) valorMobileEl.innerText = totalText;
    if (valorDesktopEl) valorDesktopEl.innerText = totalText;
}

function resetarFormulario() {
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
        el.checked = false;
        el.dispatchEvent(new Event('change'));
    });
    // Reset payment method to default (Dinheiro)
    const dinheiroRadio = document.getElementById('payment-dinheiro');
    if (dinheiroRadio) dinheiroRadio.checked = true;

    document.getElementById('quantidade').value = 1;
    document.getElementById('nome-cliente').value = '';
    document.getElementById('telefone-cliente').value = '';
    document.getElementById('observacoes').value = '';
    calcularValor();
}

function handleOrderAction() {
    if (isStoreOpen) { enviarPedido(); } else { showModal(storeSettings.mensagemFechado || "Desculpe, estamos fechados no momento."); }
}
sendOrderBtnMobile.addEventListener('click', handleOrderAction);
sendOrderBtnDesktop.addEventListener('click', handleOrderAction);

async function enviarPedido() {
    if (!isStoreOpen) return;
    const tamanhoEl = document.querySelector('input[name="tamanho"]:checked');
    if (!tamanhoEl) { showModal("Por favor, selecione o tamanho do copo!"); return; }
    const quantidade = document.getElementById("quantidade").value;
    if (quantidade < 1) { showModal("Por favor, informe a quantidade!"); return; }

    // Validação de nome do cliente (2-100 caracteres, apenas letras e espaços)
    const nomeCliente = document.getElementById('nome-cliente').value.trim();
    if (!nomeCliente) {
        showModal("Por favor, digite seu nome!");
        return;
    }
    if (nomeCliente.length < 2 || nomeCliente.length > 100) {
        showModal("Nome deve ter entre 2 e 100 caracteres.");
        return;
    }
    if (!/^[a-záàâãéèêíïóôõöúçñA-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s]+$/.test(nomeCliente)) {
        showModal("Nome deve conter apenas letras.");
        return;
    }

    // Validação de telefone (formato brasileiro)
    const telefoneCliente = document.getElementById('telefone-cliente').value.trim();
    if (!telefoneCliente) {
        showModal("Por favor, digite seu telefone!");
        return;
    }
    // Remover caracteres não numéricos
    const telefoneLimpo = telefoneCliente.replace(/\D/g, '');
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        showModal("Telefone inválido. Use o formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX");
        return;
    }

    const acompanhamentosSelecionados = [];
    document.querySelectorAll('.acompanhamento-check:checked').forEach(check => {
        const nome = check.value;
        const qtyInput = document.getElementById(check.dataset.qtyTarget);
        const qty = qtyInput.value;
        acompanhamentosSelecionados.push({ name: nome, quantity: parseInt(qty) });
    });

    const apenasAcai = document.getElementById('apenas-acai-check').checked;
    if (!apenasAcai && acompanhamentosSelecionados.length === 0) { showModal("Por favor, selecione ao menos 1 acompanhamento ou marque 'Apenas Açaí'."); return; }

    const observacoes = document.getElementById("observacoes").value;
    const valor = document.getElementById("valor-mobile").innerText;

    const paymentMethodEl = document.querySelector('input[name="payment-method"]:checked');
    if (!paymentMethodEl) { showModal("Por favor, selecione a forma de pagamento!"); return; }
    const paymentMethod = paymentMethodEl.value;

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

            transaction.set(counterRef, {
                lastOrderNumber: newCount,
                lastOrderDate: todayStr
            });

            const paddedCount = String(newCount).padStart(3, '0');
            return `${displayDate}-${paddedCount}`;
        });
    } catch (e) {
        console.error("Transaction failed: ", e);
        showModal("Não foi possível gerar o ID do pedido. Tente novamente.");
        return;
    }

    const numero = storeSettings.whatsappNumber || "5514991962607";
    const acompanhamentosText = acompanhamentosSelecionados.map(a => `${a.name} (x${a.quantity})`).join("\n- ");
    const msg = `*Novo Pedido: ${orderId}*\n\n*Cliente:* ${nomeCliente}\n*Telefone:* ${telefoneCliente}\n\nOlá! Quero pedir ${quantidade} copo(s) de açaí ${tamanhoEl.value}.\n\n*Acompanhamentos:*\n- ${acompanhamentosSelecionados.length > 0 ? acompanhamentosText : 'Nenhum (Somente Açaí)'}\n\n📝 *Observações:* ${observacoes || "Nenhuma"}\n\n*Forma de Pagamento:* ${paymentMethod}\n\n💰 *Valor Total: ${valor}*`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");

    try {
        await addDoc(collection(db, "vendas"), { orderId, nomeCliente, telefoneCliente, tamanho: tamanhoEl.value, quantidade: parseInt(quantidade), acompanhamentos: acompanhamentosSelecionados, observacoes: observacoes || "Nenhuma", total: valor, status: "pendente", paymentMethod: paymentMethod, timestamp: serverTimestamp() });

        if (paymentMethod === 'PIX') {
            showPixModal(valor, orderId);
        } else {
            showModal("Pedido enviado com sucesso! Agradecemos a preferência.");
        }
        resetarFormulario();

    } catch (e) {
        console.error("Erro ao salvar venda: ", e);
        showModal("Ocorreu um erro ao salvar seu pedido no nosso sistema, mas você pode enviá-lo pelo WhatsApp.");
    }
}

window.closeModal = closeModal;

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

    const paymentMethodEl = document.querySelector('input[name="payment-method"]:checked');
    if (!paymentMethodEl) { showModal("Por favor, selecione a forma de pagamento!"); return; }
    const paymentMethod = paymentMethodEl.value;

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
    const msg = `*Pedido de Combo: ${orderId}*\n\n*Cliente:* ${nomeCliente}\n*Telefone:* ${telefoneCliente}\n\nOlá! Gostaria de pedir o *${combo.name}*.\n\n*Descrição:* ${combo.description || ''}\n\n*Forma de Pagamento:* ${paymentMethod}\n\n💰 *Valor Total: ${valor}*`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");

    try {
        const vendaData = {
            orderId, nomeCliente, telefoneCliente, pedidoCombo: combo.name, observacoes: combo.description || "", total: valor, status: "pendente", paymentMethod: paymentMethod, timestamp: serverTimestamp(), tamanho: "", quantidade: 1, acompanhamentos: []
        };
        await addDoc(collection(db, "vendas"), vendaData);

        if (paymentMethod === 'PIX') {
            showPixModal(valor, orderId);
        } else {
            showModal("Pedido do combo enviado com sucesso! Agradecemos a preferência.");
        }

    } catch (e) {
        console.error("Erro ao salvar venda do combo: ", e);
        showModal("Ocorreu um erro ao salvar seu pedido no nosso sistema, mas você pode enviá-lo pelo WhatsApp.");
    }
};

function renderAdminPanel() {
    adminPanel.innerHTML = `
        <h2 class="text-3xl font-bold text-center text-purple-700 mb-6">Painel de Administração</h2>
        <div class="flex border-b border-gray-200 mb-4 overflow-x-auto no-scrollbar">
            <button id="tab-dashboard" class="tab-btn py-2 px-4 font-semibold border-b-2 tab-active flex-shrink-0">Visão Geral</button>
            <button id="tab-produtos" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Gerenciar Produtos</button>
            <button id="tab-combos" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Gerenciar Combos</button>
            <button id="tab-vendas" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Relatório de Vendas</button>
            <button id="tab-caixa" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Fluxo de Caixa</button>
            <button id="tab-notificacoes" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">🔔 Notificações</button>
            <button id="tab-config" class="tab-btn py-2 px-4 font-semibold border-b-2 border-transparent flex-shrink-0">Configurações</button>
        </div>
        <div id="content-dashboard"></div>
        <div id="content-produtos" class="hidden"></div>
        <div id="content-combos" class="hidden"></div>
        <div id="content-vendas" class="hidden"></div>
        <div id="content-caixa" class="hidden"></div>
        <div id="content-notificacoes" class="hidden"></div>
        <div id="content-config" class="hidden"></div>
    `;

    renderDashboardAdmin(); // <-- ADICIONADO
    renderProdutosAdmin();
    renderCombosAdmin();
    renderVendasAdmin();
    renderCaixaAdmin();
    renderNotificacoesAdmin();
    renderConfigAdmin();

    const tabs = {
        dashboard: document.getElementById('tab-dashboard'), // <-- ADICIONADO
        produtos: document.getElementById('tab-produtos'),
        combos: document.getElementById('tab-combos'),
        vendas: document.getElementById('tab-vendas'),
        caixa: document.getElementById('tab-caixa'),
        notificacoes: document.getElementById('tab-notificacoes'),
        config: document.getElementById('tab-config')
    };
    const contents = {
        dashboard: document.getElementById('content-dashboard'), // <-- ADICIONADO
        produtos: document.getElementById('content-produtos'),
        combos: document.getElementById('content-combos'),
        vendas: document.getElementById('content-vendas'),
        caixa: document.getElementById('content-caixa'),
        notificacoes: document.getElementById('content-notificacoes'),
        config: document.getElementById('content-config')
    };

    Object.keys(tabs).forEach(key => {
        tabs[key].addEventListener('click', () => {
            Object.values(tabs).forEach(t => t.classList.remove('tab-active'));
            Object.values(contents).forEach(c => c.classList.add('hidden'));
            tabs[key].classList.add('tab-active');
            contents[key].classList.remove('hidden');
        });
    });
}
/**
 * Renderiza o layout HTML do painel de Visão Geral (Dashboard).
 */
function renderDashboardAdmin() {
    document.getElementById('content-dashboard').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white p-5 rounded-xl shadow-lg border border-blue-200">
            <h4 class="text-sm font-semibold text-blue-700">Saldo Atual (Total)</h4>
            <p id="dashboard-saldo" class="text-3xl font-bold text-blue-600">R$0,00</p>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-lg border border-green-200">
            <h4 class="text-sm font-semibold text-green-700">Vendas de Hoje</h4>
            <p id="dashboard-vendas-hoje" class="text-3xl font-bold text-green-600">R$0,00</p>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-lg border border-yellow-200">
            <h4 class="text-sm font-semibold text-yellow-700">Pedidos Pendentes (Hoje)</h4>
            <p id="dashboard-pendentes" class="text-3xl font-bold text-yellow-600">0</p>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-lg border border-purple-200">
            <h4 class="text-sm font-semibold text-purple-700">Total de Pedidos (Hoje)</h4>
            <p id="dashboard-total-pedidos" class="text-3xl font-bold text-purple-600">0</p>
        </div>
    </div>

    <!-- Novas Métricas -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-gradient-to-br from-pink-50 to-pink-100 p-5 rounded-xl shadow-lg border border-pink-200">
            <h4 class="text-sm font-semibold text-pink-700">💰 Ticket Médio (Hoje)</h4>
            <p id="dashboard-ticket-medio" class="text-2xl font-bold text-pink-600">R$0,00</p>
        </div>
        <div class="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl shadow-lg border border-orange-200">
            <h4 class="text-sm font-semibold text-orange-700">📊 CMV (Hoje)</h4>
            <p id="dashboard-cmv" class="text-2xl font-bold text-orange-600">R$0,00</p>
            <p class="text-xs text-orange-500 mt-1">Custo de Mercadoria Vendida</p>
        </div>
        <div class="bg-gradient-to-br from-teal-50 to-teal-100 p-5 rounded-xl shadow-lg border border-teal-200">
            <h4 class="text-sm font-semibold text-teal-700">📈 Lucro Bruto (Hoje)</h4>
            <p id="dashboard-lucro-bruto" class="text-2xl font-bold text-teal-600">R$0,00</p>
        </div>
    </div>

    <!-- Top Produtos -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="bg-white p-6 rounded-2xl shadow-lg">
            <h3 class="text-xl font-semibold mb-4 text-purple-700">🏆 Top 3 Mais Vendidos (Hoje)</h3>
            <div id="dashboard-top-vendidos" class="space-y-2">
                <p class="text-gray-500 text-sm">Carregando...</p>
            </div>
        </div>
        <div class="bg-white p-6 rounded-2xl shadow-lg">
            <h3 class="text-xl font-semibold mb-4 text-green-700">💎 Top 3 Mais Lucrativos (Hoje)</h3>
            <div id="dashboard-top-lucrativos" class="space-y-2">
                <p class="text-gray-500 text-sm">Carregando...</p>
            </div>
        </div>
    </div>

    <!-- Alertas -->
    <div id="dashboard-alertas" class="mb-6"></div>

    <div class="bg-white p-6 rounded-2xl shadow-lg">
        <h3 class="text-2xl font-semibold mb-4 text-purple-700">Pedidos Pendentes de Hoje</h3>
        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="p-3">ID Pedido</th>
                        <th class="p-3">Hora</th>
                        <th class="p-3">Cliente</th>
                        <th class="p-3">Pedido</th>
                        <th class="p-3">Pagamento</th>
                        <th class="p-3">Total</th>
                        <th class="p-3">Ações</th>
                    </tr>
                </thead>
                <tbody id="dashboard-vendas-pendentes-body" class="divide-y divide-gray-200">
                    <tr><td colspan="7" class="text-center p-4 text-gray-500">Carregando...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    `;
    carregarDashboardData();
}

/**
 * Carrega e monitora os dados para o painel de Visão Geral (Dashboard).
 */
function carregarDashboardData() {

    // 1. Carregar Saldo do Caixa (Total)
    if (unsubscribeDashboardCaixa) unsubscribeDashboardCaixa();
    const qCaixa = query(collection(db, "fluxoCaixa"));
    unsubscribeDashboardCaixa = onSnapshot(qCaixa, (snapshot) => {
        let totalEntradas = 0, totalSaidas = 0;
        snapshot.docs.forEach(docSnap => {
            const t = docSnap.data();
            if (t.tipo === 'entrada') totalEntradas += (t.valor || 0);
            else totalSaidas += (t.valor || 0);
        });
        const saldoEl = document.getElementById('dashboard-saldo');
        if (saldoEl) saldoEl.innerText = `R$${(totalEntradas - totalSaidas).toFixed(2).replace('.', ',')}`;
    });

    // 2. Carregar Vendas de Hoje (para KPIs e tabela de pendentes)
    if (unsubscribeDashboardVendas) unsubscribeDashboardVendas();
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const qVendas = query(collection(db, "vendas"), where("timestamp", ">=", startOfDay), where("timestamp", "<=", endOfDay), orderBy("timestamp", "desc"));

    unsubscribeDashboardVendas = onSnapshot(qVendas, (snapshot) => {
        const tableBody = document.getElementById('dashboard-vendas-pendentes-body');
        const vendasHojeEl = document.getElementById('dashboard-vendas-hoje');
        const pendentesEl = document.getElementById('dashboard-pendentes');
        const totalPedidosEl = document.getElementById('dashboard-total-pedidos');
        const ticketMedioEl = document.getElementById('dashboard-ticket-medio');
        const cmvEl = document.getElementById('dashboard-cmv');
        const lucroBrutoEl = document.getElementById('dashboard-lucro-bruto');
        const topVendidosEl = document.getElementById('dashboard-top-vendidos');
        const topLucrativosEl = document.getElementById('dashboard-top-lucrativos');
        const alertasEl = document.getElementById('dashboard-alertas');

        if (!tableBody || !vendasHojeEl || !pendentesEl || !totalPedidosEl) return;

        let totalVendasHoje = 0;
        let pedidosPendentesCount = 0;
        let totalCMV = 0;
        const produtosVendidos = {};
        const produtosLucro = {};
        const alertasMargem = [];

        tableBody.innerHTML = ''; // Limpa a tabela para recarregar

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-gray-500">Nenhum pedido hoje.</td></tr>';
        } else {
            snapshot.docs.forEach(docSnap => {
                const venda = { id: docSnap.id, ...docSnap.data() };
                const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.'));

                if (!isNaN(valorNumerico)) {
                    totalVendasHoje += valorNumerico;
                }

                // Calcular CMV e métricas por produto
                if (!venda.pedidoCombo && venda.tamanho) {
                    const { custoTotal } = calcularCustoPedido(venda);
                    totalCMV += custoTotal;

                    // Contabilizar vendidos
                    if (!produtosVendidos[venda.tamanho]) {
                        produtosVendidos[venda.tamanho] = { quantidade: 0, valor: 0 };
                    }
                    produtosVendidos[venda.tamanho].quantidade += venda.quantidade || 1;
                    produtosVendidos[venda.tamanho].valor += valorNumerico;

                    // Contabilizar lucro
                    const lucro = valorNumerico - custoTotal;
                    if (!produtosLucro[venda.tamanho]) {
                        produtosLucro[venda.tamanho] = 0;
                    }
                    produtosLucro[venda.tamanho] += lucro;

                    // Verificar margens baixas
                    const margem = calcularMargem(valorNumerico, custoTotal);
                    if (margem < 35) {
                        alertasMargem.push({
                            produto: venda.tamanho,
                            margem: margem,
                            pedidoId: venda.orderId
                        });
                    }
                }

                // Adiciona à tabela apenas se estiver pendente
                if (venda.status === 'pendente') {
                    pedidosPendentesCount++;
                    const data = venda.timestamp ? new Date(venda.timestamp.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
                    const isCombo = venda.pedidoCombo && !venda.tamanho;
                    const pedidoHTML = isCombo ? `<strong>Combo:</strong> ${escapeHTML(venda.pedidoCombo)}` : `${venda.quantidade}x ${escapeHTML(venda.tamanho)}`;
                    const paymentIcon = venda.paymentMethod === 'PIX' ? '📱' : venda.paymentMethod === 'Cartão' ? '💳' : '💵';

                    tableBody.innerHTML += `<tr class="border-b-0">
                        <td class="p-3 text-sm font-mono">${escapeHTML(venda.orderId || 'N/A')}</td>
                        <td class="p-3 text-sm">${data}</td>
                        <td class="p-3 text-sm font-semibold">${escapeHTML(venda.nomeCliente || 'N/A')}</td>
                        <td class="p-3 text-sm">${pedidoHTML}</td>
                        <td class="p-3 text-sm">${escapeHTML(venda.paymentMethod || 'N/A')} ${paymentIcon}</td>
                        <td class="p-3 font-medium">${escapeHTML(venda.total)}</td>
                        <td class="p-3">
                            <button class="confirm-venda-btn bg-green-500 text-white px-2 py-1 rounded text-xs" data-id="${venda.id}">✔️</button>
                            <button class="delete-venda-btn bg-red-500 text-white px-2 py-1 rounded text-xs ml-1" data-id="${venda.id}">🗑️</button>
                        </td>
                    </tr>`;
                }
            });

            if (pedidosPendentesCount === 0) {
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-gray-500">Nenhum pedido pendente.</td></tr>';
            }
        }

        // Atualiza os cartões (KPIs)
        vendasHojeEl.innerText = `R$${totalVendasHoje.toFixed(2).replace('.', ',')}`;
        pendentesEl.innerText = pedidosPendentesCount;
        totalPedidosEl.innerText = snapshot.size; // Total de pedidos do dia

        // Ticket médio
        const ticketMedio = snapshot.size > 0 ? totalVendasHoje / snapshot.size : 0;
        if (ticketMedioEl) ticketMedioEl.innerText = `R$${ticketMedio.toFixed(2).replace('.', ',')}`;

        // CMV
        if (cmvEl) cmvEl.innerText = `R$${totalCMV.toFixed(2).replace('.', ',')}`;

        // Lucro Bruto
        const lucroBruto = totalVendasHoje - totalCMV;
        if (lucroBrutoEl) {
            lucroBrutoEl.innerText = `R$${lucroBruto.toFixed(2).replace('.', ',')}`;
        }

        // Top 3 Vendidos
        if (topVendidosEl) {
            const topVendidos = Object.entries(produtosVendidos)
                .sort((a, b) => b[1].quantidade - a[1].quantidade)
                .slice(0, 3);

            if (topVendidos.length > 0) {
                let html = '';
                topVendidos.forEach(([produto, dados], index) => {
                    const medal = ['🥇', '🥈', '🥉'][index];
                    html += `
                        <div class="flex justify-between items-center p-2 bg-purple-50 rounded-lg">
                            <div>
                                <span class="text-lg">${medal}</span>
                                <span class="font-semibold ml-2">${escapeHTML(produto)}</span>
                            </div>
                            <div class="text-right">
                                <p class="font-bold text-purple-700">${dados.quantidade} un</p>
                                <p class="text-xs text-gray-600">R$${dados.valor.toFixed(2)}</p>
                            </div>
                        </div>
                    `;
                });
                topVendidosEl.innerHTML = html;
            } else {
                topVendidosEl.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma venda ainda</p>';
            }
        }

        // Top 3 Lucrativos
        if (topLucrativosEl) {
            const topLucrativos = Object.entries(produtosLucro)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

            if (topLucrativos.length > 0) {
                let html = '';
                topLucrativos.forEach(([produto, lucro], index) => {
                    const medal = ['🥇', '🥈', '🥉'][index];
                    html += `
                        <div class="flex justify-between items-center p-2 bg-green-50 rounded-lg">
                            <div>
                                <span class="text-lg">${medal}</span>
                                <span class="font-semibold ml-2">${escapeHTML(produto)}</span>
                            </div>
                            <p class="font-bold text-green-700">R$${lucro.toFixed(2)}</p>
                        </div>
                    `;
                });
                topLucrativosEl.innerHTML = html;
            } else {
                topLucrativosEl.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma venda ainda</p>';
            }
        }

        // Alertas de margem baixa
        if (alertasEl && alertasMargem.length > 0) {
            let alertasHTML = `
                <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
                    <h4 class="font-bold text-yellow-800 mb-2">⚠️ Atenção: Produtos com Margem Baixa Vendidos Hoje</h4>
                    <div class="space-y-1">
            `;

            alertasMargem.forEach(alerta => {
                alertasHTML += `
                    <p class="text-sm text-yellow-700">
                        • Pedido <strong>${escapeHTML(alerta.pedidoId)}</strong> - ${escapeHTML(alerta.produto)} - Margem: <strong class="text-red-600">${alerta.margem.toFixed(1)}%</strong>
                    </p>
                `;
            });

            alertasHTML += `
                    </div>
                </div>
            `;
            alertasEl.innerHTML = alertasHTML;
        } else if (alertasEl) {
            alertasEl.innerHTML = '';
        }

        // Re-associa os eventos aos botões da tabela (importante!)
        document.querySelectorAll('.confirm-venda-btn').forEach(btn => btn.addEventListener('click', e => confirmarVenda(e.currentTarget.dataset.id)));
        document.querySelectorAll('.delete-venda-btn').forEach(btn => btn.addEventListener('click', e => deletarVenda(e.currentTarget.dataset.id)));
    });
}

function renderProdutosAdmin() {
    document.getElementById('content-produtos').innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Adicionar / Editar Produto</h3><div class="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6 p-4 border border-gray-200 rounded-lg"><input type="hidden" id="produto-id"><input type="text" id="produto-nome" placeholder="Nome" class="p-2 border rounded border-gray-300"><input type="number" id="produto-preco" placeholder="Preço Venda" step="0.01" class="p-2 border rounded border-gray-300"><input type="number" id="produto-custo" placeholder="Preço Custo" step="0.01" class="p-2 border rounded border-gray-300"><input type="text" id="produto-unidade" placeholder="Unidade (g, ml, un)" class="p-2 border rounded border-gray-300"><input type="text" id="produto-icone" placeholder="URL do Ícone" class="p-2 border rounded border-gray-300"><select id="produto-categoria" class="p-2 border rounded border-gray-300"><option value="tamanho">Tamanho</option><option value="fruta">Fruta</option><option value="creme">Creme</option><option value="outro">Outro</option><option value="insumo">Insumo</option></select><button id="salvar-produto-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600 col-span-full">Salvar</button></div><div id="lista-produtos-admin"></div></div>`;
    document.getElementById('salvar-produto-btn').addEventListener('click', salvarProduto);
    carregarProdutosAdmin();
}

function renderCombosAdmin() {
    document.getElementById('content-combos').innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg mb-8"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Adicionar / Editar Combo</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border border-gray-200 rounded-lg"><input type="hidden" id="combo-id"><input type="text" id="combo-nome" placeholder="Nome do Combo" class="p-2 border rounded border-gray-300"><input type="number" id="combo-preco" placeholder="Preço do Combo" step="0.01" class="p-2 border rounded border-gray-300"><input type="text" id="combo-imagem" placeholder="URL da Imagem" class="p-2 border rounded col-span-full border-gray-300"><textarea id="combo-descricao" placeholder="Descrição do Combo (Ex: 2 Açaís 500ml...)" class="p-2 border rounded col-span-full border-gray-300" rows="3"></textarea><button id="salvar-combo-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600 col-span-full">Salvar Combo</button></div><div id="lista-combos-admin"></div></div>`;
    document.getElementById('salvar-combo-btn').addEventListener('click', salvarCombo);
    carregarCombosAdmin();
}

async function salvarCombo() {
    const id = document.getElementById('combo-id').value;
    const combo = { name: document.getElementById('combo-nome').value, price: parseFloat(document.getElementById('combo-preco').value) || 0, description: document.getElementById('combo-descricao').value, imageUrl: document.getElementById('combo-imagem').value, isActive: true };
    if (!combo.name || !combo.description || combo.price <= 0) { showModal("Nome, Descrição e Preço válido são obrigatórios."); return; }
    try {
        if (id) { const existingCombo = combos.find(c => c.id === id); if (existingCombo) combo.isActive = existingCombo.isActive; await updateDoc(doc(db, "combos", id), combo); } else { await addDoc(collection(db, "combos"), combo); }
        document.getElementById('combo-id').value = ''; document.getElementById('combo-nome').value = ''; document.getElementById('combo-preco').value = ''; document.getElementById('combo-descricao').value = ''; document.getElementById('combo-imagem').value = '';
    } catch (error) { console.error("Erro ao salvar combo:", error); showModal("Não foi possível salvar o combo."); }
}

function carregarCombosAdmin() {
    onSnapshot(query(collection(db, "combos"), orderBy("name")), (snapshot) => {
        const container = document.getElementById('lista-combos-admin');
        if (!container) return;
        container.innerHTML = `<h4 class="text-xl font-medium mt-6 mb-2 text-purple-600">Combos Cadastrados</h4>`;
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        if (snapshot.empty) { grid.innerHTML = '<p class="col-span-full text-gray-500">Nenhum combo cadastrado.</p>'; }
        snapshot.forEach(docSnap => {
            const c = { id: docSnap.id, ...docSnap.data() };
            const isInactive = c.isActive === false;
            grid.innerHTML += `<div class="border border-gray-200 p-3 rounded-lg flex justify-between items-start ${isInactive ? 'opacity-50' : ''}"><div class="flex-grow"><p class="font-bold">${escapeHTML(c.name)}</p><p class="text-sm text-gray-600">${escapeHTML(c.description)}</p><p class="text-md font-semibold text-green-700 mt-1">R$${(c.price || 0).toFixed(2)}</p></div><div class="flex flex-col ml-2"><button class="toggle-combo-btn p-1 text-white rounded mb-1 ${isInactive ? 'bg-gray-400' : 'bg-green-500'}" data-id="${c.id}">${isInactive ? '🚫' : '👁️'}</button><button class="edit-combo-btn p-1 text-blue-500" data-id="${c.id}">✏️</button><button class="delete-combo-btn p-1 text-red-500" data-id="${c.id}">🗑️</button></div></div>`;
        });
        container.appendChild(grid);
        document.querySelectorAll('.edit-combo-btn').forEach(btn => btn.addEventListener('click', (e) => editarCombo(e.currentTarget.dataset.id)));
        document.querySelectorAll('.delete-combo-btn').forEach(btn => btn.addEventListener('click', (e) => deletarCombo(e.currentTarget.dataset.id)));
        document.querySelectorAll('.toggle-combo-btn').forEach(btn => btn.addEventListener('click', (e) => toggleComboStatus(e.currentTarget.dataset.id)));
    });
}

function editarCombo(id) {
    const c = combos.find(combo => combo.id === id);
    if (c) { document.getElementById('combo-id').value = c.id; document.getElementById('combo-nome').value = c.name; document.getElementById('combo-preco').value = c.price; document.getElementById('combo-descricao').value = c.description; document.getElementById('combo-imagem').value = c.imageUrl; }
}

function deletarCombo(id) {
    showModal(`<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir este combo?</p><button id="confirm-delete-combo-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg ml-2">Cancelar</button>`, () => {
        document.getElementById('confirm-delete-combo-btn').addEventListener('click', async () => {
            try { await deleteDoc(doc(db, "combos", id)); closeModal(); } catch (error) { console.error("Erro ao excluir combo:", error); closeModal(); showModal('Ocorreu um erro ao excluir o combo.'); }
        });
    });
}

async function toggleComboStatus(id) {
    const combo = combos.find(c => c.id === id);
    if (combo) {
        const newStatus = !(combo.isActive !== false);
        try { await updateDoc(doc(db, "combos", id), { isActive: newStatus }); } catch (error) { console.error("Erro ao atualizar status:", error); showModal("Não foi possível atualizar o status do combo."); }
    }
}

function renderVendasAdmin() {
    document.getElementById('content-vendas').innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Relatório de Vendas</h3><div class="flex flex-wrap gap-4 items-center mb-4 p-4 border border-gray-200 rounded-lg"><label for="start-date">De:</label><input type="date" id="start-date" class="p-2 border rounded border-gray-300"><label for="end-date">Até:</label><input type="date" id="end-date" class="p-2 border rounded border-gray-300"><button id="gerar-relatorio-btn" class="bg-blue-500 text-white p-2 rounded hover:bg-blue-600">Gerar Relatório</button><button id="exportar-relatorio-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600">Exportar CSV</button></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-gray-100"><tr><th class="p-3">ID Pedido</th><th class="p-3">Data/Hora</th><th class="p-3">Cliente</th><th class="p-3">Pedido</th><th class="p-3">Pagamento</th><th class="p-3">Financeiro</th><th class="p-3">Status</th><th class="p-3">Ações</th></tr></thead><tbody id="vendas-table-body" class="divide-y divide-gray-200"></tbody></table></div><div class="mt-4 flex justify-end items-start gap-8 pr-4"><div id="total-por-tamanho" class="text-right"></div><div class="text-right"><h4 class="text-xl font-bold text-gray-800">Total das Vendas (Período): <span id="total-vendas" class="text-purple-700">R$0,00</span></h4></div></div></div>`;
    document.getElementById('gerar-relatorio-btn').addEventListener('click', () => carregarVendasAdmin(document.getElementById('start-date').value, document.getElementById('end-date').value));
    document.getElementById('exportar-relatorio-btn').addEventListener('click', exportarRelatorioVendas);
    carregarVendasAdmin();
}

async function exportarRelatorioVendas() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    let q = query(collection(db, "vendas"), orderBy("timestamp", "desc"));

    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q = query(collection(db, "vendas"), where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "desc"));
    }

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            showModal("Nenhuma venda encontrada no período para exportar.");
            return;
        }

        const sanitizeCSVField = (field) => {
            const str = String(field ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const headers = [
            'ID Pedido', 'Data/Hora', 'Cliente', 'Telefone', 'Item Principal', 'Quantidade',
            'Acompanhamentos', 'Observacoes', 'Pagamento', 'Total', 'Status'
        ];

        let csvContent = headers.join(',') + '\r\n';

        querySnapshot.forEach(docSnap => {
            const venda = docSnap.data();
            const data = venda.timestamp ? new Date(venda.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'N/A';

            const isCombo = venda.pedidoCombo && !venda.tamanho;
            const itemPrincipal = isCombo ? venda.pedidoCombo : venda.tamanho;
            const quantidade = isCombo ? 1 : venda.quantidade;

            const acompanhamentos = (venda.acompanhamentos || [])
                .map(a => `${a.name} (x${a.quantity})`)
                .join('; ');

            const row = [
                venda.orderId, data, venda.nomeCliente, venda.telefoneCliente,
                itemPrincipal, quantidade, acompanhamentos, venda.observacoes,
                venda.paymentMethod, venda.total, venda.status
            ].map(sanitizeCSVField).join(',');

            csvContent += row + '\r\n';
        });

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        link.setAttribute("download", `relatorio_vendas_${today}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Erro ao exportar relatório: ", error);
        showModal("Ocorreu um erro ao gerar o arquivo de exportação.");
    }
}

function renderConfigAdmin() {
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    let diasHTML = dias.map(dia => `<div class="grid grid-cols-1 sm:grid-cols-10 gap-x-4 gap-y-2 items-center mb-3 pb-3 border-b border-gray-200 last:border-b-0"><span class="font-semibold capitalize sm:col-span-3">${dia}-feira</span><input type="time" id="${dia}-abertura" class="p-2 border rounded w-full sm:col-span-3 border-gray-300"><input type="time" id="${dia}-fechamento" class="p-2 border rounded w-full sm:col-span-3 border-gray-300"><label class="flex items-center gap-2 sm:justify-self-center sm:col-span-1"><input type="checkbox" id="${dia}-aberto" class="w-5 h-5 accent-purple-600"> Aberto</label></div>`).join('');

    document.getElementById('content-config').innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-lg">
            <h3 class="text-2xl font-semibold mb-4 text-purple-700">Configurações Gerais</h3>
            <div class="mb-6 p-4 border border-gray-200 rounded-lg">
                <label for="whatsapp-number" class="block font-semibold mb-2">Número do WhatsApp para Pedidos</label>
                <input type="text" id="whatsapp-number" placeholder="Ex: 5511999998888" class="w-full p-2 border rounded border-gray-300">
            </div>
            
            <h3 class="text-2xl font-semibold mb-4 text-purple-700">Configurações do PIX</h3>
             <div class="mb-6 p-4 border border-gray-200 rounded-lg space-y-4">
                <div>
                    <label for="pix-key" class="block font-semibold mb-2">Chave PIX</label>
                    <input type="text" id="pix-key" placeholder="Sua chave PIX (CPF, CNPJ, e-mail, etc.)" class="w-full p-2 border rounded border-gray-300">
                </div>
                <div>
                    <label for="pix-recipient-name" class="block font-semibold mb-2">Nome do Beneficiário</label>
                    <input type="text" id="pix-recipient-name" placeholder="Nome completo que aparecerá no PIX" class="w-full p-2 border rounded border-gray-300">
                </div>
                <div>
                    <label for="pix-recipient-city" class="block font-semibold mb-2">Cidade do Beneficiário</label>
                    <input type="text" id="pix-recipient-city" placeholder="Cidade do beneficiário (sem acentos)" class="w-full p-2 border rounded border-gray-300">
                </div>
            </div>

            <h3 class="text-2xl font-semibold mb-4 text-purple-700">Horário de Funcionamento</h3>
            <div class="p-4 border border-gray-200 rounded-lg">${diasHTML}</div>
            <h3 class="text-2xl font-semibold mt-6 mb-4 text-purple-700">Mensagem (Loja Fechada)</h3>
            <textarea id="mensagem-fechado" class="w-full p-2 border rounded border-gray-300" rows="3" placeholder="Ex: Estamos fechados. Nosso horário é de..."></textarea>
            <button id="salvar-config-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600 mt-4">Salvar Configurações</button>
        </div>`;
    document.getElementById('salvar-config-btn').addEventListener('click', salvarConfiguracoes);
    carregarConfiguracoesAdmin();
}

function renderNotificacoesAdmin() {
    const settings = typeof notificationManager !== 'undefined' ? notificationManager.getSettings() : {
        sound: false,
        vibration: false,
        notifications: false,
        permission: 'default'
    };

    const permissionStatus = {
        'granted': { text: '✅ Permitidas', class: 'bg-green-100 text-green-800' },
        'denied': { text: '⛔ Bloqueadas', class: 'bg-red-100 text-red-800' },
        'default': { text: '⏸️ Não solicitadas', class: 'bg-yellow-100 text-yellow-800' }
    };

    const currentPermission = permissionStatus[settings.permission] || permissionStatus['default'];

    document.getElementById('content-notificacoes').innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-lg">
            <h3 class="text-2xl font-semibold mb-2 text-purple-700">🔔 Configurações de Notificações</h3>
            <p class="text-gray-600 mb-6">Configure como você deseja ser alertado sobre novos pedidos.</p>
            
            <!-- Status das Permissões -->
            <div class="mb-8 p-5 border-2 border-purple-200 rounded-xl bg-purple-50">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h4 class="text-lg font-semibold text-gray-800">Status das Permissões</h4>
                        <p class="text-sm text-gray-600">Permissão do navegador para notificações push</p>
                    </div>
                    <span class="px-4 py-2 rounded-full font-bold ${currentPermission.class}">${currentPermission.text}</span>
                </div>
                
                ${settings.permission !== 'granted' ? `
                    <button id="request-permission-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z"/>
                        </svg>
                        <span>Ativar Notificações Push</span>
                    </button>
                ` : `
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                        <p class="text-green-800 font-medium">✅ Notificações ativadas! Você receberá alertas de novos pedidos.</p>
                    </div>
                `}
            </div>

            <!-- Configurações de Som -->
            <div class="mb-6 p-5 border border-gray-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h4 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
                            🔊 Som de Alerta
                        </h4>
                        <p class="text-sm text-gray-600">Tocar som ao receber novo pedido</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="toggle-sound" class="sr-only peer" ${settings.sound ? 'checked' : ''}>
                        <div class="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                </div>
                <button id="test-sound-btn" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                    🎵 Testar Som
                </button>
            </div>

            <!-- Configurações de Vibração -->
            <div class="mb-6 p-5 border border-gray-200 rounded-xl">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
                            📳 Vibração (Mobile)
                        </h4>
                        <p class="text-sm text-gray-600">Vibrar dispositivo ao receber pedido</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="toggle-vibration" class="sr-only peer" ${settings.vibration ? 'checked' : ''}>
                        <div class="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                </div>
            </div>

            <!-- Teste de Notificação Completa -->
            <div class="p-5 border-2 border-purple-200 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50">
                <h4 class="text-lg font-semibold text-gray-800 mb-2">🧪 Testar Notificação Completa</h4>
                <p class="text-sm text-gray-600 mb-4">Enviar uma notificação de teste com som e vibração</p>
                <button id="test-notification-btn" class="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md">
                    🚀 Enviar Notificação de Teste
                </button>
            </div>

            <!-- Instruções -->
            <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h5 class="font-semibold text-blue-900 mb-2">💡 Como Funciona</h5>
                <ul class="text-sm text-blue-800 space-y-1 list-disc list-inside">
                    <li>Quando logado: Som + Toast visual no painel</li>
                    <li>Com aba fechada: Notificação push no navegador</li>
                    <li>Com site fechado: Notificação em segundo plano (requer permissão)</li>
                    <li>No celular: Som + vibração + notificação visual</li>
                </ul>
            </div>
        </div>
    `;

    // Event Listeners
    const requestPermissionBtn = document.getElementById('request-permission-btn');
    if (requestPermissionBtn) {
        requestPermissionBtn.addEventListener('click', async () => {
            if (typeof notificationManager !== 'undefined') {
                const granted = await notificationManager.requestPermission();
                if (granted) {
                    renderNotificacoesAdmin(); // Re-render para atualizar UI
                    showModal('✅ Notificações ativadas com sucesso!');
                } else {
                    showModal('⚠️ Permissão negada. Verifique as configurações do navegador.');
                }
            }
        });
    }

    const toggleSound = document.getElementById('toggle-sound');
    if (toggleSound) {
        toggleSound.addEventListener('change', () => {
            if (typeof notificationManager !== 'undefined') {
                const enabled = notificationManager.toggleSound();
                showToast(enabled ? '🔊 Som ativado' : '🔇 Som desativado');
            }
        });
    }

    const toggleVibration = document.getElementById('toggle-vibration');
    if (toggleVibration) {
        toggleVibration.addEventListener('change', () => {
            if (typeof notificationManager !== 'undefined') {
                const enabled = notificationManager.toggleVibration();
                showToast(enabled ? '📳 Vibração ativada' : '📴 Vibração desativada');
            }
        });
    }

    const testSoundBtn = document.getElementById('test-sound-btn');
    if (testSoundBtn) {
        testSoundBtn.addEventListener('click', () => {
            if (typeof notificationManager !== 'undefined') {
                notificationManager.playNotificationSound();
                showToast('🎵 Reproduzindo som de teste');
            }
        });
    }

    const testNotificationBtn = document.getElementById('test-notification-btn');
    if (testNotificationBtn) {
        testNotificationBtn.addEventListener('click', async () => {
            if (typeof notificationManager !== 'undefined') {
                await notificationManager.testNotification();
                showToast('🚀 Notificação de teste enviada!');
            }
        });
    }
}

function renderCaixaAdmin() {
    document.getElementById('content-caixa').innerHTML = `<div class="bg-white p-6 rounded-2xl shadow-lg"><h3 class="text-2xl font-semibold mb-4 text-purple-700">Fluxo de Caixa</h3><div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-center"><div class="bg-green-100 p-4 rounded-lg"><h4 class="font-semibold text-green-800">Total de Entradas</h4><p id="total-entradas" class="text-2xl font-bold text-green-600">R$0,00</p></div><div class="bg-red-100 p-4 rounded-lg"><h4 class="font-semibold text-red-800">Total de Saídas</h4><p id="total-saidas" class="text-2xl font-bold text-red-600">R$0,00</p></div><div class="bg-blue-100 p-4 rounded-lg"><h4 class="font-semibold text-blue-800">Saldo Atual</h4><p id="saldo-atual" class="text-2xl font-bold text-blue-600">R$0,00</p></div></div><div class="mb-6 p-4 border border-gray-200 rounded-lg"><h4 class="text-xl font-medium mb-3">Adicionar Lançamento</h4><div class="grid grid-cols-1 md:grid-cols-4 gap-4"><input type="hidden" id="transacao-id"><input type="text" id="transacao-descricao" placeholder="Descrição" class="p-2 border rounded col-span-2 border-gray-300"><input type="number" id="transacao-valor" placeholder="Valor" step="0.01" class="p-2 border rounded border-gray-300"><select id="transacao-tipo" class="p-2 border rounded border-gray-300"><option value="entrada">Entrada</option><option value="saida">Saída</option></select><button id="salvar-transacao-btn" class="bg-green-500 text-white p-2 rounded hover:bg-green-600 col-span-4 md:col-span-1">Salvar</button></div></div><div class="flex flex-wrap gap-4 items-center mb-4 p-4 border border-gray-200 rounded-lg"><label for="start-date-caixa">De:</label><input type="date" id="start-date-caixa" class="p-2 border rounded border-gray-300"><label for="end-date-caixa">Até:</label><input type="date" id="end-date-caixa" class="p-2 border rounded border-gray-300"><button id="gerar-relatorio-caixa-btn" class="bg-blue-500 text-white p-2 rounded hover:bg-blue-600">Filtrar</button></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-gray-100"><tr><th class="p-3">Data</th><th class="p-3">Descrição</th><th class="p-3">Tipo</th><th class="p-3">Valor</th><th class="p-3">Ações</th></tr></thead><tbody id="caixa-table-body" class="divide-y divide-gray-200"></tbody></table></div></div>`;
    document.getElementById('salvar-transacao-btn').addEventListener('click', salvarTransacao);
    document.getElementById('gerar-relatorio-caixa-btn').addEventListener('click', () => carregarFluxoCaixa(document.getElementById('start-date-caixa').value, document.getElementById('end-date-caixa').value));
    carregarFluxoCaixa();
}

async function salvarProduto() {
    const id = document.getElementById('produto-id').value;
    const produto = { name: document.getElementById('produto-nome').value, price: parseFloat(document.getElementById('produto-preco').value) || 0, cost: parseFloat(document.getElementById('produto-custo').value) || 0, unit: document.getElementById('produto-unidade').value, iconUrl: document.getElementById('produto-icone').value, category: document.getElementById('produto-categoria').value, isActive: true };
    if (!produto.name || !produto.unit) { showModal("Nome e Unidade são obrigatórios."); return; }
    if (produto.category === 'tamanho') { produto.recipe = []; }
    try {
        if (id) { const existingProd = produtos.find(p => p.id === id); if (existingProd) { produto.recipe = existingProd.recipe || []; produto.isActive = existingProd.isActive; } await updateDoc(doc(db, "produtos", id), produto); } else { await addDoc(collection(db, "produtos"), produto); }
        document.getElementById('produto-id').value = ''; document.getElementById('produto-nome').value = ''; document.getElementById('produto-preco').value = ''; document.getElementById('produto-custo').value = ''; document.getElementById('produto-unidade').value = ''; document.getElementById('produto-icone').value = '';
    } catch (error) { console.error("Erro ao salvar produto:", error); showModal("Não foi possível salvar o produto."); }
}

function carregarProdutosAdmin() {
    onSnapshot(collection(db, "produtos"), (snapshot) => {
        const container = document.getElementById('lista-produtos-admin');
        if (!container) return;
        const produtosPorCategoria = { tamanho: [], fruta: [], creme: [], outro: [], insumo: [] };
        snapshot.docs.forEach(docSnap => { const p = { id: docSnap.id, ...docSnap.data() }; if (produtosPorCategoria[p.category]) produtosPorCategoria[p.category].push(p); });
        container.innerHTML = '';

        for (const categoria in produtosPorCategoria) {
            if (produtosPorCategoria[categoria].length === 0) continue;

            container.innerHTML += `<h4 class="text-xl font-medium mt-6 mb-2 capitalize text-purple-600">${categoria}s</h4>`;
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';

            produtosPorCategoria[categoria].forEach(p => {
                const isInactive = p.isActive === false;
                const custo = calcularCustoReceita(p);
                const margem = calcularMargem(p.price, custo);
                const markup = calcularMarkup(p.price, custo);
                const precoSugerido = sugerirPreco(custo, 40);
                const alertas = validarProduto(p);

                // Definir cor da margem
                let margemClass = 'text-green-600';
                let margemIcon = '✅';
                if (margem < 30) {
                    margemClass = 'text-red-600';
                    margemIcon = '🔴';
                } else if (margem < 35) {
                    margemClass = 'text-yellow-600';
                    margemIcon = '⚠️';
                }

                // Card com informações detalhadas
                let cardHTML = `
                    <div class="border ${isInactive ? 'border-gray-300 opacity-50' : 'border-purple-200'} p-4 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                        <!-- Cabeçalho -->
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-grow">
                                <h5 class="font-bold text-lg text-gray-800">${escapeHTML(p.name)}</h5>
                                <p class="text-xs text-gray-500">${escapeHTML(p.unit)}</p>
                            </div>
                            <div class="flex items-center gap-1">
                                ${p.category !== 'tamanho' && p.category !== 'insumo' ? `<button class="toggle-active-btn p-1.5 text-white rounded ${isInactive ? 'bg-gray-400' : 'bg-green-500'}" data-id="${p.id}" title="${isInactive ? 'Ativar' : 'Desativar'}">${isInactive ? '🚫' : '👁️'}</button>` : ''}
                                ${p.category === 'tamanho' || (p.category !== 'insumo' && p.category !== 'tamanho') ? `<button class="recipe-btn p-1.5 text-green-500 hover:bg-green-50 rounded" data-id="${p.id}" title="Editar Receita">⚙️</button>` : ''}
                                <button class="edit-produto-btn p-1.5 text-blue-500 hover:bg-blue-50 rounded" data-id="${p.id}" title="Editar">✏️</button>
                                <button class="delete-produto-btn p-1.5 text-red-500 hover:bg-red-50 rounded" data-id="${p.id}" title="Excluir">🗑️</button>
                            </div>
                        </div>
                `;

                // Informações financeiras (apenas para não-insumos)
                if (p.category !== 'insumo') {
                    cardHTML += `
                        <!-- Valores -->
                        <div class="grid grid-cols-2 gap-2 mb-3 text-sm">
                            <div class="bg-blue-50 p-2 rounded">
                                <p class="text-xs text-gray-600">💰 Venda</p>
                                <p class="font-bold text-blue-700">R$ ${(p.price || 0).toFixed(2)}</p>
                            </div>
                            <div class="bg-red-50 p-2 rounded">
                                <p class="text-xs text-gray-600">💸 Custo ${p.category === 'tamanho' && p.recipe && p.recipe.length > 0 ? '(calculado)' : ''}</p>
                                <p class="font-bold text-red-700">R$ ${custo.toFixed(2)}</p>
                            </div>
                        </div>
                    `;

                    // Métricas (apenas para tamanhos)
                    if (p.category === 'tamanho' && p.price > 0) {
                        cardHTML += `
                            <!-- Métricas de Lucro -->
                            <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded-lg mb-3">
                                <div class="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p class="text-xs text-gray-600">Lucro</p>
                                        <p class="font-bold text-green-600">R$ ${(p.price - custo).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-600">Margem ${margemIcon}</p>
                                        <p class="font-bold ${margemClass}">${margem.toFixed(1)}%</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-600">Markup</p>
                                        <p class="font-bold text-purple-600">${markup.toFixed(1)}%</p>
                                    </div>
                                </div>
                            </div>
                        `;

                        // Sugestão de preço se estiver abaixo da margem
                        if (margem < 40) {
                            cardHTML += `
                                <div class="bg-yellow-50 border border-yellow-200 p-2 rounded text-xs mb-2">
                                    <p class="text-yellow-800">💡 <strong>Sugestão:</strong> Para margem de 40%, preço ideal: <strong>R$ ${precoSugerido.toFixed(2)}</strong></p>
                                </div>
                            `;
                        }
                    }
                } else {
                    // Para insumos, mostrar apenas custo
                    cardHTML += `
                        <div class="bg-orange-50 p-2 rounded mb-3">
                            <p class="text-xs text-gray-600">💸 Custo por ${escapeHTML(p.unit)}</p>
                            <p class="font-bold text-orange-700">R$ ${(p.cost || 0).toFixed(2)}</p>
                        </div>
                    `;
                }

                // Alertas de validação
                if (alertas.length > 0) {
                    cardHTML += `<div class="space-y-1 mb-2">`;
                    alertas.forEach(alerta => {
                        const bgColor = alerta.tipo === 'erro' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200';
                        const textColor = alerta.tipo === 'erro' ? 'text-red-700' : 'text-yellow-700';
                        cardHTML += `
                            <div class="${bgColor} border px-2 py-1 rounded text-xs ${textColor}">
                                ${gerarIconeAlerta(alerta.tipo)} ${escapeHTML(alerta.mensagem)}
                            </div>
                        `;
                    });
                    cardHTML += `</div>`;
                }

                // Info da receita
                if (p.recipe && p.recipe.length > 0) {
                    cardHTML += `
                        <div class="text-xs text-gray-500 mt-2">
                            📋 Receita: ${p.recipe.length} ingrediente(s)
                        </div>
                    `;
                }

                cardHTML += `</div>`;
                grid.innerHTML += cardHTML;
            });

            container.appendChild(grid);
        }

        // Re-associar eventos
        document.querySelectorAll('.edit-produto-btn').forEach(btn => btn.addEventListener('click', (e) => editarProduto(e.currentTarget.dataset.id)));
        document.querySelectorAll('.delete-produto-btn').forEach(btn => btn.addEventListener('click', (e) => deletarProduto(e.currentTarget.dataset.id)));
        document.querySelectorAll('.recipe-btn').forEach(btn => btn.addEventListener('click', (e) => openRecipeModal(e.currentTarget.dataset.id)));
        document.querySelectorAll('.toggle-active-btn').forEach(btn => btn.addEventListener('click', (e) => toggleProductStatus(e.currentTarget.dataset.id)));
    });
}

function editarProduto(id) {
    const p = produtos.find(prod => prod.id === id);
    if (p) { document.getElementById('produto-id').value = p.id; document.getElementById('produto-nome').value = p.name; document.getElementById('produto-preco').value = p.price; document.getElementById('produto-custo').value = p.cost; document.getElementById('produto-unidade').value = p.unit; document.getElementById('produto-icone').value = p.iconUrl; document.getElementById('produto-categoria').value = p.category; }
}

function deletarProduto(id) {
    const confirmationHTML = `<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir este produto?</p><button id="confirm-delete-produto-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg ml-2">Cancelar</button>`;
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
        try { await updateDoc(doc(db, "produtos", id), { isActive: newStatus }); } catch (error) { console.error("Erro ao atualizar status:", error); showModal("Não foi possível atualizar o status do produto."); }
    }
}

function showToast(message) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-notification bg-green-500 text-white p-4 rounded-lg shadow-lg';
    toast.innerText = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}

// ==================== NOVAS FUNÇÕES DE CÁLCULO E VALIDAÇÃO ====================

/**
 * Calcula a margem de lucro percentual
 * @param {number} precoVenda - Preço de venda
 * @param {number} custo - Custo do produto
 * @returns {number} Margem em porcentagem
 */
function calcularMargem(precoVenda, custo) {
    if (!precoVenda || precoVenda <= 0) return 0;
    return ((precoVenda - custo) / precoVenda) * 100;
}

/**
 * Calcula o markup sobre o custo
 * @param {number} precoVenda - Preço de venda
 * @param {number} custo - Custo do produto
 * @returns {number} Markup em porcentagem
 */
function calcularMarkup(precoVenda, custo) {
    if (!custo || custo <= 0) return 0;
    return ((precoVenda - custo) / custo) * 100;
}

/**
 * Sugere preço de venda baseado em margem desejada
 * @param {number} custo - Custo do produto
 * @param {number} margemDesejada - Margem desejada em porcentagem (ex: 40 para 40%)
 * @returns {number} Preço sugerido
 */
function sugerirPreco(custo, margemDesejada = 40) {
    if (!custo || custo <= 0) return 0;
    return custo / (1 - margemDesejada / 100);
}

/**
 * Calcula o custo total de um produto com receita
 * @param {object} produto - Objeto do produto
 * @returns {number} Custo total calculado
 */
function calcularCustoReceita(produto) {
    if (!produto.recipe || produto.recipe.length === 0) {
        return produto.cost || 0;
    }

    let custoTotal = 0;
    produto.recipe.forEach(ingrediente => {
        const insumo = produtos.find(p => p.name === ingrediente.name && p.category === 'insumo');
        if (insumo) {
            custoTotal += (ingrediente.quantity || 0) * (insumo.cost || 0);
        }
    });

    return custoTotal;
}

/**
 * Valida se o produto tem configurações corretas
 * @param {object} produto - Objeto do produto
 * @returns {array} Array de alertas/warnings
 */
function validarProduto(produto) {
    const alertas = [];
    const MARGEM_MINIMA = 30; // Margem mínima aceitável

    // Verificar se tem custo
    if (!produto.cost || produto.cost <= 0) {
        if (produto.category === 'insumo') {
            alertas.push({ tipo: 'erro', mensagem: 'Insumo sem custo cadastrado' });
        } else if (produto.category !== 'tamanho') {
            alertas.push({ tipo: 'aviso', mensagem: 'Produto sem custo definido' });
        }
    }

    // Verificar se tamanho tem receita
    if (produto.category === 'tamanho' && (!produto.recipe || produto.recipe.length === 0)) {
        alertas.push({ tipo: 'aviso', mensagem: 'Tamanho sem receita cadastrada' });
    }

    // Verificar margem de lucro
    if (produto.category === 'tamanho' && produto.price > 0) {
        const custo = calcularCustoReceita(produto);
        const margem = calcularMargem(produto.price, custo);

        if (margem < MARGEM_MINIMA) {
            alertas.push({ tipo: 'erro', mensagem: `Margem muito baixa (${margem.toFixed(1)}%)` });
        } else if (margem < 35) {
            alertas.push({ tipo: 'aviso', mensagem: `Margem abaixo do ideal (${margem.toFixed(1)}%)` });
        }
    }

    // Verificar se preço é menor que custo
    if (produto.price > 0 && produto.price < produto.cost) {
        alertas.push({ tipo: 'erro', mensagem: 'Preço menor que custo!' });
    }

    return alertas;
}

/**
 * Gera ícone de alerta baseado no tipo
 * @param {string} tipo - 'erro', 'aviso', ou 'info'
 * @returns {string} HTML do ícone
 */
function gerarIconeAlerta(tipo) {
    switch (tipo) {
        case 'erro':
            return '🔴';
        case 'aviso':
            return '⚠️';
        case 'info':
            return 'ℹ️';
        default:
            return '📌';
    }
}

function playNotificationSound() {
    // Usar o sistema de notificação melhorado
    if (typeof notificationManager !== 'undefined') {
        notificationManager.playNotificationSound();
    } else {
        // Fallback caso o notification manager não esteja carregado
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1);
        oscillator.start(audioContext.currentTime); oscillator.stop(audioContext.currentTime + 1);
    }
}

function calcularCustoPedido(venda) {
    let custoTotal = 0;
    const tamanhoProduto = produtos.find(p => p.name === venda.tamanho && p.category === 'tamanho');
    if (tamanhoProduto && tamanhoProduto.recipe) {
        tamanhoProduto.recipe.forEach(ingrediente => {
            const insumoData = produtos.find(p => p.name === ingrediente.name && p.category === 'insumo');
            if (insumoData) { custoTotal += (ingrediente.quantity || 0) * (insumoData.cost || 0); }
        });
    }
    if (venda.acompanhamentos) {
        venda.acompanhamentos.forEach(itemPedido => {
            const acompanhamentoProduto = produtos.find(p => p.name === itemPedido.name);
            if (acompanhamentoProduto) { custoTotal += (itemPedido.quantity || 0) * (acompanhamentoProduto.cost || 0); }
        });
    }
    custoTotal *= venda.quantidade;
    const valorVenda = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
    const lucro = valorVenda - custoTotal;
    return { custoTotal, lucro };
}

function carregarVendasAdmin(startDate, endDate) {
    initialVendasLoadComplete = false;
    let q = query(collection(db, "vendas"), orderBy("timestamp", "desc"));
    if (startDate && endDate) { const start = new Date(startDate); const end = new Date(endDate); end.setHours(23, 59, 59, 999); q = query(collection(db, "vendas"), where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "desc")); }
    if (unsubscribeVendas) unsubscribeVendas();
    unsubscribeVendas = onSnapshot(q, (snapshot) => {
        const tableBody = document.getElementById('vendas-table-body');
        const totalPorTamanhoContainer = document.getElementById('total-por-tamanho');
        const totalVendasSpan = document.getElementById('total-vendas');

        if (!tableBody || !totalPorTamanhoContainer || !totalVendasSpan) {
            return;
        }

        if (initialVendasLoadComplete && snapshot.docChanges().some(change => change.type === 'added')) {
            playNotificationSound();
            showToast("Novo Pedido Recebido!");

            // Enviar notificação push se disponível
            if (typeof notificationManager !== 'undefined') {
                // Pegar o primeiro pedido novo
                const novoPedido = snapshot.docChanges().find(change => change.type === 'added');
                if (novoPedido) {
                    const venda = novoPedido.doc.data();
                    notificationManager.notifyNewOrder({
                        orderId: venda.orderId || 'N/A',
                        nomeCliente: venda.nomeCliente || 'Cliente',
                        total: venda.total || 'R$0,00'
                    });
                }
            }

            const tabVendas = document.getElementById('tab-vendas');
            if (tabVendas) tabVendas.click();
        }

        tableBody.innerHTML = '';
        let totalVendas = 0;
        const totaisPorTamanho = {};

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-gray-500">Nenhuma venda encontrada.</td></tr>';
            totalVendasSpan.innerText = 'R$0,00';
            totalPorTamanhoContainer.innerHTML = '';
        } else {
            snapshot.docs.forEach(docSnap => {
                const venda = { id: docSnap.id, ...docSnap.data() }; const isCombo = venda.pedidoCombo && !venda.tamanho; const { custoTotal, lucro } = isCombo ? { custoTotal: 0, lucro: 0 } : calcularCustoPedido(venda);
                const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.'));
                if (!isNaN(valorNumerico)) {
                    totalVendas += valorNumerico;
                    if (venda.tamanho && !venda.pedidoCombo) {
                        if (!totaisPorTamanho[venda.tamanho]) { totaisPorTamanho[venda.tamanho] = { count: 0, total: 0 }; }
                        totaisPorTamanho[venda.tamanho].count += (venda.quantidade || 1);
                        totaisPorTamanho[venda.tamanho].total += valorNumerico;
                    }
                }
                const data = venda.timestamp ? new Date(venda.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'N/A';
                const pedidoHTML = isCombo ? `<strong>Combo:</strong> ${escapeHTML(venda.pedidoCombo)}<br><small class="text-gray-500">${escapeHTML(venda.observacoes)}</small>` : `${venda.quantidade}x ${escapeHTML(venda.tamanho)}<br><small class="text-gray-500">${(venda.acompanhamentos || []).map(a => `${escapeHTML(a.name)} (x${a.quantity})`).join(', ')}</small><br><small class="text-blue-500 font-semibold">Obs: ${escapeHTML(venda.observacoes)}</small>`;
                const financeiroHTML = isCombo ? `Venda: ${escapeHTML(venda.total)}<br><small class="text-gray-500">Custo/Lucro não aplicável</small>` : `Venda: ${escapeHTML(venda.total)}<br><small class="text-red-500">Custo: R$${custoTotal.toFixed(2)}</small><br><strong class="text-green-600">Lucro: R$${lucro.toFixed(2)}</strong>`;
                const paymentIcon = venda.paymentMethod === 'PIX' ? '📱' : venda.paymentMethod === 'Cartão' ? '💳' : '💵';
                const paymentHTML = `<span class="font-semibold">${escapeHTML(venda.paymentMethod || 'N/A')} ${paymentIcon}</span>`;

                tableBody.innerHTML += `<tr class="border-b-0">
                    <td class="p-3 text-sm font-mono">${escapeHTML(venda.orderId || 'N/A')}</td>
                    <td class="p-3 text-sm">${data}</td>
                    <td class="p-3 text-sm font-semibold">${escapeHTML(venda.nomeCliente || 'N/A')}<br><small class="text-gray-500 font-normal">${escapeHTML(venda.telefoneCliente || '')}</small></td>
                    <td class="p-3 text-sm">${pedidoHTML}</td>
                    <td class="p-3 text-sm">${paymentHTML}</td>
                    <td class="p-3 font-medium">${financeiroHTML}</td>
                    <td class="p-3 font-semibold ${venda.status === 'pendente' ? 'text-yellow-600' : 'text-green-600'} capitalize">${escapeHTML(venda.status)}</td>
                    <td class="p-3">${venda.status === 'pendente' ? `<button class="confirm-venda-btn bg-green-500 text-white px-2 py-1 rounded text-xs" data-id="${venda.id}">✔️</button>` : ''}<button class="delete-venda-btn bg-red-500 text-white px-2 py-1 rounded text-xs ml-1" data-id="${venda.id}">🗑️</button></td>
                </tr>`;
            });
            totalVendasSpan.innerText = `R$${totalVendas.toFixed(2).replace('.', ',')}`;

            let totaisHTML = '<h4 class="text-xl font-bold text-gray-800 mb-2">Resumo por Tamanho</h4>';
            if (Object.keys(totaisPorTamanho).length > 0) {
                totaisHTML += '<div class="space-y-1">';
                Object.keys(totaisPorTamanho).sort().forEach(tamanho => {
                    const info = totaisPorTamanho[tamanho];
                    totaisHTML += `<p class="text-sm font-semibold text-gray-700">${tamanho}: <span class="font-bold">${info.count}</span> copo(s) - <span class="font-bold text-green-600">R$${info.total.toFixed(2).replace('.', ',')}</span></p>`;
                });
                totaisHTML += '</div>';
            } else { totaisHTML += '<p class="text-sm text-gray-500">Nenhum copo vendido no período.</p>'; }
            totalPorTamanhoContainer.innerHTML = totaisHTML;
        }
        document.querySelectorAll('.confirm-venda-btn').forEach(btn => btn.addEventListener('click', e => confirmarVenda(e.currentTarget.dataset.id)));
        document.querySelectorAll('.delete-venda-btn').forEach(btn => btn.addEventListener('click', e => deletarVenda(e.currentTarget.dataset.id)));
        if (!initialVendasLoadComplete) { setTimeout(() => { initialVendasLoadComplete = true; }, 2000); }
    });
}

async function confirmarVenda(id) {
    const vendaRef = doc(db, "vendas", id);
    const vendaSnap = await getDoc(vendaRef);
    if (vendaSnap.exists()) { const venda = vendaSnap.data(); const valorNumerico = parseFloat(venda.total.replace('R$', '').replace(',', '.')); await addDoc(collection(db, "fluxoCaixa"), { descricao: `Venda Pedido #${venda.orderId}`, valor: valorNumerico, tipo: 'entrada', timestamp: serverTimestamp() }); await updateDoc(vendaRef, { status: 'concluida' }); }
}

function deletarVenda(id) {
    showModal(`<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir esta venda?</p><button id="confirm-delete-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg ml-2">Cancelar</button>`, () => {
        document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
            try { await deleteDoc(doc(db, "vendas", id)); closeModal(); } catch (error) { console.error("Erro ao excluir venda:", error); closeModal(); showModal('Ocorreu um erro ao excluir a venda.'); }
        });
    });
}

async function salvarConfiguracoes() {
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const settings = {
        mensagemFechado: document.getElementById('mensagem-fechado').value,
        whatsappNumber: document.getElementById('whatsapp-number').value,
        pixKey: document.getElementById('pix-key').value,
        pixRecipientName: document.getElementById('pix-recipient-name').value,
        pixRecipientCity: document.getElementById('pix-recipient-city').value
    };
    dias.forEach(dia => { settings[dia] = { aberto: document.getElementById(`${dia}-aberto`).checked, abertura: document.getElementById(`${dia}-abertura`).value, fechamento: document.getElementById(`${dia}-fechamento`).value, }; });
    try { await setDoc(doc(db, "configuracoes", "horarios"), settings); storeSettings = settings; checkStoreOpen(); showModal('Configurações salvas com sucesso!'); } catch (error) { console.error("Erro ao salvar configurações:", error); showModal('Erro ao salvar as configurações.'); }
}

async function carregarConfiguracoesAdmin() {
    const docRef = doc(db, "configuracoes", "horarios");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const settings = docSnap.data();
        document.getElementById('whatsapp-number').value = settings.whatsappNumber || '';
        document.getElementById('mensagem-fechado').value = settings.mensagemFechado || '';
        document.getElementById('pix-key').value = settings.pixKey || '';
        document.getElementById('pix-recipient-name').value = settings.pixRecipientName || '';
        document.getElementById('pix-recipient-city').value = settings.pixRecipientCity || '';
        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        dias.forEach(dia => { if (settings[dia]) { document.getElementById(`${dia}-aberto`).checked = settings[dia].aberto; document.getElementById(`${dia}-abertura`).value = settings[dia].abertura; document.getElementById(`${dia}-fechamento`).value = settings[dia].fechamento; } });
    }
}

async function salvarTransacao() {
    const id = document.getElementById('transacao-id').value;
    const transacao = { descricao: document.getElementById('transacao-descricao').value, valor: parseFloat(document.getElementById('transacao-valor').value), tipo: document.getElementById('transacao-tipo').value, timestamp: serverTimestamp() };
    if (!transacao.descricao || isNaN(transacao.valor) || transacao.valor <= 0) { showModal("Descrição e valor válido são obrigatórios."); return; }
    try { if (id) { await updateDoc(doc(db, "fluxoCaixa", id), { descricao: transacao.descricao, valor: transacao.valor, tipo: transacao.tipo }); } else { await addDoc(collection(db, "fluxoCaixa"), transacao); } document.getElementById('transacao-id').value = ''; document.getElementById('transacao-descricao').value = ''; document.getElementById('transacao-valor').value = ''; } catch (error) { console.error("Erro ao salvar transação:", error); showModal("Não foi possível salvar a transação."); }
}

function carregarFluxoCaixa(startDate, endDate) {
    let q = query(collection(db, "fluxoCaixa"), orderBy("timestamp", "desc"));
    if (startDate && endDate) { const start = new Date(startDate); const end = new Date(endDate); end.setHours(23, 59, 59, 999); q = query(collection(db, "fluxoCaixa"), where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "desc")); }
    if (unsubscribeFluxoCaixa) unsubscribeFluxoCaixa();
    unsubscribeFluxoCaixa = onSnapshot(q, (snapshot) => {
        const tableBody = document.getElementById('caixa-table-body');
        const totalEntradasEl = document.getElementById('total-entradas');
        const totalSaidasEl = document.getElementById('total-saidas');
        const saldoAtualEl = document.getElementById('saldo-atual');

        if (!tableBody || !totalEntradasEl || !totalSaidasEl || !saldoAtualEl) {
            return;
        }

        tableBody.innerHTML = ''; let totalEntradas = 0, totalSaidas = 0;
        if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-500">Nenhum lançamento encontrado.</td></tr>'; }
        snapshot.docs.forEach(docSnap => {
            const t = { id: docSnap.id, ...docSnap.data() }; const valor = t.valor || 0;
            if (t.tipo === 'entrada') totalEntradas += valor; else totalSaidas += valor;
            tableBody.innerHTML += `<tr class="border-b-0"><td class="p-3 text-sm">${t.timestamp ? new Date(t.timestamp.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A'}</td><td class="p-3">${escapeHTML(t.descricao)}</td><td class="p-3 font-semibold ${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'} capitalize">${escapeHTML(t.tipo)}</td><td class="p-3 font-medium">R$${valor.toFixed(2).replace('.', ',')}</td><td class="p-3"><button class="delete-transacao-btn bg-red-500 text-white px-2 py-1 rounded text-xs" data-id="${t.id}">🗑️</button></td></tr>`;
        });
        totalEntradasEl.innerText = `R$${totalEntradas.toFixed(2).replace('.', ',')}`;
        totalSaidasEl.innerText = `R$${totalSaidas.toFixed(2).replace('.', ',')}`;
        saldoAtualEl.innerText = `R$${(totalEntradas - totalSaidas).toFixed(2).replace('.', ',')}`;
        document.querySelectorAll('.delete-transacao-btn').forEach(btn => btn.addEventListener('click', e => deletarTransacao(e.currentTarget.dataset.id)));
    });
}

function deletarTransacao(id) {
    showModal(`<h3 class="text-xl font-bold mb-4">Confirmar Exclusão</h3><p class="mb-6">Tem certeza que deseja excluir este lançamento?</p><button id="confirm-delete-transacao-btn" class="bg-red-500 text-white px-6 py-2 rounded-lg">Excluir</button><button onclick="window.closeModal()" class="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg ml-2">Cancelar</button>`, () => {
        document.getElementById('confirm-delete-transacao-btn').addEventListener('click', async () => {
            try { await deleteDoc(doc(db, "fluxoCaixa", id)); closeModal(); } catch (error) { console.error("Erro ao excluir transação:", error); closeModal(); showModal('Ocorreu um erro ao excluir.'); }
        });
    });
}

function checkStoreOpen() {
    const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const agora = new Date(); const diaSemana = dias[agora.getDay()]; const horaAtual = agora.getHours() * 60 + agora.getMinutes(); const configDia = storeSettings[diaSemana];
    const avisoLojaFechada = document.getElementById('loja-fechada-aviso'); const msgLojaFechada = document.getElementById('mensagem-loja-fechada');
    if (!configDia || !configDia.aberto || !configDia.abertura || !configDia.fechamento) { isStoreOpen = true; } else {
        const [aberturaH, aberturaM] = configDia.abertura.split(':').map(Number); const [fechamentoH, fechamentoM] = configDia.fechamento.split(':').map(Number);
        isStoreOpen = horaAtual >= (aberturaH * 60 + aberturaM) && horaAtual < (fechamentoH * 60 + fechamentoM);
    }
    [sendOrderBtnMobile, sendOrderBtnDesktop].forEach(btn => {
        if (btn) {
            btn.disabled = !isStoreOpen;
            btn.classList.toggle('bg-gray-400', !isStoreOpen);
            btn.classList.toggle('cursor-not-allowed', !isStoreOpen);
            btn.classList.toggle('bg-gradient-to-r', isStoreOpen);
            if (avisoLojaFechada) avisoLojaFechada.classList.toggle('hidden', isStoreOpen);
            if (!isStoreOpen && msgLojaFechada) { msgLojaFechada.innerText = storeSettings.mensagemFechado || "Estamos fechados no momento."; }
        }
    });
}

function openRecipeModal(id) {
    const produto = produtos.find(p => p.id === id);
    if (!produto) return;

    const insumos = produtos.filter(p => p.category === 'insumo');

    if (insumos.length === 0) {
        showModal('⚠️ Nenhum insumo cadastrado! Por favor, cadastre insumos primeiro.');
        return;
    }

    // Inicializar receita se não existir
    if (!produto.recipe) {
        produto.recipe = [];
    }

    let insumosHTML = insumos.map(insumo => {
        const itemReceita = produto.recipe?.find(r => r.name === insumo.name);
        const quantidade = itemReceita ? itemReceita.quantity : 0;

        return `
            <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                <div class="flex-grow">
                    <label for="recipe-${insumo.id}" class="font-medium text-gray-700">${insumo.name}</label>
                    <p class="text-xs text-gray-500">Custo: R$ ${(insumo.cost || 0).toFixed(2)} / ${insumo.unit}</p>
                </div>
                <div class="flex items-center gap-2">
                    <input 
                        type="number" 
                        id="recipe-${insumo.id}" 
                        data-name="${insumo.name}"
                        data-cost="${insumo.cost || 0}"
                        value="${quantidade}" 
                        class="w-20 p-2 border rounded text-center bg-gray-50 border-gray-300 recipe-input" 
                        placeholder="0"
                        step="0.01"
                        min="0"
                    >
                    <span class="text-xs text-gray-500 w-10">${insumo.unit}</span>
                </div>
            </div>
        `;
    }).join('');

    const tituloModal = produto.category === 'tamanho'
        ? `Ficha Técnica - ${produto.name}`
        : `Receita/Composição - ${produto.name}`;

    const descricaoModal = produto.category === 'tamanho'
        ? 'Defina os insumos utilizados para preparar este tamanho de açaí'
        : 'Defina os insumos necessários para este item (opcional)';

    showModal(`
        <div class="text-left max-h-96 overflow-y-auto">
            <h3 class="text-xl font-bold mb-2 text-purple-700">${tituloModal}</h3>
            <p class="text-sm text-gray-600 mb-4">${descricaoModal}</p>
            
            <!-- Calculadora de Custo em Tempo Real -->
            <div class="bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded-lg mb-4">
                <p class="text-sm font-semibold text-gray-700 mb-1">💰 Custo Total Calculado:</p>
                <p id="custo-total-receita" class="text-2xl font-bold text-purple-700">R$ 0,00</p>
                <p class="text-xs text-gray-600 mt-1">
                    Preço atual: <strong>R$ ${(produto.price || 0).toFixed(2)}</strong> | 
                    <span id="margem-receita">Margem: --</span>
                </p>
            </div>
            
            <div id="recipe-form" class="space-y-1">
                ${insumosHTML}
            </div>
            
            <div class="mt-6 flex gap-2 justify-end sticky bottom-0 bg-white pt-3">
                <button onclick="window.closeModal()" class="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-400 transition">
                    Cancelar
                </button>
                <button id="save-recipe-btn" class="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition font-semibold">
                    💾 Salvar Receita
                </button>
            </div>
        </div>
    `, () => {
        // Função para atualizar custo em tempo real
        function atualizarCustoTotal() {
            let custoTotal = 0;
            document.querySelectorAll('.recipe-input').forEach(input => {
                const quantidade = parseFloat(input.value) || 0;
                const custo = parseFloat(input.dataset.cost) || 0;
                custoTotal += quantidade * custo;
            });

            const custoEl = document.getElementById('custo-total-receita');
            const margemEl = document.getElementById('margem-receita');

            if (custoEl) {
                custoEl.textContent = `R$ ${custoTotal.toFixed(2)}`;
            }

            if (margemEl && produto.price > 0) {
                const margem = calcularMargem(produto.price, custoTotal);
                let margemClass = 'text-green-600';
                let margemIcon = '✅';

                if (margem < 30) {
                    margemClass = 'text-red-600';
                    margemIcon = '🔴';
                } else if (margem < 35) {
                    margemClass = 'text-yellow-600';
                    margemIcon = '⚠️';
                }

                margemEl.innerHTML = `<span class="${margemClass}">Margem: ${margem.toFixed(1)}% ${margemIcon}</span>`;
            }
        }

        // Adicionar evento de input para atualização em tempo real
        document.querySelectorAll('.recipe-input').forEach(input => {
            input.addEventListener('input', atualizarCustoTotal);
        });

        // Calcular custo inicial
        atualizarCustoTotal();

        // Evento de salvar
        document.getElementById('save-recipe-btn').addEventListener('click', () => salvarReceita(id));
    });
}

async function salvarReceita(id) {
    const recipe = [];
    document.querySelectorAll('#recipe-form input').forEach(input => { const quantity = parseFloat(input.value); if (quantity > 0) { recipe.push({ name: input.dataset.name, quantity: quantity }); } });
    try { await updateDoc(doc(db, "produtos", id), { recipe: recipe }); closeModal(); showModal("Receita salva com sucesso!"); } catch (error) { console.error("Erro ao salvar receita:", error); showModal("Não foi possível salvar a receita."); }
}

// Funções para gerar PIX
function crc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
        }
    }
    return ('0000' + (crc & 0xFFFF).toString(16).toUpperCase()).slice(-4);
}

function formatField(id, value) {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
}

function normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25);
}

function generatePixPayload(key, name, city, amountStr, txid) {
    const amount = parseFloat(amountStr.replace("R$", "").replace(",", ".")).toFixed(2);
    const normalizedName = normalizeText(name).toUpperCase();
    const normalizedCity = normalizeText(city).toUpperCase();

    // O txid para um PIX estático com valor definido deve ser '***'
    const cleanTxid = '***';

    const merchantAccountInfo = formatField('00', 'br.gov.bcb.pix') + formatField('01', key);

    let payload = [
        formatField('00', '01'),
        formatField('26', merchantAccountInfo),
        formatField('52', '0000'),
        formatField('53', '986'),
        formatField('54', amount),
        formatField('58', 'BR'),
        formatField('59', normalizedName),
        formatField('60', normalizedCity),
        formatField('62', formatField('05', cleanTxid))
    ].join('');

    const payloadWithCrcTag = payload + '6304';
    const crcResult = crc16(payloadWithCrcTag);
    return payloadWithCrcTag + crcResult;
}

function showPixModal(valor, orderId) {
    const { pixKey, pixRecipientName, pixRecipientCity } = storeSettings;
    if (!pixKey || !pixRecipientName || !pixRecipientCity) {
        showModal("Pedido enviado! O pagamento via PIX não está configurado. Por favor, configure no painel de administração.");
        return;
    }

    const payload = generatePixPayload(pixKey, pixRecipientName, pixRecipientCity, valor, orderId);

    const pixModalHTML = `
        <h3 class="text-2xl font-bold mb-2 text-purple-800">Pagamento via PIX</h3>
        <p class="text-gray-600 mb-4">Seu pedido foi enviado! Agora, realize o pagamento.</p>
        <div id="qrcode" class="p-2 bg-gray-100 inline-block rounded-xl"></div>
        <p class="text-sm font-semibold text-gray-700 mb-2">PIX Copia e Cola:</p>
        <div class="relative mb-4">
            <input type="text" id="pix-payload-text" value="${payload}" readonly class="w-full bg-gray-100 border border-gray-300 rounded-lg p-3 pr-12 text-sm text-gray-700">
            <button id="copy-pix-btn" class="absolute inset-y-0 right-0 px-3 flex items-center bg-purple-200 text-purple-700 rounded-r-lg hover:bg-purple-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 7a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 0 1H-0.5A.5.5 0 0 1-1 7z"/></svg>
            </button>
        </div>
        <button onclick="window.closeModal()" class="bg-gray-300 text-gray-800 font-bold py-2 px-8 rounded-lg transition-colors">Fechar</button>
    `;
    showModal(pixModalHTML, () => {
        new QRCode(document.getElementById("qrcode"), {
            text: payload,
            width: 200,
            height: 200,
            colorDark: "#4C2A7A",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        document.getElementById('copy-pix-btn').addEventListener('click', (e) => {
            const textToCopy = document.getElementById('pix-payload-text');
            textToCopy.select();
            textToCopy.setSelectionRange(0, 99999);
            try {
                document.execCommand('copy');
                e.currentTarget.innerHTML = 'Copiado!';
                setTimeout(() => { e.currentTarget.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 7a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 0 1H-0.5A.5.5 0 0 1-1 7z"/></svg>'; }, 2000);
            } catch (err) {
                console.error('Falha ao copiar:', err);
            }
        });
    });
}


onSnapshot(doc(db, "configuracoes", "horarios"), (doc) => {
    if (doc.exists()) { storeSettings = doc.data(); } else { storeSettings = { mensagemFechado: "Horário não configurado." }; }
    checkStoreOpen();
}, (error) => { console.error("Erro ao carregar configurações:", error.message); storeSettings = { mensagemFechado: "Não foi possível verificar o horário." }; isStoreOpen = true; checkStoreOpen(); });

onSnapshot(collection(db, "produtos"), (snapshot) => {
    produtos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderMenu(); calcularValor();
}, (error) => {
    console.error("Erro ao carregar produtos:", error);
    const menuContainerEl = document.getElementById('menu-container');
    if (menuContainerEl) {
        menuContainerEl.innerHTML = '<p class="text-red-500 text-center">Não foi possível carregar o cardápio.</p>';
    }
});

onSnapshot(collection(db, "combos"), (snapshot) => {
    combos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderCombosMenu();
}, (error) => {
    console.error("Erro ao carregar combos:", error);
    const combosSectionEl = document.getElementById('combos-section');
    if (combosSectionEl) {
        combosSectionEl.classList.add('hidden');
    }
});
