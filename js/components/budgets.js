// ===================================================
// Budgets Component — ตั้งงบประมาณ + ติดตาม progress
// ===================================================

const BudgetsPage = {
    _safeIcon(icon) {
      if (!icon || icon === 'interest') return 'badge-percent';
      return icon;
    },

    budgets: [],
    categories: [],
    userId: null,
    activeTab: 'current',       // 'current' | 'recommend' | 'compare'
    recommendPeriod: 'monthly', // 'monthly' | 'yearly'
    recommendations: null,      // null = not fetched, Array = fetched
    compareSelectedIds: [],     // budget IDs selected for compare (max 5)
    compareMode: 'monthly',     // 'monthly' | 'yearly'
    compareYear: null, // Initialize to null, will be set in render
    minAvailableYear: null, // Minimum year with transaction data
    maxAvailableYear: null, // Maximum year with transaction data
    _compareChart: null,
    _compareSourceTxs: [],
    _compareCatToBudgetId: {},
    _compareDrilldown: null,
    _baseDataCache: null,       // { spendTxs, minBudgetStart } — ลดการ fetch ซ้ำเมื่อ switch tab
    _cachedChartYear: null,     // year สำหรับ _cachedChartTxs (monthly mode)
    _cachedChartTxs: [],        // cached expense txs สำหรับ compare chart (monthly mode)
    _cachedYearlyRange: null,   // { minYear, maxYear } — key สำหรับ cached yearly aggregation
    _cachedYearlyRows: [],      // cached RPC rows สำหรับ yearly mode

    // ===== RENDER หน้าหลัก =====

    async _yieldToPaint() {
      await new Promise(requestAnimationFrame);
    },

    async render(userId, options = {}) {
      this.userId = userId;
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

      onProgress?.(10, 'เริ่มดึงข้อมูลงบประมาณ');
      await this._yieldToPaint();

      const [budgets, categories] = await Promise.all([
        DB.getBudgets(userId),
        DB.getCategoriesByType(userId, 'expense')
      ]);
      onProgress?.(26, 'กำลังเตรียมหมวดหมู่และงบ');
      await this._yieldToPaint();

      this.categories = categories;

      const categoryChildren = categories.reduce((map, cat) => {
        if (!cat.parent_id) return map;
        if (!map.has(cat.parent_id)) map.set(cat.parent_id, []);
        map.get(cat.parent_id).push(cat.id);
        return map;
      }, new Map());

      const budgetStartDates = budgets
        .map(b => b.start_date)
        .filter(Boolean)
        .sort();
      const minBudgetStart = budgetStartDates[0] || new Date().toISOString().split('T')[0];

      // ใช้ cached spendTxs ถ้า minBudgetStart เหมือนเดิม (ลด network round-trips เมื่อ switch tab)
      const cacheValid = this._baseDataCache?.minBudgetStart === minBudgetStart;
      // ดึง year range ด้วย RPC (คืนแค่ 1 row) เฉพาะครั้งแรกที่เข้าแท็บเปรียบเทียบ
      const needsYearRange = this.activeTab === 'compare' && this.minAvailableYear === null;

      let spendTxs;
      if (cacheValid) {
        spendTxs = this._baseDataCache.spendTxs;
        if (needsYearRange) {
          const yr = await DB.getTransactionYearRange(userId);
          if (yr) { this.minAvailableYear = yr.min_year; this.maxAvailableYear = yr.max_year; }
        }
      } else {
        const [spendRes, yr] = await Promise.all([
          DB.getTransactions(userId, {
            type: 'expense',
            dateFrom: minBudgetStart,
            limit: 100000,
            sortBy: 'date',
            ascending: true,
          }),
          needsYearRange ? DB.getTransactionYearRange(userId) : Promise.resolve(null),
        ]);
        spendTxs = spendRes.data || [];
        this._baseDataCache = { spendTxs, minBudgetStart };
        if (needsYearRange && yr) { this.minAvailableYear = yr.min_year; this.maxAvailableYear = yr.max_year; }
      }
      onProgress?.(48, 'กำลังคำนวณงบปัจจุบัน');
      await this._yieldToPaint();

      // Fallback: RPC ยังไม่ deploy หรือ error
      if (this.minAvailableYear === null) {
        // Always fetch the true year range if the RPC fails, regardless of the current tab.
        // This prevents using a pre-filtered `spendTxs` which might not reflect the full history.
        const [{ data: oldest }, { data: newest }] = await Promise.all([
          DB.getTransactions(userId, { type: 'expense', limit: 1, sortBy: 'date', ascending: true }),
          DB.getTransactions(userId, { type: 'expense', limit: 1, sortBy: 'date', ascending: false }),
        ]);
        this.minAvailableYear = oldest?.[0] ? new Date(oldest[0].date).getFullYear() : new Date().getFullYear();
        this.maxAvailableYear = newest?.[0] ? new Date(newest[0].date).getFullYear() : new Date().getFullYear();
      }
      this.minAvailableYear ??= new Date().getFullYear();
      this.maxAvailableYear ??= new Date().getFullYear();
      if (this.compareYear === null || this.compareYear > this.maxAvailableYear || this.compareYear < this.minAvailableYear) {
        this.compareYear = this.maxAvailableYear;
      }

      this.budgets = budgets.map((b) => {
        const range = DB._getDateRange(b.period, b.start_date);
        const categoryIds = [b.category_id, ...(categoryChildren.get(b.category_id) || [])];
        const categoryIdSet = new Set(categoryIds);

        const spent = spendTxs.reduce((sum, tx) => {
          if (!categoryIdSet.has(tx.category_id)) return sum;
          if (tx.date < range.from || tx.date > range.to) return sum;
          return sum + parseFloat(tx.amount || 0);
        }, 0);

        const limit = parseFloat(b.amount);
        const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
        return { ...b, spent, percentage };
      });
      onProgress?.(72, 'กำลังเตรียมแท็บและกราฟ');
      await this._yieldToPaint();

      // โหลด recommendations ถ้าอยู่แท็บแนะนำและยังไม่มีข้อมูล
      if (this.activeTab === 'recommend' && this.recommendations === null) {
        onProgress?.(82, 'กำลังวิเคราะห์ข้อมูลแนะนำงบ');
        await this._yieldToPaint();
        this.recommendations = await this._fetchRecommendations(userId, this.recommendPeriod);
        // 1. ตัดรายการ Transfer- ออก (ไม่ต้องแนะนำรายการนี้)
        const transferKeywords = ['transfer-', 'โอน-'];
        this.recommendations = this.recommendations.filter(rec => {
            const categoryName = rec.categories?.name?.toLowerCase() || '';
            return !transferKeywords.some(keyword => categoryName.includes(keyword));
        });

      }
      onProgress?.(92, 'กำลังสร้างหน้าจอ');
      await this._yieldToPaint();

      const totalBudget = this.budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
      const totalSpent  = this.budgets.reduce((s, b) => s + b.spent, 0);

      return `
        <div class="page-transition">
          <!-- Header -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 class="text-2xl font-bold text-slate-800">Budgets</h1>
              <p class="text-sm text-slate-500 mt-1">ติดตามงบประมาณรายหมวดหมู่</p>
            </div>
            ${this.activeTab === 'current' ? `
            <button onclick="BudgetsPage.openModal()"
              class="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600
                     text-white px-4 py-2.5 rounded-lg font-medium text-sm
                     transition-colors active:scale-[0.98]">
              <i data-lucide="plus" class="w-4 h-4"></i>
              ตั้งงบประมาณ
            </button>
            ` : ''}
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
            <button onclick="BudgetsPage.switchTab('current')"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                     ${this.activeTab === 'current'
                       ? 'bg-white text-slate-800 shadow-sm'
                       : 'text-slate-500 hover:text-slate-700'}">
              <i data-lucide="target" class="w-4 h-4"></i>
              งบปัจจุบัน
            </button>
            <button onclick="BudgetsPage.switchTab('recommend')"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                     ${this.activeTab === 'recommend'
                       ? 'bg-white text-slate-800 shadow-sm'
                       : 'text-slate-500 hover:text-slate-700'}">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
              แนะนำงบ
            </button>
            <button onclick="BudgetsPage.switchTab('compare')"
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                     ${this.activeTab === 'compare'
                       ? 'bg-white text-slate-800 shadow-sm'
                       : 'text-slate-500 hover:text-slate-700'}">
              <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
              เปรียบเทียบ
            </button>
          </div>

          ${this.activeTab === 'current'
            ? this._renderCurrentTab(totalBudget, totalSpent)
          : this.activeTab === 'recommend'
              ? this._renderRecommendTab()
              : this._renderCompareTab()
          }
        </div>

        </div>
      `;
      onProgress?.(100, 'พร้อมแสดงผล');
    },

    // ===== TAB: งบปัจจุบัน =====

    _renderCurrentTab(totalBudget, totalSpent) {
      return `
        ${this._renderSummary(totalBudget, totalSpent)}
        <div id="budgets-list" class="space-y-3">
          ${this.budgets.filter(b => b.period === 'monthly' || b.period === 'yearly' || b.period === 'weekly').length > 0
            ? this.budgets.map((b, i) => this._renderBudgetCard(b, i)).join('')
            : this._renderEmpty()
          }
        </div>
      `;
    },

    // ===== TAB: แนะนำงบ =====

    _renderRecommendTab() {
      const periodBtns = `
        <div class="flex items-center gap-3 mb-5">
          <span class="text-sm font-medium text-slate-600">ดูจากประวัติ:</span>
          <div class="flex gap-2">
            ${['monthly', 'yearly'].map(p => {
              const labels = { monthly: 'รายเดือน', yearly: 'รายปี' };
              const sel = this.recommendPeriod === p;
              return `
                <button onclick="BudgetsPage.changeRecommendPeriod('${p}')"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium border-2 transition-all
                         ${sel
                           ? 'border-blue-500 bg-blue-50 text-blue-700'
                           : 'border-slate-200 text-slate-600 hover:border-slate-300'}">
                  ${labels[p]}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;

      if (this.recommendations === null) {
        return `
          ${periodBtns}
          <div class="flex items-center justify-center py-16">
            <div class="text-center">
              <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p class="text-sm text-slate-500">กำลังวิเคราะห์ข้อมูล...</p>
            </div>
          </div>
        `;
      }

      if (this.recommendations.length === 0) {
        return `
          ${periodBtns}
          <div class="bg-white rounded-xl shadow-sm p-12 flex flex-col items-center justify-center text-center">
            <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <i data-lucide="bar-chart-2" class="w-8 h-8 text-slate-300"></i>
            </div>
            <h3 class="font-semibold text-slate-600 mb-2">ไม่พบข้อมูลรายจ่าย</h3>
            <p class="text-sm text-slate-400">
              ${this.recommendPeriod === 'monthly'
                ? 'ยังไม่มีรายจ่ายใน 3 เดือนล่าสุด'
                : 'ยังไม่มีรายจ่ายในปีที่แล้ว'}
            </p>
          </div>
        `;
      }

      const budgetedIds  = new Set(this.budgets.map(b => b.category_id));
      const selectable   = this.recommendations.filter(r => !budgetedIds.has(r.category_id));
      const alreadyBudgeted = this.recommendations.filter(r =>  budgetedIds.has(r.category_id));
      const numMonths    = this.recommendPeriod === 'monthly' ? 3 : 12;
      const basisLabel   = this.recommendPeriod === 'monthly'
        ? 'เฉลี่ยจาก 3 เดือนล่าสุด'
        : 'รวมจากปีที่แล้ว';

      return `
        ${periodBtns}

        <!-- Info banner -->
        <div class="flex items-start gap-3 bg-blue-50 rounded-xl p-4 mb-5">
          <i data-lucide="info" class="w-4 h-4 text-blue-500 mt-0.5 shrink-0"></i>
          <p class="text-sm text-blue-700">
            <span class="font-medium">แนะนำจาก${basisLabel}</span>
            — ติ๊กเลือกหมวดหมู่ ปรับจำนวนเงินได้ตามต้องการ แล้วกด "สร้างงบประมาณ"
          </p>
        </div>

        ${selectable.length > 0 ? `
          <!-- Header row -->
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-semibold text-slate-700">${selectable.length} หมวดหมู่ที่แนะนำ</span>
            <div class="flex items-center gap-3">
              <button onclick="BudgetsPage.selectAllRecs(true)"
                class="text-xs text-blue-500 hover:text-blue-700 font-medium">เลือกทั้งหมด</button>
              <span class="text-slate-300 text-xs">|</span>
              <button onclick="BudgetsPage.selectAllRecs(false)"
                class="text-xs text-slate-500 hover:text-slate-700 font-medium">ยกเลิกทั้งหมด</button>
            </div>
          </div>

          <!-- List -->
          <div class="space-y-2 mb-5">
            ${selectable.map((rec, i) => this._renderRecItem(rec, i, numMonths)).join('')}
          </div>

          <!-- Create button -->
          <div class="sticky bottom-4 pt-1">
            <button onclick="BudgetsPage.createSelectedBudgets('${this.recommendPeriod}')"
              id="rec-create-btn"
              class="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600
                     text-white px-4 py-3 rounded-xl font-medium text-sm
                     transition-colors active:scale-[0.98]">
              <i data-lucide="check-circle" class="w-4 h-4"></i>
              สร้างงบประมาณจากรายการที่เลือก
              <span id="rec-selected-count"
                class="bg-white text-blue-600 text-xs font-bold rounded-full px-2 py-0.5 ml-1">
                ${selectable.length}
              </span>
            </button>
          </div>
        ` : `
          <div class="bg-emerald-50 rounded-xl p-4 flex items-center gap-3 mb-5">
            <i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500 shrink-0"></i>
            <p class="text-sm text-emerald-700 font-medium">ทุกหมวดหมู่มีงบประมาณแล้ว</p>
          </div>
        `}

        ${alreadyBudgeted.length > 0 ? `
          <div class="mt-6">
            <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">มีงบประมาณแล้ว</h4>
            <div class="space-y-2">
              ${alreadyBudgeted.map(rec => this._renderRecItemBudgeted(rec)).join('')}
            </div>
          </div>
        ` : ''}
      `;
    },

    // ===== TAB: เปรียบเทียบ =====

    _renderCompareTab() {
      const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

      if (this.budgets.length === 0) {
        return `
          <div class="bg-white rounded-xl shadow-sm p-12 flex flex-col items-center justify-center text-center">
            <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <i data-lucide="bar-chart-2" class="w-8 h-8 text-slate-300"></i>
            </div>
            <h3 class="font-semibold text-slate-600 mb-2">ยังไม่มีงบประมาณ</h3>
            <p class="text-sm text-slate-400 mb-4">สร้างงบประมาณก่อนเพื่อดูกราฟเปรียบเทียบ</p>
            <button onclick="BudgetsPage.switchTab('current')"
              class="text-sm text-blue-500 hover:underline font-medium">ไปที่งบปัจจุบัน</button>
          </div>
        `;
      }

      return `
        <!-- Budget Selector -->
        <div class="bg-white rounded-xl shadow-sm p-5 mb-4">
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-semibold text-slate-700">
              เลือกงบที่ต้องการเปรียบเทียบ
              <span class="font-normal text-slate-400">(สูงสุด 5 รายการ)</span>
            </p>
            <span id="compare-count"
              class="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              ${this.compareSelectedIds.length}/5
            </span>
          </div>
          <div class="space-y-2">
            ${this.budgets.map((b) => {
              const cat = b.categories || {};
              const icon = this._safeIcon(cat.icon || 'help-circle');
              const color = cat.color || '#64748b';
              const isSelected = this.compareSelectedIds.includes(b.id);
              const colorIdx = this.compareSelectedIds.indexOf(b.id);
              const dotColor = isSelected ? COLORS[colorIdx] : '#cbd5e1';
              const isDisabled = !isSelected && this.compareSelectedIds.length >= 5;
              // display amount in current compare mode unit
              const dispAmt  = this.compareMode === 'monthly' ? this._getMonthlyLimit(b) : this._getAnnualLimit(b);
              const modeLabel = this.compareMode === 'monthly' ? '/เดือน' : '/ปี';
              return `
                <label data-budget-id="${b.id}"
                  class="flex items-center gap-3 p-3 rounded-lg border-2 transition-all
                         ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                         ${isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}">
                  <input type="checkbox" class="sr-only" ${isSelected ? 'checked' : ''}
                    ${isDisabled ? 'disabled' : ''}
                    onchange="BudgetsPage.toggleCompareId('${b.id}')">
                  <span class="compare-color-dot w-3 h-3 rounded-full shrink-0 transition-colors"
                        style="background-color:${dotColor}"></span>
                  <span class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style="background-color:${color}15">
                    <i data-lucide="${icon}" class="w-4 h-4" style="color:${color}"></i>
                  </span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-medium text-slate-800 truncate">${cat.name || 'ไม่ระบุ'}</span>
                    <!-- inline view -->
                    <span id="compare-disp-${b.id}" class="flex items-center gap-1">
                      <span class="text-xs text-slate-400">฿${Format.money(dispAmt)}${modeLabel}</span>
                      <button type="button"
                        onclick="event.preventDefault();event.stopPropagation();BudgetsPage.startInlineEdit('${b.id}')"
                        class="p-0.5 rounded transition-colors" title="แก้ไขงบ">
                        <i data-lucide="pencil" class="w-3 h-3 text-slate-300 hover:text-blue-500"></i>
                      </button>
                    </span>
                    <!-- inline edit -->
                    <span id="compare-edit-row-${b.id}" class="items-center gap-1 mt-0.5" style="display:none">
                      <span class="text-xs text-slate-400">฿</span>
                      <input type="number" id="compare-edit-amt-${b.id}"
                        value="${dispAmt}" step="100" min="1"
                        onclick="event.stopPropagation()"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();BudgetsPage.saveInlineEdit('${b.id}');}if(event.key==='Escape'){BudgetsPage.cancelInlineEdit('${b.id}');}"
                        class="w-20 px-1.5 py-0.5 border border-blue-300 rounded text-xs font-number text-right focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <button type="button"
                        onclick="event.preventDefault();event.stopPropagation();BudgetsPage.saveInlineEdit('${b.id}')"
                        class="text-emerald-500 hover:text-emerald-600 transition-colors">
                        <i data-lucide="check" class="w-3.5 h-3.5"></i>
                      </button>
                      <button type="button"
                        onclick="event.preventDefault();event.stopPropagation();BudgetsPage.cancelInlineEdit('${b.id}')"
                        class="text-slate-400 hover:text-slate-600 transition-colors">
                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                      </button>
                    </span>
                  </span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Chart Area (filled dynamically) -->
        <div id="compare-chart-area">
          ${this.compareSelectedIds.length === 0 ? `
            <div class="bg-slate-50 rounded-xl p-10 text-center text-slate-400">
              <i data-lucide="mouse-pointer-click" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
              <p class="text-sm">ติ๊กเลือกงบประมาณด้านบนเพื่อดูกราฟเปรียบเทียบ</p>
            </div>
          ` : ''}
        </div>
      `;
    },

    _renderRecItem(rec, index, numMonths) {
      const cat = rec.categories;
      if (!cat) return '';
      const icon  = this._safeIcon(cat.icon || 'help-circle');
      const color = cat.color || '#64748b';
      // ปัดขึ้นไปทีละ 100
      const suggested = Math.ceil((rec.total / numMonths) / 100) * 100;
      const avgLabel  = numMonths === 12
        ? `รวม ${Format.money(rec.total)}/ปีที่แล้ว`
        : `เฉลี่ย ${Format.money(rec.total / numMonths)}/เดือน`;

      return `
        <div class="bg-white rounded-xl shadow-sm p-4 animate-fade-in-up stagger-${Math.min(index + 1, 4)}">
          <div class="flex items-center gap-3">
            <!-- Checkbox (default unchecked) -->
            <input type="checkbox" id="rec-check-${rec.category_id}"
              onchange="BudgetsPage.updateCreateBtn()"
              class="w-5 h-5 rounded border-slate-300 accent-blue-500 cursor-pointer shrink-0">

            <!-- Icon -->
            <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                 style="background-color: ${color}15">
              <i data-lucide="${icon}" class="w-4 h-4" style="color: ${color}"></i>
            </div>

            <!-- Name + basis -->
            <div class="flex-1 min-w-0">
              <p class="font-medium text-slate-800 text-sm truncate">${cat.name}</p>
              <p class="text-xs text-slate-400">${avgLabel}</p>
            </div>

            <!-- Editable amount -->
            <div class="relative shrink-0">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">฿</span>
              <input type="number" id="rec-amount-${rec.category_id}"
                value="${suggested}" min="1" step="100"
                class="w-28 pl-7 pr-2 py-2 border border-slate-200 rounded-lg text-sm
                       font-number text-right focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
        </div>
      `;
    },

    _renderRecItemBudgeted(rec) {
      const cat = rec.categories;
      if (!cat) return '';
      const icon  = this._safeIcon(cat.icon || 'help-circle');
      const color = cat.color || '#64748b';
      const existing = this.budgets.find(b => b.category_id === rec.category_id);
      const periodLabel = { weekly: 'สัปดาห์', monthly: 'เดือน', yearly: 'ปี' };

      return `
        <div class="bg-slate-50 rounded-xl p-4 opacity-60">
          <div class="flex items-center gap-3">
            <i data-lucide="check" class="w-4 h-4 text-emerald-500 shrink-0"></i>
            <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                 style="background-color: ${color}15">
              <i data-lucide="${icon}" class="w-4 h-4" style="color: ${color}"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-slate-600 text-sm truncate">${cat.name}</p>
              ${existing
                ? `<p class="text-xs text-slate-400">งบปัจจุบัน ${Format.money(existing.amount)}/${periodLabel[existing.period] || existing.period}</p>`
                : ''}
            </div>
            <span class="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-full shrink-0">มีงบแล้ว</span>
          </div>
        </div>
      `;
    },

    // ===== FETCH RECOMMENDATIONS =====

    async _fetchRecommendations(userId, period) {
      const now = new Date();
      let dateFrom, dateTo;

      if (period === 'monthly') {
        // 3 เดือนล่าสุด (ไม่รวมเดือนปัจจุบัน)
        const startOf3Ago = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        dateFrom = startOf3Ago.toISOString().split('T')[0];
        dateTo   = endOfLastMonth.toISOString().split('T')[0];
      } else {
        // ปีที่แล้วทั้งปี
        const prevYear = now.getFullYear() - 1;
        dateFrom = `${prevYear}-01-01`;
        dateTo   = `${prevYear}-12-31`;
      }

      return await DB.getHistoricalSpendingByCategory(userId, dateFrom, dateTo);
    },

    // ===== CACHE INVALIDATION =====

    _invalidateCache() {
      this._baseDataCache = null;
      this._cachedChartYear = null;
      this._cachedChartTxs = [];
      this._cachedYearlyRange = null;
      this._cachedYearlyRows = [];
    },

    // ===== TAB SWITCHING =====

    async switchTab(tab) {
      this.activeTab = tab;

      // Fast path: มี cached spendTxs → ข้าม loading screen ทั้งหมด เหลือแค่ re-fetch budgets+categories
      if (this._baseDataCache) {
        const container = document.getElementById('page-content');
        if (container) {
          const html = await this.render(this.userId);
          container.innerHTML = html;
          lucide.createIcons();
          if (this.activeTab === 'compare' && this.compareSelectedIds.length > 0) {
            await this._renderChartArea();
          }
          return;
        }
      }

      await this.refresh();
    },

    async changeRecommendPeriod(period) {
      this.recommendPeriod = period;
      this.recommendations = null;
      await this.refresh();
    },

    // ===== RECOMMENDATION INTERACTIONS =====

    selectAllRecs(checked) {
      document.querySelectorAll('[id^="rec-check-"]').forEach(cb => { cb.checked = checked; });
      this.updateCreateBtn();
    },

    updateCreateBtn() {
      const btn      = document.getElementById('rec-create-btn');
      const countEl  = document.getElementById('rec-selected-count');
      if (!btn || !countEl) return;
      const count = document.querySelectorAll('[id^="rec-check-"]:checked').length;
      countEl.textContent = count;
      btn.disabled = count === 0;
      btn.classList.toggle('opacity-50', count === 0);
      btn.classList.toggle('cursor-not-allowed', count === 0);
    },

    async createSelectedBudgets(period) {
      if (!this.recommendations) return;

      const budgetedIds = new Set(this.budgets.map(b => b.category_id));
      const selectable  = this.recommendations.filter(r => !budgetedIds.has(r.category_id));

      const toCreate = [];
      for (const rec of selectable) {
        const checkbox = document.getElementById(`rec-check-${rec.category_id}`);
        const amtInput = document.getElementById(`rec-amount-${rec.category_id}`);
        if (checkbox?.checked) {
          const amount = parseFloat(amtInput?.value);
          if (amount > 0) toCreate.push({ category_id: rec.category_id, amount });
        }
      }

      if (toCreate.length === 0) {
        Toast.show('กรุณาเลือกอย่างน้อย 1 หมวดหมู่', 'error');
        return;
      }

      // Disable button while saving
      const btn = document.getElementById('rec-create-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

      let ok = 0, fail = 0;
      for (const item of toCreate) {
        const { error } = await DB.createBudget({
          user_id: this.userId,
          category_id: item.category_id,
          amount: item.amount,
          period,
          alert_threshold: 80
        });
        if (error) fail++; else ok++;
      }

      if (ok > 0) Toast.show(`สร้าง ${ok} งบประมาณสำเร็จ`, 'success');
      if (fail > 0) Toast.show(`${fail} รายการบันทึกไม่สำเร็จ`, 'error');

      // กลับไปแท็บงบปัจจุบัน + รีเฟรชข้อมูล
      this.recommendations = null;
      this.activeTab = 'current';
      this._invalidateCache();
      await this.refresh();
    },

    // ===== SUMMARY =====

    _renderSummary(totalBudget, totalSpent) {
      const totalRemaining = totalBudget - totalSpent;
      const overallPercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

      return `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div class="bg-white rounded-xl shadow-sm p-4 card-hover animate-fade-in-up stagger-1">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <i data-lucide="target" class="w-4 h-4 text-blue-500"></i>
              </div>
              <span class="text-xs font-medium text-slate-500">งบรวมทั้งหมด</span>
            </div>
            <p class="text-lg font-bold font-number text-slate-800">${Format.money(totalBudget)}</p>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-4 card-hover animate-fade-in-up stagger-2">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <i data-lucide="trending-down" class="w-4 h-4 text-red-500"></i>
              </div>
              <span class="text-xs font-medium text-slate-500">ใช้ไปแล้ว</span>
            </div>
            <p class="text-lg font-bold font-number text-red-500">${Format.money(totalSpent)}</p>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-4 card-hover animate-fade-in-up stagger-3">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <i data-lucide="piggy-bank" class="w-4 h-4 text-emerald-500"></i>
              </div>
              <span class="text-xs font-medium text-slate-500">เหลือ (${overallPercent}% ใช้แล้ว)</span>
            </div>
            <p class="text-lg font-bold font-number ${totalRemaining < 0 ? 'text-red-500' : 'text-emerald-600'}">
              ${Format.money(totalRemaining)}
            </p>
          </div>
        </div>
      `;
    },

    // ===== BUDGET CARD =====

    _renderBudgetCard(budget, index = 0) {
      const catName  = budget.categories?.name || 'ไม่ระบุ';
      const catIcon  = this._safeIcon(budget.categories?.icon || 'help-circle');
      const catColor = budget.categories?.color || Theme.palette().slate;
      const limit    = parseFloat(budget.amount);
      const spent    = budget.spent;
      const remaining = limit - spent;
      const pct      = budget.percentage;

      const barColor = this._getBarColor(pct);
      const barWidth = Math.min(pct, 100);

      const periodLabels = { weekly: 'รายสัปดาห์', monthly: 'รายเดือน', yearly: 'รายปี' };

      return `
        <div class="bg-white rounded-xl shadow-sm p-5 card-hover group animate-fade-in-up stagger-${Math.min(index + 1, 4)}">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center"
                   style="background-color: ${catColor}15">
                <i data-lucide="${catIcon}" class="w-5 h-5" style="color: ${catColor}"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-800">${catName}</h3>
                <span class="text-xs text-slate-400">${periodLabels[budget.period] || budget.period}</span>
              </div>
            </div>

            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="BudgetsPage.openModal('${budget.id}')"
                class="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="แก้ไข">
                <i data-lucide="pencil" class="w-4 h-4 text-slate-400"></i>
              </button>
              <button onclick="BudgetsPage.confirmDelete('${budget.id}', '${catName}')"
                class="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
                <i data-lucide="trash-2" class="w-4 h-4 text-slate-400 hover:text-red-500"></i>
              </button>
            </div>
          </div>

          <div class="mb-2">
            <div class="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-500 ease-out"
                   style="width: ${barWidth}%; background-color: ${barColor}">
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between text-sm">
            <span class="font-number">
              <span class="font-semibold" style="color: ${barColor}">${Format.money(spent)}</span>
              <span class="text-slate-400"> / ${Format.money(limit)}</span>
            </span>
            <span class="font-medium font-number ${remaining < 0 ? 'text-red-500' : 'text-slate-500'}">
              ${remaining < 0 ? 'เกิน ' + Format.money(Math.abs(remaining)) : 'เหลือ ' + Format.money(remaining)}
            </span>
          </div>

          ${pct >= budget.alert_threshold && pct < 100 ? `
            <div class="flex items-center gap-2 mt-3 px-3 py-2 bg-amber-50 rounded-lg">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500 shrink-0"></i>
              <span class="text-xs text-amber-700">ใช้ไป ${pct}% แล้ว — ใกล้ถึงงบที่ตั้งไว้</span>
            </div>
          ` : ''}

          ${pct >= 100 ? `
            <div class="flex items-center gap-2 mt-3 px-3 py-2 bg-red-50 rounded-lg">
              <i data-lucide="alert-circle" class="w-4 h-4 text-red-500 shrink-0"></i>
              <span class="text-xs text-red-700">เกินงบแล้ว! (${pct}%)</span>
            </div>
          ` : ''}
        </div>
      `;
    },

    _getBarColor(pct) {
      const p = Theme.palette();
      if (pct < 50) return p.success;
      if (pct < 80) return p.warning;
      if (pct < 100) return p.warningStrong;
      return p.danger;
    },

    // ===== EMPTY STATE =====

    _renderEmpty() {
      return `
        <div class="bg-white rounded-xl shadow-sm p-12 min-h-[50vh] animate-fade-in-up flex flex-col items-center justify-center text-center">
          <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <i data-lucide="target" class="w-8 h-8 text-slate-300"></i>
          </div>
          <h3 class="font-semibold text-slate-600 mb-2">ยังไม่ได้ตั้งงบประมาณ</h3>
          <p class="text-sm text-slate-400 mb-4">ตั้งงบประมาณเพื่อควบคุมการใช้จ่าย</p>
          <button onclick="BudgetsPage.openModal()"
            class="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600
                   text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <i data-lucide="plus" class="w-4 h-4"></i> ตั้งงบประมาณ
          </button>
        </div>
      `;
    },

    // ===== MODAL =====

    async openModal(editId = null) {
      if (!this.userId) {
        const session = await Auth.getSession();
        this.userId = session?.user?.id;
      }
      const modal = document.getElementById('budget-modal');
      let budget = null;

      if (editId) budget = this.budgets.find(b => b.id === editId);
      const isEdit = !!budget;

      const usedCatIds = this.budgets
        .filter(b => !editId || b.id !== editId)
        .map(b => b.category_id);
      const availableCats = this.categories.filter(c => !usedCatIds.includes(c.id));

      const catOptions = isEdit
        ? [this.categories.find(c => c.id === budget.category_id), ...availableCats].filter(Boolean)
        : availableCats;

      // Pre-calculate dual monthly/yearly amounts for the form
      const initPeriod = (budget?.period === 'yearly') ? 'yearly' : 'monthly';
      const existingAmt = parseFloat(budget?.amount || 0);
      let initMonthly = '', initYearly = '';
      if (isEdit) {
        if (budget.period === 'yearly') {
          initYearly  = existingAmt;
          initMonthly = +(existingAmt / 12).toFixed(2);
        } else if (budget.period === 'monthly') {
          initMonthly = existingAmt;
          initYearly  = Math.round(existingAmt * 12);
        } else { // weekly → convert to monthly equivalent
          initMonthly = +(existingAmt * 52 / 12).toFixed(2);
          initYearly  = Math.round(existingAmt * 52);
        }
      }

      modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="BudgetsPage.closeModal()"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-md modal-content">

          <div class="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 class="text-lg font-semibold text-slate-800">
              ${isEdit ? 'แก้ไขงบประมาณ' : 'ตั้งงบประมาณใหม่'}
            </h2>
            <button onclick="BudgetsPage.closeModal()"
              class="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
            </button>
          </div>

          <div class="p-5 space-y-4">
            <!-- Category -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">หมวดหมู่รายจ่าย</label>
              ${catOptions.length > 0 ? `
                <select id="bgt-category" ${isEdit ? 'disabled' : ''}
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm
                         ${isEdit ? 'opacity-60' : ''}">
                  <option value="">เลือกหมวดหมู่</option>
                  ${(() => {
                    const tree = DB.buildCategoryTree(catOptions);
                    return tree.map(root => {
                      if (root.children && root.children.length > 0) {
                        return `<optgroup label="📁 ${root.name}">
                          <option value="${root.id}" ${budget?.category_id === root.id ? 'selected' : ''}>📁 ${root.name} (ทั้งหมวด)</option>
                          ${root.children.map(sub =>
                            `<option value="${sub.id}" ${budget?.category_id === sub.id ? 'selected' : ''}>  └ ${sub.name}</option>`
                          ).join('')}
                        </optgroup>`;
                      }
                      return `<option value="${root.id}" ${budget?.category_id === root.id ? 'selected' : ''}>${root.name}</option>`;
                    }).join('');
                  })()}
                </select>
              ` : `
                <div class="px-3 py-2.5 bg-slate-50 rounded-lg text-sm text-slate-500">
                  ทุกหมวดหมู่ถูกตั้งงบแล้ว
                </div>
              `}
            </div>

            <!-- Amount: Monthly + Yearly linked inputs -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">วงเงิน / เดือน</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">฿</span>
                  <input type="number" id="bgt-amount-monthly" step="100" min="1"
                    value="${initMonthly}"
                    placeholder="5,000"
                    oninput="BudgetsPage.syncBudgetMonthly()"
                    class="w-full pl-8 pr-2 py-2.5 border border-slate-200 rounded-lg text-sm
                           font-number focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">วงเงิน / ปี</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">฿</span>
                  <input type="number" id="bgt-amount-yearly" step="1000" min="1"
                    value="${initYearly}"
                    placeholder="60,000"
                    oninput="BudgetsPage.syncBudgetYearly()"
                    class="w-full pl-8 pr-2 py-2.5 border border-slate-200 rounded-lg text-sm
                           font-number focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                </div>
              </div>
            </div>

            <!-- Period selection (monthly / yearly) -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">บันทึกเป็นช่วงเวลา</label>
              <div class="grid grid-cols-2 gap-2">
                ${['monthly', 'yearly'].map(p => {
                  const labels = { monthly: 'รายเดือน', yearly: 'รายปี' };
                  const icons  = { monthly: '1m', yearly: '1y' };
                  const isSel  = initPeriod === p;
                  return `
                    <button type="button" onclick="BudgetsPage.selectPeriod('${p}')"
                      data-period="${p}"
                      class="bgt-period-btn px-3 py-2.5 rounded-lg text-sm font-medium
                             border-2 transition-all text-center
                             ${isSel
                               ? 'border-blue-500 bg-blue-50 text-blue-700'
                               : 'border-slate-200 text-slate-600 hover:border-slate-300'}">
                      <span class="block text-xs text-slate-400 mb-0.5">${icons[p]}</span>
                      ${labels[p]}
                    </button>
                  `;
                }).join('')}
              </div>
              <input type="hidden" id="bgt-period" value="${initPeriod}">
            </div>

            <!-- Alert Threshold -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                แจ้งเตือนเมื่อใช้ถึง (%)
              </label>
              <div class="flex items-center gap-3">
                <input type="range" id="bgt-threshold" min="50" max="100" step="5"
                  value="${budget?.alert_threshold || 80}"
                  oninput="document.getElementById('bgt-threshold-val').textContent = this.value + '%'"
                  class="flex-1 accent-blue-500">
                <span id="bgt-threshold-val" class="text-sm font-medium text-slate-700 w-10 text-right">
                  ${budget?.alert_threshold || 80}%
                </span>
              </div>
            </div>
          </div>

          <div class="flex gap-3 p-5 border-t border-slate-100">
            <button onclick="BudgetsPage.closeModal()"
              class="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm
                     font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              ยกเลิก
            </button>
            <button onclick="BudgetsPage.save('${editId || ''}')"
              class="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm
                     font-medium text-white transition-colors active:scale-[0.98]">
              ${isEdit ? 'บันทึก' : 'ตั้งงบประมาณ'}
            </button>
          </div>
        </div>
      `;
      lucide.createIcons();
    },

    selectPeriod(period) {
      document.getElementById('bgt-period').value = period;
      document.querySelectorAll('.bgt-period-btn').forEach(btn => {
        const isSelected = btn.dataset.period === period;
        btn.classList.toggle('border-blue-500', isSelected);
        btn.classList.toggle('bg-blue-50', isSelected);
        btn.classList.toggle('text-blue-700', isSelected);
        btn.classList.toggle('border-slate-200', !isSelected);
        btn.classList.toggle('text-slate-600', !isSelected);
      });
    },

    closeModal() {
      const modal = document.getElementById('budget-modal');
      modal.className = 'hidden fixed inset-0 z-50';
      modal.innerHTML = '';
    },

    syncBudgetMonthly() {
      const v  = parseFloat(document.getElementById('bgt-amount-monthly')?.value) || 0;
      const el = document.getElementById('bgt-amount-yearly');
      if (el) el.value = v > 0 ? Math.round(v * 12) : '';
    },

    syncBudgetYearly() {
      const v  = parseFloat(document.getElementById('bgt-amount-yearly')?.value) || 0;
      const el = document.getElementById('bgt-amount-monthly');
      if (el) el.value = v > 0 ? +(v / 12).toFixed(2) : '';
    },

    // ===== SAVE =====

    async save(editId) {
      const categoryId = document.getElementById('bgt-category')?.value;
      const period     = document.getElementById('bgt-period').value;
      const monthlyAmt = parseFloat(document.getElementById('bgt-amount-monthly')?.value);
      const yearlyAmt  = parseFloat(document.getElementById('bgt-amount-yearly')?.value);
      const amount     = period === 'yearly' ? yearlyAmt : monthlyAmt;
      const threshold  = parseInt(document.getElementById('bgt-threshold').value);

      if (!editId && !categoryId) {
        Toast.show('กรุณาเลือกหมวดหมู่', 'error');
        return;
      }
      if (!amount || amount <= 0) {
        Toast.show('กรุณาใส่วงเงิน', 'error');
        return;
      }

      let result;
      if (editId) {
        result = await DB.updateBudget(editId, { amount, period, alert_threshold: threshold });
      } else {
        result = await DB.createBudget({
          user_id: this.userId,
          category_id: categoryId,
          amount,
          period,
          alert_threshold: threshold
        });
      }

      if (result.error) {
        Toast.show('บันทึกไม่สำเร็จ: ' + result.error.message, 'error');
        return;
      }

      Toast.show(editId ? 'แก้ไขงบสำเร็จ' : 'ตั้งงบสำเร็จ', 'success');
      this.closeModal();
      this._invalidateCache();
      await this.refresh();
    },

    // ===== DELETE =====

    confirmDelete(id, name) {
      const modal = document.getElementById('budget-modal');
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="BudgetsPage.closeModal()"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-sm modal-content p-6 text-center">
          <div class="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="alert-triangle" class="w-6 h-6 text-red-500"></i>
          </div>
          <h3 class="text-lg font-semibold text-slate-800 mb-2">ลบงบ "${name}"?</h3>
          <p class="text-sm text-slate-500 mb-6">ธุรกรรมที่เกี่ยวข้องจะไม่ถูกลบ</p>
          <div class="flex gap-3">
            <button onclick="BudgetsPage.closeModal()"
              class="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm
                     font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              ยกเลิก
            </button>
            <button onclick="BudgetsPage.deleteBudget('${id}')"
              class="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 rounded-lg text-sm
                     font-medium text-white transition-colors">
              ลบ
            </button>
          </div>
        </div>
      `;
      lucide.createIcons();
    },

    async deleteBudget(id) {
      const { error } = await DB.deleteBudget(id);
      if (error) {
        Toast.show('ลบไม่สำเร็จ', 'error');
        return;
      }
      Toast.show('ลบงบประมาณแล้ว', 'success');
      this.closeModal();
      this._invalidateCache();
      await this.refresh();
    },

    // ===== COMPARE: helpers =====

    _getMonthlyLimit(budget) {
      const amt = parseFloat(budget.amount);
      if (budget.period === 'monthly') return amt;
      if (budget.period === 'yearly')  return amt / 12;
      if (budget.period === 'weekly')  return amt * (52 / 12);
      return amt;
    },

    _getAnnualLimit(budget) {
      const amt = parseFloat(budget.amount);
      if (budget.period === 'yearly')  return amt;
      if (budget.period === 'monthly') return amt * 12;
      if (budget.period === 'weekly')  return amt * 52;
      return amt;
    },

    // ===== COMPARE: interactions =====

    toggleCompareId(id) {
      const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      const idx = this.compareSelectedIds.indexOf(id);
      if (idx >= 0) {
        this.compareSelectedIds.splice(idx, 1);
      } else {
        if (this.compareSelectedIds.length >= 5) {
          Toast.show('เลือกได้สูงสุด 5 รายการ', 'error');
          const label = document.querySelector(`[data-budget-id="${id}"]`);
          if (label) label.querySelector('input').checked = false;
          return;
        }
        this.compareSelectedIds.push(id);
      }

      // Sync selector UI (no full page re-render needed)
      const countEl = document.getElementById('compare-count');
      if (countEl) countEl.textContent = `${this.compareSelectedIds.length}/5`;

      for (const b of this.budgets) {
        const label = document.querySelector(`[data-budget-id="${b.id}"]`);
        if (!label) continue;
        const isSelected = this.compareSelectedIds.includes(b.id);
        const colorIdx  = this.compareSelectedIds.indexOf(b.id);
        const dotColor  = isSelected && colorIdx >= 0 ? COLORS[colorIdx] : '#cbd5e1';
        const isDisabled = !isSelected && this.compareSelectedIds.length >= 5;

        label.classList.toggle('border-blue-200', isSelected);
        label.classList.toggle('bg-blue-50',      isSelected);
        label.classList.toggle('border-slate-100', !isSelected);
        label.classList.toggle('opacity-50',       isDisabled);
        label.classList.toggle('cursor-not-allowed', isDisabled);
        label.classList.toggle('cursor-pointer',    !isDisabled);

        const dot = label.querySelector('.compare-color-dot');
        if (dot) dot.style.backgroundColor = dotColor;

        const cb = label.querySelector('input[type="checkbox"]');
        if (cb) { cb.checked = isSelected; cb.disabled = isDisabled; }
      }

      this._renderChartArea();
    },

    setCompareMode(mode) {
      this.compareMode = mode;
      // Sync displayed amounts in selector without full re-render
      const modeLabel = mode === 'monthly' ? '/เดือน' : '/ปี';
      for (const b of this.budgets) {
        const amt = mode === 'monthly' ? this._getMonthlyLimit(b) : this._getAnnualLimit(b);
        const dispEl = document.getElementById(`compare-disp-${b.id}`);
        if (dispEl) {
          const amtSpan = dispEl.querySelector('span:first-child');
          if (amtSpan) amtSpan.textContent = `฿${Format.money(amt)}${modeLabel}`;
        }
        const editInput = document.getElementById(`compare-edit-amt-${b.id}`);
        if (editInput) editInput.value = amt;
      }
      this._renderChartArea();
    },

    setCompareYear(year) {
      this.compareYear = year;
      this._cachedYearlyRange = null;
      this._cachedYearlyRows = [];
      this._renderChartArea();
    },

    // ===== COMPARE: render chart area =====

    async _renderChartArea() {
      const area = document.getElementById('compare-chart-area');
      if (!area) return;

      if (this.compareSelectedIds.length === 0) {
        if (this._compareChart) { this._compareChart.destroy(); this._compareChart = null; } // Destroy existing chart
        area.innerHTML = `
          <div class="bg-slate-50 rounded-xl p-10 text-center text-slate-400">
            <i data-lucide="mouse-pointer-click" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
            <p class="text-sm">ติ๊กเลือกงบประมาณด้านบนเพื่อดูกราฟเปรียบเทียบ</p>
          </div>`;
        lucide.createIcons();
        return;
      }

      const _currentYear = new Date().getFullYear();
      const _yearlyStart = Math.max(this.compareYear - 4, this.minAvailableYear);
      const chartTitle = this.compareMode === 'monthly'
        ? `งบ vs ใช้จริงรายเดือน — ปี ${this.compareYear} (แท่ง = ใช้จริง, เส้นประ = งบ)`
        : `งบ vs ใช้จริงรายปี — ${_yearlyStart} – ${this.compareYear} (แท่ง = ใช้จริง, เส้นประ = งบ)`;

      // Disable logic แยกตาม mode
      const _prevDisabled = this.compareMode === 'monthly'
        ? this.compareYear <= this.minAvailableYear
        : this.compareYear - 1 < this.minAvailableYear;
      const _nextDisabled = this.compareMode === 'monthly'
        ? this.compareYear >= this.maxAvailableYear
        : this.compareYear >= _currentYear;

      // Year display แยกตาม mode
      const _yearDisplay = this.compareMode === 'monthly'
        ? [this.compareYear - 1, this.compareYear, this.compareYear + 1]
            .filter(y => y >= this.minAvailableYear && y <= this.maxAvailableYear)
            .map(y => `
              <button onclick="BudgetsPage.setCompareYear(${y})"
                class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                       ${this.compareYear === y ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">
                ${y}
              </button>`).join('')
        : `<span class="px-3 py-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg whitespace-nowrap">
             ${_yearlyStart} – ${this.compareYear}
           </span>`;

      area.innerHTML = `
        <!-- Controls -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
            ${['monthly', 'yearly'].map(m => `
              <button onclick="BudgetsPage.setCompareMode('${m}')"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                       ${this.compareMode === m
                         ? 'bg-white text-slate-800 shadow-sm'
                         : 'text-slate-500 hover:text-slate-700'}">
                <i data-lucide="${m === 'monthly' ? 'calendar' : 'calendar-range'}" class="w-3.5 h-3.5"></i>
                ${m === 'monthly' ? 'รายเดือน' : 'รายปี (5 ปี)'}
              </button>`).join('')}
          </div>

          <!-- Year Selector -->
          <div class="flex items-center gap-2">
            <button onclick="BudgetsPage.changeCompareYear(-1)" ${_prevDisabled ? 'disabled' : ''}
              class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <div class="flex gap-2">
              ${_yearDisplay}
            </div>
            <button onclick="BudgetsPage.changeCompareYear(1)" ${_nextDisabled ? 'disabled' : ''}
              class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Chart card -->
        <div class="bg-white rounded-xl shadow-sm p-5 mb-4">
          <p class="font-semibold text-slate-800 mb-4 text-sm">${chartTitle}</p>
          <div id="compare-chart-loading" class="flex items-center justify-center py-14">
            <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div id="compare-chart-wrap" class="hidden" style="position:relative;height:300px">
            <canvas id="compare-chart"></canvas>
          </div>
        </div>

        <!-- Table -->
        <div id="compare-table" class="bg-white rounded-xl shadow-sm overflow-hidden mb-4"></div>
      `;

      lucide.createIcons();
      await this.loadCompareChart();
    },

    changeCompareYear(offset) {
      const newYear = this.compareYear + offset;
      const maxYear = this.compareMode === 'yearly' ? new Date().getFullYear() : this.maxAvailableYear;
      if (newYear >= this.minAvailableYear && newYear <= maxYear) {
        this.compareYear = newYear;
        // ล้าง yearly cache เมื่อ year เปลี่ยน เพื่อให้ดึงข้อมูลใหม่
        this._cachedYearlyRange = null;
        this._cachedYearlyRows = [];
        this._renderChartArea();
      }
    },

    // ===== COMPARE: chart data + render =====

    async loadCompareChart() {
      const COLORS   = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

      const loadingEl  = document.getElementById('compare-chart-loading');
      const chartWrap  = document.getElementById('compare-chart-wrap');
      const tableEl    = document.getElementById('compare-table');
      const canvas     = document.getElementById('compare-chart');
      if (!canvas || !loadingEl || !chartWrap) return;

      const selectedBudgets = this.budgets.filter(b => this.compareSelectedIds.includes(b.id));

      // Build categoryId → budgetId map (including sub-categories)
      const catToBudgetId = {};
      for (const b of selectedBudgets) {
        catToBudgetId[b.category_id] = b.id;
        for (const cat of this.categories) {
          if (cat.parent_id === b.category_id) catToBudgetId[cat.id] = b.id;
        }
      }

      // ดึง txs รายเดือนเฉพาะ monthly mode (yearly mode ใช้ annualRows จาก RPC/fallback แทน)
      let txs = [];
      if (this.compareMode === 'monthly') {
        if (this._cachedChartYear === this.compareYear && this._cachedChartTxs.length > 0) {
          txs = this._cachedChartTxs;
        } else {
          const { data: freshTxs } = await DB.getTransactions(this.userId, {
            type: 'expense',
            dateFrom: `${this.compareYear}-01-01`,
            dateTo:   `${this.compareYear}-12-31`,
            limit: 100000,
            sortBy: 'date',
            ascending: true,
          });
          txs = freshTxs || [];
          this._cachedChartYear = this.compareYear;
          this._cachedChartTxs = txs;
        }
      }

      // Aggregate by month per budget (ใช้ใน monthly mode)
      const monthlySpent = {};
      for (const b of selectedBudgets) monthlySpent[b.id] = new Array(12).fill(0);

      for (const tx of txs) {
        const bid = catToBudgetId[tx.category_id];
        if (!bid) continue;
        const m = new Date(tx.date).getMonth();
        monthlySpent[bid][m] += parseFloat(tx.amount);
      }
      this._compareSourceTxs = txs; // yearly mode จะ override ด้านล่าง
      this._compareCatToBudgetId = catToBudgetId;

      // Destroy old chart
      if (this._compareChart) { this._compareChart.destroy(); this._compareChart = null; }

      // ---- MONTHLY mode ----
      if (this.compareMode === 'monthly') {
        const datasets = [];
        for (let i = 0; i < selectedBudgets.length; i++) {
          const b      = selectedBudgets[i];
          const color  = COLORS[i % COLORS.length];
          const name   = b.categories?.name || 'ไม่ระบุ';
          const mLimit = this._getMonthlyLimit(b);

          // Actual spending bar
          datasets.push({
            type: 'bar',
            label: name,
            data: monthlySpent[b.id],
            backgroundColor: color + 'b3',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
            order: 2,
          });
          // Budget limit — dashed line, same color
          datasets.push({
            type: 'line',
            label: `${name} (งบ)`,
            data: Array(12).fill(mLimit),
            borderColor: color,
            borderDash: [5, 4],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointHitRadius: 0,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: color,
            pointBorderWidth: 2,
            tension: 0.25,
            spanGaps: true,
            fill: false,
            order: 1,
          });
        }

        this._compareChart = new Chart(canvas, {
          type: 'bar',
          data: { labels: TH_MONTHS, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (evt, elements, chart) => {
              const nativeEvt = evt?.native || evt;
              const hits = elements?.length ? elements : (chart.getElementsAtEventForMode(nativeEvt, 'x', { intersect: true }, true) || []);
              const el = hits.find(item => chart.data.datasets?.[item.datasetIndex]?.type === 'bar');
              if (!el) return;
              const ds = chart.data.datasets?.[el.datasetIndex];
              if (!ds || ds.type !== 'bar') return;
              this.openCompareDrilldown('monthly', el.index);
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: { boxWidth: 12, font: { size: 11 }, padding: 12 },
              },
              tooltip: {
                callbacks: {
                  label: ctx => ` ${ctx.dataset.label}: ฿${Format.money(ctx.raw)}`,
                },
              },
            },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, ticks: { callback: v => Format.compactNumber(v) } },
            },
          },
        });

        // Monthly table
        if (tableEl) {
          const nowMonth = new Date().getMonth();
          const nowYear  = new Date().getFullYear();
          const totals   = selectedBudgets.map(() => 0);

          let rows = '';
          for (let m = 0; m < 12; m++) {
            const rowTotal = selectedBudgets.reduce((s, b) => s + monthlySpent[b.id][m], 0);
            const isCurrent = m === nowMonth && this.compareYear === nowYear;
            rows += `
              <tr class="${isCurrent ? 'bg-blue-50' : 'hover:bg-slate-50'} transition-colors">
                <td class="px-4 py-2.5 text-sm font-medium text-slate-700 whitespace-nowrap cursor-pointer hover:text-blue-600"
                    onclick="BudgetsPage.openCompareDrilldown('monthly', ${m})"
                    title="คลิกเพื่อดูรายการค่าใช้จ่ายของเดือนนี้">
                  ${TH_MONTHS[m]}${isCurrent ? ' <span class="text-xs text-blue-400">(ปัจจุบัน)</span>' : ''}
                </td>
                ${selectedBudgets.map((b, i) => {
                  const spent  = monthlySpent[b.id][m];
                  const limit  = this._getMonthlyLimit(b);
                  const pct    = limit > 0 ? (spent / limit) * 100 : 0;
                  totals[i] += spent;
                  const cls = pct >= 100 ? 'text-red-500' : pct >= 80 ? 'text-amber-500' : 'text-slate-700';
                  return `<td class="px-3 py-2.5 text-right text-sm font-number ${cls}">${Format.money(spent)}</td>`;
                }).join('')}
                <td class="px-4 py-2.5 text-right text-sm font-semibold font-number text-slate-800">
                  ${Format.money(rowTotal)}
                </td>
              </tr>`;
          }

          const grandTotal = totals.reduce((s, v) => s + v, 0);
          tableEl.innerHTML = `
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">เดือน</th>
                    ${selectedBudgets.map((b, i) => `
                      <th class="px-3 py-3 text-right text-xs font-semibold" style="color:${COLORS[i % COLORS.length]}">
                        ${b.categories?.name || ''}
                      </th>`).join('')}
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600">รวม</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">${rows}</tbody>
                <tfoot class="border-t-2 border-slate-200">
                  <tr class="bg-slate-50 font-semibold">
                    <td class="px-4 py-3 text-xs text-slate-700">รวมทั้งปี</td>
                    ${totals.map((t, i) => {
                      const aLimit = this._getAnnualLimit(selectedBudgets[i]);
                      const pct = aLimit > 0 ? (t / aLimit) * 100 : 0;
                      const cls = pct >= 100 ? 'text-red-500' : pct >= 80 ? 'text-amber-500' : 'text-emerald-600';
                      return `<td class="px-3 py-3 text-right text-xs font-number ${cls}">${Format.money(t)}</td>`;
                    }).join('')}
                    <td class="px-4 py-3 text-right text-xs font-number text-slate-800">${Format.money(grandTotal)}</td>
                  </tr>
                  <tr class="bg-slate-50">
                    <td class="px-4 pb-3 text-xs text-slate-400">งบต่อปี</td>
                    ${selectedBudgets.map(b => `
                      <td class="px-3 pb-3 text-right text-xs font-number text-slate-400">
                        ${Format.money(this._getAnnualLimit(b))}
                      </td>`).join('')}
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>`;
        }

      // ---- YEARLY mode (5 ปีย้อนหลัง) ----
      } else {
        const minYear = Math.max(this.compareYear - 4, this.minAvailableYear);
        const maxYear = this.compareYear;
        const yearsToCompare = [];
        for (let y = minYear; y <= maxYear; y++) yearsToCompare.push(y);

        // ตรวจสอบ cache ก่อน
        const cacheYearlyValid =
          this._cachedYearlyRange?.minYear === minYear &&
          this._cachedYearlyRange?.maxYear === maxYear;

        let annualRows;
        if (cacheYearlyValid) {
          annualRows = this._cachedYearlyRows;
          this._compareSourceTxs = []; // drilldown จะ fetch lazily
        } else {
          // ใช้ RPC: คืน ~(5×N_categories) rows แทน 5 × 100k raw transactions
          annualRows = await DB.getAnnualSpendingByCategory(this.userId, minYear, maxYear);

          if (annualRows !== null) {
            // RPC สำเร็จ — cache ผลลัพธ์, drilldown จะ lazy-fetch
            this._cachedYearlyRange = { minYear, maxYear };
            this._cachedYearlyRows  = annualRows;
            this._compareSourceTxs  = []; // ไม่เก็บ raw txs; drilldown fetch on-demand
          } else {
            // RPC ยังไม่ deploy — fallback: single fetch ครอบทั้ง 5 ปีในครั้งเดียว
            const { data: rawTxs } = await DB.getTransactions(this.userId, {
              type: 'expense',
              dateFrom: `${minYear}-01-01`,
              dateTo:   `${maxYear}-12-31`,
              limit: 100000,
              sortBy: 'date',
              ascending: true,
            });
            const txList = rawTxs || [];
            this._compareSourceTxs = txList; // เก็บไว้สำหรับ drilldown (fallback path)
            // แปลง raw txs → aggregated rows format เพื่อใช้ code เดิม
            const tempMap = {};
            for (const tx of txList) {
              if (!tx.category_id) continue;
              const yr = new Date(tx.date).getFullYear();
              const key = `${yr}_${tx.category_id}`;
              if (!tempMap[key]) tempMap[key] = { yr, category_id: tx.category_id, total: 0 };
              tempMap[key].total += parseFloat(tx.amount);
            }
            annualRows = Object.values(tempMap);
          }
        }

        this._compareCatToBudgetId = catToBudgetId;

        // Aggregate annual spending per budget per year จาก annualRows (RPC หรือ fallback)
        const annualSpent = {};
        for (const b of selectedBudgets) annualSpent[b.id] = new Array(yearsToCompare.length).fill(0);
        for (const row of (annualRows || [])) {
          const bid = catToBudgetId[row.category_id];
          if (!bid) continue;
          const yi = yearsToCompare.indexOf(Number(row.yr));
          if (yi >= 0) annualSpent[bid][yi] += Number(row.total);
        }

        // Build datasets: bar (actual) + dashed line (budget) per category, same color
        const datasets = [];
        for (let i = 0; i < selectedBudgets.length; i++) {
          const b      = selectedBudgets[i];
          const color  = COLORS[i % COLORS.length];
          const name   = b.categories?.name || 'ไม่ระบุ';
          const aLimit = this._getAnnualLimit(b);

          datasets.push({
            type: 'bar',
            label: name,
            data: annualSpent[b.id],
            backgroundColor: color + 'b3',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
            order: 2,
          });
          datasets.push({
            type: 'line',
            label: `${name} (งบ)`,
            data: Array(yearsToCompare.length).fill(aLimit),
            borderColor: color,
            borderDash: [5, 4],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointHitRadius: 0,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: color,
            pointBorderWidth: 2,
            tension: 0.25,
            spanGaps: true,
            fill: false,
            order: 1,
          });
        }

        this._compareChart = new Chart(canvas, {
          type: 'bar',
          data: { labels: yearsToCompare.map(String), datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (evt, elements, chart) => {
              const nativeEvt = evt?.native || evt;
              const hits = elements?.length ? elements : (chart.getElementsAtEventForMode(nativeEvt, 'x', { intersect: true }, true) || []);
              const el = hits.find(item => chart.data.datasets?.[item.datasetIndex]?.type === 'bar');
              if (!el) return;
              const ds = chart.data.datasets?.[el.datasetIndex];
              if (!ds || ds.type !== 'bar') return;
              this.openCompareDrilldown('yearly', yearsToCompare[el.index]);
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: { boxWidth: 12, font: { size: 11 }, padding: 12 },
              },
              tooltip: {
                callbacks: {
                  label: ctx => ` ${ctx.dataset.label}: ฿${Format.money(ctx.raw)}`,
                },
              },
            },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, ticks: { callback: v => Format.compactNumber(v) } },
            },
          },
        });

        // Yearly table — year rows × category columns (same structure as monthly table)
        if (tableEl) {
          const totals = selectedBudgets.map(() => 0);
          let rows = '';
          for (let yi = 0; yi < yearsToCompare.length; yi++) {
            const rowTotal = selectedBudgets.reduce((s, b) => s + annualSpent[b.id][yi], 0);
            rows += `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2.5 text-sm font-medium text-slate-700 cursor-pointer hover:text-blue-600"
                    onclick="BudgetsPage.openCompareDrilldown('yearly', ${yearsToCompare[yi]})"
                    title="คลิกเพื่อดูรายการค่าใช้จ่ายของปีนี้">${yearsToCompare[yi]}</td>
                ${selectedBudgets.map((b, i) => {
                  const spent = annualSpent[b.id][yi];
                  const limit = this._getAnnualLimit(b);
                  const pct   = limit > 0 ? (spent / limit) * 100 : 0;
                  totals[i] += spent;
                  const cls = pct >= 100 ? 'text-red-500' : pct >= 80 ? 'text-amber-500' : 'text-slate-700';
                  return `<td class="px-3 py-2.5 text-right text-sm font-number ${cls}">${Format.money(spent)}</td>`;
                }).join('')}
                <td class="px-4 py-2.5 text-right text-sm font-semibold font-number text-slate-800">
                  ${Format.money(rowTotal)}
                </td>
              </tr>`;
          }
          const grandTotal = totals.reduce((s, v) => s + v, 0);
          tableEl.innerHTML = `
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">ปี</th>
                    ${selectedBudgets.map((b, i) => `
                      <th class="px-3 py-3 text-right text-xs font-semibold" style="color:${COLORS[i % COLORS.length]}">
                        ${b.categories?.name || ''}
                      </th>`).join('')}
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600">รวม</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">${rows}</tbody>
                <tfoot class="border-t-2 border-slate-200">
                  <tr class="bg-slate-50 font-semibold">
                    <td class="px-4 py-3 text-xs text-slate-700">รวมทุกปี</td>
                    ${totals.map((t, i) => {
                      const aLimit = this._getAnnualLimit(selectedBudgets[i]) * yearsToCompare.length;
                      const pct = aLimit > 0 ? (t / aLimit) * 100 : 0;
                      const cls = pct >= 100 ? 'text-red-500' : pct >= 80 ? 'text-amber-500' : 'text-emerald-600';
                      return `<td class="px-3 py-3 text-right text-xs font-number ${cls}">${Format.money(t)}</td>`;
                    }).join('')}
                    <td class="px-4 py-3 text-right text-xs font-number text-slate-800">${Format.money(grandTotal)}</td>
                  </tr>
                  <tr class="bg-slate-50">
                    <td class="px-4 pb-3 text-xs text-slate-400">งบต่อปี</td>
                    ${selectedBudgets.map(b => `
                      <td class="px-3 pb-3 text-right text-xs font-number text-slate-400">
                        ${Format.money(this._getAnnualLimit(b))}
                      </td>`).join('')}
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>`;
        }
      }

      // Reveal chart
      loadingEl.classList.add('hidden');
      chartWrap.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    },

    async openCompareDrilldown(period, value) {
      const selectedBudgets = this.budgets.filter(b => this.compareSelectedIds.includes(b.id));
      if (!selectedBudgets.length) return;

      const budgetIdSet = new Set(selectedBudgets.map(b => b.id));
      const budgetNameById = new Map(selectedBudgets.map(b => [b.id, b.categories?.name || 'ไม่ระบุ']));

      let startDate;
      let endDate;
      let title;

      if (period === 'monthly') {
        const month = Number(value);
        const monthStart = String(month + 1).padStart(2, '0');
        const monthEndDate = new Date(this.compareYear, month + 1, 0).getDate();
        startDate = `${this.compareYear}-${monthStart}-01`;
        endDate = `${this.compareYear}-${monthStart}-${String(monthEndDate).padStart(2, '0')}`;
        title = `รายการค่าใช้จ่ายเดือน ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][month]} ปี ${this.compareYear}`;
      } else {
        const year = Number(value);
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
        title = `รายการค่าใช้จ่ายปี ${year}`;
      }

      const mapSource = this._compareCatToBudgetId || {};
      let sourceTxs = Array.isArray(this._compareSourceTxs) ? this._compareSourceTxs : [];

      // Lazy fetch: yearly mode ใช้ RPC สำหรับ chart ดังนั้น _compareSourceTxs จะว่าง
      // ดึง raw txs เฉพาะปีที่คลิก เมื่อ user ต้องการดู drilldown เท่านั้น
      if (sourceTxs.length === 0 && period === 'yearly') {
        const { data: lazyTxs } = await DB.getTransactions(this.userId, {
          type: 'expense',
          dateFrom: startDate,
          dateTo: endDate,
          limit: 100000,
          sortBy: 'date',
        });
        sourceTxs = lazyTxs || [];
      }

      const txs = sourceTxs.filter(tx => {
        if ((tx.type || '').toLowerCase() !== 'expense') return false;
        if (tx.date < startDate || tx.date > endDate) return false;
        const budgetId = mapSource[tx.category_id];
        return budgetId && budgetIdSet.has(budgetId);
      }).map(tx => ({
        ...tx,
        _budgetId: mapSource[tx.category_id] || null,
      }));

      this._compareDrilldown = {
        period,
        value,
        title,
        startDate,
        endDate,
        budgetFilter: 'all',
        transactions: txs,
        budgetNameById,
      };

      this._openCompareDrilldownModal();
      this.renderCompareDrilldown();
    },

    _openCompareDrilldownModal() {
      let modal = document.getElementById('compare-drilldown-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'compare-drilldown-modal';
        modal.className = 'hidden fixed inset-0 z-[120]';
        document.body.appendChild(modal);
      }
      modal.classList.remove('hidden');
    },

    renderCompareDrilldown() {
      const modal = document.getElementById('compare-drilldown-modal');
      if (!modal || !this._compareDrilldown) return;

      const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const data = this._compareDrilldown;
      const budgetOptions = [
        { id: 'all', label: 'ทั้งหมด' },
        ...Array.from(data.budgetNameById.entries()).map(([id, name]) => ({ id, label: name })),
      ];

      const filtered = data.budgetFilter === 'all'
        ? data.transactions
        : data.transactions.filter(tx => tx._budgetId === data.budgetFilter);

      const totals = filtered.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

      const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

      modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="BudgetsPage.closeCompareDrilldown()"></div>
        <div class="relative bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden mx-auto my-4 sm:my-8 flex flex-col max-h-[88vh]">
          <div class="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/70 flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-bold text-slate-800">${escapeHtml(data.title)}</h3>
              <p class="text-xs text-slate-500 mt-1">
                พบ ${sorted.length} รายการ | รวม ฿${Format.money(totals)}
              </p>
            </div>
            <button onclick="BudgetsPage.closeCompareDrilldown()"
              class="w-10 h-10 rounded-full hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all shadow-sm">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="p-5 sm:p-6 border-b border-slate-100 bg-white">
            <div class="flex flex-wrap items-center gap-2 mb-4">
              <span class="text-xs font-semibold text-slate-500 mr-1">ตัวกรอง:</span>
              ${budgetOptions.map(opt => {
                const active = data.budgetFilter === opt.id;
                return `
                  <button onclick="BudgetsPage.setCompareDrilldownFilter('${opt.id}')"
                    class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                           ${active ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">
                    ${escapeHtml(opt.label)}
                  </button>`;
              }).join('')}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="rounded-2xl bg-slate-50 p-3">
                <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">ช่วงวันที่</p>
                <p class="text-sm font-semibold text-slate-700 mt-1">${escapeHtml(data.startDate)} - ${escapeHtml(data.endDate)}</p>
              </div>
              <div class="rounded-2xl bg-slate-50 p-3">
                <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">จำนวนรายการ</p>
                <p class="text-sm font-semibold text-slate-700 mt-1">${sorted.length} รายการ</p>
              </div>
              <div class="rounded-2xl bg-slate-50 p-3">
                <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">ยอดรวม</p>
                <p class="text-sm font-semibold text-slate-700 mt-1">฿${Format.money(totals)}</p>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-5 sm:p-6 bg-white">
            ${sorted.length > 0 ? `
              <div class="space-y-2">
                ${sorted.map(tx => `
                  <div class="rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors p-4">
                    <div class="flex items-start justify-between gap-4">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color:${tx.categories?.color || '#cbd5e1'}"></span>
                          <p class="font-semibold text-slate-800 truncate">${escapeHtml(tx.categories?.name || 'ไม่ระบุหมวดหมู่')}</p>
                          ${tx.accounts?.name ? `<span class="text-[10px] text-slate-400 font-medium">• ${escapeHtml(tx.accounts.name)}</span>` : ''}
                        </div>
                        <p class="text-xs text-slate-500">
                          ${escapeHtml(new Date(tx.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }))}
                          ${tx.note ? `• ${escapeHtml(tx.note)}` : ''}
                        </p>
                      </div>
                      <div class="text-right shrink-0">
                        <p class="text-sm font-black text-rose-600">-฿${Format.money(tx.amount)}</p>
                        <p class="text-[10px] text-slate-400 font-medium mt-1">${escapeHtml(data.budgetNameById.get(tx._budgetId) || '')}</p>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="py-16 text-center text-slate-400">
                <i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                <p class="text-sm">ไม่พบรายการในตัวกรองนี้</p>
              </div>
            `}
          </div>
        </div>
      `;

      lucide.createIcons();
    },

    setCompareDrilldownFilter(filterId) {
      if (!this._compareDrilldown) return;
      this._compareDrilldown.budgetFilter = filterId;
      this.renderCompareDrilldown();
      this._openCompareDrilldownModal();
    },

    closeCompareDrilldown() {
      const modal = document.getElementById('compare-drilldown-modal');
      if (modal) modal.classList.add('hidden');
    },

    // ===== COMPARE: inline edit =====

    startInlineEdit(id) {
      const dispEl = document.getElementById(`compare-disp-${id}`);
      const editEl = document.getElementById(`compare-edit-row-${id}`);
      if (!dispEl || !editEl) return;
      dispEl.style.display = 'none';
      editEl.style.display = 'flex';
      const input = document.getElementById(`compare-edit-amt-${id}`);
      input?.focus();
      input?.select();
    },

    cancelInlineEdit(id) {
      const dispEl = document.getElementById(`compare-disp-${id}`);
      const editEl = document.getElementById(`compare-edit-row-${id}`);
      if (!dispEl || !editEl) return;
      dispEl.style.display = 'flex';
      editEl.style.display = 'none';
    },

    async saveInlineEdit(id) {
      const input  = document.getElementById(`compare-edit-amt-${id}`);
      const amount = parseFloat(input?.value);
      if (!amount || amount <= 0) { Toast.show('กรุณาใส่จำนวนเงิน', 'error'); return; }

      const budget = this.budgets.find(b => b.id === id);
      if (!budget) return;

      // Save using the current compare mode as the period (monthly or yearly)
      const newPeriod = this.compareMode;
      const { error } = await DB.updateBudget(id, {
        amount,
        period: newPeriod,
        alert_threshold: budget.alert_threshold
      });
      if (error) { Toast.show('บันทึกไม่สำเร็จ', 'error'); return; }

      Toast.show('บันทึกงบสำเร็จ', 'success');
      budget.amount = amount;
      budget.period = newPeriod;

      const modeLabel = this.compareMode === 'monthly' ? '/เดือน' : '/ปี';
      const dispEl = document.getElementById(`compare-disp-${id}`);
      if (dispEl) {
        const amtSpan = dispEl.querySelector('span:first-child');
        if (amtSpan) amtSpan.textContent = `฿${Format.money(amount)}${modeLabel}`;
      }
      this.cancelInlineEdit(id);
      if (this.compareSelectedIds.includes(id)) await this._renderChartArea();
    },

    // ===== REFRESH & MOUNT =====

    async mount(userId) {
        const container = document.getElementById('page-content');
        if (!container) return;

        // 1. Show loading UI
        container.innerHTML = `
          <div id="budget-loading" class="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
            <div class="relative mb-6">
              <div class="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
              <div class="absolute inset-0 flex items-center justify-center">
                 <i data-lucide="piggy-bank" class="w-6 h-6 text-blue-600"></i>
              </div>
            </div>
            <h3 class="text-lg font-bold text-slate-700 mb-2">กำลังเตรียมข้อมูลงบประมาณ</h3>
            <p class="text-sm text-slate-400 mb-4" id="budget-progress-text">กำลังเริ่มต้น...</p>
            <div class="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div id="budget-progress-bar" class="h-full bg-blue-600 transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>
        `;
        lucide.createIcons();

        const progressText = document.getElementById('budget-progress-text');
        const progressBar = document.getElementById('budget-progress-bar');

        // 2. Define onProgress callback
        const onProgress = (percent, text) => {
            if (progressText) progressText.textContent = text;
            if (progressBar) progressBar.style.width = `${percent}%`;
        };

        try {
            // 3. Call render with the callback
            const html = await this.render(userId, { onProgress });
            container.innerHTML = html;
            lucide.createIcons();

            // 4. If compare tab is active, render the chart
            if (this.activeTab === 'compare' && this.compareSelectedIds.length > 0) {
                await this._renderChartArea();
            }
        } catch (e) {
            console.error("Error rendering Budgets page:", e);
            container.innerHTML = `<div class="p-8 text-center text-red-500">Error loading Budgets: ${e.message}</div>`;
        }
    },

    async refresh() {
      if (this._compareChart) { this._compareChart.destroy(); this._compareChart = null; }
      await this.mount(this.userId);
    }
};
