const Animations = (() => {
  function fadeIn(node) {
    if (!node) return;
    node.style.opacity = '0';
    node.style.transform = 'translateY(10px)';
    node.style.transition = 'opacity 240ms ease-out, transform 240ms ease-out';

    requestAnimationFrame(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateY(0)';
    });
  }

  function fadeInFromLeft(node) {
    if (!node) return;
    node.style.opacity = '0';
    node.style.transform = 'translateX(-20px)';
    node.style.transition = 'opacity 240ms ease-out, transform 240ms ease-out';

    requestAnimationFrame(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateX(0)';
    });
  }

  function fadeInFromRight(node) {
    if (!node) return;
    node.style.opacity = '0';
    node.style.transform = 'translateX(20px)';
    node.style.transition = 'opacity 240ms ease-out, transform 240ms ease-out';

    requestAnimationFrame(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateX(0)';
    });
  }

  function scaleIn(node) {
    if (!node) return;
    node.style.opacity = '0';
    node.style.transform = 'scale(0.95)';
    node.style.transition = 'opacity 200ms ease-out, transform 200ms ease-out';

    requestAnimationFrame(() => {
      node.style.opacity = '1';
      node.style.transform = 'scale(1)';
    });
  }

  function pulseStatus(node) {
    if (!node) return;
    node.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.02)', opacity: 0.95 },
        { transform: 'scale(1)', opacity: 1 }
      ],
      {
        duration: 400,
        easing: 'ease-in-out'
      }
    );
  }

  return {
    fadeIn,
    fadeInFromLeft,
    fadeInFromRight,
    scaleIn,
    pulseStatus
  };
})();