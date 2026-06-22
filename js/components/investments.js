// ===================================================
// Investments Component — จัดการการลงทุน
// ===================================================

const InvestmentsPage = {
  accounts: [],
  userId: null,
  sortBy: 'custom',
  sortOrder: 'asc',
  activeFilter: 'all', // 'all', 'mutual_fund', 'stock', 'gold'
  cardsPerRow: window.innerWidth > 768 ? 3 : 2,
  navData: {},
  navFetchState: { loading: false, results: [], failed: [] },

  // ===== NAV FETCHING =====

  async fetchNAV() {
    if (!window.FUND_ACCOUNTS) return;
    const fundAccounts = window.FUND_ACCOUNTS.filter(f => f.source !== 'yahoo');
    const stockAccounts = window.FUND_ACCOUNTS.filter(f => f.source === 'yahoo');

    const [mutualResult, stockResult] = await Promise.allSettled([
      this._fetchMutualFundNAV(fundAccounts),
      this._fetchStockNAV(stockAccounts),
    ]);

    if (mutualResult.status === 'fulfilled') Object.assign(this.navData, mutualResult.value);
    if (stockResult.status === 'fulfilled') Object.assign(this.navData, stockResult.value);
  },

  async _fetchMutualFundNAV(fundAccounts) {
    if (!fundAccounts.length) return {};
    const keys = fundAccounts.map(f => encodeURIComponent(f.navKey)).join(',');
    try {
      const res = await fetch(`/api/nav?funds=${keys}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return {};
    }
  },

  async _fetchStockNAV(stockAccounts) {
    if (!stockAccounts.length) return {};
    const result = {};
    const tickers = stockAccounts.map(s => encodeURIComponent(s.ticker)).join(',');
    try {
      const res = await fetch(`/api/nav?tickers=${tickers}`);
      const json = await res.json();
      for (const s of stockAccounts) {
        const entry = json[s.ticker];
        if (entry?.nav != null) result[s.navKey ?? s.ticker] = { nav: entry.nav, date: null };
      }
    } catch {}
    return result;
  },

  _setNavAreaLoading() {
    const updateArea = document.getElementById('nav-update-area');
    if (!updateArea) return;
    updateArea.innerHTML = `
      <button disabled class="inline-flex items-center gap-2 bg-slate-100 text-slate-400 px-4 py-2.5 rounded-lg font-medium text-sm cursor-not-allowed">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
        <span id="nav-status-text">กำลังเริ่ม...</span>
      </button>`;
    if (window.lucide) lucide.createIcons();
  },

  async _doFetchPrices(fundAccounts, stockAccounts, setMsg) {
    const results = [];
    const failedEntries = [];

    if (fundAccounts.length) {
      setMsg(`กำลังดึงกองทุนรวม ${fundAccounts.length} รายการ...`);
      const navResult = await this._fetchMutualFundNAV(fundAccounts);
      for (const [k, v] of Object.entries(navResult)) {
        if (v?.nav != null) this.navData[k] = v;
      }
      for (const f of fundAccounts) {
        const entry = navResult[f.navKey];
        const ok = !!(entry?.nav);
        if (!ok) failedEntries.push(f);
        results.push({
          label: `${f.navKey}${ok ? ' ' + Number(entry.nav).toFixed(entry.nav > 100 ? 2 : 4) : ''}`,
          ok,
        });
      }
    }

    if (stockAccounts.length) {
      setMsg(`กำลังดึงราคาหุ้น ${stockAccounts.length} รายการ...`);
      const tickers = stockAccounts.map(s => encodeURIComponent(s.ticker)).join(',');
      let tickerResult = {};
      try {
        const res = await fetch(`/api/nav?tickers=${tickers}`);
        tickerResult = await res.json();
      } catch {}
      for (const s of stockAccounts) {
        const label = s.name.replace(/^ST /, '');
        const key = s.navKey ?? s.ticker;
        const entry = tickerResult[s.ticker];
        if (entry?.nav != null) {
          this.navData[key] = { nav: entry.nav, date: null };
          results.push({ label: `${label} ${entry.nav.toFixed(2)}`, ok: true });
        } else {
          failedEntries.push(s);
          results.push({ label, ok: false });
        }
      }
    }

    return { results, failedEntries };
  },

  _loadNavFromCache() {
    try {
      const cached = JSON.parse(localStorage.getItem('inv_nav_cache') || '{}');
      for (const [key, val] of Object.entries(cached)) {
        if (!this.navData[key] && val?.nav) this.navData[key] = val;
      }
    } catch {}
  },

  _saveNavToCache() {
    try {
      localStorage.setItem('inv_nav_cache', JSON.stringify(this.navData));
    } catch {}
  },

  _calcLots(lots) {
    const buys = lots.filter(t => t.units > 0).map(t => ({ ...t, remaining: t.units }));
    const sells = lots.filter(t => t.units < 0);

    for (const sell of sells) {
      let toSell = Math.abs(sell.units);
      for (const buy of buys) {
        if (buy.remaining <= 0 || toSell <= 0) continue;
        const consumed = Math.min(buy.remaining, toSell);
        buy.remaining -= consumed;
        toSell -= consumed;
      }
    }

    const openBuys = buys.filter(b => b.remaining > 0);
    const netUnits = openBuys.reduce((s, b) => s + b.remaining, 0);
    const investedAmount = openBuys.reduce((s, b) => s + (b.remaining / b.units) * b.cost, 0);
    return { buys, sells, netUnits, investedAmount };
  },

  // ===== RENDER หน้าหลัก =====

  async render(userId) {
    this.userId = userId;
    let rawAccounts = await DB.getAccounts(userId);

    if (window.AccountPrefs) {
      rawAccounts = rawAccounts.filter(a => !window.AccountPrefs.get(a.id).hidden);
    }

    // 1. เอาเฉพาะการลงทุน
    this.accounts = rawAccounts.filter(a => ['investment', 'mutual_fund', 'stock', 'gold'].includes(a.type));

    this._loadNavFromCache();
    // 2. populate investments[0] จาก navData ที่ cache ไว้ (user กด "อัปเดตราคา" เพื่อ fetch ใหม่)
    if (window.FUND_ACCOUNTS) {
      for (const account of this.accounts) {
        const fundCfg = window.FUND_ACCOUNTS.find(f => f.name === account.name);
        if (!fundCfg) continue;

        const lots = DB.getInvestmentLots(account.name);
        if (!lots.length) continue;
        account._hasLots = true;

        const navKey = fundCfg.navKey ?? fundCfg.ticker;
        const navEntry = this.navData[navKey];
        if (!navEntry?.nav) continue;

        const { netUnits, investedAmount: calcInvested } = this._calcLots(lots);
        if (netUnits <= 0) continue;
        const investedAmount = lots.some(l => l._isCheckpoint)
          ? DB.getAccountNetBalance(account.name)
          : calcInvested;

        account.investments = [{
          current_value: netUnits * navEntry.nav,
          invested_amount: investedAmount,
          units: netUnits,
          nav: navEntry.nav,
          nav_date: navEntry.date,
        }];
      }
    }

    // 3. fallback: คำนวณ balance จาก transactions
    // ให้ getAccountNetBalance มีสิทธิ์ก่อนเสมอ เพราะ account.value ใน DB อาจ stale
    // fallback ไปที่ account.balance เฉพาะเมื่อยังไม่มี transactions เลย
    for (const account of this.accounts) {
      if (account.investments?.length) continue;
      const netBal = DB.getAccountNetBalance(account.name);
      if (netBal > 0) {
        account._investedAmt = netBal;
        account._currentVal = netBal;
      } else {
        const bal = Math.max(0, parseFloat(account.balance) || 0);
        account._investedAmt = bal;
        account._currentVal = bal;
      }
    }

    // 3.5 ตรวจหาบัญชีหุ้นกู้ (เฉพาะ mutual_fund/investment เท่านั้น — ไม่รวม stock/gold)
    for (const account of this.accounts) {
      if (account._hasLots) continue;
      if (account.type === 'stock' || account.type === 'gold') continue;
      if (window.FUND_ACCOUNTS?.find(f => f.name === account.name)) continue;
      const bonds = DB.getAccountBondHoldings(account.name);
      if (!bonds.length) continue;
      account._hasBonds = true;
      account._bondData = bonds;
      // ใช้ยอดรวม active bonds เป็น investedAmt แทน getAccountNetBalance
      // เพราะ bond maturity บันทึกเป็น transfer (i_e=2) ทำให้ getAccountNetBalance นับสูงเกิน
      const activeTotal = bonds.filter(b => !b.matured).reduce((s, b) => s + b.totalValue, 0);
      account._investedAmt = activeTotal;
      account._currentVal  = activeTotal;
    }

    // 4. กรองตามแถบสรุปยอด
    let filtered = [...this.accounts];
    if (this.activeFilter !== 'all') {
      // if filter is mutual_fund, stock, or gold
      if (this.activeFilter === 'mutual_fund') {
        filtered = filtered.filter(a => ['mutual_fund', 'investment'].includes(a.type));
      } else {
        filtered = filtered.filter(a => a.type === this.activeFilter);
      }
    }

    // 3. ระบบเรียงลำดับ
    const _hasNavCfg = (a) => !!(window.FUND_ACCOUNTS?.find(f => f.name === a.name));
    filtered.sort((a, b) => {
      // บัญชีที่ไม่มี nav config อยู่ท้ายกลุ่มเสมอ
      const navDiff = _hasNavCfg(b) - _hasNavCfg(a);
      if (navDiff !== 0) return navDiff;

      let comparison = 0;
      if (this.sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (this.sortBy === 'balance') {
        comparison = parseFloat(a.balance) - parseFloat(b.balance);
      } else if (this.sortBy === 'type') {
        comparison = a.type.localeCompare(b.type);
      } else if (this.sortBy === 'custom' && window.AccountPrefs) {
        comparison = window.AccountPrefs.get(a.id).order - window.AccountPrefs.get(b.id).order;
        if (comparison === 0) comparison = a.name.localeCompare(b.name);
      }
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });

    return `
        <div class="page-transition">
          <!-- Summary Cards (Acting as Filters) -->
          ${this._renderSummary()}

          <!-- Header Toolbar -->
          <div class="flex flex-col gap-4 mb-6">
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
               <span class="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">เรียงตาม:</span>
               ${['custom', 'name', 'balance', 'type'].map(key => {
      const labels = { custom: 'จัดเรียงเอง', name: 'ชื่อบัญชี', balance: 'มูลค่ารวม', type: 'ประเภท' };
      const isActive = this.sortBy === key;
      return `
                   <button onclick="InvestmentsPage.setSort('${key}')"
                     class="px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap
                     ${isActive ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">
                     ${labels[key]}
                   </button>
                 `;
    }).join('')}
               
               <button onclick="InvestmentsPage.toggleOrder()" 
                 class="ml-1 p-2 bg-white rounded-full border border-slate-200 shadow-sm text-slate-500 hover:text-blue-500 transition-colors">
                 <i data-lucide="${this.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'}" class="w-4 h-4"></i>
               </button>
            </div>

            <div class="flex items-center justify-between">
              <!-- Grid columns slider -->
              <div class="flex items-center gap-3 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ขนาด:</span>
                <input type="range" id="inv-grid-cols-slider" 
                  min="1" max="5" value="${this.cardsPerRow}"
                  oninput="InvestmentsPage.setGridCols(this.value)"
                  class="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500">
                <span id="inv-grid-cols-val" class="text-xs font-bold text-blue-600 min-w-[12px] text-center">${this.cardsPerRow}</span>
              </div>

              ${this._renderNavUpdateBtn()}
            </div>
          </div>
  
          <!-- Accounts Groups -->
          <div class="flex flex-col gap-8">
            <style>
               .inv-accounts-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(${this.cardsPerRow}, minmax(0, 1fr)); }
               @media (max-width: 1024px) { .inv-accounts-grid { grid-template-columns: repeat(${Math.min(this.cardsPerRow, 3)}, minmax(0, 1fr)); } }
               @media (max-width: 768px) { .inv-accounts-grid { grid-template-columns: repeat(${Math.min(this.cardsPerRow, 2)}, minmax(0, 1fr)); } }
               @media (max-width: 480px) { .inv-accounts-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); } }
            </style>
            ${this._renderGroups(filtered)}
          </div>
        </div>
  
        </div>
      `;
  },

  _renderGroups(filtered) {
    if (filtered.length === 0) return this._renderEmpty();

    const subGroups = {};
    filtered.forEach(item => {
      if (!subGroups[item.type]) subGroups[item.type] = [];
      subGroups[item.type].push(item);
    });

    let html = `<div><h2 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="trending-up" class="w-5 h-5 text-blue-500"></i> หมวดการลงทุน</h2>`;

    const typeOrder = ['mutual_fund', 'stock', 'gold', 'investment'];
    const sortedTypes = Object.keys(subGroups).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));

    sortedTypes.forEach(t => {
      const typeLabels = { investment: 'การลงทุนอื่นๆ', mutual_fund: 'พอร์ตกองทุนรวม', stock: 'พอร์ตหุ้น', gold: 'พอร์ตทองคำ' };
      html += `
              <div class="mb-6">
                <h3 class="text-sm font-semibold text-slate-500 mb-3 border-b border-slate-100 pb-1">${typeLabels[t] || t}</h3>
                <div class="inv-accounts-grid">
                  ${subGroups[t].map((a, i) => this._renderAccountCard(a, i)).join('')}
                </div>
              </div>
            `;
    });

    html += `</div>`;
    return html;
  },

  // ===== SUMMARY FILTERS =====

  _renderSummary() {
    const cur = { all: 0, mutual_fund: 0, stock: 0, gold: 0 };
    const inv = { all: 0, mutual_fund: 0, stock: 0, gold: 0 };

    this.accounts.forEach(a => {
      const invested = a.investments?.[0]
        ? parseFloat(a.investments[0].invested_amount)
        : (a._investedAmt ?? 0);
      const current = a.investments?.[0]
        ? parseFloat(a.investments[0].current_value)
        : (a._currentVal ?? 0);

      cur.all += current; inv.all += invested;
      if (['mutual_fund', 'investment'].includes(a.type)) { cur.mutual_fund += current; inv.mutual_fund += invested; }
      if (a.type === 'stock') { cur.stock += current; inv.stock += invested; }
      if (a.type === 'gold') { cur.gold += current; inv.gold += invested; }
    });

    const items = [
      { id: 'all',         label: 'มูลค่ารวม',       color: 'blue',    icon: 'wallet' },
      { id: 'mutual_fund', label: 'พอร์ตกองทุนรวม',  color: 'emerald', icon: 'pie-chart' },
      { id: 'stock',       label: 'พอร์ตหุ้น',        color: 'orange',  icon: 'line-chart' },
      { id: 'gold',        label: 'พอร์ตทองคำ',       color: 'amber',   icon: 'coins' },
    ];

    return `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          ${items.map(item => {
      const currentVal = cur[item.id];
      const investedVal = inv[item.id];
      const profit = currentVal - investedVal;
      const profitPct = investedVal > 0 ? (profit / investedVal) * 100 : 0;
      const isActive = this.activeFilter === item.id;
      const borderClass = isActive ? `border-${item.color}-500 shadow-md ring-2 ring-${item.color}-50` : 'border-slate-100 hover:border-slate-300';
      const profitColor = profit >= 0 ? 'text-emerald-600' : 'text-red-500';
      const sign = profit >= 0 ? '▲' : '▼';

      return `
              <div onclick="InvestmentsPage.setFilter('${item.id}')"
                class="relative bg-white rounded-xl p-4 cursor-pointer transition-all border-2 overflow-hidden ${borderClass}">
                <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-${item.color}-500"></div>
                <div class="pl-1">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <i data-lucide="${item.icon}" class="w-3 h-3 text-${item.color}-500"></i>
                    ${item.label}
                  </span>
                  <p class="text-xl font-bold font-number mt-1 text-slate-800">${Format.money(currentVal)}</p>
                  <div class="mt-1.5 space-y-0.5">
                    <p class="text-[10px] text-slate-400">ลงทุน: <span class="font-medium text-slate-600">${Format.money(investedVal)}</span></p>
                    ${investedVal > 0 ? `<p class="text-[10px] font-bold ${profitColor}">${sign} ${Format.money(Math.abs(profit))} (${profitPct.toFixed(2)}%)</p>` : ''}
                  </div>
                </div>
              </div>
            `;
    }).join('')}
        </div>
      `;
  },

  // ===== ACCOUNT CARD =====

  _renderAccountCard(account, index = 0) {
    const typeLabels = { investment: 'การลงทุน', mutual_fund: 'กองทุนรวม', stock: 'หุ้น', gold: 'ทองคำ' };
    const inv = account.investments?.[0];
    const fundCfg = window.FUND_ACCOUNTS?.find(f => f.name === account.name);
    const themeColor = fundCfg?.color ?? this._getAutoBankColor(account.name, account.color, account.type);
    const hasFundData = account._hasLots || !!inv?.units;
    const editNavKey = fundCfg?.navKey ?? fundCfg?.ticker;
    const currentNav = editNavKey ? this.navData[editNavKey] : null;

    const invested = inv ? parseFloat(inv.invested_amount) : (account._investedAmt ?? 0);
    const current  = inv ? parseFloat(inv.current_value)   : (account._currentVal  ?? 0);
    const profit    = current - invested;
    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;
    const hasChange = invested > 0 && Math.abs(profit) > 0.01;
    const sign      = profit >= 0 ? '▲' : '▼';
    const profitClass = profit >= 0 ? 'text-emerald-300' : 'text-red-300';
    const unitLabel = account.type === 'stock' ? 'หุ้น' : 'หน่วย';

    const navEditSection = editNavKey ? `
      <div class="mt-3 pt-3 border-t border-white/15 relative z-10" onclick="event.stopPropagation()">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[9px] opacity-60 uppercase tracking-wide flex-shrink-0">NAV</span>
            <input id="nav-price-${account.id}" type="number" step="0.0001"
              value="${currentNav?.nav ?? ''}"
              placeholder="0.0000"
              class="w-32 px-2 py-0.5 text-xs text-right rounded-md bg-white/15 border border-white/25 text-white placeholder-white/35 focus:outline-none focus:border-white/60 focus:bg-white/20 font-number">
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="text-[9px] opacity-60 uppercase tracking-wide flex-shrink-0">วันที่</span>
            <input id="nav-date-${account.id}" type="date"
              value="${currentNav?.date ?? ''}"
              class="w-36 px-2 py-0.5 text-xs text-right rounded-md bg-white/15 border border-white/25 text-white focus:outline-none focus:border-white/60 focus:bg-white/20">
          </div>
          <button onclick="InvestmentsPage.saveNavFromCard(${account.id})"
            class="w-full py-1 bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-md text-xs font-medium text-white transition-colors">
            บันทึก
          </button>
        </div>
      </div>` : '';

    return `
      <div class="group" onclick="InvestmentsPage.${hasFundData ? `openLotModal(${account.id})` : account._hasBonds ? `openBondModal(${account.id})` : `viewTransactions('${account.id}')`}">
        <div class="rounded-2xl p-4 text-white relative overflow-hidden shadow-lg cursor-pointer transition-transform hover:scale-[1.01] duration-300 flex flex-col"
             style="background: linear-gradient(135deg, ${themeColor}, ${themeColor}CC)">

          <!-- Header -->
          <div class="relative z-10 flex items-start justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <i data-lucide="${this._getTypeIcon(account.type)}" class="w-4 h-4 text-white"></i>
              </div>
              <div class="min-w-0">
                <h3 class="font-bold text-sm truncate max-w-[150px] leading-tight">${account.name}</h3>
                <p class="text-[9px] opacity-60 uppercase font-medium tracking-wider">${typeLabels[account.type] || account.type}</p>
              </div>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="event.stopPropagation(); InvestmentsPage.viewTransactions('${account.id}')"
                class="p-1.5 bg-white/10 hover:bg-white/30 rounded-full transition-colors" title="ดู transactions">
                <i data-lucide="list" class="w-3.5 h-3.5 text-white"></i>
              </button>
            </div>
          </div>

          <!-- Data rows -->
          <div class="relative z-10 mt-3 space-y-1.5">
            <div class="flex items-baseline justify-between">
              <p class="text-[9px] opacity-60 uppercase tracking-wide">เงินลงทุน</p>
              <p class="text-xs font-semibold font-number opacity-80">${Format.money(invested)}</p>
            </div>
            ${inv?.units != null ? `
            <div class="flex items-baseline justify-between">
              <p class="text-[9px] opacity-60 uppercase tracking-wide">หน่วยคงเหลือ</p>
              <p class="text-xs font-semibold font-number opacity-80">${inv.units.toLocaleString('th-TH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${unitLabel}</p>
            </div>` : ''}
            <div class="flex items-baseline justify-between">
              <p class="text-[9px] opacity-60 uppercase tracking-wide">มูลค่าปัจจุบัน</p>
              <p class="text-base font-bold font-number">${Format.money(current)}</p>
            </div>
            <div class="flex items-baseline justify-between">
              <p class="text-[9px] opacity-60 uppercase tracking-wide">กำไร/ขาดทุน</p>
              ${hasChange
                ? `<p class="${profitClass} text-xs font-bold">${sign} ${Format.money(Math.abs(profit))} (${profitPct.toFixed(2)}%)</p>`
                : `<p class="text-[10px] opacity-40">${currentNav?.nav ? 'ไม่มีการเปลี่ยนแปลง' : 'ยังไม่อัปเดตราคา'}</p>`}
            </div>
          </div>

          <!-- Inline NAV edit (FUND_ACCOUNTS only) -->
          ${navEditSection}

          <div class="absolute -right-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        </div>
      </div>
    `;
  },

  _getTypeIcon(type) {
    const icons = { investment: 'trending-up', mutual_fund: 'pie-chart', stock: 'line-chart', gold: 'coins' };
    return icons[type] || 'circle';
  },

  // ===== LOT DETAIL MODAL =====

  async openLotModal(accountId) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return;
    const accountName = account.name;
    const fundCfg = window.FUND_ACCOUNTS?.find(f => f.name === accountName);

    const inv = account.investments?.[0];
    const lots = DB.getInvestmentLots(accountName);
    const hasCheckpoint = lots.some(l => l._isCheckpoint);
    const { buys, sells, netUnits, investedAmount: calcInvested } = this._calcLots(lots);
    const investedAmount = hasCheckpoint ? DB.getAccountNetBalance(accountName) : calcInvested;

    const currentValue = inv?.current_value ?? 0;
    const totalProfit = currentValue - investedAmount;
    const profitPct = investedAmount > 0 ? (totalProfit / investedAmount) * 100 : 0;
    const profitColor = totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500';

    const lotRows = buys.map(buy => {
      const isClosed = buy.remaining <= 0;
      const isPartial = buy.remaining > 0 && buy.remaining < buy.units;
      const statusBadge = isClosed
        ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-medium">ปิดแล้ว</span>`
        : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">ถืออยู่</span>`;
      const costPerUnit = buy.units > 0 ? buy.cost / buy.units : 0;
      const remainingCost = buy.units > 0 ? (buy.remaining / buy.units) * buy.cost : 0;
      const unitsDisplay = isPartial
        ? `${buy.remaining.toLocaleString('th-TH', { minimumFractionDigits: 4 })} <span class="text-slate-300 text-[9px]">(${buy.units.toLocaleString('th-TH', { minimumFractionDigits: 4 })})</span>`
        : buy.units.toLocaleString('th-TH', { minimumFractionDigits: 4 });
      return `
        <tr class="${isClosed ? 'opacity-50' : ''}">
          <td class="py-2 text-xs text-slate-500">${buy.date || '-'}</td>
          <td class="py-2 text-xs font-number text-right">${unitsDisplay}</td>
          <td class="py-2 text-xs font-number text-right">${Format.money(isClosed ? 0 : remainingCost)}</td>
          <td class="py-2 text-xs font-number text-right text-slate-400">${costPerUnit.toFixed(4)}</td>
          <td class="py-2 text-right">${statusBadge}</td>
        </tr>`;
    }).join('');

    const modal = document.getElementById('investment-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/40" onclick="InvestmentsPage.closeModal()"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div class="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between z-10">
          <div>
            <h2 class="text-base font-bold text-slate-800">${accountName}</h2>
            <p class="text-xs text-slate-400 mt-0.5">${netUnits.toLocaleString('th-TH', { minimumFractionDigits: 4 })} หน่วย · NAV ${inv?.nav?.toFixed(4) ?? '-'}</p>
          </div>
          <button onclick="InvestmentsPage.closeModal()" class="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <div class="px-5 py-4 border-b border-slate-100 grid grid-cols-3 gap-3">
          <div>
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">ต้นทุนคงเหลือ</p>
            <p class="text-sm font-bold font-number text-slate-700">${Format.money(investedAmount)}</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">มูลค่าปัจจุบัน</p>
            <p class="text-sm font-bold font-number text-slate-700">${Format.money(currentValue)}</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">กำไร/ขาดทุน</p>
            <p class="text-sm font-bold font-number ${profitColor}">${totalProfit >= 0 ? '+' : ''}${Format.money(totalProfit)} (${profitPct.toFixed(2)}%)</p>
          </div>
        </div>

        <div class="overflow-y-auto flex-1 px-5 py-3">
          <table class="w-full">
            <thead>
              <tr class="text-[10px] text-slate-400 uppercase border-b border-slate-100">
                <th class="pb-2 text-left font-medium">วันที่</th>
                <th class="pb-2 text-right font-medium">หน่วยคงเหลือ</th>
                <th class="pb-2 text-right font-medium">ต้นทุนคงเหลือ</th>
                <th class="pb-2 text-right font-medium">ต่อหน่วย</th>
                <th class="pb-2 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${lotRows || '<tr><td colspan="5" class="py-4 text-center text-sm text-slate-400">ไม่พบข้อมูล lot (ต้องมี --units ใน notes)</td></tr>'}
            </tbody>
          </table>

          ${sells.length ? `
          <div class="mt-4">
            <p class="text-[10px] font-semibold text-slate-400 uppercase mb-2">รายการขาย/ไถ่ถอน</p>
            <table class="w-full">
              <tbody class="divide-y divide-slate-50">
                ${sells.map(s => `
                  <tr>
                    <td class="py-2 text-xs text-slate-500">${s.date || '-'}</td>
                    <td class="py-2 text-xs font-number text-right text-red-400">${s.units.toLocaleString('th-TH', { minimumFractionDigits: 4 })}</td>
                    <td class="py-2 text-xs font-number text-right">${Format.money(s.cost)}</td>
                    <td class="py-2"></td>
                    <td class="py-2 text-right"><span class="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-400 font-medium">ขายแล้ว</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
        </div>

        <div class="sticky bottom-0 bg-white px-5 py-4 border-t border-slate-100 flex gap-3">
          ${fundCfg ? `<button onclick="InvestmentsPage.openManualPriceEdit(${accountId})"
            class="flex-1 py-2.5 border border-blue-200 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50">แก้ไขราคา</button>` : ''}
          <button onclick="InvestmentsPage.closeModal()" class="${fundCfg ? 'flex-1' : 'w-full'} py-2.5 border rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">ปิด</button>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  // ===== BOND MODAL =====

  openBondModal(accountId) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return;
    const bonds = account._bondData || [];
    const activeBonds = bonds.filter(b => !b.matured);
    const totalActive = activeBonds.reduce((s, b) => s + b.totalValue, 0);

    const bondRow = (bond) => `
      <tr class="${bond.matured ? 'opacity-50' : ''}">
        <td class="py-2.5 text-xs font-medium text-slate-700">${bond.name}</td>
        <td class="py-2.5 text-xs font-number text-right">${Format.money(bond.totalValue)}</td>
        <td class="py-2.5 text-xs text-slate-400 text-center">${bond.firstBuyDate || '-'}</td>
        <td class="py-2.5 text-right">
          ${bond.matured
            ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-medium">ครบกำหนดแล้ว</span>'
            : '<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">ถืออยู่</span>'}
        </td>
      </tr>`;

    const modal = document.getElementById('investment-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/40" onclick="InvestmentsPage.closeModal()"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div class="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between z-10">
          <div>
            <h2 class="text-base font-bold text-slate-800">${account.name} — หุ้นกู้</h2>
            <p class="text-xs text-slate-400 mt-0.5">ถืออยู่ ${activeBonds.length} ตัว · ครบกำหนดแล้ว ${bonds.length - activeBonds.length} ตัว</p>
          </div>
          <button onclick="InvestmentsPage.closeModal()" class="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <div class="px-5 py-4 border-b border-slate-100">
          <p class="text-[10px] text-slate-400 uppercase tracking-wide">มูลค่ารวมที่ถืออยู่</p>
          <p class="text-xl font-bold font-number text-slate-800">${Format.money(totalActive)}</p>
        </div>

        <div class="overflow-y-auto flex-1 px-5 py-3">
          <table class="w-full">
            <thead>
              <tr class="text-[10px] text-slate-400 uppercase border-b border-slate-100">
                <th class="pb-2 text-left font-medium">หุ้นกู้</th>
                <th class="pb-2 text-right font-medium">มูลค่า</th>
                <th class="pb-2 text-center font-medium">วันที่ซื้อ</th>
                <th class="pb-2 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${bonds.map(bondRow).join('') || '<tr><td colspan="4" class="py-4 text-center text-sm text-slate-400">ไม่พบข้อมูลหุ้นกู้</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="sticky bottom-0 bg-white px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onclick="InvestmentsPage.viewTransactions('${accountId}')"
            class="flex-1 py-2.5 border rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">ดู Transactions</button>
          <button onclick="InvestmentsPage.closeModal()"
            class="flex-1 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">ปิด</button>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  // ===== EMPTY STATE =====

  _renderEmpty() {
    return `
        <div class="col-span-full bg-white rounded-xl shadow-sm p-12 flex flex-col items-center justify-center text-center">
          <i data-lucide="trending-up" class="w-8 h-8 text-slate-300 mb-4"></i>
          <h3 class="font-semibold text-slate-600 mb-2">ไม่พบรายการลงทุน</h3>
          <p class="text-sm text-slate-400 mb-4">ยังไม่มีพอร์ตในกลุ่มที่เลือก</p>
          <button onclick="InvestmentsPage.setFilter('all')" class="text-blue-500 text-sm font-medium">ดูทั้งหมด</button>
        </div>
      `;
  },

  // ===== MODAL =====

  async openModal(editId = null) {
    if (!this.userId) {
      const session = await Auth.getSession();
      this.userId = session?.user?.id;
    }
    const modal = document.getElementById('investment-modal');
    let account = null;
    let investment = null;

    if (editId) {
      account = this.accounts.find(a => a.id === editId);
      investment = account.investments?.[0];
    }

    const isEdit = !!account;
    const title = isEdit ? 'แก้ไขพอร์ต' : 'เพิ่มพอร์ตใหม่';
    const colors = Theme.palette().chart;
    const p = Theme.palette();

    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="InvestmentsPage.closeModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md modal-content overflow-hidden flex flex-col max-h-[90vh]">
          
          <div class="sticky top-0 bg-white p-5 border-b border-slate-100 flex items-center justify-between z-10">
            <h2 class="text-lg font-bold text-slate-800">${title}</h2>
            <button onclick="InvestmentsPage.closeModal()" class="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
               <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
  
          <div class="p-5 space-y-5 overflow-y-auto no-scrollbar">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">ชื่อพอร์ต</label>
              <input type="text" id="inv-name" value="${account?.name || ''}"
                placeholder="เช่น กองทุน SCB, หุ้น PTT"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">ประเภท</label>
              <select id="inv-type"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="mutual_fund" ${account?.type === 'mutual_fund' ? 'selected' : ''}>📈 พอร์ตกองทุนรวม</option>
                <option value="stock"       ${account?.type === 'stock' ? 'selected' : ''}>📈 พอร์ตหุ้น</option>
                <option value="gold"        ${account?.type === 'gold' ? 'selected' : ''}>🏅 พอร์ตทองคำ</option>
                <option value="investment"  ${account?.type === 'investment' ? 'selected' : ''}>📈 การลงทุนอื่นๆ</option>
              </select>
            </div>
            <div id="investment-fields" class="space-y-4 p-4 bg-slate-50 rounded-xl border border-dotted border-slate-200">
               <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">เงินต้นทั้งหมด</label>
                    <input type="number" id="inv-cost" value="${investment?.invested_amount || 0}" class="w-full px-3 py-2 text-sm border rounded-lg font-number">
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">มูลค่าปัจจุบัน</label>
                    <input type="number" id="inv-current" value="${investment?.current_value || 0}" class="w-full px-3 py-2 text-sm border rounded-lg font-number">
                  </div>
               </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">สีประจำพอร์ต</label>
              <div class="flex gap-2 flex-wrap">
                ${colors.map(c => `
                  <button type="button" onclick="InvestmentsPage.selectColor('${c}')"
                    data-color="${c}" class="inv-color-btn w-8 h-8 rounded-full border-2 transition-transform hover:scale-110
                           ${(account?.color || p.primary) === c ? 'border-slate-800 scale-110' : 'border-transparent'}"
                    style="background-color: ${c}"></button>
                `).join('')}
              </div>
              <input type="hidden" id="inv-color" value="${account?.color || p.primary}">
            </div>
          </div>
          <div class="sticky bottom-0 bg-white flex gap-3 p-5 border-t border-slate-100">
            <button onclick="InvestmentsPage.closeModal()" class="flex-1 py-2.5 border rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onclick="InvestmentsPage.save('${editId || ''}')" class="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium text-white shadow-sm">บันทึก</button>
          </div>
        </div>
      `;
    lucide.createIcons();
  },

  selectColor(color) {
    document.getElementById('inv-color').value = color;
    document.querySelectorAll('.inv-color-btn').forEach(btn => {
      const isSelected = btn.dataset.color === color;
      btn.classList.toggle('border-slate-800', isSelected);
      btn.classList.toggle('scale-110', isSelected);
    });
  },

  closeModal() {
    const modal = document.getElementById('investment-modal');
    modal.className = 'hidden fixed inset-0 z-50';
    modal.innerHTML = '';
  },

  async save(editId) {
    const name = document.getElementById('inv-name').value.trim();
    const type = document.getElementById('inv-type').value;
    const color = document.getElementById('inv-color').value;
    let balance = parseFloat(document.getElementById('inv-current').value) || 0;
    if (!name) return Toast.show('กรุณาใส่ชื่อพอร์ต', 'error');
    const accountData = { user_id: this.userId, name, type, balance, color, currency: 'THB' };
    if (editId) delete accountData.user_id;
    const result = editId ? await DB.updateAccount(editId, accountData) : await DB.createAccount(accountData);
    if (result.error) return Toast.show('ล้มเหลว', 'error');

    const accountId = editId || result.data.id;
    await DB.saveInvestment({
      user_id: this.userId, account_id: accountId,
      invested_amount: parseFloat(document.getElementById('inv-cost').value) || 0,
      current_value: balance
    });

    Toast.show('สำเร็จ', 'success');
    this.closeModal();
    await this.refresh();
  },

  async confirmDelete(id, name) {
    const modal = document.getElementById('investment-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="InvestmentsPage.closeModal()"></div>
        <div class="relative bg-white rounded-xl p-6 text-center max-w-sm w-full mx-auto">
          <h3 class="text-lg font-bold text-slate-800 mb-4">ลบพอร์ต "${name}"?</h3>
          <div class="flex gap-3">
             <button onclick="InvestmentsPage.closeModal()" class="flex-1 py-2 border rounded-lg">ยกเลิก</button>
             <button onclick="InvestmentsPage.deleteAccount('${id}')" class="flex-1 py-2 bg-red-500 text-white rounded-lg">ลบ</button>
          </div>
        </div>
      `;
  },

  async deleteAccount(id) { await DB.deleteAccount(id); this.closeModal(); await this.refresh(); },

  setSort(val) { if (this.sortBy === val) return this.toggleOrder(); this.sortBy = val; this.refresh(); },
  toggleOrder() { this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'; this.refresh(); },
  setGridCols(val) { this.cardsPerRow = parseInt(val); this.refresh(); },
  setFilter(val) { this.activeFilter = val; this.refresh(); },

  async viewTransactions(accountId) {
    if (typeof TransactionsPage !== 'undefined') {
      const account = this.accounts.find(a => String(a.id) === String(accountId));
      TransactionsPage.resetContextFilters({
        accountId,
        showSearch: true,
        contextLabel: account?.name || null,
      });
    }
    navigate('transactions');
  },

  _getAutoBankColor(accountName, userColor, type) {
    if (typeof getBrandColor === 'function') {
      return getBrandColor(accountName, userColor, type, '#64748b');
    }
    if (['investment', 'mutual_fund', 'stock', 'gold'].includes(type)) return '#10b981'; // Emerald
    return userColor || '#64748b'; // Slate
  },

  _renderNavUpdateBtn() {
    const { loading, results, failed } = this.navFetchState;
    const failedCount = failed?.length ?? 0;

    const resultChips = results?.length
      ? `<div class="flex flex-wrap gap-1 mt-1.5">
          ${results.map(r => `
            <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium
                ${r.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}">
              <i data-lucide="${r.ok ? 'check' : 'x'}" class="w-2.5 h-2.5"></i>
              ${r.label}
            </span>`).join('')}
        </div>`
      : '';

    if (loading) {
      return `<div id="nav-update-area" class="flex flex-col items-end">
        <button disabled class="inline-flex items-center gap-2 bg-slate-100 text-slate-400 px-4 py-2.5 rounded-lg font-medium text-sm cursor-not-allowed">
          <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
          <span id="nav-status-text">กำลังดึง...</span>
        </button>
      </div>`;
    }

    return `<div id="nav-update-area" class="flex flex-col items-end">
      <div class="flex gap-2">
        ${failedCount > 0 ? `
        <button onclick="InvestmentsPage.retryFailed()"
          class="inline-flex items-center gap-2 bg-red-50 hover:bg-red-100 border border-red-200
                 text-red-600 px-4 py-2.5 rounded-lg font-medium text-sm
                 transition-colors active:scale-[0.98]">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
          ลองใหม่ (${failedCount})
        </button>` : ''}
        <button onclick="InvestmentsPage.updatePrices()"
          class="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600
                 text-white px-4 py-2.5 rounded-lg font-medium text-sm
                 transition-colors shadow-sm active:scale-[0.98]">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
          อัปเดตราคา
        </button>
      </div>
      ${resultChips}
    </div>`;
  },

  async updatePrices() {
    if (this.navFetchState.loading || !window.FUND_ACCOUNTS) return;

    this.navFetchState = { loading: true, results: [], failed: [] };
    this._setNavAreaLoading();

    const setMsg = (msg) => {
      const el = document.getElementById('nav-status-text');
      if (el) el.textContent = msg;
    };

    const fundAccounts = window.FUND_ACCOUNTS.filter(f => f.source !== 'yahoo');
    const stockAccounts = window.FUND_ACCOUNTS.filter(f => f.source === 'yahoo');

    const { results, failedEntries } = await this._doFetchPrices(fundAccounts, stockAccounts, setMsg);

    this._saveNavToCache();
    this.navFetchState = { loading: false, results, failed: failedEntries };
    await this.refresh();
  },

  async retryFailed() {
    const toRetry = this.navFetchState.failed;
    if (!toRetry?.length || this.navFetchState.loading) return;

    const prevOkResults = this.navFetchState.results.filter(r => r.ok);
    this.navFetchState = { loading: true, results: [], failed: [] };
    this._setNavAreaLoading();

    const setMsg = (msg) => {
      const el = document.getElementById('nav-status-text');
      if (el) el.textContent = msg;
    };

    const fundAccounts = toRetry.filter(f => f.source !== 'yahoo');
    const stockAccounts = toRetry.filter(f => f.source === 'yahoo');

    const { results: newResults, failedEntries } = await this._doFetchPrices(fundAccounts, stockAccounts, setMsg);

    this._saveNavToCache();
    this.navFetchState = { loading: false, results: [...prevOkResults, ...newResults], failed: failedEntries };
    await this.refresh();
  },

  openManualPriceEdit(accountId) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return;
    const fundCfg = window.FUND_ACCOUNTS?.find(f => f.name === account.name);
    if (!fundCfg) return;
    const navKey = fundCfg.navKey ?? fundCfg.ticker;
    const current = this.navData[navKey];

    const modal = document.getElementById('investment-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/40" onclick="InvestmentsPage.closeModal()"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div class="px-5 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-slate-800">แก้ไขราคา</h2>
            <p class="text-xs text-slate-400 mt-0.5">${account.name}</p>
          </div>
          <button onclick="InvestmentsPage.closeModal()" class="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
        <div class="px-5 py-4 space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">ราคา / NAV</label>
            <input type="number" id="manual-nav-price" step="0.0001"
              value="${current?.nav ?? ''}"
              placeholder="0.0000"
              class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-number focus:ring-2 focus:ring-blue-500 focus:outline-none">
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">วันที่ข้อมูล (ไม่บังคับ)</label>
            <input type="date" id="manual-nav-date"
              value="${current?.date ?? ''}"
              class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
          </div>
        </div>
        <div class="px-5 pb-5 flex gap-3">
          <button onclick="InvestmentsPage.closeModal()"
            class="flex-1 py-2.5 border rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onclick="InvestmentsPage.saveManualPrice('${navKey}')"
            class="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium">บันทึก</button>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  _applyNavUpdate(navKey, nav, date) {
    this.navData[navKey] = { nav, date };
    this._saveNavToCache();
  },

  saveNavFromCard(accountId) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return;
    const fundCfg = window.FUND_ACCOUNTS?.find(f => f.name === account.name);
    if (!fundCfg) return;
    const navKey = fundCfg.navKey ?? fundCfg.ticker;
    const nav = parseFloat(document.getElementById(`nav-price-${accountId}`)?.value);
    if (!nav || isNaN(nav) || nav <= 0) return Toast.show('กรุณาใส่ราคาที่ถูกต้อง', 'error');
    const date = document.getElementById(`nav-date-${accountId}`)?.value || null;
    this._applyNavUpdate(navKey, nav, date);
    this.refresh();
  },

  saveManualPrice(navKey) {
    const nav = parseFloat(document.getElementById('manual-nav-price')?.value);
    if (!nav || isNaN(nav) || nav <= 0) return Toast.show('กรุณาใส่ราคาที่ถูกต้อง', 'error');
    const date = document.getElementById('manual-nav-date')?.value || null;
    this._applyNavUpdate(navKey, nav, date);
    this.closeModal();
    this.refresh();
  },

  async refresh() {
    const container = document.getElementById('page-content');
    container.innerHTML = await this.render(this.userId);
    lucide.createIcons();
  }
};
