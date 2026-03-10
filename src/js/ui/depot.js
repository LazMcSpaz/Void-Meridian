/* Void Meridian — Trade Depot Docking UI */

const DepotUI = {
  // Sub-screen within the depot: 'menu' | 'trade' | 'sell' | 'recruit' | 'fuel' | 'repairs' | 'confirm_buy'
  subScreen: 'menu',

  // Generated stock for this depot visit (lazily populated)
  _stock: null,
  _recruitPool: null,

  // Pending purchase for confirmation
  _pendingPurchase: null,

  // ─── Entry Point ─────────────────────────────────────────────

  enterDepot(node) {
    GameState.run.atDepot = true;
    GameState.run.depotNodeId = node.id;
    this.subScreen = 'menu';
    this._stock = null;
    this._recruitPool = null;

    // Check for auto-trigger events first
    const autoEvent = this._pickAutoEvent(node);
    if (autoEvent) {
      GameState.run.activeEvent = autoEvent;
      GameState.run.activeEventStep = 0;
      GameState.run.lastStepOutcomes = {};
      GameState.addLog('event', autoEvent.setup_text ? autoEvent.setup_text.substring(0, 80) + '...' : 'Depot encounter');
      GameState.screen = 'event';
      Tabs.activeTab = 'event';
      GameState.save();
      Game.render();
      return;
    }

    // No auto event — go straight to docking menu
    GameState.screen = 'map';
    Tabs.activeTab = 'event';
    GameState.save();
    Game.render();
  },

  leaveDepot() {
    GameState.run.atDepot = false;
    GameState.run.depotNodeId = null;
    this.subScreen = 'menu';
    this._stock = null;
    this._recruitPool = null;
    Tabs.switchTo('map');
  },

  // ─── Auto-Trigger Event Selection ────────────────────────────

  _pickAutoEvent(node) {
    const factionContext = node.faction || 'none';
    const allEligible = Registry.getEligibleEvents(node.type, factionContext);
    const auto = allEligible.filter(evt => evt.tags && evt.tags.includes('auto_trigger'));
    if (auto.length === 0) return null;
    const picked = auto[Math.floor(Math.random() * auto.length)];
    return JSON.parse(JSON.stringify(picked));
  },

  // ─── Main Render ─────────────────────────────────────────────

  render(container) {
    switch (this.subScreen) {
      case 'trade':       this._renderTrade(container); break;
      case 'sell':        this._renderSell(container); break;
      case 'confirm_buy': this._renderConfirmBuy(container); break;
      case 'recruit':     this._renderRecruit(container); break;
      case 'fuel':        this._renderFuel(container); break;
      case 'repairs':     this._renderRepairs(container); break;
      default:            this._renderMenu(container); break;
    }
  },

  // ─── Docking Menu ────────────────────────────────────────────

  _renderMenu(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'TRADE DEPOT — DOCKED';
    screen.appendChild(header);

    const desc = document.createElement('div');
    desc.className = 'narrative';
    desc.innerHTML = EventUI._colorizeNarrative(
      'The station hums with commerce. Docking clamps hold the Meridian steady as you survey the available services.'
    );
    screen.appendChild(desc);

    const divider = document.createElement('hr');
    divider.className = 'divider';
    screen.appendChild(divider);

    const sellableCount = this._getSellableItems().length;
    const services = [
      { id: 'trade',   label: 'BUY',       desc: 'Browse weapons and modules for sale' },
      { id: 'sell',    label: 'SELL',       desc: sellableCount > 0 ? `${sellableCount} item${sellableCount !== 1 ? 's' : ''} to sell` : 'Nothing to sell' },
      { id: 'recruit', label: 'RECRUIT',    desc: 'Hire crew members' },
      { id: 'fuel',    label: 'BUY FUEL',   desc: `Current: ${GameState.run.fuel} cells` },
      { id: 'repairs', label: 'REPAIRS',    desc: `Hull: ${GameState.run.ship.hull}/${GameState.run.ship.maxHull}` },
      { id: 'explore', label: 'EXPLORE',    desc: 'See what else this station has to offer' },
    ];

    for (const svc of services) {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = svc.label;

      const sub = document.createElement('span');
      sub.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-muted); margin-top:var(--space-xs);';
      sub.textContent = svc.desc;
      btn.appendChild(sub);

      btn.addEventListener('click', () => this._handleService(svc.id));
      screen.appendChild(btn);
    }

    // Depart button
    const departBtn = document.createElement('button');
    departBtn.className = 'btn-confirm';
    departBtn.style.marginTop = 'var(--space-md)';
    departBtn.textContent = 'DEPART';
    departBtn.addEventListener('click', () => this.leaveDepot());
    screen.appendChild(departBtn);

    container.appendChild(screen);
  },

  _handleService(serviceId) {
    if (serviceId === 'explore') {
      this._triggerExploreEvent();
      return;
    }
    this.subScreen = serviceId;
    Game.render();
  },

  // ─── Explore (triggers a scripted event) ─────────────────────

  _triggerExploreEvent() {
    const node = this._getDepotNode();
    if (!node) { this.leaveDepot(); return; }

    const factionContext = node.faction || 'none';
    const allEligible = Registry.getEligibleEvents(node.type, factionContext);
    // Exclude auto_trigger events from explore pool
    const explorePool = allEligible.filter(evt => !evt.tags || !evt.tags.includes('auto_trigger'));

    let event;
    if (explorePool.length > 0) {
      event = JSON.parse(JSON.stringify(explorePool[Math.floor(Math.random() * explorePool.length)]));
    } else {
      event = EventEngine._placeholderEvent();
    }

    GameState.run.activeEvent = event;
    GameState.run.activeEventStep = 0;
    GameState.run.lastStepOutcomes = {};
    GameState.addLog('event', event.setup_text ? event.setup_text.substring(0, 80) + '...' : 'Exploring the depot');
    GameState.screen = 'event';
    Tabs.activeTab = 'event';
    GameState.save();
    Game.render();
  },

  _getDepotNode() {
    if (!GameState.run.map || !GameState.run.depotNodeId) return null;
    return GameState.run.map.nodes.find(n => n.id === GameState.run.depotNodeId) || null;
  },

  // ─── Back Button Helper ──────────────────────────────────────

  _addBackButton(screen, label) {
    const btn = document.createElement('button');
    btn.className = 'btn-confirm';
    btn.style.marginTop = 'var(--space-md)';
    btn.textContent = label || 'BACK';
    btn.addEventListener('click', () => {
      this.subScreen = 'menu';
      Game.render();
    });
    screen.appendChild(btn);
  },

  // ─── Trade Service ───────────────────────────────────────────

  _generateStock() {
    if (this._stock) return this._stock;

    const run = GameState.run;
    const maxDepth = run.map ? run.map.maxDepth : 30;
    const progress = run.depth / maxDepth;

    // Determine max tier available based on depth
    let maxTier = 1;
    if (progress >= 0.6) maxTier = 3;
    else if (progress >= 0.3) maxTier = 2;

    // Gather available weapons and modules up to maxTier
    const allWeapons = Registry.getAllWeapons().filter(w =>
      w.tier <= maxTier && !w.irremovable &&
      w.gating && w.gating.source && w.gating.source.includes('trade_post')
    );
    const allModules = Registry.getAllModules().filter(m =>
      m.tier <= maxTier && !m.irremovable
    );

    // Pick a random subset
    const shuffle = arr => arr.sort(() => Math.random() - 0.5);
    const weapons = shuffle([...allWeapons]).slice(0, 3);
    const modules = shuffle([...allModules]).slice(0, 3);

    // Price items based on tier and depth
    const node = this._getDepotNode();
    const faction = node && node.faction ? node.faction : null;
    const priceMod = faction ? EconomyEngine.getPriceModifier(faction) : 1;

    const priceItem = (item) => {
      const base = (item.tier || 1) * 40 + 20;
      return Math.round(base * priceMod);
    };

    this._stock = {
      weapons: weapons.map(w => ({ item: w, price: priceItem(w), type: 'weapon' })),
      modules: modules.map(m => ({ item: m, price: priceItem(m), type: 'module' })),
    };
    return this._stock;
  },

  _renderTrade(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'TRADE';
    screen.appendChild(header);

    const credits = document.createElement('div');
    credits.style.cssText = 'margin-bottom:var(--space-md); color:var(--color-credits);';
    credits.textContent = `Credits: ${GameState.run.credits}`;
    screen.appendChild(credits);

    const stock = this._generateStock();

    // Weapons section
    if (stock.weapons.length > 0) {
      const wpnLabel = document.createElement('div');
      wpnLabel.className = 'system-label';
      wpnLabel.style.marginBottom = 'var(--space-sm)';
      wpnLabel.textContent = 'WEAPONS';
      screen.appendChild(wpnLabel);

      for (const entry of stock.weapons) {
        screen.appendChild(this._createShopItem(entry));
      }
    }

    // Modules section
    if (stock.modules.length > 0) {
      const modLabel = document.createElement('div');
      modLabel.className = 'system-label';
      modLabel.style.cssText = 'margin-top:var(--space-md); margin-bottom:var(--space-sm);';
      modLabel.textContent = 'MODULES';
      screen.appendChild(modLabel);

      for (const entry of stock.modules) {
        screen.appendChild(this._createShopItem(entry));
      }
    }

    if (stock.weapons.length === 0 && stock.modules.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'Nothing available for sale at this depot.';
      screen.appendChild(empty);
    }

    this._addBackButton(screen);
    container.appendChild(screen);
  },

  _createShopItem(entry) {
    const btn = document.createElement('button');
    const canAfford = EconomyEngine.canAfford(entry.price);
    const alreadyOwned = entry.type === 'weapon'
      ? GameState.run.ship.equippedWeapons.some(w => w.id === entry.item.id)
      : GameState.run.ship.equippedModules.some(m => m.id === entry.item.id);

    btn.className = 'choice-btn' + (!canAfford || alreadyOwned ? ' locked' : '');

    const name = document.createElement('span');
    name.textContent = `${entry.item.emoji || '◻'} ${entry.item.name}`;
    btn.appendChild(name);

    // Show effect text (the mechanical description)
    if (entry.item.effect) {
      const eff = document.createElement('span');
      eff.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-accent); margin-top:var(--space-xs);';
      eff.textContent = entry.item.effect;
      btn.appendChild(eff);
    }

    // Show weapon stats for weapons
    if (entry.type === 'weapon' && entry.item.stats) {
      const s = entry.item.stats;
      const statsEl = document.createElement('span');
      statsEl.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-secondary); margin-top:var(--space-xs);';
      let statsText = `DMG ${s.damage} | SPD ${s.speed_modifier >= 0 ? '+' : ''}${s.speed_modifier} | RNG ${s.range}`;
      if (s.ammo != null) statsText += ` | AMMO ${s.ammo}`;
      statsEl.textContent = statsText;
      btn.appendChild(statsEl);
    }

    // Show module slot target
    if (entry.type === 'module' && entry.item.slots_onto) {
      const slot = document.createElement('span');
      slot.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-muted); margin-top:var(--space-xs);';
      slot.textContent = `Installs on: ${ShipEngine.SYSTEM_NAMES[entry.item.slots_onto] || entry.item.slots_onto}`;
      btn.appendChild(slot);
    }

    const price = document.createElement('span');
    price.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--color-credits); margin-top:var(--space-xs);';
    price.textContent = alreadyOwned ? 'OWNED' : `${entry.price} credits`;
    btn.appendChild(price);

    if (canAfford && !alreadyOwned) {
      btn.addEventListener('click', () => {
        this._pendingPurchase = entry;
        this.subScreen = 'confirm_buy';
        Game.render();
      });
    }

    return btn;
  },

  // ─── Purchase Confirmation ───────────────────────────────────

  _renderConfirmBuy(container) {
    const entry = this._pendingPurchase;
    if (!entry) { this.subScreen = 'trade'; Game.render(); return; }

    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'CONFIRM PURCHASE';
    screen.appendChild(header);

    // Item detail card
    const card = document.createElement('div');
    card.style.cssText = 'padding:var(--space-md); border:1px solid var(--text-accent); background:var(--bg-card); margin-bottom:var(--space-md);';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'color:var(--text-primary); font-size:var(--font-size-lg); margin-bottom:var(--space-sm);';
    nameEl.textContent = `${entry.item.emoji || '◻'} ${entry.item.name}`;
    card.appendChild(nameEl);

    if (entry.type === 'module') {
      const typeEl = document.createElement('div');
      typeEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); text-transform:uppercase; margin-bottom:var(--space-sm);';
      typeEl.textContent = `Module — ${ShipEngine.SYSTEM_NAMES[entry.item.slots_onto] || entry.item.slots_onto}`;
      card.appendChild(typeEl);
    } else {
      const typeEl = document.createElement('div');
      typeEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); text-transform:uppercase; margin-bottom:var(--space-sm);';
      typeEl.textContent = `Weapon — T${entry.item.tier} ${entry.item.type}`;
      card.appendChild(typeEl);
    }

    // Effect text
    if (entry.item.effect) {
      const effEl = document.createElement('div');
      effEl.style.cssText = 'color:var(--text-accent); font-size:var(--font-size-sm); margin-bottom:var(--space-sm);';
      effEl.textContent = entry.item.effect;
      card.appendChild(effEl);
    }

    // Weapon stats
    if (entry.type === 'weapon' && entry.item.stats) {
      const s = entry.item.stats;
      const statsEl = document.createElement('div');
      statsEl.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin-bottom:var(--space-sm);';
      let t = `DMG ${s.damage} | SPD ${s.speed_modifier >= 0 ? '+' : ''}${s.speed_modifier} | RNG ${s.range}`;
      if (s.ammo != null) t += ` | AMMO ${s.ammo}`;
      if (s.special_charges > 0) t += ` | CHG ${s.special_charges}`;
      statsEl.textContent = t;
      card.appendChild(statsEl);
    }

    // Flavor text
    if (entry.item.flavor) {
      const flavEl = document.createElement('div');
      flavEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); font-style:italic;';
      flavEl.textContent = entry.item.flavor;
      card.appendChild(flavEl);
    }

    screen.appendChild(card);

    // Cost summary
    const costEl = document.createElement('div');
    costEl.style.cssText = 'margin-bottom:var(--space-md); font-size:var(--font-size-sm);';
    costEl.innerHTML = `
      <span style="color:var(--text-secondary)">Cost:</span> <span style="color:var(--color-credits)">${entry.price} credits</span><br>
      <span style="color:var(--text-secondary)">After purchase:</span> <span style="color:var(--color-credits)">${GameState.run.credits - entry.price} credits</span>
    `;
    screen.appendChild(costEl);

    // Confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-confirm';
    confirmBtn.style.cssText = 'margin-bottom:var(--space-sm);';
    confirmBtn.textContent = `BUY ${entry.item.name.toUpperCase()}`;
    confirmBtn.addEventListener('click', () => {
      if (!EconomyEngine.spend(entry.price)) return;
      if (entry.type === 'weapon') {
        ShipEngine.equipWeapon(entry.item.id);
      } else {
        ShipEngine.addModule(entry.item.id);
      }
      GameState.addLog('event', `Purchased ${entry.item.name} for ${entry.price} credits`);
      GameState.save();
      this._pendingPurchase = null;
      this.subScreen = 'trade';
      Game.render();
    });
    screen.appendChild(confirmBtn);

    // Cancel
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-confirm';
    cancelBtn.style.cssText = 'border-color:var(--border); color:var(--text-secondary);';
    cancelBtn.textContent = 'CANCEL';
    cancelBtn.addEventListener('click', () => {
      this._pendingPurchase = null;
      this.subScreen = 'trade';
      Game.render();
    });
    screen.appendChild(cancelBtn);

    container.appendChild(screen);
  },

  // ─── Sell Service ───────────────────────────────────────────

  _getSellPrice(item, type) {
    const tier = item.tier || 1;
    const base = tier * 20 + 10; // ~50% of buy price
    const node = this._getDepotNode();
    const faction = node && node.faction ? node.faction : null;
    // Inverse price modifier — selling at hostile stations gives better prices
    const priceMod = faction ? (2 - EconomyEngine.getPriceModifier(faction)) : 1;
    if (type === 'cargo') return Math.round((tier * 15 + 5) * priceMod);
    return Math.round(base * priceMod);
  },

  _getSellableItems() {
    const ship = GameState.run.ship;
    const items = [];

    // Weapons — can sell if not irremovable AND player has more than 1 weapon
    if (ship.equippedWeapons.length > 1) {
      for (const wpn of ship.equippedWeapons) {
        if (!wpn.irremovable) {
          items.push({ item: wpn, type: 'weapon', price: this._getSellPrice(wpn, 'weapon') });
        }
      }
    }

    // Modules — can sell if not irremovable
    for (const mod of ship.equippedModules) {
      if (!mod.irremovable) {
        items.push({ item: mod, type: 'module', price: this._getSellPrice(mod, 'module') });
      }
    }

    // Cargo
    for (let i = 0; i < ship.cargo.length; i++) {
      const cargoId = ship.cargo[i];
      items.push({
        item: { id: cargoId, name: cargoId.replace(/_/g, ' '), tier: 1 },
        type: 'cargo',
        cargoIndex: i,
        price: this._getSellPrice({ tier: 1 }, 'cargo'),
      });
    }

    return items;
  },

  _renderSell(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'SELL';
    screen.appendChild(header);

    const credits = document.createElement('div');
    credits.style.cssText = 'margin-bottom:var(--space-md); color:var(--color-credits);';
    credits.textContent = `Credits: ${GameState.run.credits}`;
    screen.appendChild(credits);

    const sellable = this._getSellableItems();

    if (sellable.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'Nothing available to sell. Irremovable items and your last weapon cannot be sold.';
      screen.appendChild(empty);
    } else {
      // Weapons
      const weapons = sellable.filter(s => s.type === 'weapon');
      if (weapons.length > 0) {
        const wpnLabel = document.createElement('div');
        wpnLabel.className = 'system-label';
        wpnLabel.style.marginBottom = 'var(--space-sm)';
        wpnLabel.textContent = 'WEAPONS';
        screen.appendChild(wpnLabel);

        for (const entry of weapons) {
          screen.appendChild(this._createSellItem(entry));
        }
      }

      // Modules
      const modules = sellable.filter(s => s.type === 'module');
      if (modules.length > 0) {
        const modLabel = document.createElement('div');
        modLabel.className = 'system-label';
        modLabel.style.cssText = 'margin-top:var(--space-md); margin-bottom:var(--space-sm);';
        modLabel.textContent = 'MODULES';
        screen.appendChild(modLabel);

        for (const entry of modules) {
          screen.appendChild(this._createSellItem(entry));
        }
      }

      // Cargo
      const cargo = sellable.filter(s => s.type === 'cargo');
      if (cargo.length > 0) {
        const cargoLabel = document.createElement('div');
        cargoLabel.className = 'system-label';
        cargoLabel.style.cssText = 'margin-top:var(--space-md); margin-bottom:var(--space-sm);';
        cargoLabel.textContent = 'CARGO';
        screen.appendChild(cargoLabel);

        for (const entry of cargo) {
          screen.appendChild(this._createSellItem(entry));
        }
      }
    }

    this._addBackButton(screen);
    container.appendChild(screen);
  },

  _createSellItem(entry) {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';

    const name = document.createElement('span');
    const emoji = entry.item.emoji || (entry.type === 'cargo' ? '📦' : '◻');
    name.textContent = `${emoji} ${entry.item.name}`;
    btn.appendChild(name);

    // Show effect/stats
    if (entry.item.effect) {
      const eff = document.createElement('span');
      eff.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-accent); margin-top:var(--space-xs);';
      eff.textContent = entry.item.effect;
      btn.appendChild(eff);
    }

    if (entry.type === 'weapon' && entry.item.stats) {
      const s = entry.item.stats;
      const statsEl = document.createElement('span');
      statsEl.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-secondary); margin-top:var(--space-xs);';
      let statsText = `DMG ${s.damage} | SPD ${s.speed_modifier >= 0 ? '+' : ''}${s.speed_modifier} | RNG ${s.range}`;
      if (s.ammo != null) statsText += ` | AMMO ${s.ammo}`;
      statsEl.textContent = statsText;
      btn.appendChild(statsEl);
    }

    const price = document.createElement('span');
    price.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--color-success); margin-top:var(--space-xs);';
    price.textContent = `Sell for ${entry.price} credits`;
    btn.appendChild(price);

    btn.addEventListener('click', () => {
      this._confirmSell(entry);
    });

    return btn;
  },

  _confirmSell(entry) {
    // Sell immediately — the item list serves as the confirmation
    EconomyEngine.earn(entry.price);

    if (entry.type === 'weapon') {
      const idx = GameState.run.ship.equippedWeapons.findIndex(w => w.id === entry.item.id);
      if (idx !== -1) GameState.run.ship.equippedWeapons.splice(idx, 1);
    } else if (entry.type === 'module') {
      ShipEngine.removeModule(entry.item.id);
    } else if (entry.type === 'cargo') {
      GameState.run.ship.cargo.splice(entry.cargoIndex, 1);
    }

    GameState.addLog('event', `Sold ${entry.item.name} for ${entry.price} credits`);
    GameState.save();
    Game.render();
  },

  // ─── Recruit Service ─────────────────────────────────────────

  _generateRecruitPool() {
    if (this._recruitPool) return this._recruitPool;

    const pool = [];
    const usedRoles = new Set(GameState.run.crew.filter(c => !c.dead).map(c => c.role));

    // Generate 2-3 candidates, preferring roles not on the ship
    const count = 2 + (Math.random() < 0.4 ? 1 : 0);
    const availableRoles = CrewEngine.ROLES.filter(r => !usedRoles.has(r));
    const rolePool = availableRoles.length >= count ? availableRoles : [...CrewEngine.ROLES];

    for (let i = 0; i < count; i++) {
      const role = rolePool.splice(Math.floor(Math.random() * rolePool.length), 1)[0] || 'engineer';
      const member = CrewEngine._createFromArchetype(role, 0);
      const cost = 30 + Math.floor(Math.random() * 20);
      pool.push({ member, cost });
    }

    this._recruitPool = pool;
    return pool;
  },

  _renderRecruit(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'RECRUIT CREW';
    screen.appendChild(header);

    const credits = document.createElement('div');
    credits.style.cssText = 'margin-bottom:var(--space-md); color:var(--color-credits);';
    credits.textContent = `Credits: ${GameState.run.credits}`;
    screen.appendChild(credits);

    const pool = this._generateRecruitPool();

    for (const entry of pool) {
      const m = entry.member;
      const hired = GameState.run.crew.some(c => c.id === m.id);
      const canAfford = EconomyEngine.canAfford(entry.cost);

      const btn = document.createElement('button');
      btn.className = 'choice-btn' + (!canAfford || hired ? ' locked' : '');

      const nameEl = document.createElement('span');
      nameEl.textContent = `${m.emoji} ${m.name}`;
      btn.appendChild(nameEl);

      const roleEl = document.createElement('span');
      roleEl.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-accent); text-transform:uppercase; margin-top:var(--space-xs);';
      roleEl.textContent = m.role;
      btn.appendChild(roleEl);

      const traitEl = document.createElement('span');
      traitEl.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--text-secondary); font-style:italic;';
      traitEl.textContent = m.trait;
      btn.appendChild(traitEl);

      const costEl = document.createElement('span');
      costEl.style.cssText = 'display:block; font-size:var(--font-size-sm); color:var(--color-credits); margin-top:var(--space-xs);';
      costEl.textContent = hired ? 'HIRED' : `${entry.cost} credits`;
      btn.appendChild(costEl);

      if (canAfford && !hired) {
        btn.addEventListener('click', () => {
          if (!EconomyEngine.spend(entry.cost)) return;
          GameState.run.crew.push(m);
          GameState.addLog('crew', `${m.name} (${m.role}) joined the crew for ${entry.cost} credits.`);
          GameState.save();
          Game.render();
        });
      }

      screen.appendChild(btn);
    }

    this._addBackButton(screen);
    container.appendChild(screen);
  },

  // ─── Fuel Service ────────────────────────────────────────────

  _renderFuel(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'BUY FUEL';
    screen.appendChild(header);

    const fuelCost = 8;

    const info = document.createElement('div');
    info.style.cssText = 'margin-bottom:var(--space-md);';
    info.innerHTML = `
      <span style="color:var(--text-secondary)">Current fuel:</span> ${GameState.run.fuel} cells<br>
      <span style="color:var(--text-secondary)">Price:</span> <span style="color:var(--color-credits)">${fuelCost} credits per cell</span><br>
      <span style="color:var(--text-secondary)">Credits:</span> <span style="color:var(--color-credits)">${GameState.run.credits}</span>
    `;
    screen.appendChild(info);

    const amounts = [1, 3, 5];
    for (const amt of amounts) {
      const totalCost = fuelCost * amt;
      const canAfford = EconomyEngine.canAfford(totalCost);

      const btn = document.createElement('button');
      btn.className = 'choice-btn' + (!canAfford ? ' locked' : '');
      btn.textContent = `Buy ${amt} fuel cell${amt > 1 ? 's' : ''} — ${totalCost} credits`;

      if (canAfford) {
        btn.addEventListener('click', () => {
          EconomyEngine.spend(totalCost);
          GameState.run.fuel += amt;
          GameState.addLog('event', `Purchased ${amt} fuel for ${totalCost} credits`);
          GameState.save();
          Game.render();
        });
      }

      screen.appendChild(btn);
    }

    this._addBackButton(screen);
    container.appendChild(screen);
  },

  // ─── Repairs Service ─────────────────────────────────────────

  _renderRepairs(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'REPAIRS';
    screen.appendChild(header);

    const ship = GameState.run.ship;
    const hullPct = ship.maxHull > 0 ? Math.round((ship.hull / ship.maxHull) * 100) : 100;

    const info = document.createElement('div');
    info.style.cssText = 'margin-bottom:var(--space-md);';
    info.innerHTML = `
      <span style="color:var(--text-secondary)">Hull integrity:</span> ${ship.hull}/${ship.maxHull} (${hullPct}%)<br>
      <span style="color:var(--text-secondary)">Credits:</span> <span style="color:var(--color-credits)">${GameState.run.credits}</span>
    `;
    screen.appendChild(info);

    // Hull repair options
    const hullLabel = document.createElement('div');
    hullLabel.className = 'system-label';
    hullLabel.style.marginBottom = 'var(--space-sm)';
    hullLabel.textContent = 'HULL REPAIR';
    screen.appendChild(hullLabel);

    const missing = ship.maxHull - ship.hull;
    if (missing <= 0) {
      const full = document.createElement('div');
      full.style.cssText = 'color:var(--color-success); margin-bottom:var(--space-md);';
      full.textContent = 'Hull at full integrity.';
      screen.appendChild(full);
    } else {
      const repairOptions = [
        { amount: Math.min(10, missing), label: 'Patch repair (+10 hull)', cost: 15 },
        { amount: Math.min(25, missing), label: 'Standard repair (+25 hull)', cost: 35 },
        { amount: missing, label: `Full repair (+${missing} hull)`, cost: Math.round(missing * 1.5) },
      ];

      // Deduplicate if amounts are the same
      const seen = new Set();
      for (const opt of repairOptions) {
        if (seen.has(opt.amount)) continue;
        seen.add(opt.amount);

        const canAfford = EconomyEngine.canAfford(opt.cost);
        const btn = document.createElement('button');
        btn.className = 'choice-btn' + (!canAfford ? ' locked' : '');
        btn.textContent = `${opt.label} — ${opt.cost} credits`;

        if (canAfford) {
          btn.addEventListener('click', () => {
            EconomyEngine.spend(opt.cost);
            ShipEngine.repair(opt.amount);
            GameState.addLog('event', `Hull repaired +${opt.amount} for ${opt.cost} credits`);
            GameState.save();
            Game.render();
          });
        }

        screen.appendChild(btn);
      }
    }

    // System repairs
    const damagedSystems = Object.entries(ship.baseSystems).filter(([, sys]) => sys.damaged);
    if (damagedSystems.length > 0) {
      const sysLabel = document.createElement('div');
      sysLabel.className = 'system-label';
      sysLabel.style.cssText = 'margin-top:var(--space-md); margin-bottom:var(--space-sm);';
      sysLabel.textContent = 'SYSTEM REPAIR';
      screen.appendChild(sysLabel);

      for (const [key, sys] of damagedSystems) {
        const displayName = ShipEngine.SYSTEM_NAMES[key] || key;
        const cost = 25;
        const canAfford = EconomyEngine.canAfford(cost);

        const btn = document.createElement('button');
        btn.className = 'choice-btn' + (!canAfford ? ' locked' : '');
        btn.textContent = `Repair ${displayName} — ${cost} credits`;

        if (canAfford) {
          btn.addEventListener('click', () => {
            EconomyEngine.spend(cost);
            ShipEngine.repairSystem(key);
            GameState.addLog('event', `${displayName} repaired for ${cost} credits`);
            GameState.save();
            Game.render();
          });
        }

        screen.appendChild(btn);
      }
    }

    this._addBackButton(screen);
    container.appendChild(screen);
  },
};
