const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

document.querySelectorAll('.door').forEach((door) => {
  door.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const box = door.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    door.style.setProperty('--tilt-x', `${y * -2}deg`);
    door.style.setProperty('--tilt-y', `${x * 2}deg`);
  });

  door.addEventListener('pointerleave', () => {
    door.style.removeProperty('--tilt-x');
    door.style.removeProperty('--tilt-y');
  });
});
