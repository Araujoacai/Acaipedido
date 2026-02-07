/**
 * Sistema de Gerenciamento de Notificações
 * Gerencia notificações push, sons e vibrações para novos pedidos
 */

class NotificationManager {
    constructor() {
        this.hasPermission = false;
        this.soundEnabled = this.loadPreference('soundEnabled', true);
        this.vibrationEnabled = this.loadPreference('vibrationEnabled', true);
        this.notificationsEnabled = this.loadPreference('notificationsEnabled', false);

        // Verificar permissão atual
        if ('Notification' in window && Notification.permission === 'granted') {
            this.hasPermission = true;
            this.notificationsEnabled = true;
        }
    }

    /**
     * Carregar preferências do localStorage
     */
    loadPreference(key, defaultValue) {
        const stored = localStorage.getItem(`notification_${key}`);
        return stored !== null ? JSON.parse(stored) : defaultValue;
    }

    /**
     * Salvar preferência no localStorage
     */
    savePreference(key, value) {
        localStorage.setItem(`notification_${key}`, JSON.stringify(value));
    }

    /**
     * Solicitar permissão de notificação ao usuário
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('Este navegador não suporta notificações');
            return false;
        }

        if (Notification.permission === 'granted') {
            this.hasPermission = true;
            this.notificationsEnabled = true;
            this.savePreference('notificationsEnabled', true);
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            this.hasPermission = permission === 'granted';
            this.notificationsEnabled = this.hasPermission;
            this.savePreference('notificationsEnabled', this.hasPermission);
            return this.hasPermission;
        }

        return false;
    }

    /**
     * Exibir notificação push
     */
    async showNotification(title, options = {}) {
        // Se notificações estão desabilitadas, não fazer nada
        if (!this.notificationsEnabled || !this.hasPermission) {
            return;
        }

        // Vibração em dispositivos mobile
        if (this.vibrationEnabled && 'vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]); // Padrão: curto-longo-curto
        }

        // Som de alerta
        if (this.soundEnabled) {
            this.playNotificationSound();
        }

        // Criar notificação visual
        const defaultOptions = {
            icon: '/Logoacai.png',
            badge: '/Logoacai.png',
            vibrate: [200, 100, 200],
            requireInteraction: true, // Manter visível até interação
            tag: 'new-order', // Evitar duplicatas
            renotify: true, // Alertar novamente se houver pedido novo
            ...options
        };

        try {
            // Tentar usar Service Worker se disponível
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(title, defaultOptions);
            } else {
                // Fallback para notificação básica
                new Notification(title, defaultOptions);
            }
        } catch (error) {
            console.error('Erro ao exibir notificação:', error);
        }
    }

    /**
     * Tocar som de notificação customizado
     * Som mais agradável e profissional para novos pedidos
     */
    playNotificationSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            // Tom mais agradável: dó-sol-dó (C-G-C)
            oscillator.type = 'sine';

            // Primeira nota (C5 - 523 Hz)
            oscillator.frequency.setValueAtTime(523, audioCtx.currentTime);

            // Segunda nota (G5 - 784 Hz)
            oscillator.frequency.setValueAtTime(784, audioCtx.currentTime + 0.15);

            // Terceira nota (C6 - 1047 Hz)
            oscillator.frequency.setValueAtTime(1047, audioCtx.currentTime + 0.3);

            // Envelope de volume (fade in/out suave)
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.4);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch (error) {
            console.error('Erro ao tocar som:', error);
        }
    }

    /**
     * Notificar sobre novo pedido (método principal)
     */
    async notifyNewOrder(orderData) {
        const { orderId, nomeCliente, total } = orderData;

        const title = '🔔 Novo Pedido Recebido!';
        const body = `Pedido #${orderId}\nCliente: ${nomeCliente}\nValor: ${total}`;

        await this.showNotification(title, {
            body,
            icon: '/Logoacai.png',
            data: {
                orderId,
                url: window.location.origin,
                action: 'view-order'
            }
        });
    }

    /**
     * Alternar som ativado/desativado
     */
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        this.savePreference('soundEnabled', this.soundEnabled);
        return this.soundEnabled;
    }

    /**
     * Alternar vibração ativada/desativada
     */
    toggleVibration() {
        this.vibrationEnabled = !this.vibrationEnabled;
        this.savePreference('vibrationEnabled', this.vibrationEnabled);
        return this.vibrationEnabled;
    }

    /**
     * Alternar notificações ativadas/desativadas
     */
    async toggleNotifications() {
        if (!this.notificationsEnabled) {
            // Tentar ativar
            const permitted = await this.requestPermission();
            return permitted;
        } else {
            // Desativar
            this.notificationsEnabled = false;
            this.savePreference('notificationsEnabled', false);
            return false;
        }
    }

    /**
     * Obter status das configurações
     */
    getSettings() {
        return {
            sound: this.soundEnabled,
            vibration: this.vibrationEnabled,
            notifications: this.notificationsEnabled,
            permission: Notification.permission
        };
    }

    /**
     * Testar notificação
     */
    async testNotification() {
        await this.notifyNewOrder({
            orderId: '0702-001',
            nomeCliente: 'Cliente Teste',
            total: 'R$25,00'
        });
    }

    /**
     * Registrar Service Worker para Firebase Cloud Messaging
     */
    async registerFCMServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('Service Worker não suportado neste navegador');
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('Service Worker registrado com sucesso:', registration);
            return true;
        } catch (error) {
            console.error('Erro ao registrar Service Worker:', error);
            return false;
        }
    }

    /**
     * Inicializar Firebase Cloud Messaging
     * Nota: A implementação completa do FCM requer configuração adicional no Firebase Console
     */
    async initializeFCM() {
        // Registrar service worker
        await this.registerFCMServiceWorker();

        // Aqui você pode adicionar lógica adicional para obter o FCM token
        // e enviá-lo para o servidor se necessário
        console.log('FCM Service Worker inicializado');
    }
}

// Exportar instância única (singleton)
const notificationManager = new NotificationManager();

// Inicializar FCM quando a página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        notificationManager.initializeFCM();
    });
} else {
    notificationManager.initializeFCM();
}

