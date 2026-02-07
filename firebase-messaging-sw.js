// Service Worker para Firebase Cloud Messaging
// Este arquivo permite receber notificações push mesmo quando o site está fechado

importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js');

// Configuração do Firebase (mesma do script.js)
const firebaseConfig = {
    apiKey: "AIzaSyCKZ-9QMY5ziW7uJIano6stDzHDKm8KqnE",
    authDomain: "salvapropagandas.firebaseapp.com",
    projectId: "salvapropagandas",
    storageBucket: "salvapropagandas.appspot.com",
    messagingSenderId: "285635693052",
    appId: "1:285635693052:web:260476698696d303be0a79"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Instância do Firebase Messaging
const messaging = firebase.messaging();

// Lidar com mensagens em background
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Mensagem recebida em background:', payload);

    const notificationTitle = payload.notification?.title || 'Novo Pedido Recebido! 🔔';
    const notificationOptions = {
        body: payload.notification?.body || 'Você tem um novo pedido',
        icon: '/Logoacai.png',
        badge: '/Logoacai.png',
        vibrate: [200, 100, 200],
        tag: 'new-order',
        requireInteraction: true,
        data: {
            url: payload.data?.url || self.location.origin,
            orderId: payload.data?.orderId
        }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Lidar com clique na notificação
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notificação clicada:', event);

    event.notification.close();

    // Abrir ou focar na janela do painel admin
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Tentar focar em uma janela já aberta
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Se nenhuma janela está aberta, abrir uma nova
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url || '/');
                }
            })
    );
});
