// ===================================================
// Accounts Component — จัดการบัญชีเงินฝากและการลงทุน
// ===================================================

const AccountsPage = {
  accounts: [],
  userId: null,
  sortBy: 'custom',
  sortOrder: 'asc',
  activeFilter: 'all',
  cardsPerRow: window.innerWidth > 768 ? 3 : 2,
  showHidden: false,

  // ===== RENDER หน้าหลัก =====

  async render(userId) {
    this.userId = userId;
    const rawAccounts = await DB.getAccounts(userId);

    // Filter out investments (shown on Investments page)
    const bankAccounts = rawAccounts.filter(a => ['cash', 'bank', 'savings', 'general'].includes(a.type));

    // Split visible (use_account=1) and hidden (use_account=2)
    const visibleAccounts = bankAccounts.filter(a => a.use_account === 1);
    const hiddenAccounts  = bankAccounts.filter(a => a.use_account !== 1);

    // Summary totals use visible accounts only
    this.accounts = visibleAccounts;

    // Build display list
    let displayList = visibleAccounts.map(a => ({...a, _hidden: false}));
    if (this.showHidden) {
      displayList = [...displayList, ...hiddenAccounts.map(a => ({...a, _hidden: true}))];
    }

    const is24M = (name) => /24M$/i.test(name);

    // Apply active filter
    let filtered = [...displayList];
    if (this.activeFilter === 'cash') {
      filtered = filtered.filter(a => !is24M(a.name));
    } else if (this.activeFilter === 'bank') {
      filtered = filtered.filter(a => is24M(a.name));
    }

    // Sort — keep hidden accounts after visible
    const visibleFiltered = filtered.filter(a => !a._hidden);
    const hiddenFiltered  = filtered.filter(a => a._hidden);
    const sortFn = (a, b) => {
      let comparison = 0;
      if (this.sortBy === 'name') comparison = a.name.localeCompare(b.name);
      else if (this.sortBy === 'balance') comparison = parseFloat(a.balance) - parseFloat(b.balance);
      else if (this.sortBy === 'type') comparison = a.type.localeCompare(b.type);
      return this.sortOrder === 'asc' ? comparison : -comparison;
    };
    visibleFiltered.sort(sortFn);
    hiddenFiltered.sort(sortFn);
    filtered = [...visibleFiltered, ...hiddenFiltered];

    const hiddenCount = hiddenAccounts.length;

    return `
        <div class="page-transition">
          ${this._renderSummary()}

          <div class="flex flex-col gap-4 mb-6">
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
               <span class="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">เรียงตาม:</span>
               ${['custom', 'name', 'balance', 'type'].map(key => {
      const labels = { custom: 'จัดเรียงเอง', name: 'ชื่อบัญชี', balance: 'ยอดเงิน', type: 'ประเภท' };
      const isActive = this.sortBy === key;
      return `
                   <button onclick="AccountsPage.setSort('${key}')"
                     class="px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap
                     ${isActive ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">
                     ${labels[key]}
                   </button>
                 `;
    }).join('')}
               <button onclick="AccountsPage.toggleOrder()"
                 class="ml-1 p-2 bg-white rounded-full border border-slate-200 shadow-sm text-slate-500 hover:text-blue-500 transition-colors">
                 <i data-lucide="${this.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'}" class="w-4 h-4"></i>
               </button>
               ${hiddenCount > 0 ? `
                 <button onclick="AccountsPage.toggleHidden()"
                   class="ml-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border
                   ${this.showHidden ? 'bg-slate-500 text-white border-slate-500' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}">
                   ${this.showHidden ? 'ซ่อน Hidden' : `แสดง Hidden (${hiddenCount})`}
                 </button>
               ` : ''}
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ขนาด:</span>
                <input type="range" id="grid-cols-slider"
                  min="1" max="5" value="${this.cardsPerRow}"
                  oninput="AccountsPage.setGridCols(this.value)"
                  class="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500">
                <span id="grid-cols-val" class="text-xs font-bold text-blue-600 min-w-[12px] text-center">${this.cardsPerRow}</span>
              </div>
              <div></div>
            </div>
          </div>

          <div class="flex flex-col gap-8">
            <style>
               .accounts-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(${this.cardsPerRow}, minmax(0, 1fr)); }
               @media (max-width: 1024px) { .accounts-grid { grid-template-columns: repeat(${Math.min(this.cardsPerRow, 3)}, minmax(0, 1fr)); } }
               @media (max-width: 768px) { .accounts-grid { grid-template-columns: repeat(${Math.min(this.cardsPerRow, 2)}, minmax(0, 1fr)); } }
               @media (max-width: 480px) { .accounts-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); } }
            </style>
            ${this._renderGroups(filtered)}
          </div>
        </div>
      `;
  },

  _renderGroups(filtered) {
    if (filtered.length === 0) return this._renderEmpty();

    const is24M = (name) => /24M$/i.test(name);
    const cashItems  = filtered.filter(a => !is24M(a.name));
    const fixedItems = filtered.filter(a =>  is24M(a.name));

    const subGroups = [];
    if (cashItems.length > 0)  subGroups.push({ label: 'เงินสด',    icon: 'banknote', items: cashItems });
    if (fixedItems.length > 0) subGroups.push({ label: 'ฝากประจำ', icon: 'landmark', items: fixedItems });

    let html = `<div><h2 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="wallet" class="w-5 h-5 text-blue-500"></i> หมวด เงินสด+ฝากประจำ</h2>`;

    subGroups.forEach(sg => {
      html += `
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-slate-500 mb-3 border-b border-slate-100 pb-1 flex items-center gap-1.5">
            <i data-lucide="${sg.icon}" class="w-3.5 h-3.5"></i> ${sg.label}
          </h3>
          <div class="accounts-grid">
            ${sg.items.map((a, i) => this._renderAccountCard(a, i)).join('')}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  },

  // ===== SUMMARY FILTERS =====

  _renderSummary() {
    const is24M = (name) => /24M$/i.test(name);
    const totals = { all: 0, cash: 0, bank: 0 };

    this.accounts.forEach(a => {
      const bal = parseFloat(a.balance);
      if (is24M(a.name)) {
        totals.bank += bal;
      } else {
        totals.cash += bal;
      }
      totals.all += bal;
    });

    const items = [
      { id: 'all', label: 'มูลค่ารวม', amount: totals.all, color: 'blue', icon: 'wallet' },
      { id: 'cash', label: 'เงินสด', amount: totals.cash, color: 'emerald', icon: 'banknote' },
      { id: 'bank', label: 'ฝากประจำ', amount: totals.bank, color: 'orange', icon: 'landmark' }
    ];

    return `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          ${items.map(item => {
      const isActive = this.activeFilter === item.id;
      const borderClass = isActive ? `border-${item.color}-500 shadow-md ring-2 ring-${item.color}-50` : 'border-slate-100 hover:border-slate-300';
      const barClass = `bg-${item.color}-500`;
      const iconBg = `bg-${item.color}-50`;
      const iconColor = `text-${item.color}-500`;

      return `
              <div onclick="AccountsPage.setFilter('${item.id}')"
                class="relative bg-white rounded-xl p-5 cursor-pointer transition-all border-2 overflow-hidden flex flex-col justify-between h-32 ${borderClass}">
                
                <!-- Side Accent Bar -->
                <div class="absolute left-0 top-0 bottom-0 w-1.5 ${barClass}"></div>
                
                <div class="flex items-start justify-between">
                  <div>
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">${item.label}</span>
                    <p class="text-2xl font-bold font-number mt-1 text-slate-800">${Format.money(item.amount)}</p>
                  </div>
                  <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center">
                    <i data-lucide="${item.icon}" class="w-5 h-5 ${iconColor}"></i>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                  <i data-lucide="check-circle" class="w-3 h-3 text-emerald-400"></i>
                  ข้อมูลอัปเดตล่าสุด
                </div>
              </div>
            `;
    }).join('')}
        </div>
      `;
  },

  // ===== ACCOUNT CARD =====

  _renderAccountCard(account, index = 0) {
    const typeLabels = { cash: 'เงินสด', bank: 'ธนาคาร', savings: 'ออมทรัพย์', general: 'ทั่วไป' };
    const displayBalance = parseFloat(account.balance);
    const themeColor = this._getAutoBankColor(account.name, account.color, account.type);
    const hiddenClass = account._hidden ? 'opacity-50 saturate-0' : '';

    return `
        <div class="group cursor-pointer ${hiddenClass}" onclick="AccountsPage.viewTransactions('${account.id}')">
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
                    <p class="text-[10px] opacity-70 uppercase tracking-widest mb-1">ยอดคงเหลือ</p>
                    <p class="text-2xl font-bold font-number">${Format.money(displayBalance)}</p>
                    ${account.notes ? `<p class="text-[10px] opacity-60 mt-1 truncate max-w-[160px]">${account.notes}</p>` : ''}
                  </div>
                  <div class="text-right">
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
    const icons = { cash: 'banknote', bank: 'landmark', savings: 'piggy-bank', general: 'wallet' };
    return icons[type] || 'circle';
  },

  // ===== EMPTY STATE =====

  _renderEmpty() {
    return `
        <div class="col-span-full bg-white rounded-xl shadow-sm p-12 flex flex-col items-center justify-center text-center">
          <i data-lucide="wallet" class="w-8 h-8 text-slate-300 mb-4"></i>
          <h3 class="font-semibold text-slate-600 mb-2">ไม่พบรายการ</h3>
          <p class="text-sm text-slate-400 mb-4">ยังไม่มีบัญชีในกลุ่มที่เลือก</p>
          <button onclick="AccountsPage.setFilter('all')" class="text-blue-500 text-sm font-medium">ดูทั้งหมด</button>
        </div>
      `;
  },

  // ===== MODAL =====

  async openModal(editId = null) {
    if (!this.userId) {
      const session = await Auth.getSession();
      this.userId = session?.user?.id;
    }
    const modal = document.getElementById('account-modal');
    let account = null;
    let investment = null;

    if (editId) {
      account = this.accounts.find(a => a.id === editId);
      investment = account.investments?.[0];
    }

    const isEdit = !!account;
    const title = isEdit ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีใหม่';
    const colors = Theme.palette().chart;
    const p = Theme.palette();

    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="AccountsPage.closeModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md modal-content overflow-hidden flex flex-col max-h-[90vh]">
          
          <div class="sticky top-0 bg-white p-5 border-b border-slate-100 flex items-center justify-between z-10">
            <h2 class="text-lg font-bold text-slate-800">${title}</h2>
            <button onclick="AccountsPage.closeModal()" class="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
               <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
  
          <div class="p-5 space-y-5 overflow-y-auto no-scrollbar">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">ชื่อบัญชี</label>
              <input type="text" id="acc-name" value="${account?.name || ''}"
                placeholder="เช่น เงินสดออมทรัพย์, บัญชีเงินเดือน"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">ประเภท</label>
              <select id="acc-type"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="cash"        ${account?.type === 'cash' ? 'selected' : ''}>💵 เงินสด</option>
                <option value="bank"        ${account?.type === 'bank' ? 'selected' : ''}>🏦 ธนาคาร (ฝากประจำ)</option>
                <option value="savings"     ${account?.type === 'savings' ? 'selected' : ''}>🐷 ออมทรัพย์</option>
                <option value="general"     ${account?.type === 'general' ? 'selected' : ''}>📂 ทั่วไป</option>
              </select>
            </div>
            <div id="balance-group">
              <label class="block text-sm font-medium text-slate-700 mb-1">${isEdit ? 'ยอดคงเหลือ' : 'ยอดเริ่มต้น'}</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">฿</span>
                <input type="number" id="acc-balance" step="0.01" value="${account?.balance ?? 0}" class="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm font-number focus:ring-2 focus:ring-blue-500">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">สีประจำบัญชี</label>
              <div class="flex gap-2 flex-wrap">
                ${colors.map(c => `
                  <button type="button" onclick="AccountsPage.selectColor('${c}')"
                    data-color="${c}" class="acc-color-btn w-8 h-8 rounded-full border-2 transition-transform hover:scale-110
                           ${(account?.color || p.primary) === c ? 'border-slate-800 scale-110' : 'border-transparent'}"
                    style="background-color: ${c}"></button>
                `).join('')}
              </div>
              <input type="hidden" id="acc-color" value="${account?.color || p.primary}">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input type="text" id="acc-notes" value="${(account?.notes || '').replace(/'/g, '&#39;')}"
                placeholder="เช่น เลขบัญชี, อัตราดอกเบี้ย"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>
          </div>
          <div class="sticky bottom-0 bg-white flex gap-3 p-5 border-t border-slate-100">
            <button onclick="AccountsPage.closeModal()" class="flex-1 py-2.5 border rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onclick="AccountsPage.save('${editId || ''}')" class="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium text-white shadow-sm">บันทึก</button>
          </div>
        </div>
      `;
    lucide.createIcons();
  },

  selectColor(color) {
    document.getElementById('acc-color').value = color;
    document.querySelectorAll('.acc-color-btn').forEach(btn => {
      const isSelected = btn.dataset.color === color;
      btn.classList.toggle('border-slate-800', isSelected);
      btn.classList.toggle('scale-110', isSelected);
    });
  },

  closeModal() {
    const modal = document.getElementById('account-modal');
    modal.className = 'hidden fixed inset-0 z-50';
    modal.innerHTML = '';
  },

  async save(editId) {
    const name = document.getElementById('acc-name').value.trim();
    const type = document.getElementById('acc-type').value;
    const color = document.getElementById('acc-color').value;
    const notes = document.getElementById('acc-notes')?.value.trim() || '';
    let balance = parseFloat(document.getElementById('acc-balance')?.value) || 0;
    if (!name) return Toast.show('กรุณาใส่ชื่อบัญชี', 'error');
    const accountData = { user_id: this.userId, name, type, balance, color, currency: 'THB', notes };
    if (editId) delete accountData.user_id;
    const result = editId ? await DB.updateAccount(editId, accountData) : await DB.createAccount(accountData);
    if (result.error) return Toast.show('ล้มเหลว', 'error');
    Toast.show('สำเร็จ', 'success');
    this.closeModal();
    await this.refresh();
  },

  async confirmDelete(id, name) {
    const modal = document.getElementById('account-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="AccountsPage.closeModal()"></div>
        <div class="relative bg-white rounded-xl p-6 text-center max-w-sm w-full mx-auto">
          <h3 class="text-lg font-bold text-slate-800 mb-4">ลบบัญชี "${name}"?</h3>
          <div class="flex gap-3">
             <button onclick="AccountsPage.closeModal()" class="flex-1 py-2 border rounded-lg">ยกเลิก</button>
             <button onclick="AccountsPage.deleteAccount('${id}')" class="flex-1 py-2 bg-red-500 text-white rounded-lg">ลบ</button>
          </div>
        </div>
      `;
  },

  async deleteAccount(id) { await DB.deleteAccount(id); this.closeModal(); await this.refresh(); },

  setSort(val) { if (this.sortBy === val) return this.toggleOrder(); this.sortBy = val; this.refresh(); },
  toggleOrder() { this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'; this.refresh(); },
  toggleHidden() { this.showHidden = !this.showHidden; this.refresh(); },
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
    return userColor || (type === 'cash' ? '#6366f1' : '#64748b');
  },

  async refresh() {
    const container = document.getElementById('page-content');
    container.innerHTML = await this.render(this.userId);
    lucide.createIcons();
  }
};
