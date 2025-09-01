document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('retirada-modal');
    const modalBox = document.getElementById('retirada-modal-box');
    const closeButton = document.getElementById('close-retirada-modal');

    // Mostra o modal com uma animação suave
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        modalBox.style.opacity = '1';
        modalBox.style.transform = 'scale(1)';
    }, 300); // Um pequeno atraso para garantir que a animação ocorra

    // Função para fechar o modal
    const closeModal = () => {
        modalBox.style.transform = 'scale(0.95)';
        modalBox.style.opacity = '0';
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none'; // Remove o modal da tela
        }, 300);
    };

    closeButton.addEventListener('click', closeModal);
});