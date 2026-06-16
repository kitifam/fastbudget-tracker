// ===================================================
// Transactions Component — หัวใจหลักของแอป
// เพิ่ม/แก้ไข/ลบ ธุรกรรม + filter + search + pagination
// ===================================================

window.TransactionsPage = {
    _safeIcon(icon) {
        if (!icon || icon === 'interest') return 'badge-percent';
        return icon;
    },

    transactions: [],
    accounts: [],
    categories: [],
    totalCount: 0,
    userId: null,
    previousPage: null, 
  
    filters: {
        type: null,
        accountId: null,
        accountType: null,
        categoryId: null,
        dateFrom: null,   
        dateTo: null,
        search: null,
        excludeCategories: null,
        page: 1,
        perPage: 50,
        selectedYear: new Date().getFullYear(),
        showSearch: false,
        sortBy: 'date',
        ascending: false
    },

    pendingCheckedStates: {}, // txId -> boolean

    _isFabOpen: false,

    handleQuickAdd(type) {
        this.openModal();
        
        // 1. ดึงค่าจาก Filter มาเป็นค่าเริ่มต้น
        let accountId = this.filters.accountId || (this.accounts && this.accounts.length > 0 ? this.accounts[0].id : '');
        let categoryId = this.filters.categoryId || '';
        let toAccountId = '';

        // 2. จัดการกรณีโอนเงิน
        if (type === 'transfer') {
            // ค้นหาบัญชีที่มีคำว่า "Cash" สำหรับเป็น To Account
            const cashAcc = this.accounts.find(a => a.name.toLowerCase().includes('cash'));
            if (cashAcc) toAccountId = cashAcc.id;
        }

        this._renderFullForm({ 
            type: type, 
            category_id: categoryId, 
            account_id: accountId,
            to_account_id: toAccountId,
            amount: '', 
            note: '', 
            date: new Date().toISOString().split('T')[0] 
        });
        this.toggleQuickAddMenu(false);
    },

    toggleQuickAddMenu(open = null) {
        this._isFabOpen = (open !== null) ? open : !this._isFabOpen;
        const menu = document.getElementById('fab-menu');
        const backdrop = document.getElementById('fab-backdrop');
        const mainBtn = document.getElementById('fab-main-btn');
        const iconContainer = mainBtn?.querySelector('.icon-wrapper');

        if (this._isFabOpen) {
            menu?.classList.remove('hidden');
            backdrop?.classList.remove('hidden');
            mainBtn?.classList.add('bg-blue-500');
            mainBtn?.classList.remove('bg-purple-600');
            if (iconContainer) iconContainer.innerHTML = '<i data-lucide="x" class="w-8 h-8 md:w-9 md:h-9 scale-110"></i>';
        } else {
            menu?.classList.add('hidden');
            backdrop?.classList.add('hidden');
            mainBtn?.classList.remove('bg-blue-500');
            mainBtn?.classList.add('bg-purple-600');
            if (iconContainer) iconContainer.innerHTML = '<i data-lucide="plus" class="w-8 h-8 md:w-9 md:h-9"></i>';
        }
        if (window.lucide) lucide.createIcons();
    },
  
    // ===== RENDER หน้าหลัก =====
  
    async render(userId, fromPage = null) {
      this.userId = userId;
      if (fromPage) this.previousPage = fromPage;
  
      // โหลดข้อมูลพร้อมกัน
      const [accounts, categories] = await Promise.all([
        DB.getAccounts(userId),
        DB.getCategories(userId)
      ]);
      this.accounts = (accounts || []).sort((a, b) => 
        a.name.localeCompare(b.name, 'th', { numeric: true, sensitivity: 'base' })
      );
      this.categories = categories;
  
      await this._loadTransactions();
  
      return `
        <div class="page-transition min-h-screen bg-slate-50 -m-6 p-0 pb-20">
          <style>
            .swipe-container {
              position: relative;
              overflow: hidden;
              touch-action: pan-y;
            }
            .swipe-content {
              position: relative;
              background: white;
              z-index: 2;
              transition: transform 0.2s ease-out;
              will-change: transform;
            }
            .swipe-action {
              position: absolute;
              right: 0;
              top: 0;
              bottom: 0;
              width: 80px;
              background: #f43f5e;
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 1;
              font-weight: bold;
              font-size: 12px;
            }
            .swiped .swipe-content {
              transform: translateX(-80px);
            }
          </style>
          <!-- Main Header -->
          <div class="bg-blue-600 px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-30">
            <div class="flex items-center gap-2">
              ${this.previousPage && this.previousPage !== 'transactions' ? `
                <button onclick="TransactionsPage.goBack()" class="p-2 text-white hover:bg-white/10 rounded-full transition-colors mr-1">
                  <i data-lucide="arrow-left" class="w-5 h-5"></i>
                </button>
              ` : ''}
              <h1 class="text-white font-bold text-lg">Transactions</h1>
            </div>
            <div id="tx-header-actions" class="flex items-center gap-2">
              ${this._renderHeaderActions()}
            </div>
          </div>

          <!-- Filter / Period Info -->
          ${(!this.filters.dateFrom && !this.filters.dateTo) ? `
          <div class="bg-blue-500 py-2 flex items-center justify-between px-6 text-white text-lg font-bold shadow-sm">
            <button onclick="TransactionsPage.changeYear(-1)" class="hover:bg-black/10 p-1 rounded transition-all active:scale-90">
              <i data-lucide="chevron-left" class="w-6 h-6"></i>
            </button>
            <button onclick="TransactionsPage.toggleAllYears()" 
                    class="px-4 py-1.5 hover:bg-black/10 rounded-xl transition-all active:scale-95 flex items-center gap-2">
              <span>${this.filters.selectedYear === 'all' ? 'ทุกปี (ทั้งหมด)' : this.filters.selectedYear}</span>
              <i data-lucide="layers" class="w-4 h-4 opacity-70"></i>
            </button>
            <button onclick="TransactionsPage.changeYear(1)" class="hover:bg-black/10 p-1 rounded transition-all active:scale-90">
              <i data-lucide="chevron-right" class="w-6 h-6"></i>
            </button>
          </div>
          ` : `
          <div class="bg-blue-500 py-3 px-6 text-white text-sm font-medium flex items-center justify-between">
             <div class="flex items-center gap-2">
                <i data-lucide="calendar" class="w-4 h-4"></i>
                <span>${this.filters.dateFrom} - ${this.filters.dateTo}</span>
             </div>
             <button onclick="TransactionsPage.clearDateFilter()" class="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30">Reset</button>
          </div>
          `}

          <div id="tx-search-container" class="${this.filters.showSearch ? '' : 'hidden'} animate-fade-in">
            ${this._renderFilters()}
          </div>

          <div id="tx-summary-header"></div>

          <div id="tx-list-container" class="mt-1">
            ${this._renderList()}
          </div>

          <!-- FAB removed (read-only mode) -->
          <div class="hidden">
            <div id="fab-menu" class="hidden">
                <button onclick="TransactionsPage.handleQuickAdd('transfer')" class="hidden">
                  <span></span>
                  <div class="w-14 h-14 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg group-hover:bg-blue-600 group-hover:shadow-blue-200 transition-all duration-200">
                    <i data-lucide="arrow-right-left" class="w-7 h-7"></i>
                  </div>
                </button>
                
                <!-- 2. Income -->
                <button onclick="TransactionsPage.handleQuickAdd('income')"
                  class="group flex items-center gap-3 transition-all active:scale-95 outline-none">
                  <span class="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl text-sm font-bold text-slate-600 shadow-lg border border-slate-100 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-200">
                    Income
                  </span>
                  <div class="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg group-hover:bg-emerald-600 group-hover:shadow-emerald-200 transition-all duration-200">
                    <i data-lucide="plus" class="w-8 h-8"></i>
                  </div>
                </button>

                <!-- 3. Expense -->
                <button onclick="TransactionsPage.handleQuickAdd('expense')"
                  class="group flex items-center gap-3 transition-all active:scale-95 outline-none">
                  <span class="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl text-sm font-bold text-slate-600 shadow-lg border border-slate-100 group-hover:bg-rose-500 group-hover:text-white transition-all duration-200">
                    Expense
                  </span>
                  <div class="w-14 h-14 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg group-hover:bg-rose-600 group-hover:shadow-rose-200 transition-all duration-200">
                    <i data-lucide="minus" class="w-8 h-8"></i>
                  </div>
                </button>
            </div>

            <!-- Main Toggle Button -->
            <button id="fab-main-btn" onclick="TransactionsPage.toggleQuickAddMenu()"
              class="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center bg-purple-600 text-white shadow-2xl transition-all duration-300 active:scale-90">
              <span class="icon-wrapper flex items-center justify-center">
                <i data-lucide="plus" class="w-8 h-8 md:w-9 md:h-9"></i>
              </span>
            </button>

            <!-- Backdrop overlay -->
            <div id="fab-backdrop" class="hidden fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[-1] transition-opacity"
              onclick="TransactionsPage.toggleQuickAddMenu(false)"></div>
          </div>
        </div>
      `;
    },
  
    _renderFilters() {
      return `
        <div class="bg-white border-b border-slate-200 p-3 shadow-sm flex flex-col gap-3">
          <!-- Search & Clear Row -->
          <div class="flex items-center gap-3">
              <div class="relative flex-1">
                  <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                  <input type="text" id="tx-search" placeholder="ค้นหาบันทึก..."
                      value="${this.filters.search || ''}"
                      oninput="TransactionsPage.debounceSearch(this.value)"
                      class="w-full pl-9 pr-3 py-2 border border-slate-100 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all">
              </div>
              <button onclick="TransactionsPage.clearFilters()" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Reset Filters">
                  <i data-lucide="rotate-ccw" class="w-5 h-5"></i>
              </button>
          </div>

          <!-- Main Filter Grid -->
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <!-- Type Select -->
              <div class="relative group">
                  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-500">
                      <i data-lucide="filter" class="w-3.5 h-3.5"></i>
                  </div>
                  <select id="tx-filter-type" onchange="TransactionsPage.applyFilters()"
                      class="w-full pl-8 pr-2 py-2 border border-slate-100 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500/20 appearance-none cursor-pointer">
                      <option value="">ทุกประเภท</option>
                      <option value="income"  ${this.filters.type === 'income' ? 'selected' : ''}>รายรับ</option>
                      <option value="expense" ${this.filters.type === 'expense' ? 'selected' : ''}>รายจ่าย</option>
                      <option value="transfer" ${this.filters.type === 'transfer' ? 'selected' : ''}>โอนเงิน</option>
                  </select>
              </div>

              <!-- Account Type -->
              <div class="relative group">
                  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-500">
                      <i data-lucide="layers" class="w-3.5 h-3.5"></i>
                  </div>
                  <select id="tx-filter-account-type" onchange="TransactionsPage.applyFilters()"
                      class="w-full pl-8 pr-2 py-2 border border-slate-100 rounded-lg text-xs bg-slate-50 focus:outline-none appearance-none cursor-pointer">
                      <option value="">กลุ่มบัญชี</option>
                      <option value="bank" ${this.filters.accountType === 'bank' ? 'selected' : ''}>เงินสด/ธนาคาร</option>
                      <option value="investment" ${this.filters.accountType === 'investment' ? 'selected' : ''}>การลงทุน</option>
                      <option value="credit_card" ${this.filters.accountType === 'credit_card' ? 'selected' : ''}>บัตรเครดิต</option>
                  </select>
              </div>

              <!-- Individual Account -->
              <div class="relative group">
                  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-500">
                      <i data-lucide="landmark" class="w-3.5 h-3.5"></i>
                  </div>
                  <select id="tx-filter-account" onchange="TransactionsPage.applyFilters()"
                      class="w-full pl-8 pr-2 py-2 border border-slate-100 rounded-lg text-xs bg-slate-50 focus:outline-none appearance-none cursor-pointer">
                      <option value="">รายบัญชี</option>
                      ${this.accounts.map(a => `<option value="${a.id}" ${this.filters.accountId === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                  </select>
              </div>

              <!-- Sorting -->
              <div class="relative group">
                  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-500">
                      <i data-lucide="arrow-down-up" class="w-3.5 h-3.5"></i>
                  </div>
                  <select id="tx-sort-by" onchange="TransactionsPage.applyFilters()"
                      class="w-full pl-8 pr-2 py-2 border border-slate-100 rounded-lg text-xs bg-slate-50 focus:outline-none appearance-none cursor-pointer">
                      <option value="date" ${this.filters.sortBy === 'date' ? 'selected' : ''}>เรียง: วันที่</option>
                      <option value="amount" ${this.filters.sortBy === 'amount' ? 'selected' : ''}>เรียง: จำนวน</option>
                      <option value="note" ${this.filters.sortBy === 'note' ? 'selected' : ''}>เรียง: บันทึก</option>
                      <option value="category_name" ${this.filters.sortBy === 'category_name' ? 'selected' : ''}>เรียง: หมวดหมู่</option>
                      <option value="account_name" ${this.filters.sortBy === 'account_name' ? 'selected' : ''}>เรียง: บัญชี</option>
                  </select>
              </div>

              <!-- Date Range -->
              <div class="col-span-2 flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2 shadow-inner">
                  <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
                  <input type="date" id="tx-filter-from" value="${this.filters.dateFrom || ''}" onchange="TransactionsPage.applyFilters()"
                         class="bg-transparent text-[10px] py-2 focus:outline-none w-full font-bold text-slate-600">
                  <span class="text-slate-300">-</span>
                  <input type="date" id="tx-filter-to" value="${this.filters.dateTo || ''}" onchange="TransactionsPage.applyFilters()"
                         class="bg-transparent text-[10px] py-2 focus:outline-none w-full font-bold text-slate-600">
              </div>
          </div>

          <!-- Bottom Bar: Status & Batch Actions -->
          <div class="flex items-center justify-between gap-3 pt-1">
              <div class="flex items-center gap-3">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                      FOUND ${this.totalCount}
                  </span>
                  <button onclick="TransactionsPage.exportToCSV()" class="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100 hover:bg-emerald-100 transition-all">
                      <i data-lucide="download" class="w-3.5 h-3.5"></i> EXPORT CSV
                  </button>
                  <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      <button onclick="TransactionsPage.toggleSortOrder(false)" 
                              class="p-1.5 rounded-md transition-all ${!this.filters.ascending ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}" title="Descending">
                          <i data-lucide="sort-desc" class="w-3.5 h-3.5"></i>
                      </button>
                      <button onclick="TransactionsPage.toggleSortOrder(true)" 
                              class="p-1.5 rounded-md transition-all ${this.filters.ascending ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}" title="Ascending">
                          <i data-lucide="sort-asc" class="w-3.5 h-3.5"></i>
                      </button>
                  </div>
              </div>

              <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1">
                      <button onclick="TransactionsPage.batchCheck(true)" class="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all" title="Check All Items">
                          <i data-lucide="check-square" class="w-4 h-4"></i>
                      </button>
                      <button onclick="TransactionsPage.batchCheck(false)" class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="Uncheck All Items">
                          <i data-lucide="square" class="w-4 h-4"></i>
                      </button>
                  </div>
              </div>
          </div>
        </div>
      `;
    },

    goBack() {
        const page = this.previousPage || 'dashboard';
        this.previousPage = null;
        navigate(page);
    },

    clearDateFilter() {
        this.filters.dateFrom = null;
        this.filters.dateTo = null;
        this.refresh();
    },

    toggleSortOrder(asc) {
        this.filters.ascending = asc;
        this.refresh();
    },

    clearFilters() {
        this.filters.type = null;
        this.filters.accountId = null;
        this.filters.accountType = null;
        this.filters.categoryId = null;
        this.filters.dateFrom = null;
        this.filters.dateTo = null;
        this.filters.search = null;
        this.filters.excludeCategories = null;
        this.filters.page = 1;
        this.filters.sortBy = 'date';
        this.filters.ascending = false;
        this.pendingCheckedStates = {};
        this.refresh();
    },

    resetContextFilters(overrides = {}) {
        this.filters = {
            ...this.filters,
            type: null,
            accountId: null,
            accountType: null,
            categoryId: null,
            dateFrom: null,
            dateTo: null,
            search: null,
            excludeCategories: null,
            page: 1,
            showSearch: false,
            ...overrides
        };
        this.pendingCheckedStates = {};
    },

    applyFilters() {
        this.filters.type = document.getElementById('tx-filter-type')?.value || null;
        this.filters.accountId = document.getElementById('tx-filter-account')?.value || null;
        this.filters.accountType = document.getElementById('tx-filter-account-type')?.value || null;
        this.filters.dateFrom = document.getElementById('tx-filter-from')?.value || null;
        this.filters.dateTo = document.getElementById('tx-filter-to')?.value || null;
        this.filters.sortBy = document.getElementById('tx-sort-by')?.value || 'date';
        // Note: ascending is now handled via toggleSortOrder buttons
        this.filters.page = 1;
        this.refresh();
    },

    debounceSearch(val) {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
            this.filters.search = val;
            this.filters.page = 1;
            this.refresh();
        }, 400);
    },

    toggleSearch() {
        this.filters.showSearch = !this.filters.showSearch;
        this.refresh();
    },

    toggleAllYears() {
        if (this.filters.selectedYear === 'all') {
            this.filters.selectedYear = new Date().getFullYear();
        } else {
            this.filters.selectedYear = 'all';
        }
        this.filters.page = 1;
        this.refresh();
    },

    changeYear(offset) {
        if (this.filters.selectedYear === 'all') {
            this.filters.selectedYear = new Date().getFullYear();
        } else {
            this.filters.selectedYear += offset;
        }
        this.filters.page = 1;
        this.refresh();
    },

    async _loadTransactions() {
        const isAllYears = this.filters.selectedYear === 'all';
        const queryDateFrom = this.filters.dateFrom || (isAllYears ? null : `${this.filters.selectedYear}-01-01`);
        const queryDateTo = this.filters.dateTo || (isAllYears ? null : `${this.filters.selectedYear}-12-31`);

        // Balance today = sum of current account balances (bank accounts only)
        const allAccounts = await DB.getAccounts(this.userId);
        const balanceToday = allAccounts
            .filter(a => !['credit_card', 'mutual_fund', 'stock', 'investment'].includes(a.type))
            .reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);

        const { data, count } = await DB.getTransactions(this.userId, {
            limit: 1000,
            offset: 0,
            type: this.filters.type,
            accountId: this.filters.accountId,
            excludeCategories: this.filters.excludeCategories,
            accountType: this.filters.accountType,
            categoryId: this.filters.categoryId,
            dateFrom: queryDateFrom,
            dateTo: queryDateTo,
            search: this.filters.search,
            sortBy: this.filters.sortBy,
            ascending: this.filters.ascending
        });

        // Transactions after queryDateTo for running balance calculation
        const futureTxsData = queryDateTo ? DB.getRawTransactionsSince(queryDateTo) : [];
        
        let currentRunBalance = balanceToday - futureTxsData.reduce((sum, t) => {
            const amt = parseFloat(t.amount || 0);
            return sum + (t.type === 'income' ? amt : -amt);
        }, 0);

        this.transactions = (data || []).map(tx => {
            tx.original_is_checked = tx.is_checked; // เก็บสถานะจริงจาก DB
            if (this.pendingCheckedStates[tx.id] !== undefined) {
                tx.is_checked = this.pendingCheckedStates[tx.id];
            }
            tx.is_pending = this.pendingCheckedStates[tx.id] !== undefined; // บอกว่ามีการแก้ไขแต่ยังไม่เซฟหรือไม่

            const isSortedByDefault = this.filters.sortBy === 'date' && !this.filters.ascending;
            if (isSortedByDefault) {
                tx.running_balance = currentRunBalance;
                const amt = parseFloat(tx.amount || 0);
                currentRunBalance -= (tx.type === 'income' ? amt : -amt);
            } else {
                tx.running_balance = null;
            }
            return tx;
        });
        this.totalCount = count || 0;

        setTimeout(() => {
            const summaryHeader = document.getElementById('tx-summary-header');
            if (summaryHeader) {
                summaryHeader.innerHTML = `
                    <div class="bg-white px-5 py-3 border-b border-slate-200 flex justify-center text-xs text-slate-500 font-bold">
                        <span>BALANCE TODAY: <span class="text-emerald-600 ml-1">฿${Math.round(balanceToday).toLocaleString()}</span></span>
                    </div>
                `;
            }
            if (window.lucide) lucide.createIcons();
        }, 0);
    },

    _renderList() {
        if (this.transactions.length === 0) {
            return `<div class="p-12 text-center text-slate-400 text-sm">ไม่พบรายการที่ตรงตามเงื่อนไข</div>`;
        }

        const isSortedByDate = this.filters.sortBy === 'date';

        if (!isSortedByDate) {
            // Flat list for non-date sorting
            return `
                <div class="mb-4">
                    <div class="px-5 py-2 bg-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                       <span>SORTED BY ${this.filters.sortBy.toUpperCase()}</span>
                       <span>${this.transactions.length} ITEMS</span>
                    </div>
                    <div class="bg-white divide-y divide-slate-50">
                        ${this.transactions.map(tx => this._renderTransactionRow(tx)).join('')}
                    </div>
                </div>
            `;
        }

        // Grouped by month for date sorting
        const groupedByMonth = {};
        this.transactions.forEach(tx => {
            const monthKey = tx.date.substring(0, 7);
            if (!groupedByMonth[monthKey]) groupedByMonth[monthKey] = [];
            groupedByMonth[monthKey].push(tx);
        });

        const sortedMonths = Object.entries(groupedByMonth).sort((a,b) => {
            return this.filters.ascending ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
        });

        return sortedMonths.map(([monthKey, txs]) => {
            const dateObj = new Date(monthKey + '-01');
            const monthLabel = dateObj.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
            return `
                <div class="mb-4">
                    <div class="px-5 py-2 bg-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                       <span>${monthLabel}</span>
                       <span>${txs.length} ITEMS</span>
                    </div>
                    <div class="bg-white divide-y divide-slate-50">
                        ${txs.map(tx => this._renderTransactionRow(tx)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    },

    _renderTransactionRow(tx) {
        let color = tx.categories?.color || '#cbd5e1';
        let icon = this._safeIcon(tx.categories?.icon || 'help-circle');
        const isInc = tx.type === 'income';

        // ตรวจสอบว่าเป็นรายการโอนเงินหรือไม่
        const isTransfer = !tx.category_id && (tx.note?.includes('โอน') || tx.note?.includes('จ่ายบิล') || tx.note?.includes('รับชำระ'));
        if (isTransfer) {
            icon = 'arrow-right-left';
            color = '#3b82f6'; // blue-500
        }

        // กำหนดชื่อรายการที่จะแสดง
        let displayTitle = tx.note || '';
        
        // ถ้ามีข้อมูล From/To ให้แสดงนำหน้า หรือถ้าไม่มี Note ให้ใช้ From/To เป็นหลัก
        if (tx.from_or_to) {
            displayTitle = tx.note 
                ? `${tx.from_or_to} • <span class="text-slate-400 font-normal">${tx.note}</span>`
                : tx.from_or_to;
        }
        
        // ถ้าทุกอย่างว่าง ให้พยายามหาข้อมูลอื่น
        if (!displayTitle || displayTitle === '-') {
            if (isTransfer) {
                displayTitle = 'รายการโอนเงิน';
            } else {
                displayTitle = tx.categories?.name || 'ไม่มีระบุ';
            }
        }

        return `
            <div class="swipe-container border-b border-slate-50" data-tx-id="${tx.id}">
                <div class="swipe-action" onclick="TransactionsPage.deleteTransaction('${tx.id}')">
                    <div class="flex flex-col items-center gap-1">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                        <span>ลบ</span>
                    </div>
                </div>
                <div class="swipe-content" 
                     onclick="TransactionsPage.handleRowClick(event, '${tx.id}')"
                     ontouchstart="TransactionsPage.handleSwipeStart(event)"
                     ontouchmove="TransactionsPage.handleSwipeMove(event)"
                     ontouchend="TransactionsPage.handleSwipeEnd(event)"
                     onmousedown="TransactionsPage.handleMouseDown(event)"
                     onmousemove="TransactionsPage.handleMouseMove(event)"
                     onmouseup="TransactionsPage.handleMouseUp(event)"
                     onmouseleave="TransactionsPage.handleMouseUp(event)">
                    <div class="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors group">
                        <!-- Checkbox status -->
                        <div onclick="event.stopPropagation(); TransactionsPage.toggleCheck('${tx.id}')" 
                             class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 
                             ${tx.is_checked 
                                ? (tx.is_pending ? 'bg-amber-500 border-amber-500 text-white' : 'bg-emerald-400 border-emerald-400 text-white') 
                                : 'border-slate-200 bg-white group-hover:border-slate-300'}">
                            ${tx.is_checked ? '<i data-lucide="check" class="w-4 h-4 stroke-[3]"></i>' : ''}
                        </div>
                        
                        <div class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style="background-color: ${color}15; color: ${color}">
                            <i data-lucide="${icon}" class="w-5 h-5"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-2 mb-0.5">
                                <p class="text-sm font-bold text-slate-700 truncate">${displayTitle}</p>
                                <span class="text-sm font-bold ${isInc ? 'text-emerald-500' : 'text-rose-500'} font-number">
                                    ${isInc ? '+' : '-'}${Math.round(tx.amount).toLocaleString()}
                                </span>
                            </div>
                            <div class="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                                <span class="truncate">${tx.accounts?.name || 'Unknown'} • ${isTransfer ? 'โอนเงิน/จ่ายบิล' : (tx.categories?.name || 'Category')}</span>
                                <span class="shrink-0 ml-2">${new Date(tx.date).toLocaleDateString('th-TH', {day:'2-digit', month:'2-digit'})}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // ===== BATCH ACTIONS & CHECK LOGIC =====

    toggleCheck(txId) {
        const tx = this.transactions.find(t => t.id === txId);
        if (!tx) return;

        tx.is_checked = !tx.is_checked;
        this.pendingCheckedStates[txId] = tx.is_checked;
        tx.is_pending = true;

        this.updateHeaderActions();
        this.refreshListOnly();
    },

    batchCheck(checked) {
        this.transactions.forEach(tx => {
            tx.is_checked = checked;
            tx.is_pending = true;
            this.pendingCheckedStates[tx.id] = checked;
        });
        this.updateHeaderActions();
        this.refreshListOnly();
    },

    async saveBulkChanges() {
        const ids = Object.keys(this.pendingCheckedStates);
        if (ids.length === 0) return;

        const updates = ids.map(id => ({
            id: id,
            user_id: this.userId,
            is_checked: this.pendingCheckedStates[id]
        }));

        Toast.show(`Saving ${updates.length} items...`, 'info');
        
        const { error } = await DB.bulkUpdateTransactions(updates);
        
        if (error) {
            Toast.show('Error saving changes', 'error');
        } else {
            Toast.show('Successfully saved', 'success');
            this.pendingCheckedStates = {};
            this.refresh();
        }
    },

    refreshListOnly() {
        const container = document.getElementById('tx-list-container');
        if (container) {
            container.innerHTML = this._renderList();
            if (window.lucide) lucide.createIcons();
        }
        // Also update search container for the Save button
        const searchContainer = document.getElementById('tx-search-container');
        if (searchContainer) {
            searchContainer.innerHTML = this._renderFilters();
            if (window.lucide) lucide.createIcons();
        }
    },

    // ===== MODAL LOGIC =====

    async openModal(txId = null) {
        if (!this.userId) {
            const session = await Auth.getSession();
            this.userId = session?.user?.id;
        }
        const modal = document.getElementById('tx-modal');
        if (!modal) return;

        // ถ้าเป็นการแก้ไข หรือเป็นรายการโอนเดิม ให้เปิดฟอร์มเต็มเลย
        if (txId) {
            const tx = this.transactions.find(t => t.id === txId);
            this._renderFullForm(tx);
            return;
        }

        // ถ้าเป็นการเพิ่มใหม่ เริ่มที่ Step 1: เลือกประเภท
        this._renderStepType();
    },

    _renderStepType() {
        const modal = document.getElementById('tx-modal');
        const templates = JSON.parse(localStorage.getItem('TX_TEMPLATES') || '[]');

        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm modal-backdrop" onclick="TransactionsPage.closeModal()"></div>
            <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] shadow-2xl p-8 animate-fade-in-up max-h-[90vh] overflow-y-auto">
                <div class="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
                
                <!-- Quick Templates Section -->
                ${templates.length > 0 ? `
                <div class="mb-8">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">ธุรกรรมด่วน (Templates)</h3>
                    <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                        ${templates.map(t => {
                            const cat = this.categories.find(c => c.id === t.categoryId);
                            const color = cat?.color || '#94a3b8';
                            return `
                                <button onclick="TransactionsPage.applyTemplate('${t.id}')"
                                    class="flex-none w-20 flex flex-col items-center gap-2 group">
                                    <div class="w-14 h-14 rounded-2xl flex items-center justify-center transition-all group-active:scale-95 shadow-sm"
                                         style="background-color: ${color}15; color: ${color}">
                                        <i data-lucide="${this._safeIcon(cat?.icon || 'layout-template')}" class="w-6 h-6"></i>
                                    </div>
                                    <span class="text-[10px] font-bold text-slate-500 text-center truncate w-full">${t.name}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}

                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">ประเภทรายการ</h3>
                <div class="grid grid-cols-3 gap-4 mb-4">
                    <button onclick="TransactionsPage._renderStepCategory('income')" class="flex flex-col items-center gap-3 p-4 rounded-2xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all">
                        <div class="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                            <i data-lucide="trending-up" class="w-6 h-6"></i>
                        </div>
                        <span class="font-bold text-sm">Income</span>
                    </button>
                    <button onclick="TransactionsPage._renderStepCategory('expense')" class="flex flex-col items-center gap-3 p-4 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all">
                        <div class="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center">
                            <i data-lucide="trending-down" class="w-6 h-6"></i>
                        </div>
                        <span class="font-bold text-sm">Expense</span>
                    </button>
                    <button onclick="TransactionsPage._renderFullForm({ type: 'transfer', category_id: '', account_id: '', amount: '', note: '', date: new Date().toISOString().split('T')[0] })" 
                            class="flex flex-col items-center gap-3 p-4 rounded-2xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all">
                        <div class="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center">
                            <i data-lucide="refresh-cw" class="w-6 h-6"></i>
                        </div>
                        <span class="font-bold text-sm">Transfer</span>
                    </button>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        lucide.createIcons();
    },

    applyTemplate(templateId) {
        const templates = JSON.parse(localStorage.getItem('TX_TEMPLATES') || '[]');
        const t = templates.find(tpl => tpl.id === templateId);
        if (!t) return;

        this._renderFullForm({
            type: t.type,
            category_id: t.categoryId,
            account_id: t.accountId || (this.accounts[0]?.id),
            amount: t.amount,
            note: t.note,
            date: new Date().toISOString().split('T')[0]
        });
    },

    _renderStepCategory(type, search = '') {
        const modal = document.getElementById('tx-modal');
        const showDefault = localStorage.getItem('TX_SHOW_DEFAULT_CATS') !== 'false';
        
        let filteredCats = this.categories.filter(c => c.type === type);
        if (!showDefault) {
            filteredCats = filteredCats.filter(c => !c.is_default);
        }
        
        if (search) {
            filteredCats = filteredCats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
        }

        const tree = DB.buildCategoryTree(filteredCats);
        const typeLabel = type === 'income' ? 'รายรับ' : 'รายจ่าย';

        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm modal-backdrop" onclick="TransactionsPage.closeModal()"></div>
            <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] shadow-2xl p-6 max-h-[85vh] overflow-y-auto animate-fade-in-up">
                <div class="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
                
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <button onclick="TransactionsPage._renderStepType()" class="p-2 hover:bg-slate-100 rounded-full"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                        <h3 class="text-xl font-bold text-slate-800">${typeLabel}</h3>
                    </div>
                    
                    <!-- Toggle Default Cats -->
                    <label class="flex items-center gap-2 cursor-pointer group">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Default</span>
                        <div class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" ${showDefault ? 'checked' : ''} 
                                   class="sr-only peer" onchange="TransactionsPage.toggleDefaultCategoriesInModal('${type}')">
                            <div class="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-500"></div>
                        </div>
                    </label>
                </div>

                <!-- Category Search -->
                <div class="relative mb-6">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                    <input type="text" id="cat-search" placeholder="ค้นหาหมวดหมู่..."
                           value="${search}"
                           oninput="TransactionsPage._renderStepCategory('${type}', this.value)"
                           class="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                </div>

                <div class="grid grid-cols-4 gap-2">
                    ${tree.map(root => `
                        <button onclick="${root.children && root.children.length > 0
                            ? `TransactionsPage._renderStepSubCategory('${type}', '${root.id}')`
                            : `TransactionsPage._renderStepAccount('${type}', '${root.id}')`}"
                            class="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-slate-50 transition-all relative">
                            <div class="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform active:scale-90" 
                                 style="background-color: ${root.color}15; color: ${root.color}">
                                <i data-lucide="${this._safeIcon(root.icon)}" class="w-6 h-6"></i>
                            </div>
                            <span class="text-[10px] font-bold text-slate-500 text-center truncate w-full">${root.name}</span>
                            ${root.children && root.children.length > 0
                                ? `<span class="absolute top-1 right-2 w-2 h-2 bg-blue-500 rounded-full border border-white"></span>`
                                : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
        if (search) document.getElementById('cat-search').focus();
    },

    toggleDefaultCategoriesInModal(type) {
        const current = localStorage.getItem('TX_SHOW_DEFAULT_CATS') !== 'false';
        localStorage.setItem('TX_SHOW_DEFAULT_CATS', (!current).toString());
        this._renderStepCategory(type);
    },

    _renderStepSubCategory(type, parentId) {
        const modal = document.getElementById('tx-modal');
        const allCats = this.categories.filter(c => c.type === type);
        const parent = allCats.find(c => c.id === parentId);
        const subs = allCats
            .filter(c => c.parent_id === parentId)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm modal-backdrop" onclick="TransactionsPage.closeModal()"></div>
            <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] shadow-2xl p-8 max-h-[80vh] overflow-y-auto animate-fade-in-up">
                <div class="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
                <div class="flex items-center gap-2 mb-5">
                    <button onclick="TransactionsPage._renderStepCategory('${type}')" class="p-2 hover:bg-slate-100 rounded-full">
                        <i data-lucide="arrow-left" class="w-5 h-5"></i>
                    </button>
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                             style="background-color: ${parent?.color}20; color: ${parent?.color}">
                            <i data-lucide="${this._safeIcon(parent?.icon)}" class="w-4 h-4"></i>
                        </div>
                        <h3 class="text-xl font-bold text-slate-800">${parent?.name || 'หมวดย่อย'}</h3>
                    </div>
                </div>
                <!-- เลือก parent เอง (ไม่แยกหมวดย่อย) -->
                <button onclick="TransactionsPage._renderStepAccount('${type}', '${parentId}')"
                    class="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-sm text-slate-500">
                    <i data-lucide="tag" class="w-4 h-4 shrink-0"></i>
                    <span>ใช้ทั้งหมวด <b>${parent?.name}</b> (ไม่แยกย่อย)</span>
                </button>
                <div class="grid grid-cols-4 gap-3">
                    ${subs.map(sub => `
                        <button onclick="TransactionsPage._renderStepAccount('${type}', '${sub.id}')"
                            class="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-slate-50 transition-all">
                            <div class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background-color: ${sub.color}15; color: ${sub.color}">
                                <i data-lucide="${this._safeIcon(sub.icon)}" class="w-6 h-6"></i>
                            </div>
                            <span class="text-[10px] font-bold text-slate-600 text-center truncate w-full">${sub.name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
    },

    _renderStepAccount(type, categoryId = null) {
        const modal = document.getElementById('tx-modal');
        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm modal-backdrop" onclick="TransactionsPage.closeModal()"></div>
            <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] shadow-2xl p-8 max-h-[80vh] overflow-y-auto animate-fade-in-up">
                <div class="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
                <div class="flex items-center gap-2 mb-6">
                    <button onclick="${type === 'transfer' ? 'TransactionsPage._renderStepType()' : 'TransactionsPage._renderStepCategory(\''+type+'\')'}" class="p-2 hover:bg-slate-100 rounded-full"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                    <h3 class="text-xl font-bold text-slate-800">เลือกบัญชี${type === 'transfer' ? 'ต้นทาง' : ''}</h3>
                </div>
                <div class="space-y-3">
                    ${this.accounts.map(a => `
                        <button onclick="TransactionsPage._renderFullForm({ type: '${type}', category_id: '${categoryId || ''}', account_id: '${a.id}', amount: '', note: '', date: '${new Date().toISOString().split('T')[0]}' })" 
                                class="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-left">
                            <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                <i data-lucide="landmark" class="w-5 h-5 text-slate-500"></i>
                            </div>
                            <div>
                                <p class="font-bold text-slate-700">${a.name}</p>
                                <p class="text-xs text-slate-400">${Format.money(a.balance)}</p>
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        lucide.createIcons();
    },

    _renderFullForm(tx) {
        const modal = document.getElementById('tx-modal');
        this._modalType = tx.type;

        // กำหนดสีและข้อความตามประเภท
        const config = {
            income: { 
                title: 'New income', 
                headerBg: 'bg-[#4caf50]', 
                actionColor: 'text-[#4caf50]', 
                btnBg: 'bg-[#4caf50]',
                pastelBg: 'bg-[#f1f8e9]'
            },
            expense: { 
                title: 'New expense', 
                headerBg: 'bg-[#f44336]', 
                actionColor: 'text-[#f44336]', 
                btnBg: 'bg-[#f44336]',
                pastelBg: 'bg-[#ffebee]'
            },
            transfer: { 
                title: 'Transfer money', 
                headerBg: 'bg-[#2196f3]', 
                actionColor: 'text-[#2196f3]', 
                btnBg: 'bg-[#2196f3]',
                pastelBg: 'bg-[#e3f2fd]'
            }
        };
        const active = config[tx.type] || config.expense;

        // เรียงลำดับบัญชีตามชื่อ (Natural Sort)
        const sortedAccounts = [...this.accounts].sort((a, b) => 
            a.name.localeCompare(b.name, 'th', { numeric: true, sensitivity: 'base' })
        );

        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm modal-backdrop" onclick="TransactionsPage.closeModal()"></div>
            <div class="fixed bottom-0 left-0 right-0 md:top-0 md:bottom-0 md:left-0 md:right-0 md:mx-auto md:w-full md:max-w-xl bg-[#f8f9fa] rounded-t-[2rem] md:rounded-none shadow-2xl overflow-hidden z-10 animate-fade-in-up h-[92vh] md:h-screen flex flex-col">
                
                <!-- HEADER -->
                <div class="${active.headerBg} px-4 py-4 flex items-center justify-between text-white shadow-md shrink-0">
                    <div class="flex items-center gap-4">
                        <button onclick="TransactionsPage.closeModal()" class="p-1 hover:bg-white/20 rounded-full transition-colors">
                            <i data-lucide="arrow-left" class="w-6 h-6"></i>
                        </button>
                        <h3 class="text-xl font-medium">${tx.id ? 'Edit ' + tx.type : active.title}</h3>
                    </div>
                    <div class="flex items-center gap-3">
                        <button class="p-1 hover:bg-white/20 rounded-full transition-colors"><i data-lucide="star" class="w-5 h-5"></i></button>
                        <button class="p-1 hover:bg-white/20 rounded-full transition-colors"><i data-lucide="more-vertical" class="w-5 h-5"></i></button>
                    </div>
                </div>

                <!-- SCROLLABLE CONTENT -->
                <div class="flex-1 overflow-y-auto p-5 space-y-6">
                    <!-- SECTION 1: AMOUNT & CATEGORY -->
                    <div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-5">
                        <div class="flex items-start justify-between gap-4">
                            <div class="relative flex-1">
                                <div class="absolute -top-3 left-3 px-2 bg-white text-[10px] font-bold text-slate-400 uppercase tracking-widest">Value</div>
                                <div class="flex items-center gap-2 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-500 transition-all">
                                    <input type="number" id="m-amount" value="${tx.amount}" placeholder="0.00" autofocus
                                           class="w-full text-2xl font-bold text-slate-800 bg-transparent focus:outline-none font-number">
                                    <span class="text-slate-400 font-bold">฿</span>
                                </div>
                            </div>
                        </div>

                        <!-- Category Selector (Hide if transfer) -->
                        <div id="m-category-container" class="${tx.type === 'transfer' ? 'hidden' : ''}">
                            <div class="flex items-center gap-4 bg-[#f5f5f5] rounded-xl px-4 py-1.5">
                                <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-500 shadow-sm">
                                    <i data-lucide="tag" class="w-5 h-5"></i>
                                </div>
                                <select id="m-category" class="flex-1 bg-transparent border-none py-3 text-sm font-bold text-slate-700 focus:outline-none">
                                    <option value="">Select category</option>
                                    ${(() => {
                                        const baseCats = this.categories.filter(c => 
                                            c.type === tx.type || 
                                            c.id === tx.category_id ||
                                            c.name.toLowerCase().includes('transfer') ||
                                            c.name.includes('โอน')
                                        );
                                        const tree = DB.buildCategoryTree(baseCats);
                                        return tree.map(root => {
                                            if (root.children && root.children.length > 0) {
                                                return `<optgroup label="${root.name}">
                                                    <option value="${root.id}" ${tx.category_id === root.id ? 'selected' : ''}>${root.name}</option>
                                                    ${root.children.map(sub => `<option value="${sub.id}" ${tx.category_id === sub.id ? 'selected' : ''}>  └ ${sub.name}</option>`).join('')}
                                                </optgroup>`;
                                            }
                                            return `<option value="${root.id}" ${tx.category_id === root.id ? 'selected' : ''}>${root.name}</option>`;
                                        }).join('');
                                    })()}
                                </select>
                            </div>
                            <div class="mt-2 pl-16 text-xs text-slate-400 font-medium">
                                Total: <span class="font-bold text-slate-600">0.00 ฿</span>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 2: ACCOUNT & DATE -->
                    <div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-5">
                        <!-- Account Selector -->
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center text-slate-400">
                                <i data-lucide="${tx.type === 'transfer' ? 'arrow-down-circle' : 'landmark'}" class="w-6 h-6"></i>
                            </div>
                            <div class="flex-1 bg-[#f5f5f5] rounded-xl px-4 py-0.5">
                                <div class="text-[10px] font-bold text-slate-400 mt-1 uppercase">${tx.type === 'transfer' ? 'From:' : 'Account:'}</div>
                                <select id="m-account" onchange="TransactionsPage.updateToAccountOptions()"
                                        class="w-full bg-transparent border-none py-1.5 text-sm font-bold text-slate-700 focus:outline-none">
                                    <option value="" data-balance="0">Select account</option>
                                    ${sortedAccounts.map(a => `<option value="${a.id}" data-balance="${a.balance}" ${tx.account_id === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div id="m-account-bal-container" class="pl-14 -mt-3 text-xs font-bold text-emerald-500">
                             <span id="m-account-bal-label"></span>
                        </div>

                        <!-- Transfer To (Show if transfer) -->
                        <div id="m-transfer-container" class="${tx.type === 'transfer' ? '' : 'hidden'} space-y-5">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 flex items-center justify-center text-slate-400">
                                    <i data-lucide="arrow-up-circle" class="w-6 h-6"></i>
                                </div>
                                <div class="flex-1 bg-[#f5f5f5] rounded-xl px-4 py-0.5">
                                    <div class="text-[10px] font-bold text-slate-400 mt-1 uppercase">To:</div>
                                    <select id="m-account-to" onchange="TransactionsPage.updateToAccountOptions()"
                                            class="w-full bg-transparent border-none py-1.5 text-sm font-bold text-slate-700 focus:outline-none">
                                        <option value="" data-balance="0">Select destination</option>
                                        ${sortedAccounts.map(a => `<option value="${a.id}" data-balance="${a.balance}" ${tx.to_account_id === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="pl-14 -mt-3 text-xs font-bold text-rose-500">
                                <span id="m-account-to-bal-label"></span>
                            </div>
                        </div>

                        <!-- Date Selector -->
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center text-slate-400">
                                <i data-lucide="calendar" class="w-6 h-6"></i>
                            </div>
                            <div class="flex-1 flex items-center gap-3">
                                <span class="text-sm font-medium text-slate-500 w-12">Date:</span>
                                <div class="bg-[#f5f5f5] rounded-xl px-4 py-3 flex-1">
                                    <input type="date" id="m-date" value="${tx.date}" 
                                           class="w-full bg-transparent border-none text-sm font-bold text-slate-700 focus:outline-none">
                                </div>
                            </div>
                        </div>

                        <!-- From/To Optional (Hide if transfer) -->
                        <div id="m-from-to-container" class="${tx.type === 'transfer' ? 'hidden' : ''} flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center text-slate-400">
                                <i data-lucide="user" class="w-6 h-6"></i>
                            </div>
                            <div class="flex-1 border border-slate-200 rounded-xl px-4 py-3">
                                <input type="text" id="m-from-to" value="${tx.from_or_to || ''}" 
                                       placeholder="${tx.type === 'income' ? 'From (Optional)' : 'To (Optional)'}" 
                                       class="w-full bg-transparent border-none text-sm font-medium text-slate-700 focus:outline-none">
                            </div>
                        </div>

                        <!-- Note Selector -->
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center text-slate-400">
                                <i data-lucide="edit-3" class="w-6 h-6"></i>
                            </div>
                            <div class="flex-1 border border-slate-200 rounded-xl px-4 py-3">
                                <input type="text" id="m-note" value="${tx.note}" placeholder="Notes (Optional)" 
                                       class="w-full bg-transparent border-none text-sm font-medium text-slate-700 focus:outline-none">
                            </div>
                        </div>

                        <!-- Checked Switch -->
                        <div class="flex items-center justify-between pl-14">
                            <span class="text-sm font-medium text-slate-500">Checked</span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="m-checked" class="sr-only peer" ${tx.is_checked ? 'checked' : ''}>
                                <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:${active.headerBg.replace('bg-', 'bg')}"></div>
                            </label>
                        </div>
                    </div>

                    <!-- SECTION 3: SCHEDULE -->
                    <div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center justify-between opacity-60">
                        <div class="flex items-center gap-4">
                            <i data-lucide="calendar-clock" class="w-6 h-6 text-slate-400"></i>
                            <span class="text-sm font-medium text-slate-700">Scheduled ${tx.type === 'transfer' ? 'transfer' : 'expense'} <i data-lucide="pickaxe" class="w-3.5 h-3.5 text-amber-500 inline-block ml-1"></i></span>
                        </div>
                        <label class="relative inline-flex items-center cursor-not-allowed">
                            <input type="checkbox" class="sr-only peer" disabled>
                            <div class="w-11 h-6 bg-slate-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                        </label>
                    </div>

                    <!-- ATTACHMENTS -->
                    <div class="grid grid-cols-2 gap-4 pb-4 opacity-50">
                        <button disabled class="flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-not-allowed">
                            <i data-lucide="pickaxe" class="w-4 h-4 text-amber-500"></i>
                            Camera
                        </button>
                        <button disabled class="flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-not-allowed">
                            <i data-lucide="pickaxe" class="w-4 h-4 text-amber-500"></i>
                            Attach
                        </button>
                    </div>
                </div>

                <!-- FOOTER BUTTONS -->
                <div class="p-6 bg-white border-t border-slate-100 grid grid-cols-2 gap-4 shrink-0">
                    <button onclick="TransactionsPage.closeModal()" 
                            class="py-4 border border-slate-300 rounded-full font-bold text-slate-500 hover:bg-slate-50 active:scale-95 transition-all">
                        CANCEL
                    </button>
                    <button onclick="TransactionsPage.saveTransaction('${tx.id || ''}')" 
                            class="py-4 ${active.btnBg} text-white rounded-full font-bold shadow-lg active:scale-95 transition-all uppercase tracking-widest">
                        SAVE
                    </button>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        lucide.createIcons();
        
        // Initial balance update
        this.updateToAccountOptions();
    },

    updateToAccountOptions() {
        const fromSelect = document.getElementById('m-account');
        const toSelect = document.getElementById('m-account-to');
        const fromId = fromSelect.value;
        
        // Update balance labels
        const fromOpt = fromSelect.options[fromSelect.selectedIndex];
        const fromBal = fromOpt ? parseFloat(fromOpt.dataset.balance || 0) : 0;
        const fromBalLabel = document.getElementById('m-account-bal-label');
        if (fromBalLabel) {
            fromBalLabel.textContent = fromId ? `(Balance: ฿${Math.round(fromBal).toLocaleString()})` : '';
            fromBalLabel.className = fromBal < 0 ? 'text-rose-500 ml-1' : 'text-blue-500 ml-1';
        }

        if (!toSelect) return;

        const toOpt = toSelect.options[toSelect.selectedIndex];
        const toBal = toOpt ? parseFloat(toOpt.dataset.balance || 0) : 0;
        const toBalLabel = document.getElementById('m-account-to-bal-label');
        if (toBalLabel) {
            toBalLabel.textContent = toSelect.value ? `(Balance: ฿${Math.round(toBal).toLocaleString()})` : '';
        }

        const options = toSelect.querySelectorAll('option');
        options.forEach(opt => {
            if (!opt.value) return; 
            if (opt.value === fromId) {
                opt.disabled = true;
                opt.classList.add('hidden');
                if (toSelect.value === fromId) toSelect.value = '';
            } else {
                opt.disabled = false;
                opt.classList.remove('hidden');
            }
        });
    },

    setModalType(type) {
        const incBtn = document.getElementById('m-type-income');
        const expBtn = document.getElementById('m-type-expense');
        const transBtn = document.getElementById('m-type-transfer');
        
        const catContainer = document.getElementById('m-category-container');
        const transContainer = document.getElementById('m-transfer-container');
        const normalContainer = document.getElementById('m-normal-account-container');
        const dateContainer = document.getElementById('m-date-container');
        const datePlaceholder = document.getElementById('m-date-transfer-placeholder');
        const accountLabel = document.getElementById('m-account-label');

        this._modalType = type;

        if (incBtn) incBtn.className = 'flex-1 py-3 text-sm font-bold rounded-xl transition-all text-slate-500 hover:bg-white/50';
        if (expBtn) expBtn.className = 'flex-1 py-3 text-sm font-bold rounded-xl transition-all text-slate-500 hover:bg-white/50';
        if (transBtn) transBtn.className = 'flex-1 py-3 text-sm font-bold rounded-xl transition-all text-slate-500 hover:bg-white/50';

        if (catContainer) catContainer.classList.remove('hidden');
        if (transContainer) transContainer.classList.add('hidden');
        if (normalContainer) normalContainer.classList.remove('grid-cols-1');
        if (normalContainer) normalContainer.classList.add('grid-cols-2');
        if (dateContainer) dateContainer.classList.remove('hidden');
        if (accountLabel) accountLabel.innerText = 'ACCOUNT';
        
        // Move date back if needed
        if (dateContainer && normalContainer && dateContainer.parentElement !== normalContainer) {
            normalContainer.prepend(dateContainer);
        }

        if (type === 'income') {
            if (incBtn) incBtn.className = 'flex-1 py-3 text-sm font-bold rounded-xl transition-all bg-emerald-500 text-white shadow-lg';
        } else if (type === 'expense') {
            if (expBtn) expBtn.className = 'flex-1 py-3 text-sm font-bold rounded-xl transition-all bg-rose-500 text-white shadow-lg';
        } else if (type === 'transfer') {
            if (transBtn) transBtn.className = 'flex-1 py-3 text-sm font-bold rounded-xl transition-all bg-blue-500 text-white shadow-lg';
            if (catContainer) catContainer.classList.add('hidden');
            if (transContainer) transContainer.classList.remove('hidden');
            if (normalContainer) {
                normalContainer.classList.remove('grid-cols-2');
                normalContainer.classList.add('grid-cols-1'); // From Account full width
            }
            if (accountLabel) accountLabel.innerText = 'FROM ACCOUNT';
            
            // Move date to under To Account
            if (dateContainer && datePlaceholder) {
                datePlaceholder.appendChild(dateContainer);
            }
        }
    },

    closeModal() {
        const modal = document.getElementById('tx-modal');
        if (modal) modal.classList.add('hidden');
    },

    async saveTransaction(id) {
        const amount = parseFloat(document.getElementById('m-amount').value);
        const accountId = document.getElementById('m-account').value;
        const date = document.getElementById('m-date').value;
        const note = document.getElementById('m-note').value;
        const fromTo = document.getElementById('m-from-to')?.value || '';
        let type = this._modalType || 'expense';

        if (type === 'transfer') {
            const accountToId = document.getElementById('m-account-to').value;
            if (!amount || !accountId || !accountToId) {
                return Toast.show('กรุณากรอกข้อมูลบัญชีต้นทางและปลายทางให้ครบถ้วน', 'error');
            }
            if (accountId === accountToId) {
                return Toast.show('บัญชีต้นทางและปลายทางต้องไม่เป็นบัญชีเดียวกัน', 'error');
            }

            const fromAcc = this.accounts.find(a => a.id === accountId);
            const toAcc = this.accounts.find(a => a.id === accountToId);
            const transferCat = this.categories.find(c => c.name === 'Transfer between accounts');

            Toast.show('กำลังบันทึก...', 'info');

            // 1. หักเงิน (Expense)
            const expenseResult = await DB.createTransaction({
                user_id: this.userId,
                account_id: accountId,
                category_id: transferCat?.id || null,
                amount: amount,
                type: 'expense',
                date: date,
                note: `โอนเงินไป ${toAcc?.name || 'บัญชีปลายทาง'} ${note ? '('+note+')' : ''}`,
                from_or_to: fromAcc?.name
            });

            if (expenseResult.error) return Toast.show('เกิดข้อผิดพลาดในการตัดยอด', 'error');

            // 2. เพิ่มเงิน (Income)
            const incomeResult = await DB.createTransaction({
                user_id: this.userId,
                account_id: accountToId,
                category_id: transferCat?.id || null,
                amount: amount,
                type: 'income',
                date: date,
                note: `รับเงินโอนจาก ${fromAcc?.name || 'บัญชีต้นทาง'} ${note ? '('+note+')' : ''}`,
                from_or_to: toAcc?.name
            });

            if (incomeResult.error) return Toast.show('เกิดข้อผิดพลาดในการเพิ่มยอด', 'error');

            Toast.show('บันทึกรายการโอนเงินสำเร็จ', 'success');
            this.closeModal();
            this.refresh();
            return;
        }

        const categoryId = document.getElementById('m-category').value;
        if (!amount || !accountId || !categoryId) {
            return Toast.show('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
        }

        const txData = { 
            amount, account_id: accountId, category_id: categoryId, 
            note, from_or_to: fromTo, date, type, user_id: this.userId,
            is_checked: document.getElementById('m-checked')?.checked || false
        };

        try {
            let result;
            if (id) {
                const oldTx = this.transactions.find(t => t.id === id);
                result = await DB.updateTransaction(id, oldTx, txData);
            } else {
                result = await DB.createTransaction(txData);
            }

            if (result && result.data) {
                Toast.show(id ? 'อัปเดตรายการสำเร็จ' : 'บันทึกรายการสำเร็จ', 'success');
                this.closeModal();
                this.refresh();
            }
        } catch (err) {
            console.error('Save error details:', err);
            const errorMsg = err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
            Toast.show(errorMsg, 'error');
        }
    },

    deleteTransaction(_id) {
        Toast.show('Read-only mode — ไม่สามารถลบข้อมูลได้', 'warning');
    },

    handleRowClick(e, txId) {
        // ถ้ากำลัง swipe อยู่ ไม่ต้องเปิด modal
        const container = e.currentTarget.closest('.swipe-container');
        if (container.classList.contains('swiped')) {
            container.classList.remove('swiped');
            return;
        }
        this.openModal(txId);
    },

    handleSwipeStart(e) {
        this._touchX = e.touches[0].clientX;
        this._activeSwipeContainer = e.currentTarget.closest('.swipe-container');
    },

    handleSwipeMove(e) {
        if (!this._touchX || !this._activeSwipeContainer) return;
        const currentX = e.touches[0].clientX;
        const diffX = currentX - this._touchX;
        
        // ถ้า swipe ซ้าย (diffX < 0) ให้เตรียมโชว์ปุ่มลบ
        if (diffX < -30) {
            this._activeSwipeContainer.classList.add('swiped');
        } else if (diffX > 30) {
            this._activeSwipeContainer.classList.remove('swiped');
        }
    },

    handleSwipeEnd() {
        this._touchX = null;
        this._activeSwipeContainer = null;
    },

    // PC Mouse Support
    handleMouseDown(e) {
        this._isMouseDown = true;
        this._touchX = e.clientX;
        this._activeSwipeContainer = e.currentTarget.closest('.swipe-container');
    },

    handleMouseMove(e) {
        if (!this._isMouseDown) return;
        const currentX = e.clientX;
        const diffX = currentX - this._touchX;
        if (diffX < -30) {
            this._activeSwipeContainer.classList.add('swiped');
        } else if (diffX > 30) {
            this._activeSwipeContainer.classList.remove('swiped');
        }
    },

    handleMouseUp() {
        this._isMouseDown = false;
        this._touchX = null;
        this._activeSwipeContainer = null;
    },

    async refresh() {
        const container = document.getElementById('page-content');
        if (container) {
            container.innerHTML = await this.render(this.userId);
            if (window.lucide) lucide.createIcons();
        }
    },

    async exportToCSV() {
        try {
            if (this.totalCount === 0) {
                Toast.show('ไม่พบข้อมูลสำหรับการ Export', 'warning');
                return;
            }

            Toast.show('กำลังเตรียมไฟล์ CSV...', 'info');
            
            // 1. Fetch ALL data matching current filters (ignore pagination)
            const exportFilters = {
                ...this.filters,
                limit: 50000, 
                page: 1
            };
            
            const session = await Auth.getSession();
            const { data } = await DB.getTransactions(session.user.id, exportFilters);
            
            if (!data || data.length === 0) {
                Toast.show('ไม่พบข้อมูล', 'warning');
                return;
            }

            // 2. Format CSV Header & Rows
            const headers = ['Date', 'Type', 'Category', 'Account', 'To_Account', 'From/To', 'Note', 'Amount', 'Checked'];
            const rows = data.map(tx => [
                tx.date,
                tx.type,
                tx.categories?.name || '-',
                tx.accounts?.name || '-',
                tx.to_accounts?.name || '-', 
                tx.from_or_to || '-',
                tx.note || '-',
                tx.amount,
                tx.is_checked ? 'Checked' : 'Unchecked'
            ]);

            // 3. Convert to CSV String
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(val => {
                    const str = String(val === null || val === undefined ? '' : val);
                    return `"${str.replace(/"/g, '""')}"`;
                }).join(','))
            ].join('\n');

            // 4. Handle Thai Encoding (UTF-8 BOM)
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // 5. Trigger Download
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('href', url);
            link.setAttribute('download', `transactions_export_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            Toast.show('Export สำเร็จ', 'success');
        } catch (error) {
            console.error('Export Error:', error);
            Toast.show('เกิดข้อผิดพลาดในการ Export', 'error');
        }
    },

    _renderHeaderActions() {
        return `
            <button onclick="TransactionsPage.toggleSearch()"
                class="p-2 text-white hover:bg-white/10 rounded-full transition-colors">
                <i data-lucide="search" class="w-5 h-5"></i>
            </button>
        `;
    },

    updateHeaderActions() {
        const container = document.getElementById('tx-header-actions');
        if (container) {
            container.innerHTML = this._renderHeaderActions();
            if (window.lucide) lucide.createIcons();
        }
    }
};
