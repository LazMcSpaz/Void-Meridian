/* Void Meridian — Overlay: Nexus transmissions, modals */

const Overlay = {
  _queue: [],
  _active: false,

  showNexusTransmission(text, durationMs) {
    this._queue.push({ type: 'nexus', text, duration: durationMs || 4000 });
    if (!this._active) this._processQueue();
  },

  _processQueue() {
    if (this._queue.length === 0) {
      this._active = false;
      return;
    }
    this._active = true;
    const item = this._queue.shift();

    if (item.type === 'nexus') {
      this._showNexus(item.text, item.duration);
    }
  },

  _showNexus(text, duration) {
    let el = document.getElementById('nexus-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nexus-overlay';
      el.className = 'nexus-overlay';
      el.innerHTML = '<div class="nexus-text"></div>';
      document.body.appendChild(el);
    }

    el.querySelector('.nexus-text').textContent = text;

    // Fade in
    requestAnimationFrame(() => {
      el.classList.add('active');
    });

    // Hold, then fade out
    setTimeout(() => {
      el.classList.remove('active');
      setTimeout(() => this._processQueue(), 600);
    }, duration);
  },
};
