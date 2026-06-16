// ===================================================
// Settings Component — ตั้งค่า + จัดการหมวดหมู่
// ===================================================

const SettingsPage = {
  _safeIcon(icon) {
    if (!icon || icon === 'interest') return 'badge-percent';
    return icon;
  },
  categories: [],
  accounts: [],
  userId: null,
  activeTab: 'profile', // เปลี่ยนเป็น Profile เป็นค่าเริ่มต้น
  activeAccountTab: 'accounts', // accounts, investments, creditcards
  activeCategoryTab: 'expense', // expense, income
  showDefaultCategories: true, // แสดงหมวดหมู่เริ่มต้นหรือไม่
  _pwaListenerAttached: false,

  _canInstallApp() {
    return !!window.PWAInstallPrompt?.canInstall;
  },

  async installPwaApp() {
    const installState = window.PWAInstallPrompt;
    if (!installState?.event) {
      Toast.show('ยังไม่พร้อมติดตั้งแอปใน browser นี้', 'error');
      return;
    }

    installState.event.prompt();
    const choice = await installState.event.userChoice.catch(() => null);
    installState.event = null;
    installState.canInstall = false;

    if (choice?.outcome === 'accepted') {
      Toast.show('ติดตั้งแอปสำเร็จ', 'success');
    } else {
      Toast.show('ยกเลิกการติดตั้งแอป', 'info');
    }

    if (this.activeTab === 'profile') {
      document.getElementById('settings-content').innerHTML = await this._renderTab(await DB.getProfile(this.userId));
      lucide.createIcons();
    }
  },

  _attachPwaListeners() {
    if (this._pwaListenerAttached) return;
    this._pwaListenerAttached = true;

    const rerender = async () => {
      if (this.activeTab !== 'profile') return;
      const profile = await DB.getProfile(this.userId);
      const content = document.getElementById('settings-content');
      if (!content) return;
      content.innerHTML = await this._renderTab(profile);
      lucide.createIcons();
    };

    window.addEventListener('pwa-install-available', rerender);
    window.addEventListener('pwa-install-changed', rerender);
  },

  // ===== RENDER หน้าหลัก =====

  async render(userId) {
    this.userId = userId;
    this._attachPwaListeners();
    const [categories, accounts, profile] = await Promise.all([
      DB.getCategories(userId),
      DB.getAccounts(userId),
      DB.getProfile(userId)
    ]);
    this.categories = categories;
    this.accounts = accounts;

    return `
        <div class="page-transition">
          <!-- Header -->
          <div class="mb-6 flex items-center justify-between gap-2 sm:gap-4">
            <div class="min-w-0">
              <h1 class="text-xl sm:text-2xl font-bold text-slate-800 truncate">Settings</h1>
              <p class="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">ตั้งค่าโปรไฟล์และหมวดหมู่</p>
            </div>
            ${this._canInstallApp() ? `
            <button
              onclick="SettingsPage.installPwaApp()"
              class="inline-flex items-center justify-center shrink-0 w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-50 sm:bg-slate-900 text-blue-600 sm:text-white hover:bg-blue-100 sm:hover:bg-slate-800 transition-all"
              title="Install App"
              aria-label="Install App">
              <i data-lucide="download" class="w-3.5 h-3.5 sm:w-5 sm:h-5"></i>
            </button>
            ` : ''}
          </div>
  
          <!-- Tabs -->
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit overflow-x-auto max-w-full">
            <button onclick="SettingsPage.switchTab('profile')"
              data-tab="profile"
              class="settings-tab px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                     ${this.activeTab === 'profile' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
              โปรไฟล์
            </button>
            <button onclick="SettingsPage.switchTab('categories')"
              data-tab="categories"
              class="settings-tab px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                     ${this.activeTab === 'categories' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
              หมวดหมู่
            </button>
            <button onclick="SettingsPage.switchTab('accounts')"
              data-tab="accounts"
              class="settings-tab px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                     ${this.activeTab === 'accounts' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
              บัญชี
            </button>
            <button onclick="SettingsPage.switchTab('templates')"
              data-tab="templates"
              class="settings-tab px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                     ${this.activeTab === 'templates' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
              เทมเพลต
            </button>
            <button onclick="SettingsPage.switchTab('data_management')"
              data-tab="data_management"
              class="settings-tab px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                     ${this.activeTab === 'data_management' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
              จัดการข้อมูล
            </button>
          </div>
  
          <!-- Tab Content -->
          <div id="settings-content">
            ${await this._renderTab(profile)}
          </div>
        </div>
      `;
  },

  // ===== TAB SWITCHER =====

  async switchTab(tab) {
    this.activeTab = tab;
    const profile = await DB.getProfile(this.userId);

    // อัพเดท tab buttons
    document.querySelectorAll('.settings-tab').forEach(btn => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('bg-white', isActive);
      btn.classList.toggle('text-slate-800', isActive);
      btn.classList.toggle('shadow-sm', isActive);
      btn.classList.toggle('text-slate-500', !isActive);
    });

    document.getElementById('settings-content').innerHTML = await this._renderTab(profile);
    lucide.createIcons();
  },

  async _renderTab(profile) {
    switch (this.activeTab) {
      case 'categories': return this._renderCategories();
      case 'accounts': return await this._renderAccounts();
      case 'templates': return this._renderTemplates();
      case 'profile': return this._renderProfile(profile);
      case 'data_management': return this._renderDataManagement();
      default: return this._renderCategories();
    }
  },

  // ===== TAB: CATEGORIES =====

  _renderCategories() {
    let filteredCategories = this.categories;
    if (!this.showDefaultCategories) {
      filteredCategories = filteredCategories.filter(c => !c.is_default);
    }

    const expenseCats = filteredCategories.filter(c => c.type === 'expense');
    const incomeCats = filteredCategories.filter(c => c.type === 'income');
    const expenseTree = DB.buildCategoryTree(expenseCats);
    const incomeTree = DB.buildCategoryTree(incomeCats);

    const activeTree = this.activeCategoryTab === 'expense' ? expenseTree : incomeTree;
    const typeLabel = this.activeCategoryTab === 'expense' ? 'รายจ่าย' : 'รายรับ';
    const typeColor = this.activeCategoryTab === 'expense' ? 'red' : 'emerald';

    const renderTree = (tree, type) => tree.map(root => {
      const children = root.children || [];
      return `
      <div class="border-b border-slate-50 last:border-0">
        <!-- Root row -->
        <div class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
               style="background-color: ${root.color}15; color: ${root.color}">
            <i data-lucide="${this._safeIcon(root.icon)}" class="w-5 h-5"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-slate-700">${root.name}</span>
              ${root.is_default ? '<span class="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">ค่าเริ่มต้น</span>' : ''}
            </div>
            <p class="text-[10px] text-slate-400">${children.length} หมวดย่อย</p>
          </div>
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onclick="SettingsPage.openSubCategoryModal('${root.id}', '${type}')"
              class="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="เพิ่มหมวดย่อย">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="SettingsPage.openCategoryModal('${type}', null, '${root.id}')"
              class="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
              title="แก้ไข">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            ${!root.is_default ? `
              <button onclick="SettingsPage.deleteCategory('${root.id}', '${root.name.replace(/'/g, "\\'")}')"
                class="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                title="ลบ">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
          </div>
        </div>
        <!-- Sub-category rows -->
        ${children.length > 0 ? `
          <div class="ml-12 border-l-2 border-slate-100">
            ${children.map((sub, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === children.length - 1;
        return `
              <div class="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors group border-b border-slate-50 last:border-0">
                <!-- Move arrows -->
                <div class="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                   <button onclick="SettingsPage.moveSubCategoryOrder('${sub.id}', -1)" ${isFirst ? 'disabled class="opacity-20"' : 'class="text-slate-400 hover:text-blue-500"'}><i data-lucide="chevron-up" class="w-3 h-3"></i></button>
                   <button onclick="SettingsPage.moveSubCategoryOrder('${sub.id}', 1)" ${isLast ? 'disabled class="opacity-20"' : 'class="text-slate-400 hover:text-blue-500"'}><i data-lucide="chevron-down" class="w-3 h-3"></i></button>
                </div>
                <div class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                     style="background-color: ${sub.color}15; color: ${sub.color}">
                  <i data-lucide="${this._safeIcon(sub.icon)}" class="w-3.5 h-3.5"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm text-slate-600">${sub.name}</span>
                  ${sub.is_default ? '<span class="ml-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">ค่าเริ่มต้น</span>' : ''}
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onclick="SettingsPage.openCategoryModal('${type}', '${sub.parent_id}', '${sub.id}')"
                    class="p-1 text-slate-400 hover:text-blue-500 transition-colors rounded">
                    <i data-lucide="pencil" class="w-3 h-3"></i>
                  </button>
                  ${!sub.is_default ? `
                    <button onclick="SettingsPage.deleteCategory('${sub.id}', '${sub.name.replace(/'/g, "\\'")}')"
                      class="p-1 text-slate-300 hover:text-red-400 transition-colors rounded">
                      <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
                  ` : ''}
                </div>
              </div>
              `;
      }).join('')}
          </div>
        ` : ''}
      </div>
      `;
    }).join('');

    return `
        <div class="space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <!-- Sub-tabs -->
            <div class="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
              <button onclick="SettingsPage.switchCategoryTab('expense')"
                class="px-4 py-2 rounded-lg text-sm font-bold transition-all ${this.activeCategoryTab === 'expense' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500 hover:text-slate-700'}">
                หมวดหมู่รายจ่าย
              </button>
              <button onclick="SettingsPage.switchCategoryTab('income')"
                class="px-4 py-2 rounded-lg text-sm font-bold transition-all ${this.activeCategoryTab === 'income' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}">
                หมวดหมู่รายรับ
              </button>
            </div>

            <!-- Options -->
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer group">
                <div class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" ${this.showDefaultCategories ? 'checked' : ''} 
                         class="sr-only peer" onchange="SettingsPage.toggleDefaultCategories()">
                  <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </div>
                <span class="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">แสดงค่าเริ่มต้น</span>
              </label>

              <button onclick="SettingsPage.openCategoryModal('${this.activeCategoryTab}')"
                class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm">
                <i data-lucide="plus" class="w-4 h-4"></i>
                เพิ่มหมวดหลัก
              </button>
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div class="p-5 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-${typeColor}-50 flex items-center justify-center">
                  <i data-lucide="${this.activeCategoryTab === 'expense' ? 'trending-down' : 'trending-up'}" class="w-4 h-4 text-${typeColor}-500"></i>
                </div>
                <h3 class="font-bold text-slate-800">${typeLabel}</h3>
                <span class="text-xs text-slate-400 bg-white border border-slate-100 px-2 py-0.5 rounded-full">
                  ${activeTree.length} หมวดหลัก
                </span>
              </div>
            </div>
            <div class="divide-y divide-slate-50">${renderTree(activeTree, this.activeCategoryTab)}</div>
          </div>
        </div>
      `;
  },

  // ===== TAB: PROFILE =====

  _renderProfile(profile) {
    const menuPrefs = JSON.parse(localStorage.getItem('MENU_PREFS') || '{}');
    const menus = [
      { id: 'dashboard', name: 'Overview', icon: 'layout-dashboard' },
      { id: 'transactions', name: 'Transactions', icon: 'arrow-left-right' },
      { id: 'accounts', name: 'Accounts', icon: 'landmark' },
      { id: 'investments', name: 'Investments', icon: 'trending-up' },
      { id: 'creditcards', name: 'Credit Cards', icon: 'credit-card' },
      { id: 'budgets', name: 'Budgets', icon: 'target' },
      { id: 'schedules', name: 'Schedules', icon: 'calendar-clock' },
      { id: 'reports', name: 'Reports', icon: 'bar-chart-2' }
    ];

    return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- ข้อมูลส่วนตัว -->
          <div class="bg-white rounded-2xl shadow-sm p-6 border border-slate-100">
            <h3 class="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
              <i data-lucide="user" class="w-4 h-4 text-blue-500"></i> ข้อมูลส่วนตัว
            </h3>
            
            <div class="flex items-center gap-4 mb-8">
              <img src="${profile?.avatar_url || ''}" alt="avatar"
                   class="w-16 h-16 rounded-full bg-slate-200 object-cover ring-4 ring-slate-50">
              <div>
                <h3 class="font-bold text-slate-800 text-lg">${profile?.full_name || 'User'}</h3>
                <p class="text-xs text-slate-400">${profile?.email || ''}</p>
              </div>
            </div>
    
            <div class="space-y-5">
              <div>
                <label class="block text-xs font-bold text-slate-400 mb-2 uppercase">ชื่อที่แสดง</label>
                <input type="text" id="profile-name" value="${profile?.full_name || ''}"
                  class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-400 mb-2 uppercase">สกุลเงินหลัก</label>
                <select id="profile-currency"
                  class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none bg-white">
                  <option value="THB" ${profile?.currency === 'THB' ? 'selected' : ''}>🇹🇭 THB (บาท)</option>
                  <option value="USD" ${profile?.currency === 'USD' ? 'selected' : ''}>🇺🇸 USD (ดอลลาร์)</option>
                  <option value="EUR" ${profile?.currency === 'EUR' ? 'selected' : ''}>🇪🇺 EUR (ยูโร)</option>
                </select>
              </div>
              <button onclick="SettingsPage.saveProfile()"
                class="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700
                       text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-100">
                <i data-lucide="save" class="w-4 h-4"></i> บันทึกข้อมูลโปรไฟล์
              </button>
            </div>
          </div>

          <!-- การตั้งค่าเมนู -->
          <div class="bg-white rounded-2xl shadow-sm p-6 border border-slate-100">
            <h3 class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
              <i data-lucide="layout" class="w-4 h-4 text-emerald-500"></i> เมนูหลักที่แสดงผล
            </h3>
            <p class="text-[11px] text-slate-400 mb-6 uppercase tracking-wider font-semibold">เลือกเมนูที่ต้องการให้แสดงบนแถบข้าง</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${menus.map(menu => {
      const isVisible = menuPrefs[menu.id] !== false; // Default is true
      return `
                  <label class="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-all group">
                    <input type="checkbox" 
                           ${isVisible ? 'checked' : ''} 
                           onchange="SettingsPage.toggleMenuPref('${menu.id}', this.checked)"
                           class="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500">
                    <div class="flex flex-col">
                      <span class="text-sm font-bold text-slate-700 group-hover:text-slate-900">${menu.name}</span>
                    </div>
                  </label>
                `;
    }).join('')}
            </div>

            <div class="mt-6 p-4 bg-emerald-50 rounded-xl">
              <p class="text-[11px] text-emerald-700 leading-relaxed">
                <b>💡 คำแนะนำ:</b> คุณสามารถซ่อนเมนูที่ไม่ได้ใช้งานประจำเพื่อให้แถบเมนูสะอาดตาขึ้น และสามารถกลับมาเปิดใหม่ได้ตลอดเวลา
              </p>
            </div>
          </div>

          <!-- การตั้งค่ารายงาน -->
          <div class="bg-white rounded-2xl shadow-sm p-6 border border-slate-100 lg:col-span-2">
            <h3 class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
              <i data-lucide="line-chart" class="w-4 h-4 text-purple-500"></i> ตั้งค่ารายงาน
            </h3>
            <div class="flex items-center justify-between mb-6">
                <p class="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">เลือกหมวดหมู่รายรับสำหรับกราฟแนวโน้ม</p>
                <button onclick="SettingsPage.resetReportIncomeCatSelection()" class="inline-flex items-center justify-center w-9 h-9 rounded-xl text-blue-500 hover:bg-blue-50 transition-colors" title="รีเซ็ต" aria-label="รีเซ็ต">
                  <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                </button>
            </div>
            <div id="report-income-cat-list" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              ${this._renderReportIncomeCatSelector()}
            </div>
          </div>
        </div>
      `;
  },

  _renderReportIncomeCatSelector() {
      const incomeCats = this.categories.filter(c => c.type === 'income');
      const incomeTree = DB.buildCategoryTree(incomeCats);
      const selectedIds = JSON.parse(localStorage.getItem('REPORT_INCOME_TREND_CATS') || '[]');

      const subCategoryGroups = incomeTree.filter(root => root.children && root.children.length > 0);

      if (subCategoryGroups.length === 0) {
          return `
            <div class="col-span-full text-center py-8 text-slate-400 text-sm">
                ไม่มีหมวดหมู่ย่อยประเภทรายรับ<br>
                <a href="#" onclick="SettingsPage.switchTab('categories')" class="text-blue-500 hover:underline">สร้างหมวดหมู่ย่อยก่อน</a>
            </div>
          `;
      }

      return subCategoryGroups.map((root, groupIndex) => {
          const childrenHtml = root.children.map(sub => {
              const isSelected = selectedIds.includes(sub.id);
              return `
                  <label class="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-all group">
                      <input type="checkbox" 
                             ${isSelected ? 'checked' : ''} 
                             onchange="SettingsPage.toggleReportIncomeCat('${sub.id}', this.checked)"
                             class="w-5 h-5 rounded border-slate-300 text-purple-500 focus:ring-purple-500">
                      <div class="flex items-center gap-2 min-w-0">
                          <div class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style="background-color:${sub.color}15">
                              <i data-lucide="${this._safeIcon(sub.icon)}" class="w-3.5 h-3.5" style="color:${sub.color}"></i>
                          </div>
                          <span class="text-sm font-bold text-slate-700 group-hover:text-slate-900 truncate">${sub.name}</span>
                      </div>
                  </label>
              `;
          }).join('');

          return `
            <div class="col-span-1 sm:col-span-2 md:col-span-3">
                <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ${groupIndex > 0 ? 'mt-4' : ''} px-1">${root.name}</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    ${childrenHtml}
                </div>
            </div>
          `;
      }).join('');
  },

  refreshReportIncomeCatSelector() {
      const container = document.getElementById('report-income-cat-list');
      if (container) {
          container.innerHTML = this._renderReportIncomeCatSelector();
          lucide.createIcons();
      }
  },

  async saveProfile() {
    const fullName = document.getElementById('profile-name').value.trim();
    const currency = document.getElementById('profile-currency').value;

    const { error } = await DB.updateProfile(this.userId, {
      full_name: fullName,
      currency: currency
    });

    if (error) {
      Toast.show('บันทึกไม่สำเร็จ', 'error');
      return;
    }

    // อัพเดทชื่อที่ sidebar ด้วย
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = fullName;
    Toast.show('บันทึกโปรไฟล์สำเร็จ', 'success');
  },

  toggleMenuPref(menuId, isVisible) {
    const menuPrefs = JSON.parse(localStorage.getItem('MENU_PREFS') || '{}');
    menuPrefs[menuId] = isVisible;
    localStorage.setItem('MENU_PREFS', JSON.stringify(menuPrefs));

    // อัพเดท sidebar ทันที
    if (window.applyMenuVisibility) {
      window.applyMenuVisibility();
    }
  },

  toggleReportIncomeCat(categoryId, isChecked) {
      let selectedIds = JSON.parse(localStorage.getItem('REPORT_INCOME_TREND_CATS') || '[]');
      
      if (isChecked) {
          if (!selectedIds.includes(categoryId)) {
              selectedIds.push(categoryId);
          }
      } else {
          selectedIds = selectedIds.filter(id => id !== categoryId);
      }

      localStorage.setItem('REPORT_INCOME_TREND_CATS', JSON.stringify(selectedIds));
      this.refreshReportIncomeCatSelector();
  },

  resetReportIncomeCatSelection() {
      localStorage.removeItem('REPORT_INCOME_TREND_CATS');
      this.refreshReportIncomeCatSelector();
      Toast.show('รีเซ็ตการตั้งค่ารายงานแล้ว', 'success');
  },

  // ===== TAB: ACCOUNTS MANAGEMENT =====

  async _renderAccounts() {
    // โหลดข้อมูลทั้งหมด
    const [allAccounts, allCards] = await Promise.all([
      DB.getAccounts(this.userId),
      DB.getCreditCards(this.userId)
    ]);

    const accounts = allAccounts.filter(a => !['investment', 'mutual_fund', 'stock', 'gold', 'credit_card'].includes(a.type));
    const investments = allAccounts.filter(a => ['investment', 'mutual_fund', 'stock', 'gold'].includes(a.type));
    const creditcards = allCards;

    const RESET_PWD = '12345'; // รหัสผ่านสำหรับล้างข้อมูล

    // Helper function สำหรับ render ตาราง
    const renderTable = (items, type) => {
      // เรียงตาม order ที่ตั้งไว้ (เก็บใน localStorage: window.AccountPrefs)
      const getPrefs = (id) => (window.AccountPrefs ? window.AccountPrefs.get(id) : { hidden: false, excludeSum: false, order: 999 });
      items.sort((a, b) => getPrefs(a.id).order - getPrefs(b.id).order);

      if (items.length === 0) {
        return `<div class="p-8 text-center text-slate-500">ไม่มีข้อมูล</div>`;
      }

      return `
        <div class="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-100">
          <table class="w-full text-sm text-left">
            <thead class="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th class="px-4 py-3 w-10">#</th>
                <th class="px-4 py-3 min-w-[150px]">ชื่อบัญชี</th>
                <th class="px-4 py-3">แสดงผล</th>
                <th class="px-4 py-3">ยอดรวม</th>
                <th class="px-4 py-3 min-w-[120px]">ยอดปัจจุบัน</th>
                ${type !== 'creditcards' ? `<th class="px-4 py-3 min-w-[120px]">ยอดเริ่มต้น</th>` : ''}
                <th class="px-4 py-3 text-right min-w-[150px]">จัดการ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${items.map((item, index) => {
        const prefs = getPrefs(item.id);
        const isFirst = index === 0;
        const isLast = index === items.length - 1;
        const name = type === 'creditcards' ? item.bank_name : item.name;
        const balance = type === 'creditcards' ? Math.abs(item.accounts?.balance || 0) : item.balance;
        const accId = type === 'creditcards' ? item.account_id : item.id; // account table ID for syncing balance

        return `
                <tr>
                  <td class="px-4 py-3">
                    <div class="flex flex-col gap-1">
                      <button onclick="SettingsPage.moveItemOrder('${item.id}', -1)" ${isFirst ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="hover:text-blue-600"'}><i data-lucide="chevron-up" class="w-4 h-4"></i></button>
                      <button onclick="SettingsPage.moveItemOrder('${item.id}', 1)" ${isLast ? 'disabled class="opacity-30 cursor-not-allowed"' : 'class="hover:text-blue-600"'}><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
                    </div>
                  </td>
                  <td class="px-4 py-3 font-medium text-slate-700">
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 rounded-full" style="background-color: ${item.color || (item.accounts?.color) || '#cbd5e1'}"></div>
                      <span class="truncate">${name}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" ${!prefs.hidden ? 'checked' : ''} class="sr-only peer" onchange="SettingsPage.togglePref('${item.id}', 'hidden', !this.checked)">
                      <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </td>
                  <td class="px-4 py-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" ${!prefs.excludeSum ? 'checked' : ''} class="sr-only peer" onchange="SettingsPage.togglePref('${item.id}', 'excludeSum', !this.checked)">
                      <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                  </td>
                  <td class="px-4 py-3">
                    <input type="number" step="0.01" value="${balance}" 
                      id="acc-balance-${accId}"
                      class="w-full max-w-[100px] px-2 py-1 border border-slate-200 rounded text-sm text-right font-number">
                  </td>
                  ${type !== 'creditcards' ? `
                  <td class="px-4 py-3">
                    <input type="number" step="0.01" value="${item.initial_balance || 0}" 
                      id="acc-initial-${accId}"
                      class="w-full max-w-[100px] px-2 py-1 border border-slate-200 rounded text-sm text-right font-number">
                  </td>
                  ` : ''}
                  <td class="px-4 py-3 text-right">
                    <div class="flex justify-end items-center gap-1">
                      <button onclick="SettingsPage.updateBalance('${accId}')"
                        class="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors" title="อัพเดทข้อมูลเงิน">
                        <i data-lucide="save" class="w-4 h-4"></i>
                      </button>
                      <button onclick="SettingsPage.syncBalance('${accId}')"
                        class="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition-colors" title="คำนวณใหม่จากธุรกรรม">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                      </button>
                      <button onclick="${type === 'accounts' ? `AccountsPage.openModal('${item.id}')` : type === 'investments' ? `InvestmentsPage.openModal('${item.id}')` : `CreditCardsPage.openModal('${item.id}')`}"
                        class="p-1.5 bg-slate-50 text-slate-600 rounded hover:bg-slate-200 transition-colors" title="แก้ไขรายละเอียด">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                      </button>
                      <button onclick="${type === 'accounts' ? `AccountsPage.confirmDelete('${item.id}', '${name}')` : type === 'investments' ? `InvestmentsPage.confirmDelete('${item.id}', '${name}')` : `CreditCardsPage.confirmDelete('${item.id}', '${name}')`}"
                        class="p-1.5 bg-rose-50 text-rose-600 rounded hover:bg-rose-100 transition-colors" title="ลบ">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                    </div>
                  </td>
                </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      `;
    };

    let contentHtml = '';
    if (this.activeAccountTab === 'accounts') contentHtml = renderTable(accounts, 'accounts');
    if (this.activeAccountTab === 'investments') contentHtml = renderTable(investments, 'investments');
    if (this.activeAccountTab === 'creditcards') contentHtml = renderTable(creditcards, 'creditcards');

    return `
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <!-- Sub-tabs -->
            <div class="flex gap-2 bg-slate-100 p-1 rounded-xl">
              <button onclick="SettingsPage.switchAccountTab('accounts')"
                class="px-4 py-2 rounded-lg text-sm font-bold transition-all ${this.activeAccountTab === 'accounts' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}">
                บัญชีเงินฝาก
              </button>
              <button onclick="SettingsPage.switchAccountTab('investments')"
                class="px-4 py-2 rounded-lg text-sm font-bold transition-all ${this.activeAccountTab === 'investments' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}">
                การลงทุน
              </button>
              <button onclick="SettingsPage.switchAccountTab('creditcards')"
                class="px-4 py-2 rounded-lg text-sm font-bold transition-all ${this.activeAccountTab === 'creditcards' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}">
                บัตรเครดิต
              </button>
            </div>
            
            <div class="flex gap-2">
              <button onclick="${this.activeAccountTab === 'accounts' ? 'AccountsPage.openModal()' : this.activeAccountTab === 'investments' ? 'InvestmentsPage.openModal()' : 'CreditCardsPage.openModal()'}"
                class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm">
                <i data-lucide="plus" class="w-4 h-4"></i>
                เพิ่มใหม่
              </button>
            </div>
          </div>

          <!-- Description Box -->
          <div class="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
            <h4 class="text-sm font-bold text-blue-800 mb-2">การตั้งค่าบัญชี</h4>
            <ul class="text-xs text-blue-600/80 space-y-1 list-disc list-inside">
              <li><strong>แสดงผล</strong>: ปิดหากไม่ต้องการให้โชว์เป็นหน้าการ์ดในเมนูหลัก</li>
              <li><strong>ยอดรวม</strong>: ปิดหากไม่ต้องการให้ยอดเงินนี้ไปคำนวณในภาพรวม (Overview)</li>
              <li>ลูกศร ⬆️ ⬇️ เพื่อจัดเรียงลำดับการแสดงผล</li>
            </ul>
          </div>

          <!-- Table Content -->
          ${contentHtml}

          <!-- Footer Actions -->
          <div class="mt-6 pt-4 flex justify-between items-center">
            <div class="flex items-center gap-4">
              <button onclick="SettingsPage.syncAll()"
                class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                คำนวณใหม่ทุกบัญชี (Sync)
              </button>
            </div>
          </div>
        </div>
      `;
  },

  switchAccountTab(tab) {
    this.activeAccountTab = tab;
    this.switchTab('accounts'); // รีเรนเดอร์แท็บนี้ใหม่
  },

  switchCategoryTab(tab) {
    this.activeCategoryTab = tab;
    this.switchTab('categories');
  },

  toggleDefaultCategories() {
    this.showDefaultCategories = !this.showDefaultCategories;
    this.switchTab('categories');
  },

  togglePref(id, key, value) {
    if (window.AccountPrefs) {
      const prefs = window.AccountPrefs.get(id);
      prefs[key] = value;
      window.AccountPrefs.set(id, prefs);

      // อัพเดท Overview ทันทีถ้ามีการเปิดปิด Sum
      if (typeof OverviewPage !== 'undefined' && typeof OverviewPage.refresh === 'function') {
        setTimeout(() => OverviewPage.refresh(), 100);
      }
    }
  },

  // ===== TAB: DATA MANAGEMENT (Unified) =====

  _renderDataManagement() {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
        
        <!-- 1. CSV Import/Export -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div class="p-5 border-b border-slate-50 bg-slate-50/50">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <i data-lucide="file-spreadsheet" class="w-5 h-5 text-emerald-600"></i>
              </div>
              <div>
                <h3 class="font-bold text-slate-800">1. นำเข้า/ส่งออก (CSV)</h3>
                <p class="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Data Transfer (Excel)</p>
              </div>
            </div>
          </div>
          
          <div class="p-6 space-y-6">
            <!-- Data Selection -->
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-3 uppercase">ประเภทข้อมูลที่ต้องการจัดการ</label>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label class="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                  <input type="checkbox" id="csv-type-categories" class="w-4 h-4 rounded text-blue-500 border-slate-300">
                  <span class="text-sm font-medium text-slate-600">หมวดหมู่</span>
                </label>
                <label class="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                  <input type="checkbox" id="csv-type-accounts" class="w-4 h-4 rounded text-blue-500 border-slate-300">
                  <span class="text-sm font-medium text-slate-600">บัญชี</span>
                </label>
                <label class="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                  <input type="checkbox" id="csv-type-transactions" checked class="w-4 h-4 rounded text-blue-500 border-slate-300">
                  <span class="text-sm font-medium text-slate-600">ธุรกรรม</span>
                </label>
              </div>
            </div>

            <!-- Export Section -->
            <div class="pt-4 border-t border-slate-100">
              <h4 class="text-sm font-bold text-slate-700 mb-3">ส่งออกข้อมูล (Export)</h4>
              <button onclick="SettingsPage.handleCSVExport()"
                class="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-md shadow-emerald-100">
                <i data-lucide="download" class="w-4 h-4"></i>
                ดาวน์โหลด CSV
              </button>
            </div>

            <!-- Import Section -->
            <div class="pt-4 border-t border-slate-100">
              <h4 class="text-sm font-bold text-slate-700 mb-3">นำเข้าข้อมูล (Import CSV)</h4>

              <div class="bg-amber-50 rounded-xl p-4 mb-4">
                <p class="text-xs font-bold text-amber-800 mb-2">ตัวเลือกการนำเข้า:</p>
                <div class="space-y-2">
                  <!-- Append (default) -->
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="csv-import-mode" value="append" checked
                      class="w-4 h-4 accent-amber-600"
                      onchange="document.getElementById('csv-dup-options').classList.remove('hidden')">
                    <span class="text-xs text-amber-900 font-medium">เพิ่มต่อจากเดิม (Append)</span>
                  </label>

                  <!-- Duplicate handling sub-options -->
                  <div id="csv-dup-options" class="ml-6 space-y-1.5 pl-3 border-l-2 border-amber-200">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="csv-dup-mode" value="skip" checked
                        class="w-3.5 h-3.5 accent-amber-500">
                      <span class="text-xs text-amber-700">ข้ามรายการซ้ำ <span class="text-amber-500">(Skip — ค่าเริ่มต้น)</span></span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="csv-dup-mode" value="overwrite"
                        class="w-3.5 h-3.5 accent-amber-500">
                      <span class="text-xs text-amber-700">เขียนทับรายการซ้ำ <span class="text-amber-500">(Overwrite — อัปเดต Note)</span></span>
                    </label>
                  </div>

                  <!-- Delete All -->
                  <label class="flex items-center gap-2 cursor-pointer pt-1 border-t border-amber-100 mt-1">
                    <input type="radio" name="csv-import-mode" value="delete"
                      class="w-4 h-4 accent-amber-600"
                      onchange="document.getElementById('csv-dup-options').classList.add('hidden')">
                    <span class="text-xs text-amber-900 font-medium">ลบข้อมูลเดิมทั้งหมด (Delete All)</span>
                  </label>
                </div>
              </div>

              <label class="block w-full cursor-pointer">
                <div class="flex flex-col items-center justify-center gap-2 bg-white border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500 px-4 py-6 rounded-2xl transition-all group">
                  <div class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                    <i data-lucide="upload-cloud" class="w-5 h-5"></i>
                  </div>
                  <span class="text-sm font-bold">เลือกไฟล์ CSV เพื่อนำเข้า</span>
                  <p class="text-[10px]">รองรับเฉพาะไฟล์ .csv เท่านั้น</p>
                </div>
                <input type="file" id="import-csv-file" class="hidden" accept=".csv" onchange="SettingsPage.handleCSVImport(this)">
              </label>
            </div>
          </div>
        </div>

        <!-- 2. Delete Data (Danger Zone) -->
        <div class="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden flex flex-col">
          <div class="p-5 border-b border-rose-50 bg-rose-50/30">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <i data-lucide="trash-2" class="w-5 h-5 text-rose-600"></i>
              </div>
              <div>
                <h3 class="font-bold text-slate-800">2. ลบข้อมูลถาวร</h3>
                <p class="text-[11px] text-rose-500 uppercase tracking-wider font-semibold">Danger Zone</p>
              </div>
            </div>
          </div>

          <div class="p-6 flex-1 flex flex-col">
            <div class="p-4 bg-rose-50 rounded-xl mb-6">
              <div class="flex gap-3">
                <i data-lucide="info" class="w-5 h-5 text-rose-500 shrink-0 mt-0.5"></i>
                <div class="text-[11px] text-rose-700 leading-relaxed">
                  <b>หมายเหตุ:</b> ระบบจะทำการดาวน์โหลดไฟล์สำรองข้อมูล (.json) ให้คุณโดยอัตโนมัติก่อนที่จะดำเนินการลบ เพื่อความปลอดภัย
                </div>
              </div>
            </div>

            <div class="space-y-4 mb-8">
              <label class="flex items-center gap-3 p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 cursor-pointer transition-all group">
                <input type="checkbox" id="del-type-categories" class="w-5 h-5 rounded border-slate-300 text-rose-500 focus:ring-rose-500">
                <div class="flex-1">
                  <p class="text-sm font-bold text-slate-700">ลบหมวดหมู่ที่สร้างเอง</p>
                  <p class="text-[10px] text-slate-400">Custom Categories (หมวดหมู่เริ่มต้นยังคงอยู่)</p>
                </div>
              </label>

              <label class="flex items-center gap-3 p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 cursor-pointer transition-all group">
                <input type="checkbox" id="del-type-accounts" class="w-5 h-5 rounded border-slate-300 text-rose-500 focus:ring-rose-500">
                <div class="flex-1">
                  <p class="text-sm font-bold text-slate-700">ลบบัญชีทั้งหมด</p>
                  <p class="text-[10px] text-slate-400">Accounts & Balance (ธุรกรรมจะหายไปด้วย)</p>
                </div>
              </label>

              <label class="flex items-center gap-3 p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 cursor-pointer transition-all group">
                <input type="checkbox" id="del-type-transactions" class="w-5 h-5 rounded border-slate-300 text-rose-500 focus:ring-rose-500">
                <div class="flex-1">
                  <p class="text-sm font-bold text-slate-700">ลบธุรกรรมทั้งหมด</p>
                  <p class="text-[10px] text-slate-400">All Transactions (เก็บบัญชีและหมวดหมู่ไว้)</p>
                </div>
              </label>
            </div>

            <div class="mt-auto">
              <button onclick="SettingsPage.handleDangerDelete()"
                class="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2">
                <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                ยืนยันการลบที่เลือก
              </button>
            </div>
          </div>
        </div>

        <!-- 3. System JSON Backup -->
        <div class="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden lg:col-span-2">
          <div class="p-5 border-b border-blue-50 bg-blue-50/30">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <i data-lucide="database" class="w-5 h-5 text-blue-600"></i>
              </div>
              <div>
                <h3 class="font-bold text-slate-800">3. สำรองและคืนค่าระบบ (JSON Full Backup)</h3>
                <p class="text-[11px] text-blue-500 uppercase tracking-wider font-semibold">System Migration</p>
              </div>
            </div>
          </div>
          
          <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <div class="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                <h4 class="text-sm font-bold text-blue-800 mb-1">ส่งออกระบบ (.json)</h4>
                <p class="text-xs text-blue-600/70 mb-4">รวมข้อมูลทุกอย่าง: โปรไฟล์, บัญชี, หมวดหมู่, ธุรกรรม, งบประมาณ</p>
                <button onclick="SettingsPage.runBackup()"
                  class="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-100">
                  <i data-lucide="download" class="w-4 h-4"></i>
                  ดาวน์โหลดไฟล์ Backup
                </button>
              </div>
            </div>

            <div class="space-y-4">
              <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <h4 class="text-sm font-bold text-slate-700 mb-1">คืนค่าระบบ (Restore JSON)</h4>
                <p class="text-xs text-slate-500 mb-4">ใช้สำหรับย้ายข้อมูลข้าม Account หรือกู้คืนข้อมูล (ข้อมูลเดิมจะถูกลบ)</p>
                <label class="block w-full cursor-pointer">
                  <div class="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-sm">
                    <i data-lucide="upload" class="w-4 h-4"></i>
                    คืนค่าจากไฟล์ .json
                  </div>
                  <input type="file" id="restore-file-json" class="hidden" accept=".json" onchange="SettingsPage.runRestore(this)">
                </label>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  },

  moveItemOrder(id, direction) {
    if (!window.AccountPrefs) return;

    const prefs = window.AccountPrefs.get(id);
    prefs.order += (direction * 1.5);
    window.AccountPrefs.set(id, prefs);

    this.switchTab('accounts');
  },

  async updateBalance(id) {
    const balance = parseFloat(document.getElementById(`acc-balance-${id}`).value);
    const initial = parseFloat(document.getElementById(`acc-initial-${id}`)?.value || 0);

    const { error } = await DB.updateAccount(id, {
      balance: balance,
      initial_balance: initial
    });

    if (error) {
      Toast.show('บันทึกไม่สำเร็จ', 'error');
    } else {
      Toast.show('บันทึกยอดเงินแล้ว', 'success');
      this.refresh();
    }
  },

  async syncBalance(id) {
    Toast.show('กำลังคำนวณใหม่...', 'info');
    const result = await DB.recalculateAccountBalance(id);
    if (result.error) {
      Toast.show('คำนวณไม่สำเร็จ', 'error');
    } else {
      Toast.show('ซิงค์ยอดเงินเรียบร้อย', 'success');
      this.refresh();
    }
  },

  async syncAll() {
    const accounts = await DB.getAccounts(this.userId);
    Toast.show(`กำลังดำเนินการ ${accounts.length} บัญชี...`, 'info');

    let count = 0;
    for (const a of accounts) {
      const res = await DB.recalculateAccountBalance(a.id);
      if (!res.error) count++;
    }

    Toast.show(`สำเร็จ ${count}/${accounts.length} บัญชี`, 'success');
    this.refresh();
  },

  // ===== TAB: BACKUP & RESTORE =====

  _renderBackup() {
    return `
        <div class="space-y-6 max-w-lg">
          <!-- JSON Backup (System) -->
          <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <i data-lucide="database" class="w-5 h-5 text-blue-500"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-800">สำรองและคืนค่าระบบ (JSON)</h3>
                <p class="text-sm text-slate-500">ใช้สำหรับย้ายข้อมูลระหว่างเครื่อง (รวมทุกอย่าง)</p>
              </div>
            </div>

            <div class="space-y-4">
              <button onclick="SettingsPage.runBackup()"
                class="w-full inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm">
                <i data-lucide="download" class="w-4 h-4"></i>
                ดาวน์โหลด Backup (.json)
              </button>
              
              <label class="block w-full cursor-pointer">
                <div class="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-all">
                  <i data-lucide="upload" class="w-4 h-4"></i>
                  คืนค่าจากไฟล์ .json
                </div>
                <input type="file" id="restore-file" class="hidden" accept=".json" onchange="SettingsPage.runRestore(this)">
              </label>
            </div>
          </div>

          <!-- CSV Backup & Import (Data Transfer) -->
          <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <i data-lucide="file-spreadsheet" class="w-5 h-5 text-emerald-600"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-800">จัดการข้อมูล CSV</h3>
                <p class="text-sm text-slate-500">นำเข้า/ส่งออกข้อมูลธุรกรรม (Excel)</p>
              </div>
            </div>

            <div class="space-y-6">
              <div class="p-4 bg-emerald-50/30 rounded-lg border border-emerald-100">
                <h4 class="text-sm font-bold text-emerald-700 mb-2">ส่งออกธุรกรรม (Export)</h4>
                <button onclick="SettingsPage.runCSVBackup()"
                  class="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm">
                  <i data-lucide="download" class="w-4 h-4"></i>
                  ดาวน์โหลดไฟล์ CSV
                </button>
              </div>

              <div class="p-4 bg-amber-50/30 rounded-lg border border-amber-100">
                <h4 class="text-sm font-bold text-amber-700 mb-2">นำเข้าข้อมูล (Import CSV)</h4>
                <p class="text-[10px] text-amber-600 mb-4">* รองรับคอลัมน์: Date; Type; Category; Account; Amount; Note (ใช้เครื่องหมาย ; แบ่งคอลัมน์)</p>
                
                <div class="flex items-center gap-3 mb-4">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="csv-mode" value="append" checked class="w-4 h-4 text-emerald-600">
                    <span class="text-xs text-slate-600">เพิ่มต่อจากเดิม</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="csv-mode" value="replace" class="w-4 h-4 text-emerald-600">
                    <span class="text-xs text-slate-600">ลบข้อมูลเก่าทั้งหมด</span>
                  </label>
                </div>

                <label class="block w-full cursor-pointer">
                  <div class="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm">
                    <i data-lucide="upload" class="w-4 h-4"></i>
                    เลือกไฟล์ CSV
                  </div>
                  <input type="file" id="csv-file" class="hidden" accept=".csv" onchange="SettingsPage.runCSVRestore(this)">
                </label>
              </div>
            </div>
          </div>
        </div>
      `;
  },

  async runBackup() {
    Toast.show('กำลังเตรียมไฟล์สำรอง...', 'info');
    const data = await DB.exportAllData(this.userId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('สำรองข้อมูลเรียบร้อย', 'success');
  },

  async runRestore(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    if (!confirm('การคืนค่าจะลบข้อมูลปัจจุบันทั้งหมดในบัญชีนี้ คุณแน่ใจหรือไม่?')) {
      input.value = '';
      return;
    }

    Toast.show('กำลังคืนค่าข้อมูล...', 'info');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const result = await DB.importAllData(this.userId, data);
        if (result.error) {
          Toast.show('คืนค่าไม่สำเร็จ: ' + result.error, 'error');
        } else {
          Toast.show('คืนค่าข้อมูลเรียบร้อยแล้ว ระบบจะโหลดใหม่', 'success');
          setTimeout(() => location.reload(), 1500);
        }
      } catch (err) {
        Toast.show('ไฟล์ไม่ถูกต้อง', 'error');
      }
    };
    reader.readAsText(file);
  },

  // CSV
  async runCSVBackup() {
    Toast.show('กำลังเตรียมไฟล์ CSV...', 'info');
    const csv = await DB.exportTransactionsToCSV(this.userId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async runCSVRestore(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const mode = document.querySelector('input[name="csv-mode"]:checked').value;

    if (mode === 'replace' && !confirm('ข้อมูลธุรกรรมเดิมทั้งหมดจะถูกลบ คุณแน่ใจหรือไม่?')) {
      input.value = '';
      return;
    }

    Toast.show('กำลังนำเข้าข้อมูล...', 'info');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = await DB.importTransactionsFromCSV(this.userId, e.target.result, mode === 'replace');
      if (result.error) {
        Toast.show('นำเข้าไม่สำเร็จ: ' + result.error, 'error');
      } else {
        Toast.show(`นำเข้าเรียบร้อย: ${result.count} รายการ`, 'success');
        this.refresh();
      }
    };
    reader.readAsText(file);
  },

  // ===== NEW DATA MANAGEMENT HANDLERS (Unified) =====

  async handleCSVExport() {
    const types = [];
    if (document.getElementById('csv-type-categories').checked) types.push('categories');
    if (document.getElementById('csv-type-accounts').checked) types.push('accounts');
    if (document.getElementById('csv-type-transactions').checked) types.push('transactions');

    if (types.length === 0) {
      return Toast.show('กรุณาเลือกประเภทข้อมูลที่ต้องการส่งออก', 'warning');
    }

    Toast.show('กำลังเตรียมไฟล์...', 'info');
    try {
      const csvData = await DB.exportToCSV(this.userId, types);
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance_data_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.show('ส่งออกข้อมูลสำเร็จ', 'success');
    } catch (err) {
      console.error(err);
      Toast.show('ส่งออกล้มเหลว', 'error');
    }
  },

  async handleCSVImport(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const mode = document.querySelector('input[name="csv-import-mode"]:checked').value;
    const dupMode = mode === 'append'
      ? (document.querySelector('input[name="csv-dup-mode"]:checked')?.value || 'skip')
      : 'skip';

    const types = [];
    if (document.getElementById('csv-type-categories').checked) types.push('categories');
    if (document.getElementById('csv-type-accounts').checked) types.push('accounts');
    if (document.getElementById('csv-type-transactions').checked) types.push('transactions');

    if (types.length === 0) {
      Toast.show('กรุณาเลือกประเภทข้อมูลที่ต้องการนำเข้า', 'warning');
      input.value = '';
      return;
    }

    // Safety Step: Prompt for Backup
    const wantBackup = confirm('คำแนะนำ: ท่านต้องการดาวน์โหลดไฟล์สำรองข้อมูล (Backup) เก็บไว้ก่อนดำเนินการนำเข้าหรือไม่?\n\n(กด OK เพื่อดาวน์โหลด Backup หรือกด Cancel เพื่อดำเนินการต่อทันที)');
    if (wantBackup) {
      await this.runBackup();
      Toast.show('ดาวน์โหลด Backup เรียบร้อยแล้ว กำลังเตรียมนำเข้า...', 'info');
    }

    if (mode === 'delete' && !confirm('คำเตือน: ข้อมูลเดิมในประเภทที่เลือกจะถูกลบออกทั้งหมดก่อนนำเข้า คุณแน่ใจหรือไม่?')) {
      input.value = '';
      return;
    }

    Toast.show('กำลังวิเคราะห์ไฟล์...', 'info');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await DB.importFromCSV(this.userId, e.target.result, types, mode === 'delete', dupMode);
        if (result.error) {
          Toast.show('นำเข้าล้มเหลว: ' + result.error, 'error');
        } else {
          let message = `✅ นำเข้าสำเร็จ!\n- ${result.summary}`;

          let alertDetails = `สรุปผลการนำเข้า:\n-------------------\n${result.summary.split(', ').join('\n')}\n`;

          const hasSkipped    = result.skipped     && result.skipped.length > 0;
          const hasDups       = result.duplicates  && result.duplicates.length > 0;
          const hasOverwritten = result.overwritten && result.overwritten.length > 0;
          const needsAlert    = hasSkipped || hasDups || hasOverwritten;

          if (needsAlert) {
            console.group('CSV Import Report');
            if (hasSkipped) {
              console.log('Skipped (Error):', result.skipped);
              alertDetails += `\n❌ พบข้อมูลผิดพลาด: ${result.skipped.length} รายการ (ถูกข้าม)`;
            }
            if (hasDups) {
              console.log('Duplicates (Skipped):', result.duplicates);
              alertDetails += `\n⚠️ พบรายการซ้ำ: ${result.duplicates.length} รายการ (ถูกข้าม)`;
            }
            if (hasOverwritten) {
              console.log('Overwritten:', result.overwritten);
              alertDetails += `\n✏️ เขียนทับรายการซ้ำ: ${result.overwritten.length} รายการ (อัปเดตแล้ว)`;
            }
            console.groupEnd();

            alert(`${message}\n\n${alertDetails}\n\n* ท่านสามารถดูรายละเอียดได้ใน Console (กด F12)`);
          } else {
            Toast.show(message, 'success');
          }

          setTimeout(() => location.reload(), needsAlert ? 3000 : 1500);
        }
      } catch (err) {
        console.error(err);
        Toast.show('ไฟล์ไม่ถูกต้องหรือเกิดข้อผิดพลาด', 'error');
      }
    };
    reader.readAsText(file);
    input.value = '';
  },

  async handleDangerDelete() {
    const types = [];
    const labels = [];
    if (document.getElementById('del-type-categories').checked) { types.push('categories'); labels.push('หมวดหมู่'); }
    if (document.getElementById('del-type-accounts').checked) { types.push('accounts'); labels.push('บัญชี'); }
    if (document.getElementById('del-type-transactions').checked) { types.push('transactions'); labels.push('ธุรกรรม'); }

    if (types.length === 0) {
      return Toast.show('กรุณาเลือกข้อมูลที่ต้องการลบ', 'warning');
    }

    const confirmText = `คุณกำลังจะลบข้อมูล [${labels.join(', ')}] ทั้งหมดแบบถาวร! \n\nระบบจะทำการ Backup ข้อมูลเป็น JSON ให้ก่อนลบโดยอัตโนมัติ \n\nยืนยันการลบหรือไม่?`;
    if (!confirm(confirmText)) return;

    Toast.show('กำลังสำรองข้อมูลก่อนลบ...', 'info');
    await this.runBackup(); // Backup first

    Toast.show('กำลังลบข้อมูล...', 'info');
    try {
      const result = await DB.dangerDeleteData(this.userId, types);
      if (result.error) {
        Toast.show('ลบข้อมูลไม่สำเร็จ: ' + result.error, 'error');
      } else {
        Toast.show('ลบข้อมูลเรียบร้อยแล้ว', 'success');
        setTimeout(() => location.reload(), 1500);
      }
    } catch (err) {
      console.error(err);
      Toast.show('เกิดข้อผิดพลาดในการลบ', 'error');
    }
  },

  async deleteCategory(id, name) {
    if (!confirm(`คุณต้องการลบหมวดหมู่ "${name}" หรือไม่?\n(ธุรกรรมในหมวดนี้จะถูกย้ายไปที่ "อื่นๆ")`)) return;

    const { error } = await DB.deleteCategory(id);
    if (error) {
      Toast.show('ลบไม่สำเร็จ', 'error');
      return;
    }

    Toast.show('ลบหมวดหมู่เรียบร้อย', 'success');
    this.refresh();
  },

  async moveSubCategoryOrder(id, direction) {
    const cat = this.categories.find(c => c.id == id);
    if (!cat) return;

    // หาพี่น้อง (siblings) ที่อยู่ในหมวดหลักเดียวกัน
    const siblings = this.categories
      .filter(c => c.parent_id === cat.parent_id && c.type === cat.type)
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));

    const currentIndex = siblings.findIndex(s => s.id == id);
    const targetIndex = currentIndex + direction;

    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const targetSub = siblings[targetIndex];

    // กฎเหล็ก: ห้ามแก้ลำดับของหมวดหมู่ที่เป็นค่าเริ่มต้น (is_default) เพราะเราไม่มีสิทธิ์ PATCH
    if (cat.is_default) {
      return Toast.show('ไม่สามารถเปลี่ยนลำดับหมวดหมู่ค่าเริ่มต้นได้', 'warning');
    }

    const currentPos = parseInt(cat.position || 0);
    const targetPos = parseInt(targetSub.position || 0);

    Toast.show('กำลังเปลี่ยนลำดับ...', 'info');

    try {
      if (targetSub.is_default || currentPos === targetPos) {
        // ถ้าตัวเป้าหมายเป็นค่าเริ่มต้น หรือตำแหน่งเท่ากัน 
        // เราจะเปลี่ยนแค่ตำแหน่งของตัวปัจจุบันให้ มากกว่า หรือ น้อยกว่า ตัวเป้าหมาย
        const newPos = targetPos + direction;
        const { error } = await DB.updateCategory(id, { position: newPos });
        if (error) throw error;
      } else {
        // ถ้าทั้งคู่ไม่ใช่ค่าเริ่มต้น และตำแหน่งต่างกัน -> สลับกันได้เลย
        const { error: err1 } = await DB.updateCategory(id, { position: targetPos });
        if (err1) throw err1;
        const { error: err2 } = await DB.updateCategory(targetSub.id, { position: currentPos });
        if (err2) throw err2;
      }

      await this.refresh();
      Toast.show('เปลี่ยนลำดับเรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      Toast.show('ไม่สามารถเปลี่ยนลำดับได้: ' + (err.message || 'Error'), 'error');
    }
  },

  openCategoryModal(type, preselectedParentId = null, categoryId = null) {
    const category = categoryId ? this.categories.find(c => c.id === categoryId) : null;
    const isEdit = !!category;
    const typeLabel = type === 'income' ? 'รายรับ' : 'รายจ่าย';

    // กรองหมวดหลักเพื่อใช้เป็น Parent (ยกเว้นตัวเองถ้ากำลังแก้ไข)
    const rootCats = this.categories.filter(c => c.type === type && !c.parent_id && c.id !== categoryId);

    const icons = [
      // Finance & Banking
      'landmark', 'building-2', 'vault', 'wallet', 'credit-card', 'banknote', 'coins', 'hand-coins', 'piggy-bank', 'dollar-sign', 'circle-dollar-sign', 'badge-percent', 'calculator', 'receipt', 'qr-code', 'scan-line', 'signature', 'gem', 'gift', 'shield-check', 'key',
      // Investment & Charts
      'trending-up', 'trending-down', 'pie-chart', 'bar-chart-2', 'line-chart', 'candlestick-chart', 'area-chart', 'activity', 'briefcase', 'briefcase-business', 'globe', 'cpu', 'zap', 'target', 'award',
      // People & Health
      'user', 'users', 'baby', 'smile', 'heart', 'hand-heart', 'heart-handshake', 'stethoscope', 'pill', 'activity', 'dumbbell',
      // Food & Drink
      'utensils', 'utensils-crossed', 'coffee', 'pizza', 'sandwich', 'soup', 'beer', 'wine', 'glass-water', 'cup-soda', 'ice-cream', 'cake', 'apple', 'carrot', 'citrus', 'cookie', 'cherry', 'grape', 'lollipop',
      // Travel & Transport
      'car', 'bus', 'train', 'plane', 'bike', 'ship', 'anchor', 'map', 'map-pin', 'navigation', 'compass', 'luggage', 'tent', 'mountain', 'palm-tree', 'umbrella', 'ticket', 'hotel',
      // Shopping & Home
      'shopping-cart', 'shopping-bag', 'shopping-basket', 'store', 'tag', 'home', 'lamp', 'tv', 'droplets', 'wifi', 'trash-2', 'bed', 'bath', 'washing-machine', 'refrigerator',
      // Entertainment & Others
      'music', 'headphones', 'film', 'gamepad-2', 'camera', 'book', 'pen-tool', 'scissors', 'tool', 'wrench', 'dog', 'cat', 'bird',
      'settings', 'search', 'bell', 'check', 'x', 'star', 'info', 'alert-circle', 'cloud', 'sun', 'moon'
    ];
    const colors = [
      '#FFBE0B', '#FB5607', '#FF006E', '#8338EC', '#3A86FF',
      '#9B5DE5', '#F15BB5', '#FEE440', '#00BBF9', '#00F5D4',
      '#8CB369', '#F4E285', '#F4A259', '#5B8E7D', '#BC4B51',
      '#006BA6', '#0496FF', '#FFBC42', '#D81159', '#8F2D56'
    ];

    const modal = document.getElementById('settings-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';

    const initialIcon = category?.icon || icons[0];
    const initialColor = category?.color || colors[0];
    const initialParent = preselectedParentId || category?.parent_id || '';

    modal.innerHTML = `
          <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="SettingsPage.closeModal()"></div>
          <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-sm modal-content overflow-hidden">
            <div class="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 class="text-lg font-semibold text-slate-800">${isEdit ? 'แก้ไข' : 'เพิ่ม'}หมวดหมู่${typeLabel}</h2>
              <button onclick="SettingsPage.closeModal()"
                class="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
              </button>
            </div>
    
            <div class="p-5 space-y-4">
              <!-- หมวดหมู่หลัก (parent) -->
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">อยู่ภายใต้</label>
                <select id="cat-parent"
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                  <option value="">📁 หมวดหมู่หลัก (ไม่มี Parent)</option>
                  ${rootCats.map(c =>
      `<option value="${c.id}" ${initialParent === c.id ? 'selected' : ''}>  └ ${c.name}</option>`
    ).join('')}
                </select>
              </div>
              <!-- ชื่อ -->
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">ชื่อหมวดหมู่</label>
                <input type="text" id="cat-name" value="${category?.name || ''}" placeholder="เช่น ค่าน้ำมัน, โบนัส"
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
              </div>
    
              <!-- เลือก Icon -->
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">ไอคอน</label>
                <div class="flex gap-2 flex-wrap max-h-32 overflow-y-auto p-1 bg-slate-50 rounded-lg border border-slate-100">
                  ${icons.map((ic) => `
                    <button type="button" onclick="SettingsPage.selectIcon('${ic}')"
                      data-icon="${ic}"
                      class="cat-icon-btn w-9 h-9 rounded-lg border-2 flex items-center justify-center
                             transition-all hover:scale-110
                             ${ic === initialIcon ? 'border-blue-500 bg-blue-50' : 'border-white hover:border-slate-200'}">
                      <i data-lucide="${ic}" class="w-4 h-4 text-slate-600"></i>
                    </button>
                  `).join('')}
                </div>
                <input type="hidden" id="cat-icon" value="${initialIcon}">
              </div>
    
              <!-- เลือกสี -->
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">สี</label>
                <div class="flex gap-2 flex-wrap">
                  ${colors.map((c) => `
                    <button type="button" onclick="SettingsPage.selectCatColor('${c}')"
                      data-catcolor="${c}"
                      class="cat-color-btn w-8 h-8 rounded-full border-2 transition-transform hover:scale-110
                             ${c === initialColor ? 'border-slate-800 scale-110' : 'border-transparent'}"
                      style="background-color: ${c}">
                    </button>
                  `).join('')}
                </div>
                <input type="hidden" id="cat-color" value="${initialColor}">
              </div>
    
              <!-- Option for cascading color (only for root categories during edit) -->
              ${isEdit && !category.parent_id ? `
                <div class="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <input type="checkbox" id="update-sub-colors" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                  <label for="update-sub-colors" class="text-xs font-medium text-blue-800 cursor-pointer">
                    ปรับสีหมวดย่อยตามหมวดหลัก (Gradient)
                  </label>
                </div>
              ` : ''}
            </div>
    
            <div class="flex gap-3 p-5 border-t border-slate-100">
              <button onclick="SettingsPage.closeModal()"
                class="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm
                       font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                ยกเลิก
              </button>
              <button onclick="SettingsPage.saveCategory('${type}', ${categoryId ? `'${categoryId}'` : 'null'})"
                class="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm
                       font-medium text-white transition-colors active:scale-[0.98]">
                ${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหมวดหมู่'}
              </button>
            </div>
          </div>
        `;
    lucide.createIcons();
  },

  openSubCategoryModal(parentId, type) {
    this.openCategoryModal(type, parentId);
  },

  selectIcon(icon) {
    document.getElementById('cat-icon').value = icon;
    document.querySelectorAll('.cat-icon-btn').forEach(btn => {
      const isSelected = btn.dataset.icon === icon;
      btn.classList.toggle('border-blue-500', isSelected);
      btn.classList.toggle('bg-blue-50', isSelected);
      btn.classList.toggle('border-white', !isSelected);
    });
  },

  selectCatColor(color) {
    document.getElementById('cat-color').value = color;
    document.querySelectorAll('.cat-color-btn').forEach(btn => {
      const isSelected = btn.dataset.catcolor === color;
      btn.classList.toggle('border-slate-800', isSelected);
      btn.classList.toggle('scale-110', isSelected);
      btn.classList.toggle('border-transparent', !isSelected);
    });
  },

  async saveCategory(type, categoryId = null) {
    const name = document.getElementById('cat-name').value.trim();
    const icon = document.getElementById('cat-icon').value;
    const color = document.getElementById('cat-color').value;
    const parentId = document.getElementById('cat-parent')?.value || null;

    if (!name) {
      Toast.show('กรุณาใส่ชื่อหมวดหมู่', 'error');
      return;
    }

    if (categoryId) {
      // Update
      const { error } = await DB.updateCategory(categoryId, {
        name,
        icon,
        color,
        parent_id: parentId || null
      });

      // Cascade color update if requested
      const updateSubColors = document.getElementById('update-sub-colors')?.checked;
      if (updateSubColors && !error) {
        const subCats = this.categories.filter(c => c.parent_id === categoryId);
        for (let i = 0; i < subCats.length; i++) {
          const sub = subCats[i];
          // สร้างสี Gradient โดยทำให้จางลงเรื่อยๆ (Step ละ 8%)
          const newSubColor = this._adjustColor(color, (i + 1) * 8);
          await DB.updateCategory(sub.id, { color: newSubColor });
        }
      }

      if (error) {
        Toast.show('แก้ไขไม่สำเร็จ', 'error');
        return;
      }
      Toast.show('แก้ไขหมวดหมู่สำเร็จ', 'success');
    } else {
      // Create
      const { error } = await DB.createCategory({
        user_id: this.userId,
        name,
        type,
        icon,
        color,
        is_default: false,
        parent_id: parentId || null,
        position: 0
      });
      if (error) {
        Toast.show('เพิ่มหมวดหมู่ไม่สำเร็จ', 'error');
        return;
      }
      Toast.show('เพิ่มหมวดหมู่สำเร็จ', 'success');
    }
    this.closeModal();
    await this.refresh();
  },

  // ===== TAB: TEMPLATES =====

  _renderTemplates() {
    const templates = JSON.parse(localStorage.getItem('TX_TEMPLATES') || '[]');

    return `
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-slate-800">ธุรกรรมด่วน (Templates)</h2>
          <button onclick="SettingsPage.openTemplateModal()"
            class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm">
            <i data-lucide="plus" class="w-4 h-4"></i>
            เพิ่มเทมเพลต
          </button>
        </div>

        <div class="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-6">
          <p class="text-xs text-blue-600">เทมเพลตช่วยให้คุณบันทึกรายการที่ใช้บ่อยได้รวดเร็วขึ้น เช่น ค่าน้ำมัน, ค่าเน็ต, หรือโบนัสประจำเดือน</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
          ${templates.length === 0 ? `
            <div class="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-100">
              <i data-lucide="layout-template" class="w-12 h-12 mx-auto mb-3 opacity-20"></i>
              <p>ยังไม่มีเทมเพลต</p>
            </div>
          ` : templates.map(t => {
      const cat = this.categories.find(c => c.id === t.categoryId);
      const color = cat?.color || '#94a3b8';
      return `
              <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 group">
                <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                     style="background-color: ${color}15; color: ${color}">
                  <i data-lucide="${this._safeIcon(cat?.icon || 'layout-template')}" class="w-6 h-6"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-bold text-slate-800 truncate">${t.name}</h4>
                  <p class="text-xs text-slate-500 truncate">
                    ${t.type === 'income' ? 'รายรับ' : 'รายจ่าย'} • ฿${parseFloat(t.amount || 0).toLocaleString()}
                  </p>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onclick="SettingsPage.openTemplateModal('${t.id}')"
                    class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                    <i data-lucide="pencil" class="w-4 h-4"></i>
                  </button>
                  <button onclick="SettingsPage.deleteTemplate('${t.id}')"
                    class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  },

  openTemplateModal(templateId = null) {
    const templates = JSON.parse(localStorage.getItem('TX_TEMPLATES') || '[]');
    const template = templateId ? templates.find(t => t.id === templateId) : null;
    const isEdit = !!template;

    const modal = document.getElementById('settings-modal');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';

    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/40 modal-backdrop" onclick="SettingsPage.closeModal()"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md modal-content overflow-hidden">
        <div class="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 class="text-lg font-bold text-slate-800">${isEdit ? 'แก้ไข' : 'เพิ่ม'}เทมเพลต</h2>
          <button onclick="SettingsPage.closeModal()" class="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <i data-lucide="x" class="w-5 h-5 text-slate-400"></i>
          </button>
        </div>

        <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">ชื่อเทมเพลต</label>
            <input type="text" id="tpl-name" value="${template?.name || ''}" placeholder="เช่น เติมน้ำมัน ปตท."
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">ประเภท</label>
              <select id="tpl-type" onchange="SettingsPage.refreshTemplateModalCats()"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none">
                <option value="expense" ${template?.type === 'expense' ? 'selected' : ''}>รายจ่าย</option>
                <option value="income" ${template?.type === 'income' ? 'selected' : ''}>รายรับ</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">จำนวนเงินล่าสุด</label>
              <input type="number" id="tpl-amount" value="${template?.amount || ''}" placeholder="0.00"
                class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none font-number">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">หมวดหมู่</label>
            <select id="tpl-category"
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none">
              ${this._renderCategoryOptions(template?.type || 'expense', template?.categoryId)}
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">บัญชีที่ใช้บ่อย</label>
            <select id="tpl-account"
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none">
              <option value="">(ไม่ระบุ)</option>
              ${(() => {
        // เรียงตามชื่อ โดยรองรับตัวเลข (Numeric Sort) เช่น 01, 02, 10
        const sortedAccounts = [...(this.accounts || [])].sort((a, b) =>
          a.name.localeCompare(b.name, 'th', { numeric: true, sensitivity: 'base' })
        );
        return sortedAccounts.map(a => `
                  <option value="${a.id}" ${template?.accountId === a.id ? 'selected' : ''}>${a.name}</option>
                `).join('');
      })()}
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1 uppercase">หมายเหตุ (Notes)</label>
            <input type="text" id="tpl-note" value="${template?.note || ''}" placeholder="ระบุเพิ่มเติม..."
              class="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none">
          </div>
        </div>

        <div class="p-6 border-t border-slate-100 flex gap-3">
          <button onclick="SettingsPage.closeModal()" class="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">ยกเลิก</button>
          <button onclick="SettingsPage.saveTemplate('${templateId || ''}')" class="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-100">บันทึก</button>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  refreshTemplateModalCats() {
    const type = document.getElementById('tpl-type').value;
    const catSelect = document.getElementById('tpl-category');
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

  saveTemplate(id) {
    const name = document.getElementById('tpl-name').value.trim();
    if (!name) return Toast.show('กรุณาระบุชื่อเทมเพลต', 'warning');

    const templates = JSON.parse(localStorage.getItem('TX_TEMPLATES') || '[]');
    const data = {
      id: id || Date.now().toString(),
      name,
      type: document.getElementById('tpl-type').value,
      amount: document.getElementById('tpl-amount').value,
      categoryId: document.getElementById('tpl-category').value,
      accountId: document.getElementById('tpl-account').value,
      note: document.getElementById('tpl-note').value
    };

    if (id) {
      const idx = templates.findIndex(t => t.id === id);
      templates[idx] = data;
    } else {
      templates.push(data);
    }

    localStorage.setItem('TX_TEMPLATES', JSON.stringify(templates));
    Toast.show('บันทึกเทมเพลตเรียบร้อย', 'success');
    this.closeModal();
    this.switchTab('templates');
  },

  deleteTemplate(id) {
    if (!confirm('ยืนยันการลบเทมเพลตนี้?')) return;
    const templates = JSON.parse(localStorage.getItem('TX_TEMPLATES') || '[]');
    const filtered = templates.filter(t => t.id !== id);
    localStorage.setItem('TX_TEMPLATES', JSON.stringify(filtered));
    this.switchTab('templates');
  },

  // Helper to lighten/darken color
  _adjustColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = (num >> 8 & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;

    const newR = Math.max(0, Math.min(255, R));
    const newG = Math.max(0, Math.min(255, G));
    const newB = Math.max(0, Math.min(255, B));

    return "#" + (0x1000000 + newR * 0x10000 + newG * 0x100 + newB).toString(16).slice(1);
  },

  closeModal() {
    const modal = document.getElementById('settings-modal');
    modal.className = 'hidden';
    modal.innerHTML = '';
  },

  async refresh() {
    const [categories, accounts, profile] = await Promise.all([
      DB.getCategories(this.userId),
      DB.getAccounts(this.userId),
      DB.getProfile(this.userId)
    ]);
    this.categories = categories;
    this.accounts = accounts;
    document.getElementById('settings-content').innerHTML = await this._renderTab(profile);
    lucide.createIcons();
  }
};
