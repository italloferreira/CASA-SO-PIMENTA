/* modal-utils.js — comportamento comum dos modais do admin (.modal > .modal-content).

   O .modal cobre a tela inteira por cima do .modal-overlay, então o clique "fora do cartão"
   cai no próprio .modal, nunca no overlay. Aqui ele fecha quando:
   - o clique começa e termina no fundo (arrastar a seleção de um campo até o fundo não fecha);
   - a tecla Esc é apertada com o modal aberto. */
export function ligarFechamentoModal(modal, fechar) {
  var comecouNoFundo = false;

  modal.addEventListener('mousedown', function (e) {
    comecouNoFundo = e.target === modal;
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal && comecouNoFundo) fechar();
    comecouNoFundo = false;
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('active')) fechar();
  });
}
