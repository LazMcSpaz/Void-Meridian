/* Void Meridian — Tab Bar Component */

const Tabs = {
  tabs: [
    { id: 'map',   icon: '◈', label: 'Map' },
    { id: 'event', icon: '⚡', label: 'Event' },
    { id: 'crew',  icon: '👥', label: 'Crew' },
    { id: 'log',   icon: '📋', label: 'Log' },
  ],

  activeTab: 'event',

  render(container) {
    const bar = document.createElement('nav');
    bar.className = 'tab-bar';

    for (const tab of this.tabs) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (tab.id === this.activeTab ? ' active' : '');
      btn.dataset.tab = tab.id;
      btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span class="tab-label">${tab.label}</span>`;
      btn.addEventListener('click', () => this.switchTo(tab.id));
      bar.appendChild(btn);
    }

    container.appendChild(bar);
  },

  switchTo(tabId) {
    if (this.activeTab === tabId) return;
    this.activeTab = tabId;
    Game.render();
  },

  setVisible(visible) {
    const bar = document.querySelector('.tab-bar');
    if (bar) bar.classList.toggle('hidden', !visible);
  },
};
