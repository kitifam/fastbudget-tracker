// ===================================================
// Credit Cards Component — จัดการบัตรเครดิต
// แสดงวงเงิน, ยอดค้าง, วันตัดรอบ, วันครบกำหนด
// ===================================================

const CreditCardsPage = {
  cards: [],
  accounts: [],
  userId: null,
  sortBy: 'due',
  sortOrder: 'asc',
  cardsPerRow: window.innerWidth > 768 ? 3 : 2,
  showHidden: false,

  // ===== RENDER หน้าหลัก =====

  async render(userId) {
    this.userId = userId;

    const [rawCards, accounts] = await Promise.all([
      DB.getCreditCards(userId),
      DB.getAccounts(userId)
    ]);

    this.accounts = accounts;

    // Split active (use_account=1) and hidden (use_account=2)
    const activeCards = rawCards.filter(c => c.use_account === 1);
    const hiddenCards  = rawCards.filter(c => c.use_account !== 1);
    this.cards = activeCards;

    // Build display list
    let activeDisplay = activeCards.map(c => ({...c, _hidden: false}));
    let hiddenDisplay  = hiddenCards.map(c => ({...c, _hidden: true}));

    // Sort each group
    const sortFn = (a, b) => {
      let comparison = 0;
      if (this.sortBy === 'bank') {
        comparison = a.bank_name.localeCompare(b.bank_name);
      } else if (this.sortBy === 'due') {
        const dueA = this._getNextDueDate(a.due_date).daysLeft ?? Infinity;
        const dueB = this._getNextDueDate(b.due_date).daysLeft ?? Infinity;
        comparison = dueA - dueB;
      } else if (this.sortBy === 'balance') {
        const balA = Math.abs(parseFloat(a.accounts?.balance || 0));
        const balB = Math.abs(parseFloat(b.accounts?.balance || 0));
        comparison = balA - balB;
      } else if (this.sortBy === 'statement') {
        const stmtA = this._getNextDueDate(a.statement_date).daysLeft ?? Infinity;
        const stmtB = this._getNextDueDate(b.statement_date).daysLeft ?? Infinity;
        comparison = stmtA - stmtB;
      }
      return this.sortOrder === 'asc' ? comparison : -comparison;
    };
    activeDisplay.sort(sortFn);
    hiddenDisplay.sort(sortFn);

    const displayCards = this.showHidden
      ? [...activeDisplay, ...hiddenDisplay]
      : activeDisplay;

    // Summary — active cards only
    const totalLimit = activeCards.reduce((s, c) => s + (c.credit_limit || 0), 0);
    const totalUsed  = activeCards.reduce((s, c) => s + Math.abs(parseFloat(c.accounts?.balance || 0)), 0);
    const totalAvail = totalLimit - totalUsed;

    const hiddenCount = hiddenCards.length;

    return `
        <div class="page-transition">
          ${this._renderSummary(totalLimit, totalUsed, totalAvail)}

          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
               <span class="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">เรียงตาม:</span>
               ${['custom', 'bank', 'due', 'balance', 'statement'].map(key => {
      const labels = { custom: 'จัดเรียงเอง', bank: 'ธนาคาร', due: 'วันครบกำหนด', balance: 'ยอดค้าง', statement: 'วันตัดรอบ' };
      const isActive = this.sortBy === key;
      return `
                   <button onclick="CreditCardsPage.setSort('${key}')"
                     class="px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap
                     ${isActive ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">
                     ${labels[key]}
                   </button>
                 `;
    }).join('')}
               <button onclick="CreditCardsPage.toggleOrder()"
                 class="ml-1 p-2 bg-white rounded-full border border-slate-200 shadow-sm text-slate-500 hover:text-blue-500 transition-colors">
                 <i data-lucide="${this.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'}" class="w-4 h-4"></i>
               </button>
               ${hiddenCount > 0 ? `
                 <button onclick="CreditCardsPage.toggleHidden()"
                   class="ml-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border
                   ${this.showHidden ? 'bg-slate-500 text-white border-slate-500' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}">
                   ${this.showHidden ? 'ซ่อน Hidden' : `แสดง Hidden (${hiddenCount})`}
                 </button>
               ` : ''}
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ขนาด:</span>
                <input type="range" min="1" max="4" value="${this.cardsPerRow}"
                  oninput="CreditCardsPage.setGridCols(this.value)"
                  class="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500">
                <span id="cc-grid-val" class="text-xs font-bold text-blue-600 min-w-[12px] text-center">${this.cardsPerRow}</span>
              </div>
              <div></div>
            </div>
          </div>

          <div id="cc-grid" class="grid gap-6 mt-6">
            <style>
               #cc-grid { grid-template-columns: repeat(${this.cardsPerRow}, minmax(0, 1fr)); }
               @media (max-width: 1024px) { #cc-grid { grid-template-columns: repeat(${Math.min(this.cardsPerRow, 2)}, minmax(0, 1fr)); } }
               @media (max-width: 640px) { #cc-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); } }
            </style>
            ${displayCards.length > 0
        ? displayCards.map(c => this._renderCard(c)).join('')
        : this._renderEmpty()
      }
          </div>
        </div>
      `;
  },

  // ===== SUMMARY =====

  _renderSummary(totalLimit, totalUsed, totalAvail) {
    const usedPct = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;

    return `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div class="bg-white rounded-xl shadow-sm p-4 card-hover">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <i data-lucide="credit-card" class="w-4 h-4 text-blue-500"></i>
              </div>
              <span class="text-xs font-medium text-slate-500">วงเงินรวม</span>
            </div>
            <p class="text-lg font-bold font-number text-slate-800">${Format.money(totalLimit)}</p>
          </div>
  
          <div class="bg-white rounded-xl shadow-sm p-4 card-hover">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <i data-lucide="trending-down" class="w-4 h-4 text-red-500"></i>
              </div>
              <span class="text-xs font-medium text-slate-500">ยอดค้างชำระ (${usedPct}%)</span>
            </div>
            <p class="text-lg font-bold font-number text-red-500">${Format.money(totalUsed)}</p>
          </div>
  
          <div class="bg-white rounded-xl shadow-sm p-4 card-hover">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
              </div>
              <span class="text-xs font-medium text-slate-500">เครดิตคงเหลือ</span>
            </div>
            <p class="text-lg font-bold font-number text-emerald-600">${Format.money(totalAvail)}</p>
          </div>
        </div>
      `;
  },

  // ===== CREDIT CARD (แบบการ์ดคล้ายบัตรจริง) =====

  _renderCard(card) {
    const balance = Math.abs(parseFloat(card.accounts?.balance || 0));
    const color = this._getAutoBankColor(card.bank_name, card.accounts?.color);
    const hiddenClass = card._hidden ? 'opacity-50 saturate-0' : '';

    const showStatement = this.sortBy === 'statement';
    const dateLabel = showStatement ? 'วันตัดรอบ' : 'ครบกำหนดชำระ';
    const dateValue = showStatement ? card.statement_date : card.due_date;

    const dueInfo = this._getNextDueDate(card.due_date);

    return `
        <div class="group cursor-pointer ${hiddenClass}" onclick="CreditCardsPage.viewTransactions('${card.account_id}')">
          <!-- Card visual -->
          <div class="rounded-2xl p-6 text-white relative overflow-hidden shadow-lg transition-transform hover:scale-[1.02] duration-300 min-h-[180px] flex flex-col justify-between"
               style="background: linear-gradient(135deg, ${color}, ${color}EE)">
  
            <!-- Chip & Bank -->
            <div class="relative z-10 flex items-start justify-between">
               <div class="flex-1">
                  <div class="w-12 h-8 bg-yellow-400/80 rounded mb-3 shadow-inner flex items-center justify-center">
                     <span class="text-[10px] font-mono font-bold text-yellow-900/60 tracking-wider">${card.last_four || '••••'}</span>
                  </div>
                  <p class="text-lg font-bold tracking-tight">${card.bank_name}</p>
               </div>
               <div class="flex gap-1 ml-4">
                  <button onclick="event.stopPropagation(); CreditCardsPage.openPaymentModal('${card.id}')"
                    class="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors" title="จ่ายบิล/โอนเงินเข้า">
                    <i data-lucide="arrow-right-left" class="w-4 h-4 text-white"></i>
                  </button>
               </div>
            </div>

            <div class="flex-1"></div>

            <!-- Balance & Date -->
            <div class="relative z-10 flex items-end justify-between border-t border-white/20 pt-4">
               <div>
                  <p class="text-[10px] opacity-70 uppercase tracking-widest mb-1">ยอดค้างชำระ</p>
                  <p class="text-2xl font-bold font-number">${Format.money(balance)}</p>
               </div>
               <div class="text-right">
                  <p class="text-[10px] opacity-70 uppercase tracking-widest mb-1">${dateLabel}</p>
                  <p class="text-sm font-medium">${dateValue ? `ทุกวันที่ ${dateValue}` : 'ตัดอัตโนมัติ'}</p>
                  ${!showStatement && dueInfo && dueInfo.daysLeft <= 7 ? `
                    <p class="text-[10px] font-bold mt-1 text-white bg-red-500/80 px-2 py-0.5 rounded-full inline-block">
                      อีก ${dueInfo.daysLeft} วัน
                    </p>
                  ` : ''}
               </div>
            </div>

            <!-- Background subtle pattern -->
            <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
          </div>
        </div>
      `;
  },

  // คำนวณวันครบกำหนดถัดไป (null-safe: null/0/-1 = Autopay)
  _getNextDueDate(dueDay) {
    if (!dueDay || dueDay <= 0) {
      return { nextDue: null, daysLeft: Infinity, isAutopay: true };
    }
    const now = new Date();
    let nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);

    // ถ้าวันครบกำหนดผ่านไปแล้วเดือนนี้ → ดูเดือนหน้า
    if (nextDue <= now) {
      nextDue = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
    }

    const diffMs = nextDue - now;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return { nextDue, daysLeft, isAutopay: false };
  },

  // ===== EMPTY STATE =====

  _renderEmpty() {
    return `
        <div class="col-span-full bg-white rounded-xl shadow-sm p-12
                    flex flex-col items-center text-center">
          <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <i data-lucide="credit-card" class="w-8 h-8 text-slate-300"></i>
          </div>
          <h3 class="font-semibold text-slate-700 mb-2">ไม่พบบัตรเครดิตใน Fast Budget DB</h3>
          <p class="text-sm text-slate-400">ตรวจสอบว่าไฟล์ .bak มีข้อมูลในตาราง credit_cards</p>
        </div>
      `;
  },

  // ===== MODAL =====

  async openModal(editId = null) {
    if (!this.userId) {
      const session = await Auth.getSession();
      this.userId = session?.user?.id;
    }
    const modal = document.getElementById('cc-modal');
    let card = null;

    if (editId) {
      card = this.cards.find(c => c.id === editId);
    }

    const isEdit = !!card;

    // บัญชีประเภท credit_card ที่มีอยู่แล้ว
    const ccAccounts = this.accounts.filter(a => a.type === 'credit_card');

    // บัญชี credit_card ที่ยังไม่ถูกเชื่อมกับบัตร
    const linkedAccountIds = this.cards
      .filter(c => !editId || c.id !== editId)
      .map(c => c.account_id);
    const availableAccounts = ccAccounts.filter(a => !linkedAccountIds.includes(a.id));

    // ถ้า edit → เพิ่ม account ปัจจุบันกลับ
    const accountOptions = isEdit
      ? [ccAccounts.find(a => a.id === card.account_id), ...availableAccounts].filter(Boolean)
      : availableAccounts;

    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="CreditCardsPage.closeModal()"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-md modal-content max-h-[90vh] overflow-y-auto">
  
          <div class="sticky top-0 bg-white flex items-center justify-between p-5 border-b border-slate-100 z-10">
            <h2 class="text-lg font-semibold text-slate-800">
              ${isEdit ? 'แก้ไขบัตรเครดิต' : 'เพิ่มบัตรเครดิตใหม่'}
            </h2>
            <button onclick="CreditCardsPage.closeModal()"
              class="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
            </button>
          </div>
  
          <div class="p-5 space-y-4">
  
            <!-- เลือกบัญชี credit_card -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">เชื่อมกับบัญชี</label>
              ${accountOptions.length > 0 ? `
                <select id="cc-account" ${isEdit ? 'disabled' : ''}
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm
                         ${isEdit ? 'opacity-60' : ''}">
                  <option value="">เลือกบัญชีบัตรเครดิต</option>
                  ${accountOptions.map(a =>
      `<option value="${a.id}" ${card?.account_id === a.id ? 'selected' : ''}>${a.name}</option>`
    ).join('')}
                </select>
                <p class="text-xs text-slate-400 mt-1">
                  ต้องสร้างบัญชีประเภท "บัตรเครดิต" ในหน้า Accounts ก่อน
                </p>
              ` : `
                <div class="px-3 py-2.5 bg-amber-50 rounded-lg text-sm text-amber-700">
                  <i data-lucide="alert-triangle" class="w-4 h-4 inline mr-1"></i>
                  ไม่มีบัญชีบัตรเครดิตที่ว่าง —
                  <a href="#" onclick="event.preventDefault(); CreditCardsPage.closeModal(); navigate('accounts')"
                     class="underline font-medium">ไปสร้างบัญชีก่อน</a>
                </div>
              `}
            </div>
  
            <!-- ชื่อธนาคาร -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">ธนาคาร</label>
              <input type="text" id="cc-bank" value="${card?.bank_name || ''}"
                placeholder="เช่น กสิกร, กรุงเทพ, SCB"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
            </div>
  
            <!-- 4 ตัวท้าย -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">4 หลักท้ายของบัตร</label>
              <input type="text" id="cc-last4" value="${card?.last_four || ''}"
                placeholder="1234" maxlength="4" pattern="[0-9]{4}"
                oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4)"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono tracking-widest
                       focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
            </div>
  
            <!-- วงเงิน -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">วงเงิน</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">฿</span>
                <input type="number" id="cc-limit" step="1000" min="1"
                  value="${card?.credit_limit || ''}"
                  placeholder="50000"
                  class="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm font-number
                         focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
              </div>
            </div>
  
            <!-- วันตัดรอบ + วันครบกำหนด -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">วันตัดรอบ</label>
                <select id="cc-statement"
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                  ${Array.from({ length: 28 }, (_, i) => i + 1).map(d =>
      `<option value="${d}" ${card?.statement_date === d ? 'selected' : ''}>
                      วันที่ ${d}
                    </option>`
    ).join('')}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">วันครบกำหนดชำระ</label>
                <select id="cc-due"
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                  ${Array.from({ length: 28 }, (_, i) => i + 1).map(d =>
      `<option value="${d}" ${card?.due_date === d ? 'selected' : ''}>
                      วันที่ ${d}
                    </option>`
    ).join('')}
                </select>
              </div>
            </div>
  
            <!-- ดอกเบี้ย -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">ดอกเบี้ยต่อปี (%)</label>
              <input type="number" id="cc-interest" step="0.01" min="0"
                value="${card?.interest_rate || ''}"
                placeholder="18.00"
                class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-number
                       focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
            </div>
          </div>
  
          <!-- Footer -->
          <div class="sticky bottom-0 bg-white flex gap-3 p-5 border-t border-slate-100">
            <button onclick="CreditCardsPage.closeModal()"
              class="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm
                     font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              ยกเลิก
            </button>
            <button onclick="CreditCardsPage.save('${editId || ''}')"
              class="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm
                     font-medium text-white transition-colors active:scale-[0.98]">
              ${isEdit ? 'บันทึก' : 'เพิ่มบัตร'}
            </button>
          </div>
        </div>
      `;
    lucide.createIcons();
  },

  closeModal() {
    const modal = document.getElementById('cc-modal');
    modal.className = 'hidden fixed inset-0 z-50';
    modal.innerHTML = '';
  },

  // ===== SAVE =====

  async save(_editId) {
    Toast.show('Read-only mode — ไม่สามารถบันทึกข้อมูลได้', 'warning');
    this.closeModal();
    return;
  },

  async _save_disabled(editId) {
    const accountId = document.getElementById('cc-account')?.value;
    const bankName = document.getElementById('cc-bank').value.trim();
    const lastFour = document.getElementById('cc-last4').value.trim();
    const creditLimit = parseFloat(document.getElementById('cc-limit').value);
    const statementDate = parseInt(document.getElementById('cc-statement').value);
    const dueDate = parseInt(document.getElementById('cc-due').value);
    const interestRate = parseFloat(document.getElementById('cc-interest').value) || 0;

    // Validation
    if (!editId && !accountId) {
      Toast.show('กรุณาเลือกบัญชีบัตรเครดิต', 'error');
      return;
    }
    if (!bankName) {
      Toast.show('กรุณาใส่ชื่อธนาคาร', 'error');
      return;
    }
    if (lastFour && lastFour.length !== 4) {
      Toast.show('4 หลักท้ายของบัตรต้องมี 4 ตัวเลข', 'error');
      return;
    }
    if (!creditLimit || creditLimit <= 0) {
      Toast.show('กรุณาใส่วงเงิน', 'error');
      return;
    }

    const cardData = {
      bank_name: bankName,
      last_four: lastFour,
      credit_limit: creditLimit,
      statement_date: statementDate,
      due_date: dueDate,
      interest_rate: interestRate
    };

    let result;
    if (editId) {
      result = await DB.updateCreditCard(editId, cardData);
    } else {
      result = await DB.createCreditCard({
        ...cardData,
        user_id: this.userId,
        account_id: accountId
      });
    }

    if (result.error) {
      Toast.show('บันทึกไม่สำเร็จ: ' + result.error.message, 'error');
      return;
    }

    Toast.show(editId ? 'แก้ไขบัตรสำเร็จ' : 'เพิ่มบัตรสำเร็จ', 'success');
    this.closeModal();
    await this.refresh();
  },

  // ===== DELETE =====

  confirmDelete(id, bankName) {
    const modal = document.getElementById('cc-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="CreditCardsPage.closeModal()"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-sm modal-content p-6 text-center">
          <div class="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="alert-triangle" class="w-6 h-6 text-red-500"></i>
          </div>
          <h3 class="text-lg font-semibold text-slate-800 mb-2">ลบบัตร ${bankName}?</h3>
          <p class="text-sm text-slate-500 mb-6">เฉพาะข้อมูลบัตรจะถูกลบ บัญชีจะยังอยู่</p>
          <div class="flex gap-3">
            <button onclick="CreditCardsPage.closeModal()"
              class="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm
                     font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              ยกเลิก
            </button>
            <button onclick="CreditCardsPage.deleteCard('${id}')"
              class="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 rounded-lg text-sm
                     font-medium text-white transition-colors">
              ลบ
            </button>
          </div>
        </div>
      `;
    lucide.createIcons();
  },

  async deleteCard(_id) {
    Toast.show('Read-only mode — ไม่สามารถลบข้อมูลได้', 'warning');
    this.closeModal();
  },

  // ===== NAVIGATION & LAYOUT =====

  setSort(val) {
    if (this.sortBy === val) {
      this.toggleOrder();
      return;
    }
    this.sortBy = val;
    this.refresh();
  },

  toggleOrder() {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this.refresh();
  },

  toggleHidden() { this.showHidden = !this.showHidden; this.refresh(); },

  setGridCols(val) {
    this.cardsPerRow = parseInt(val);
    this.refresh();
  },

  _getAutoBankColor(bankName, userColor) {
    if (typeof getBrandColor === 'function') {
      return getBrandColor(bankName, userColor, null, Theme.palette().primary);
    }
    return userColor || Theme.palette().primary;
  },

  async viewTransactions(cardId) {
    // Filter transactions by credit card name (credit cards are not in the account table)
    const card = this.cards.find(c => String(c.id) === String(cardId) || String(c.account_id) === String(cardId));
    if (typeof TransactionsPage !== 'undefined') {
      TransactionsPage.resetContextFilters({
        search: card ? card.bank_name : '',
        showSearch: true,
        excludeCategories: ['CCARD_Manual_Bill', 'Transfer between accounts']
      });
    }
    navigate('transactions');
  },

  // ===== PAYMENT MODAL =====

  async openPaymentModal(_cardId) {
    Toast.show('Read-only mode — ไม่สามารถบันทึกข้อมูลได้', 'warning');
    return;
  },

  async _openPaymentModal_disabled(cardId) {
    const modal = document.getElementById('cc-modal');
    const card = this.cards.find(c => c.id === cardId);
    if (!card) return;

    const balance = Math.abs(parseFloat(card.accounts?.balance || 0));
    const sourceAccounts = this.accounts.filter(a => a.type !== 'credit_card');

    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="CreditCardsPage.closeModal()"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-md modal-content">
          <div class="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 class="text-lg font-semibold text-slate-800">
              จ่ายบิลบัตรเครดิต (${card.bank_name})
            </h2>
            <button onclick="CreditCardsPage.closeModal()" class="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
            </button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">จ่ายจากบัญชี</label>
              <select id="pay-source" class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                ${sourceAccounts.map(a => `<option value="${a.id}">${a.name} (คงเหลือ ฿${Math.round(a.balance).toLocaleString()})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">จำนวนเงิน</label>
              <input type="number" id="pay-amount" value="${balance}" min="1" class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-lg font-bold text-slate-800 font-number focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">วันที่ชำระ</label>
              <input type="date" id="pay-date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ (Note)</label>
              <input type="text" id="pay-note" value="จ่ายบิลบัตร ${card.bank_name}${card.last_four ? ' ' + card.last_four.slice(-2) : ''}" class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
          <div class="flex gap-3 p-5 border-t border-slate-100">
            <button onclick="CreditCardsPage.closeModal()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">ยกเลิก</button>
            <button onclick="CreditCardsPage.savePayment('${card.id}')" class="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white transition-colors">ยืนยันการชำระ</button>
          </div>
        </div>
      `;
    lucide.createIcons();
  },

  async savePayment(_cardId) {
    Toast.show('Read-only mode — ไม่สามารถบันทึกข้อมูลได้', 'warning');
    return;
  },

  async _savePayment_disabled(cardId) {
    const card = this.cards.find(c => c.id === cardId);
    const sourceId = document.getElementById('pay-source').value;
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const date = document.getElementById('pay-date').value;
    const note = document.getElementById('pay-note').value;

    if (!sourceId || !amount || amount <= 0) {
      Toast.show('ข้อมูลไม่ถูกต้อง', 'error');
      return;
    }

    // ตรวจสอบยอดเงินคงเหลือ
    const sourceAccount = this.accounts.find(a => a.id === sourceId);
    if (sourceAccount && parseFloat(sourceAccount.balance) < amount) {
      Toast.show('ยอดเงินในบัญชีต้นทางไม่เพียงพอ', 'error');
      return;
    }

    Toast.show('กำลังบันทึก...', 'info');

    // 1. หักเงินจากบัญชีต้นทาง (Expense)
    const expenseResult = await DB.createTransaction({
      user_id: this.userId,
      account_id: sourceId,
      category_id: null, // ไม่มีหมวดหมู่ หรืออาจจะหาหมวดหมู่ที่เหมาะสม
      amount: amount,
      type: 'expense',
      date: date,
      note: note
    });

    if (expenseResult.error) {
      Toast.show('เกิดข้อผิดพลาดในการตัดยอด', 'error');
      return;
    }

    // 2. เพิ่มเงินเข้าบัตรเครดิต (Income)
    const incomeResult = await DB.createTransaction({
      user_id: this.userId,
      account_id: card.account_id,
      category_id: null,
      amount: amount,
      type: 'income',
      date: date,
      note: note
    });

    if (incomeResult.error) {
      Toast.show('เกิดข้อผิดพลาดในการปรับยอดบัตร', 'error');
      return;
    }

    Toast.show('ชำระบิลสำเร็จ', 'success');
    this.closeModal();
    this.refresh();
  },

  // ===== REFRESH =====

  async refresh() {
    const container = document.getElementById('page-content');
    container.innerHTML = await this.render(this.userId);
    lucide.createIcons();
  }
};
