// ===================================================
// Schedules Component — จัดการรายการธุรกรรมล่วงหน้า
// ===================================================

const SchedulesPage = {
    userId: null,
    schedules: [],
    categories: [],
    accounts: [],

    async render(userId) {
        this.userId = userId;
        const [schedules, categories, accounts] = await Promise.all([
            DB.getSchedules(userId),
            DB.getCategories(userId),
            DB.getAccounts(userId)
        ]);
        this.schedules = schedules;
        this.categories = categories;
        this.accounts = accounts;

        return `
        <div class="page-transition">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 class="text-2xl font-bold text-slate-800">Schedules</h1>
              <p class="text-sm text-slate-500 mt-1">ตั้งค่ารายการธุรกรรมอัตโนมัติล่วงหน้า</p>
            </div>
            <button onclick="SchedulesPage.openModal()"
              class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-100">
              <i data-lucide="plus" class="w-4 h-4"></i>
              เพิ่มรายการล่วงหน้า
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${this.schedules.length === 0 ? this._renderEmptyState() : this.schedules.map(s => this._renderScheduleCard(s)).join('')}
          </div>
        </div>

        <!-- Modal -->
        <div id="schedule-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onclick="SchedulesPage.closeModal()"></div>
          <div id="schedule-modal-content" class="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <!-- Content will be injected here -->
          </div>
        </div>
      `;
    },

    _renderEmptyState() {
        return `
        <div class="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-100">
          <div class="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <i data-lucide="calendar-clock" class="w-10 h-10 opacity-20"></i>
          </div>
          <p class="text-lg font-medium">ยังไม่มีรายการล่วงหน้า</p>
          <p class="text-sm opacity-60">เริ่มต้นสร้างรายการอัตโนมัติเพื่อช่วยบันทึกรายจ่ายประจำของคุณ</p>
        </div>
      `;
    },

    _renderScheduleCard(s) {
        const cat = s.categories || { name: 'อื่นๆ', icon: 'tag', color: '#94a3b8' };
        const acc = s.accounts || { name: 'ไม่ทราบชื่อ' };
        const freqLabel = {
            'daily': 'ทุกวัน',
            'weekly': 'ทุกสัปดาห์',
            'monthly': 'ทุกเดือน',
            'yearly': 'ทุกปี'
        }[s.frequency] || s.frequency;

        return `
        <div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all group relative">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" 
                 style="background-color: ${cat.color}15; color: ${cat.color}">
              <i data-lucide="${cat.icon || 'tag'}" class="w-6 h-6"></i>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-slate-800 truncate">${s.note || cat.name}</h3>
              <p class="text-[11px] text-slate-400 flex items-center gap-1">
                <i data-lucide="landmark" class="w-3 h-3"></i> ${acc.name}
              </p>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold ${s.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}">
                ${s.type === 'income' ? '+' : '-'}${parseFloat(s.amount).toLocaleString()}
              </p>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase">
                ${freqLabel}
              </span>
            </div>
          </div>

          <div class="space-y-3 pt-3 border-t border-slate-50">
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-400">วันรันครั้งถัดไป:</span>
              <span class="font-bold text-slate-600">${s.next_run_date ? new Date(s.next_run_date).toLocaleDateString('th-TH') : 'สิ้นสุดแล้ว'}</span>
            </div>
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-2">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" ${s.is_active ? 'checked' : ''} class="sr-only peer" 
                         onchange="SchedulesPage.toggleActive('${s.id}', this.checked)">
                  <div class="w-8 h-4 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
                <span class="text-[10px] font-bold ${s.is_active ? 'text-indigo-600' : 'text-slate-400'} uppercase">
                  ${s.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
              <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="SchedulesPage.openModal('${s.id}')" class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                  <i data-lucide="pencil" class="w-4 h-4"></i>
                </button>
                <button onclick="SchedulesPage.confirmDelete('${s.id}')" class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    openModal(id = null) {
        const s = id ? this.schedules.find(x => x.id === id) : null;
        const isEdit = !!s;

        const modal = document.getElementById('schedule-modal');
        const content = document.getElementById('schedule-modal-content');
        modal.classList.remove('hidden');

        content.innerHTML = `
        <div class="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 class="text-xl font-bold text-slate-800">${isEdit ? 'แก้ไขรายการ' : 'เพิ่มรายการล่วงหน้า'}</h2>
          <button onclick="SchedulesPage.closeModal()" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
          </button>
        </div>
        
        <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div class="grid grid-cols-2 gap-3">
            <button onclick="SchedulesPage.setFormType('expense')" id="btn-type-expense"
              class="py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2
              ${(s?.type || 'expense') === 'expense' ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-slate-100 text-slate-400'}">
              <i data-lucide="trending-down" class="w-4 h-4"></i> รายจ่าย
            </button>
            <button onclick="SchedulesPage.setFormType('income')" id="btn-type-income"
              class="py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2
              ${s?.type === 'income' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-100 text-slate-400'}">
              <i data-lucide="trending-up" class="w-4 h-4"></i> รายรับ
            </button>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">จำนวนเงิน</label>
            <input type="number" id="s-amount" value="${s?.amount || ''}" placeholder="0.00"
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-number">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">หมวดหมู่</label>
              <select id="s-category" class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none transition-all">
                ${this._renderCategoryOptions(s?.type || 'expense', s?.category_id)}
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">บัญชี</label>
              <select id="s-account" class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none transition-all">
                ${this.accounts.map(a => `<option value="${a.id}" ${s?.account_id === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">ความถี่</label>
            <select id="s-frequency" class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none transition-all">
              <option value="daily" ${s?.frequency === 'daily' ? 'selected' : ''}>ทุกวัน</option>
              <option value="weekly" ${s?.frequency === 'weekly' ? 'selected' : ''}>ทุกสัปดาห์</option>
              <option value="monthly" ${(s?.frequency || 'monthly') === 'monthly' ? 'selected' : ''}>ทุกเดือน</option>
              <option value="yearly" ${s?.frequency === 'yearly' ? 'selected' : ''}>ทุกปี</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">วันรันครั้งถัดไป</label>
              <input type="date" id="s-next-run" value="${s?.next_run_date || new Date().toISOString().split('T')[0]}"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none transition-all">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">สิ้นสุดวันที่ (Optional)</label>
              <input type="date" id="s-end-date" value="${s?.end_date || ''}"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none transition-all">
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">หมายเหตุ</label>
            <input type="text" id="s-note" value="${s?.note || ''}" placeholder="เช่น ค่าเช่าหอพัก, Netflix"
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none transition-all">
          </div>
          
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">โอนให้/รับจาก</label>
            <input type="text" id="s-fromto" value="${s?.from_or_to || ''}" placeholder="ชื่อบุคคลหรือร้านค้า"
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none transition-all">
          </div>
        </div>

        <div class="p-6 border-t border-slate-100 flex gap-3">
          <button onclick="SchedulesPage.closeModal()" class="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">ยกเลิก</button>
          <button onclick="SchedulesPage.save('${id || ''}')" class="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95">
            ${isEdit ? 'บันทึกการแก้ไข' : 'สร้างรายการ'}
          </button>
        </div>
      `;
        lucide.createIcons();
    },

    setFormType(type) {
        const btnExp = document.getElementById('btn-type-expense');
        const btnInc = document.getElementById('btn-type-income');
        const catSelect = document.getElementById('s-category');

        if (type === 'expense') {
            btnExp.className = 'py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 border-rose-500 bg-rose-50 text-rose-600';
            btnInc.className = 'py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 border-slate-100 text-slate-400';
        } else {
            btnExp.className = 'py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 border-slate-100 text-slate-400';
            btnInc.className = 'py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 border-emerald-500 bg-emerald-50 text-emerald-600';
        }

        catSelect.innerHTML = this._renderCategoryOptions(type);
    },

    _renderCategoryOptions(type, selectedId = null) {
        const typeCats = this.categories.filter(c => c.type === type);
        const tree = DB.buildCategoryTree(typeCats);
        return tree.map(root => {
            if (root.children && root.children.length > 0) {
                return `
            <optgroup label="${root.name}">
              <option value="${root.id}" ${selectedId === root.id ? 'selected' : ''}>${root.name} (ทั้งหมวด)</option>
              ${root.children.map(sub => `<option value="${sub.id}" ${selectedId === sub.id ? 'selected' : ''}>  └ ${sub.name}</option>`).join('')}
            </optgroup>
          `;
            }
            return `<option value="${root.id}" ${selectedId === root.id ? 'selected' : ''}>${root.name}</option>`;
        }).join('');
    },

    closeModal() {
        document.getElementById('schedule-modal').classList.add('hidden');
    },

    async save(id) {
        const data = {
            user_id: this.userId,
            type: document.getElementById('btn-type-income').classList.contains('border-emerald-500') ? 'income' : 'expense',
            amount: parseFloat(document.getElementById('s-amount').value || 0),
            category_id: document.getElementById('s-category').value,
            account_id: document.getElementById('s-account').value,
            frequency: document.getElementById('s-frequency').value,
            next_run_date: document.getElementById('s-next-run').value,
            end_date: document.getElementById('s-end-date').value || null,
            note: document.getElementById('s-note').value.trim(),
            from_or_to: document.getElementById('s-fromto').value.trim(),
            is_active: true
        };

        if (data.amount <= 0) return Toast.show('กรุณาระบุจำนวนเงิน', 'warning');
        if (!data.next_run_date) return Toast.show('กรุณาระบุวันที่เริ่มรัน', 'warning');

        Toast.show('กำลังบันทึก...', 'info');
        const res = id ? await DB.updateSchedule(id, data) : await DB.createSchedule(data);

        if (res.error) {
            Toast.show('ไม่สามารถบันทึกได้', 'error');
        } else {
            Toast.show('บันทึกรายการล่วงหน้าเรียบร้อย', 'success');
            this.closeModal();
            const content = document.getElementById('page-content');
            content.innerHTML = await this.render(this.userId);
            lucide.createIcons();
        }
    },

    async toggleActive(id, isActive) {
        const { error } = await DB.updateSchedule(id, { is_active: isActive });
        if (error) {
            Toast.show('ไม่สามารถเปลี่ยนสถานะได้', 'error');
        } else {
            Toast.show(isActive ? 'เริ่มใช้งานรายการล่วงหน้า' : 'ปิดการใช้งานรายการล่วงหน้า', 'success');
        }
    },

    async confirmDelete(id) {
        if (!confirm('ยืนยันการลบรายการล่วงหน้านี้?')) return;
        const { error } = await DB.deleteSchedule(id);
        if (error) {
            Toast.show('ไม่สามารถลบได้', 'error');
        } else {
            Toast.show('ลบรายการเรียบร้อย', 'success');
            const content = document.getElementById('page-content');
            content.innerHTML = await this.render(this.userId);
            lucide.createIcons();
        }
    }
};
