// One tap opens the browser's print dialog. Nothing prints on page load.
document.querySelector('[data-sudoku-pack-print]')?.addEventListener('click', () => window.print());
