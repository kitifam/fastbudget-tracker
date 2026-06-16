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

  // ===== RENDER หน้าหลัก =====

  async render(userId) {
    this.userId = userId;
    let rawAccounts = await DB.getAccounts(userId);

    if (window.AccountPrefs) {
      rawAccounts = rawAccounts.filter(a => !window.AccountPrefs.get(a.id).hidden);
    }

    // 1. เอาเฉพาะการลงทุน
    this.accounts = rawAccounts.filter(a => ['investment', 'mutual_fund', 'stock', 'gold'].includes(a.type));

    // 2. กรองตามแถบสรุปยอด
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
    filtered.sort((a, b) => {
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

              <button onclick="void(0)" style="display:none"
                class="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600
                       text-white px-4 py-2.5 rounded-lg font-medium text-sm
                       transition-colors shadow-sm active:scale-[0.98]">
                <i data-lucide="plus" class="w-4 h-4"></i>
                เพิ่มพอร์ต
              </button>
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
    const totals = { mutual_fund: 0, stock: 0, gold: 0, all: 0 };

    this.accounts.forEach(a => {
      const bal = parseFloat(a.balance);
      const currentVal = a.investments?.[0]?.current_value ? parseFloat(a.investments[0].current_value) : bal;

      totals.all += currentVal;
      if (['mutual_fund', 'investment'].includes(a.type)) totals.mutual_fund += currentVal;
      if (a.type === 'stock') totals.stock += currentVal;
      if (a.type === 'gold') totals.gold += currentVal;
    });

    const items = [
      { id: 'all', label: 'มูลค่ารวม', amount: totals.all, color: 'blue', icon: 'wallet' },
      { id: 'mutual_fund', label: 'พอร์ตกองทุนรวม', amount: totals.mutual_fund, color: 'emerald', icon: 'pie-chart' },
      { id: 'stock', label: 'พอร์ตหุ้น', amount: totals.stock, color: 'orange', icon: 'line-chart' },
      { id: 'gold', label: 'พอร์ตทองคำ', amount: totals.gold, color: 'amber', icon: 'coins' }
    ];

    return `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          ${items.map(item => {
      const isActive = this.activeFilter === item.id;
      const borderClass = isActive ? `border-${item.color}-500 shadow-md ring-2 ring-${item.color}-50` : 'border-slate-100 hover:border-slate-300';
      const barClass = `bg-${item.color}-500`;
      const iconBg = `bg-${item.color}-50`;
      const iconColor = `text-${item.color}-500`;

      return `
              <div onclick="InvestmentsPage.setFilter('${item.id}')"
                class="relative bg-white rounded-xl p-4 cursor-pointer transition-all border-2 overflow-hidden flex flex-col justify-between h-28 ${borderClass}">
                
                <!-- Side Accent Bar -->
                <div class="absolute left-0 top-0 bottom-0 w-1.5 ${barClass}"></div>
                
                <div class="flex items-start justify-between">
                  <div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${item.label}</span>
                    <p class="text-xl font-bold font-number mt-1 text-slate-800">${Format.money(item.amount)}</p>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                  <i data-lucide="${item.icon}" class="w-3 h-3 ${iconColor}"></i>
                </div>
              </div>
            `;
    }).join('')}
        </div>
      `;
  },

  // ===== ACCOUNT CARD =====

  _renderAccountCard(account, index = 0) {
    const typeLabels = { investment: 'การลงทุน', mutual_fund: 'พอร์ตกองทุนรวม', stock: 'พอร์ตหุ้น', gold: 'พอร์ตทองคำ' };
    const displayBalance = account.investments?.[0] ? parseFloat(account.investments[0].current_value) : parseFloat(account.balance);
    const themeColor = this._getAutoBankColor(account.name, account.color, account.type);

    let extraInfo = '';
    if (account.investments?.[0]) {
      const inv = account.investments[0];
      const cost = parseFloat(inv.invested_amount);
      const profit = displayBalance - cost;
      const profitPercent = cost > 0 ? (profit / cost) * 100 : 0;
      extraInfo = `
          <div class="px-2 py-0.5 rounded bg-white/20 inline-block text-[10px] font-bold">
            ${profit >= 0 ? '▲' : '▼'} ${Format.money(Math.abs(profit))} (${profitPercent.toFixed(2)}%)
          </div>
        `;
    }

    return `
        <div class="group cursor-pointer" onclick="InvestmentsPage.viewTransactions('${account.id}')">
          <div class="rounded-2xl p-6 text-white relative overflow-hidden shadow-lg transition-transform hover:scale-[1.02] duration-300 min-h-[160px] flex flex-col justify-between"
               style="background: linear-gradient(135deg, ${themeColor}, ${themeColor}CC)">
  
            <!-- Top Row: Icons/Actions -->
            <div class="relative z-10 flex items-start justify-between">
              <div class="flex items-center gap-3">
                 <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <i data-lucide="${this._getTypeIcon(account.type)}" class="w-5 h-5 text-white"></i>
                 </div>
                 <div>
                    <h3 class="font-bold text-base truncate max-w-[150px] leading-tight">${account.name}</h3>
                    <p class="text-[10px] opacity-70 uppercase font-medium tracking-wider">${typeLabels[account.type]}</p>
                 </div>
              </div>
              <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="event.stopPropagation(); window.openTransferModal('${account.id}')"
                  class="p-2 bg-white/10 hover:bg-white/30 rounded-full transition-colors" title="โอนเงิน">
                  <i data-lucide="arrow-right-left" class="w-4 h-4 text-white"></i>
                </button>
              </div>
            </div>

            <!-- Bottom Row: Balance -->
            <div class="relative z-10">
               <div class="flex items-end justify-between">
                  <div>
                    <p class="text-[10px] opacity-70 uppercase tracking-widest mb-1">มูลค่าปัจจุบัน</p>
                    <p class="text-2xl font-bold font-number">${Format.money(displayBalance)}</p>
                  </div>
                  <div class="text-right">
                    ${extraInfo}
                  </div>
               </div>
            </div>

            <!-- Background subtle pattern -->
            <div class="absolute -right-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          </div>
        </div>
      `;
  },

  _getTypeIcon(type) {
    const icons = { investment: 'trending-up', mutual_fund: 'pie-chart', stock: 'line-chart', gold: 'coins' };
    return icons[type] || 'circle';
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
      TransactionsPage.resetContextFilters({
        accountId,
        showSearch: true
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

  async refresh() {
    const container = document.getElementById('page-content');
    container.innerHTML = await this.render(this.userId);
    lucide.createIcons();
  }
};
