'use strict';

const btn = document.getElementById('btn-health');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.className = '';
  status.textContent = 'Calling health…';

  try {
    const result = await window.electronAPI.invoke(
      'health',
      {},
      (progress, message) => {
        status.textContent = `Progress ${Math.round(progress * 100)}%: ${message ?? ''}`;
      },
    );
    status.className = 'ok';
    status.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    status.className = 'err';
    status.textContent = `Error (${err.code ?? 'UNKNOWN'}): ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});
