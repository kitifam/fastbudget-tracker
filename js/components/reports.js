/**
 * Reports & Analytics Page Component
 * Phase 3.2: Charts & Reports (Pie/Bar/Line/Multi-line + Date Filter)
 */
const REPORTS_TX_RULES = window.TransactionRules;

const ReportsPage = {
    charts: {},
    currentData: {},
    viewMode: 'monthly', // 'monthly', 'yearly'
    selectedDate: new Date(),
    dateRange: {
        start: null,
        end: null
    },
    topExpenseTrendCount: 5,
    topIncomeTrendCount: 5,
    showTransfers: false,

    /**
     * Initialize the reports page
     */
    init() {
        this.bindEvents();
    },

    /**
     * Set default date range (current month)
     */
    setupDateDefaults() {
        this.selectedDate = new Date();
        this._calculateDateRange();
    },

    _calculateDateRange() {
        const d = new Date(this.selectedDate);
        if (this.viewMode === 'yearly') {
            const start = new Date(d.getFullYear(), 0, 1);
            const end = new Date(d.getFullYear(), 11, 31);
            this.dateRange = { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
        } else { // 'monthly'
            const start = new Date(d.getFullYear(), d.getMonth(), 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            this.dateRange = { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
        }
    },

    _getLabel() {
        const d = new Date(this.selectedDate);
        if (this.viewMode === 'yearly') return d.getFullYear().toString();
        return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    },

    /**
     * Render the reports page HTML
     */
    render() {
        return `
            <div class="space-y-6 animate-fade-in">
                <!-- Header with Date Filter -->
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center gap-3 mb-1">
                            <div class="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                <i data-lucide="bar-chart-2" class="w-6 h-6"></i>
                            </div>
                            <h1 class="text-2xl font-black text-slate-800 tracking-tight">รายงานและวิเคราะห์</h1>
                        </div>
                        <p class="text-slate-400 text-sm font-medium ml-14">วิเคราะห์การเงินย้อนหลังและแนวโน้มเชิงลึก</p>
                    </div>
                    
                    <!-- Filter Toolbar -->
                    <div class="flex flex-wrap items-center justify-end gap-3">
                        <!-- View Mode Toggle -->
                        <div class="flex bg-slate-100 p-1 rounded-full border border-slate-200 shadow-inner">
                            <button onclick="ReportsPage.setViewMode('monthly')" class="px-4 py-1.5 rounded-full text-xs font-bold transition-all ${this.viewMode === 'monthly' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500'}">
                                รายเดือน
                            </button>
                            <button onclick="ReportsPage.setViewMode('yearly')" class="px-4 py-1.5 rounded-full text-xs font-bold transition-all ${this.viewMode === 'yearly' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500'}">
                                รายปี
                            </button>
                        </div>

                        <!-- Date Selector -->
                        <div class="flex items-center justify-end gap-1 bg-white p-1 rounded-full border border-slate-200 shadow-sm">
                            <button onclick="ReportsPage.changePeriod(-1)" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-50 active:scale-90 transition-all">
                                <i data-lucide="chevron-left" class="w-4 h-4"></i>
                            </button>
                            <span class="text-xs font-bold text-slate-700 px-2 min-w-[120px] text-center">${this._getLabel()}</span>
                            <button onclick="ReportsPage.changePeriod(1)" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-50 active:scale-90 transition-all">
                                <i data-lucide="chevron-right" class="w-4 h-4"></i>
                            </button>
                        </div>

                        <!-- Visibility Toggle -->
                        <button onclick="ReportsPage.toggleTransfers()" 
                            id="report-transfer-toggle"
                            class="px-4 py-2 ${this.showTransfers ? 'bg-blue-500 text-white shadow-blue-100' : 'bg-white text-slate-500'} border border-slate-200 rounded-xl text-xs font-bold hover:shadow-md transition-all flex items-center gap-2">
                            <i data-lucide="${this.showTransfers ? 'eye' : 'eye-off'}" class="w-3.5 h-3.5"></i>
                            <span class="hidden sm:inline">${this.showTransfers ? 'แสดงโอน' : 'ซ่อนโอน'}</span>
                        </button>
                    </div>
                </div>

                <!-- Summary Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="reports-summary">
                    <!-- Will be populated by JavaScript -->
                    <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-200 animate-pulse">
                        <div class="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                        <div class="h-8 bg-slate-200 rounded w-32"></div>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-200 animate-pulse">
                        <div class="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                        <div class="h-8 bg-slate-200 rounded w-32"></div>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-200 animate-pulse">
                        <div class="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                        <div class="h-8 bg-slate-200 rounded w-32"></div>
                    </div>
                </div>

                <div id="reports-charts-wrap" class="space-y-6">
                <!-- Net Worth Mixed Chart -->
                <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                            <i data-lucide="gem" class="w-5 h-5 text-indigo-500"></i>
                            มูลค่าทรัพย์สินคงเหลือสะสม (Net Worth)
                        </h3>
                    </div>
                    <div class="relative h-80">
                        <canvas id="netWorthMixedChart"></canvas>
                    </div>
                </div>

                <!-- Accounts Line Chart -->
                <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                            <i data-lucide="wallet" class="w-5 h-5 text-emerald-500"></i>
                            แนวโน้มยอดเงินคงเหลือสะสม (Accounts)
                        </h3>
                    </div>
                    <div class="relative h-72">
                        <canvas id="accountsLineChart"></canvas>
                    </div>
                </div>

                <!-- Investments Line Chart -->
                <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                            <i data-lucide="trending-up" class="w-5 h-5 text-blue-500"></i>
                            แนวโน้มยอดเงินคงเหลือสะสม (Investments)
                        </h3>
                    </div>
                    <div class="relative h-72">
                        <canvas id="investmentsLineChart"></canvas>
                    </div>
                </div>

                <!-- Multi-line Chart -->
                <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                            <i data-lucide="activity" class="w-5 h-5 text-orange-500"></i>
                            แนวโน้มหมวดหมู่รายจ่ายยอดนิยม
                        </h3>
                        <div class="flex items-center gap-3 px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
                            <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">แสดงสูงสุด:</span>
                            <input type="range" id="top-expense-trend-slider" 
                                min="3" max="15" value="${this.topExpenseTrendCount}"
                                oninput="ReportsPage.updateTopExpenseTrendCount(this.value)"
                                class="w-20 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500">
                            <span id="top-expense-trend-val" class="text-xs font-bold text-orange-600 w-4">${this.topExpenseTrendCount}</span>
                        </div>
                    </div>
                    <div class="relative h-72">
                        <canvas id="expenseTrendMultiLineChart"></canvas>
                    </div>
                </div>

                <!-- Income Multi-line Chart -->
                <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                            <i data-lucide="trending-up" class="w-5 h-5 text-emerald-500"></i>
                            แนวโน้มหมวดหมู่รายรับยอดนิยม (ยกเว้น Salary)
                        </h3>
                        <div class="flex items-center gap-3 px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
                            <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">แสดงสูงสุด:</span>
                            <input type="range" id="top-income-trend-slider"
                                min="3" max="15" value="${this.topIncomeTrendCount}"
                                oninput="ReportsPage.updateTopIncomeTrendCount(this.value)"
                                class="w-20 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500">
                            <span id="top-income-trend-val" class="text-xs font-bold text-emerald-600 w-4">${this.topIncomeTrendCount}</span>
                        </div>
                    </div>
                    <div class="relative h-72">
                        <canvas id="incomeTrendMultiLineChart"></canvas>
                    </div>
                </div>

                <!-- Charts Grid Row (Moved to bottom) -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Pie Chart -->
                    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                                <i data-lucide="pie-chart" class="w-5 h-5 text-blue-500"></i>
                                สัดส่วนรายจ่ายตามหมวดหมู่
                            </h3>
                            <span class="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">แสดงทั้งหมด</span>
                        </div>
                        <div class="relative h-64">
                            <canvas id="expensePieChart"></canvas>
                        </div>
                        <div id="pie-legend" class="mt-4 space-y-2 max-h-40 overflow-y-auto"></div>
                    </div>

                    <!-- Bar Chart -->
                    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold text-slate-800 flex items-center gap-2">
                                <i data-lucide="bar-chart-2" class="w-5 h-5 text-purple-500"></i>
                                รายรับ vs รายจ่ายรายเดือน
                            </h3>
                        </div>
                        <div class="relative h-64">
                            <canvas id="monthlyBarChart"></canvas>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        `;
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Events are bound via onclick in HTML for simplicity
        // Re-initialize Lucide icons after render
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    /**
     * Update top trend count slider
     */
    updateTopExpenseTrendCount(val) {
        this.topExpenseTrendCount = parseInt(val);
        document.getElementById('top-expense-trend-val').textContent = val;
        if (this.currentData.transactions) {
            this.createExpenseMultiLineChart();
        }
    },

    updateTopIncomeTrendCount(val) {
        this.topIncomeTrendCount = parseInt(val);
        document.getElementById('top-income-trend-val').textContent = val;
        if (this.currentData.transactions) {
            this.createIncomeTrendChart();
        }
    },

    setViewMode(mode) {
        this.viewMode = mode;
        this._calculateDateRange();
        this.mount();
    },

    changePeriod(offset) {
        const nextDate = new Date(this.selectedDate);
        if (this.viewMode === 'yearly') {
            nextDate.setFullYear(nextDate.getFullYear() + offset);
        } else { // 'monthly'
            nextDate.setMonth(nextDate.getMonth() + offset);
        }
        this.selectedDate = nextDate;
        this._calculateDateRange();
        this.mount();
    },

    /**
     * Toggle transfers visibility
     */
    toggleTransfers() {
        this.showTransfers = !this.showTransfers;
        const btn = document.getElementById('report-transfer-toggle');
        if (btn) {
            if (this.showTransfers) {
                btn.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i> แสดงรายการโอน';
                btn.classList.add('bg-blue-500', 'text-white', 'border-blue-500');
                btn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
            } else {
                btn.innerHTML = '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> ซ่อนรายการโอน';
                btn.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
                btn.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        this.loadData();
    },

    /**
     * Load all necessary data
     */
    async loadData(onProgress) {
        try {
            const userId = 'local';

            onProgress?.(5, 'กำลังดึงข้อมูล...');

            const [txResult, accounts, categories] = await Promise.all([
                DB.getTransactions(userId, {
                    dateFrom: this.dateRange.start,
                    dateTo: this.dateRange.end,
                    sortBy: 'date',
                    limit: 50000,
                    ascending: true,
                    onProgress: (loaded, total) => {
                        const percent = total > 0 ? 5 + Math.round((loaded / total) * 55) : 5;
                        onProgress?.(percent, `กำลังโหลดธุรกรรม... ${loaded.toLocaleString()}/${total.toLocaleString()}`);
                    }
                }),
                DB.getAccounts(userId),
                DB.getCategories(userId)
            ]);

            const { data: transactions, error: txError } = txResult;
            if (txError) throw txError;

            // Compute opening balances locally: current balance - net flows in period
            const netFlowsData = [];

            onProgress?.(70, 'กำลังคำนวณยอดคงเหลือ...');

            const getAccGroup = (type) => {
                const t = (type || '').toLowerCase();
                if (['savings', 'cash', 'digital_wallet', 'current', 'other_asset'].includes(t)) return 'asset';
                if (['investment', 'mutual_fund', 'stock', 'gold'].includes(t)) return 'investment';
                if (['credit_card', 'loan', 'debt'].includes(t)) return 'liability';
                return 'asset';
            };

            // ยอดปัจจุบันจาก accounts
            const currentBalances = { asset: 0, investment: 0, liability: 0 };
            (accounts || []).forEach(a => {
                currentBalances[getAccGroup(a.type)] += parseFloat(a.balance || 0);
            });

            // net flow จาก RPC (income - expense ตั้งแต่ dateRange.start จนถึงปัจจุบัน)
            const netFlows = { asset: 0, investment: 0, liability: 0 };
            (netFlowsData || []).forEach(row => {
                netFlows[row.account_group] = parseFloat(row.net_flow || 0);
            });

            // ยอดยกมา ณ จุดเริ่มต้นของช่วงที่เลือก = ยอดปัจจุบัน - net flow ในช่วงนั้น
            this.groupOpeningBalances = {
                asset: currentBalances.asset - netFlows.asset,
                investment: currentBalances.investment - netFlows.investment,
                liability: currentBalances.liability - netFlows.liability
            };

            onProgress?.(85, 'กำลังประมวลผลข้อมูล...');

            const txWithAccType = (transactions || []).map(t => ({
                ...t,
                account_group: getAccGroup(t.accounts?.type)
            }));

            this.currentData = {
                transactions: txWithAccType,
                filteredTransactions: REPORTS_TX_RULES.filterFinancial(txWithAccType),
                accounts: accounts || [],
                categories: categories || []
            };

            onProgress?.(95, 'กำลังสร้างหน้าจอ...');

            const container = document.getElementById('page-content');
            if (container) {
                container.innerHTML = this.render();
                if (window.lucide) lucide.createIcons();
                this.bindEvents();
                this.updateSummaryCards();
                this.createCharts();
            }

        } catch (error) {
            console.error('Error loading report data:', error);
            Toast.show('ไม่สามารถโหลดข้อมูลรายงานได้', 'error');
            if (onProgress) throw error;
        }
    },

    /**
     * Update summary cards
     */
    updateSummaryCards() {
        const animateCurrency = (el, target, duration = 1000) => {
            const startTs = performance.now();
            const from = 0;
            const to = Number(target || 0);
            const tick = (now) => {
                const p = Math.min((now - startTs) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                const val = from + (to - from) * eased;
                el.textContent = Format.currency(val);
                if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };

        const animateSummaryNumbers = (root) => {
            root.querySelectorAll('[data-countup-currency]').forEach((el) => {
                animateCurrency(el, Number(el.getAttribute('data-countup-currency') || 0), 1000);
            });
        };

        const transactions = this.currentData.filteredTransactions || [];
        const chartsWrap = document.getElementById('reports-charts-wrap');
        const container = document.getElementById('reports-summary');

        if (transactions.length === 0 && this.currentData.accounts.length === 0) {
            if (container) {
                container.innerHTML = `
                    <div class="col-span-full bg-white rounded-xl shadow-sm p-12 min-h-[50vh] animate-fade-in-up flex flex-col items-center justify-center text-center">
                        <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                            <i data-lucide="bar-chart-2" class="w-8 h-8 text-slate-300"></i>
                        </div>
                        <h3 class="font-semibold text-slate-600 mb-2">ไม่พบข้อมูลในช่วงเวลานี้</h3>
                        <p class="text-sm text-slate-400">ลองเปลี่ยนช่วงวันที่หรือเพิ่มธุรกรรมก่อน</p>
                    </div>
                `;
                lucide.createIcons();
            }
            if (chartsWrap) chartsWrap.classList.add('hidden');
            return;
        }

        if (chartsWrap) chartsWrap.classList.remove('hidden');

        const totalIncome = transactions
            .filter(t => (t.type || '').toLowerCase() === 'income')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        
        const totalExpense = transactions
            .filter(t => (t.type || '').toLowerCase() === 'expense')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        
        const INVESTMENT_TYPES = ['investment', 'mutual_fund', 'stock', 'gold'];
        const totalInvestment = this.currentData.accounts
            .filter(a => INVESTMENT_TYPES.includes((a.type || '').toLowerCase()))
            .reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);

        if (container) {
            container.innerHTML = `
                <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-200 border-l-4 border-l-emerald-500 animate-fade-in-up stagger-1">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-slate-500 font-medium">รายรับรวม</p>
                            <p class="text-2xl font-bold text-emerald-600 mt-1" data-countup-currency="${totalIncome}">${Format.currency(0)}</p>
                        </div>
                        <div class="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                            <i data-lucide="arrow-down-left" class="w-6 h-6 text-emerald-600"></i>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-200 border-l-4 border-l-red-500 animate-fade-in-up stagger-2">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-slate-500 font-medium">รายจ่ายรวม</p>
                            <p class="text-2xl font-bold text-red-600 mt-1" data-countup-currency="${totalExpense}">${Format.currency(0)}</p>
                        </div>
                        <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                            <i data-lucide="arrow-up-right" class="w-6 h-6 text-red-600"></i>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm p-6 border border-slate-200 border-l-4 border-l-indigo-500 animate-fade-in-up stagger-3">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-slate-500 font-medium">มูลค่าการลงทุนรวม</p>
                            <p class="text-2xl font-bold text-indigo-600 mt-1" data-countup-currency="${totalInvestment}">${Format.currency(0)}</p>
                        </div>
                        <div class="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                            <i data-lucide="trending-up" class="w-6 h-6 text-indigo-600"></i>
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();
            animateSummaryNumbers(container);
        }
    },

    /**
     * Create all charts
     */
    createCharts() {
        this.createNetWorthMixedChart();
        this.createPieChart();
        this.createBarChart();
        this.createAccountsLineChart();
        this.createInvestmentsLineChart();
        this.createExpenseMultiLineChart();
        this.createIncomeTrendChart();
    },

    /**
     * Create Pie Chart - Expense by Category
     */
    createPieChart() {
        const ctx = document.getElementById('expensePieChart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.pie) {
            this.charts.pie.destroy();
        }

        // Aggregation logic with case-insensitive and empty check
        const expenses = this.currentData.filteredTransactions.filter(t => 
            (t.type || '').toLowerCase() === 'expense'
        );
        const categoryMap = {};
        
        expenses.forEach(t => {
            const catName = t.categories?.name || 'ไม่ระบุหมวดหมู่';
            categoryMap[catName] = (categoryMap[catName] || 0) + parseFloat(t.amount || 0);
        });

        // Sort all
        const sorted = Object.entries(categoryMap)
            .sort((a, b) => b[1] - a[1]);
        
        const legendContainer = document.getElementById('pie-legend');
        if (sorted.length === 0) {
            if (legendContainer) legendContainer.innerHTML = '<p class="text-center text-slate-400 text-sm py-8">ไม่มีข้อมูลรายจ่ายในช่วงเวลานี้</p>';
            return;
        }
        
        const labels = sorted.map(([name]) => name);
        const data = sorted.map(([, amount]) => amount);
        const totalAll = data.reduce((a, b) => a + b, 0);

        // Dynamic Colors for many categories
        const baseColors = [
            '#F43F5E', '#FB923C', '#FBBF24', '#34D399', '#3B82F6', '#8B5CF6', 
            '#EC4899', '#06B6D4', '#6366F1', '#14B8A6', '#F97316', '#A855F7'
        ];
        const colors = sorted.map((_, i) => baseColors[i % baseColors.length]);

        this.charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 800,
                },
                plugins: {
                    legend: {
                        display: false // Custom legend below
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = Format.currency(context.raw);
                                const percentage = ((context.raw / totalAll) * 100).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                },
                onClick: (evt, activeElements, chart) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const label = chart.data.labels[index];
                        const filtered = this.currentData.transactions.filter(t => 
                            (t.categories?.name || 'ไม่ระบุหมวดหมู่') === label && 
                            (t.type || '').toLowerCase() === 'expense'
                        );
                        this.openDrillDownModal(filtered, `หมวดหมู่: ${label}`);
                    }
                }
            }
        });

        // Custom legend
        if (legendContainer) {
            legendContainer.innerHTML = labels.map((label, index) => `
                <div class="flex items-center justify-between text-sm">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style="background-color: ${colors[index]}"></div>
                        <span class="text-slate-700">${label}</span>
                    </div>
                    <span class="font-medium text-slate-900">${Format.currency(data[index])}</span>
                </div>
            `).join('');
        }
    },

    /**
     * Create Bar Chart - Monthly Income vs Expense
     */
    createBarChart() {
        const ctx = document.getElementById('monthlyBarChart');
        if (!ctx) return;

        if (this.charts.bar) {
            this.charts.bar.destroy();
        }

        // Group by month
        const monthlyData = {};
        this.currentData.filteredTransactions.forEach(t => {
            const date = new Date(t.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { label: monthLabel, income: 0, expense: 0 };
            }
            
            const amt = parseFloat(t.amount || 0);
            const typeLower = (t.type || '').toLowerCase();
            if (typeLower === 'income') {
                monthlyData[monthKey].income += amt;
            } else if (typeLower === 'expense') {
                monthlyData[monthKey].expense += amt;
            }
        });

        const sortedMonths = Object.entries(monthlyData).sort((a, b) => a[0].localeCompare(b[0]));
        const labels = sortedMonths.map(([, data]) => data.label);
        const incomeData = sortedMonths.map(([, data]) => data.income);
        const expenseData = sortedMonths.map(([, data]) => data.expense);

        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'รายรับ',
                        data: incomeData,
                        backgroundColor: Theme.palette().success,
                        borderRadius: 4,
                    },
                    {
                        label: 'รายจ่าย',
                        data: expenseData,
                        backgroundColor: Theme.palette().danger,
                        borderRadius: 4,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    y: {
                        from: 0,
                        duration: 700,
                        easing: 'easeOutQuart',
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => Format.compactNumber(value)
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15
                        }
                    }
                },
                onClick: (evt, activeElements, chart) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const datasetIndex = activeElements[0].datasetIndex;
                        const label = chart.data.labels[index]; // e.g. "เม.ย. 67"
                        const type = chart.data.datasets[datasetIndex].label === 'รายรับ' ? 'income' : 'expense';
                        
                        // กรองตามเดือนและปี
                        const filtered = this.currentData.transactions.filter(t => {
                            const date = new Date(t.date);
                            const monthLabel = date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
                            return monthLabel === label && (t.type || '').toLowerCase() === type;
                        });
                        this.openDrillDownModal(filtered, `รายละเอียด ${chart.data.datasets[datasetIndex].label}: ${label}`);
                    }
                }
            }
        });
    },

    /**
     * Create Mixed Chart - Net Worth (Bar + Lines)
     */
    createNetWorthMixedChart() {
        const ctx = document.getElementById('netWorthMixedChart');
        if (!ctx) return;
        if (this.charts.netWorth) this.charts.netWorth.destroy();

        // Data for Net Worth (Accounts + Investments)
        const datesSet = new Set();
        this.currentData.transactions.forEach(t => datesSet.add(t.date));
        const sortedDates = Array.from(datesSet).sort();

        let runAcc = (this.groupOpeningBalances?.asset || 0) + (this.groupOpeningBalances?.liability || 0);
        let runInv = this.groupOpeningBalances?.investment || 0;

        const labels = [];
        const accData = [];
        const invData = [];
        const totalData = [];

        const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

        if (this.viewMode === 'monthly') {
            // Daily aggregation
            // Initial state at start of period
            labels.push(new Date(this.dateRange.start).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' (เริ่ม)');
            accData.push(runAcc);
            invData.push(runInv);
            totalData.push(runAcc + runInv);

            sortedDates.forEach(date => {
                const txs = this.currentData.transactions.filter(t => t.date === date);
                txs.forEach(t => {
                    const amt = parseFloat(t.amount || 0);
                    const isInc = (t.type || '').toLowerCase() === 'income';
                    if (t.account_group === 'asset' || t.account_group === 'liability') {
                        runAcc += isInc ? amt : -amt;
                    } else if (t.account_group === 'investment') {
                        runInv += isInc ? amt : -amt;
                    }
                });
                labels.push(new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
                accData.push(runAcc);
                invData.push(runInv);
                totalData.push(runAcc + runInv);
            });
        } else { // Yearly viewMode - Monthly aggregation
            // Aggregate transactions by month
            const monthlyChanges = {}; // Stores net change for each month and group
            for (let m = 0; m < 12; m++) {
                const monthKey = `${this.selectedDate.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
                monthlyChanges[monthKey] = { asset: 0, investment: 0, liability: 0 };
            }

            this.currentData.transactions.forEach(tx => {
                const date = new Date(tx.date);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyChanges.hasOwnProperty(monthKey)) {
                    const amt = parseFloat(tx.amount || 0);
                    const isInc = (tx.type || '').toLowerCase() === 'income';
                    const change = isInc ? amt : -amt;
                    if (tx.account_group === 'asset' || tx.account_group === 'liability') monthlyChanges[monthKey].asset += change;
                    else if (tx.account_group === 'investment') monthlyChanges[monthKey].investment += change;
                }
            });

            labels.push(...TH_MONTHS);
            for (let m = 0; m < 12; m++) {
                const monthKey = `${this.selectedDate.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
                runAcc += monthlyChanges[monthKey].asset + monthlyChanges[monthKey].liability;
                runInv += monthlyChanges[monthKey].investment;
                accData.push(runAcc);
                invData.push(runInv);
                totalData.push(runAcc + runInv);
            }
        }

        this.charts.netWorth = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'ยอดเงินคงเหลือ (Accounts)',
                        data: accData,
                        borderColor: '#10b981', // Green
                        backgroundColor: '#10b981',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 2,
                        order: 1
                    },
                    {
                        type: 'line',
                        label: 'ยอดเงินลงทุน (Investments)',
                        data: invData,
                        borderColor: '#a855f7', // Purple
                        backgroundColor: '#a855f7',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 2,
                        order: 2
                    },
                    {
                        type: 'bar',
                        label: 'มูลค่าทรัพย์สินรวม (Net Worth)',
                        data: totalData,
                        backgroundColor: 'rgba(59, 130, 246, 0.15)', // Light blue
                        borderColor: 'rgba(59, 130, 246, 0.5)',
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 15 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return ` ${context.dataset.label}: ${Format.currency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => Format.compactNumber(value)
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    },

    /**
     * Create Line Chart - Accounts (Assets) Trend
     */
    createAccountsLineChart() {
        const ctx = document.getElementById('accountsLineChart');
        if (!ctx) return;
        if (this.charts.accountsLine) this.charts.accountsLine.destroy();

        const { labels, data } = this._getRunningBalanceChartData(
            this.currentData.transactions,
            (this.groupOpeningBalances?.asset || 0) + (this.groupOpeningBalances?.liability || 0),
            ['asset', 'liability']
        );

        /*
        const dailyBalance = {}; // Net change per day for asset/liability group
        this.currentData.transactions.filter(t => t.account_group === 'asset' || t.account_group === 'liability').forEach(t => {
                const date = t.date;
                if (!dailyBalance[date]) dailyBalance[date] = 0;
                const amt = parseFloat(t.amount || 0);
                if (t.type === 'income') dailyBalance[date] += amt;
                else if (t.type === 'expense') dailyBalance[date] -= amt;
            });

        const sortedDates = Object.keys(dailyBalance).sort();
        // รวม Asset + Liability (สุทธิ)
        let running = (this.groupOpeningBalances?.asset || 0) + (this.groupOpeningBalances?.liability || 0);
        
        const data = [{
            date: new Date(this.dateRange.start).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
            balance: running
        }];

        sortedDates.forEach(date => {
            running += dailyBalance[date];
            data.push({
                date: new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
                balance: running
            });
        });
        */

        this.charts.accountsLine = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{ // data is already the running balance
                    label: 'ยอดเงินคงเหลือสะสม (Accounts)',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true, tension: 0.4, pointRadius: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    },

    /**
     * Create Line Chart - Investments Trend
     */
    createInvestmentsLineChart() {
        const ctx = document.getElementById('investmentsLineChart');
        if (!ctx) return;
        if (this.charts.investmentsLine) this.charts.investmentsLine.destroy();

        const { labels, data } = this._getRunningBalanceChartData(
            this.currentData.transactions,
            this.groupOpeningBalances?.investment || 0,
            'investment'
        );
        /*
        const dailyBalance = {}; // Net change per day for investment group
        this.currentData.transactions.filter(t => t.account_group === 'investment').forEach(t => {
                const date = t.date;
                if (!dailyBalance[date]) dailyBalance[date] = 0;
                const amt = parseFloat(t.amount || 0);
                if (t.type === 'income') dailyBalance[date] += amt;
                else if (t.type === 'expense') dailyBalance[date] -= amt;
            });

        const sortedDates = Object.keys(dailyBalance).sort();
        let running = this.groupOpeningBalances?.investment || 0;
        
        const data = [{
            date: new Date(this.dateRange.start).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
            balance: running
        }];

        sortedDates.forEach(date => {
            running += dailyBalance[date];
            data.push({
                date: new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
                balance: running
            });
        });
        */

        this.charts.investmentsLine = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{ // data is already the running balance
                    label: 'ยอดเงินคงเหลือสะสม (Investments)',
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true, tension: 0.4, pointRadius: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    },

    /**
     * Create Multi-line Chart - Top Expense Categories Trend
     */
    createExpenseMultiLineChart() {
        const ctx = document.getElementById('expenseTrendMultiLineChart');
        if (!ctx) return;

        if (this.charts.expenseMultiLine) {
            this.charts.expenseMultiLine.destroy();
        }

        // Find top trend categories from selected range transactions
        const categoryTotals = {};
        this.currentData.filteredTransactions
            .filter(t => (t.type || '').toLowerCase() === 'expense')
            .forEach(t => {
                const catName = t.categories?.name || 'ไม่ระบุ';
                categoryTotals[catName] = (categoryTotals[catName] || 0) + parseFloat(t.amount || 0);
            });

        const topCategoriesCount = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, this.topExpenseTrendCount)
            .map(([name]) => name);

        // Group by period (daily or monthly)
        const aggregatedData = {}; // Stores daily/monthly spending per category
        const periods = new Set(); // Stores dates or month keys

        const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        
        this.currentData.filteredTransactions
            .filter(t => (t.type || '').toLowerCase() === 'expense' && t.categories?.name && topCategoriesCount.includes(t.categories.name))
            .forEach(t => {
                const date = t.date;
                const catName = t.categories.name;
                let periodKey;
                let periodLabel;

                if (this.viewMode === 'monthly') {
                    periodKey = t.date; // Daily key
                    periodLabel = new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                } else { // Yearly viewMode
                    periodKey = `${new Date(date).getFullYear()}-${String(new Date(date).getMonth() + 1).padStart(2, '0')}`; // Monthly key
                    periodLabel = TH_MONTHS[new Date(date).getMonth()];
                }
                periods.add(periodKey);

                if (!aggregatedData[periodKey]) aggregatedData[periodKey] = { label: periodLabel };
                if (!aggregatedData[periodKey][catName]) aggregatedData[periodKey][catName] = 0;
                
                aggregatedData[periodKey][catName] += parseFloat(t.amount || 0);
            });

        const sortedPeriods = Array.from(periods).sort();
        let labels = sortedPeriods.map(p => aggregatedData[p].label);

        const colors = [
            '#F43F5E', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', 
            '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#A855F7', '#FBBF24'
        ];

        const datasets = topCategoriesCount.map((cat, index) => {
            let dataPoints;
            if (this.viewMode === 'yearly') {
                labels = TH_MONTHS;
                dataPoints = Array(12).fill(0);
                sortedPeriods.forEach(p => {
                    const monthIndex = parseInt(p.split('-')[1]) - 1;
                    if (monthIndex >= 0 && monthIndex < 12) {
                        dataPoints[monthIndex] = aggregatedData[p]?.[cat] || 0;
                    }
                });
            } else {
                dataPoints = sortedPeriods.map(p => aggregatedData[p]?.[cat] || 0);
            }
            return {
                label: cat, data: dataPoints, borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length] + '20', tension: 0.4, pointRadius: 3, fill: false
            };
        });

        this.charts.expenseMultiLine = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 10,
                            boxWidth: 8,
                            font: { size: 10 },
                            // ป้องกันการแสดง legend ของ dataset ที่ไม่มีข้อมูล (ยอดเป็น 0 ตลอดช่วง)
                            filter: function(legendItem, chartData) {
                                const dataset = chartData.datasets[legendItem.datasetIndex];
                                return dataset.data && dataset.data.length > 0 && dataset.data.some(point => point > 0);
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = Format.currency(context.raw);
                                return `${label}: ${value}`;
                            }
                        }
                    }
                },
                onClick: (evt, activeElements, chart) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const datasetIndex = activeElements[0].datasetIndex;
                        const dateLabel = chart.data.labels[index]; 
                        const catName = chart.data.datasets[datasetIndex].label;

                        // Adjust dateLabel for yearly view to match full month name
                        let displayDateLabel = dateLabel;
                        if (this.viewMode === 'yearly') {
                            const monthIndex = TH_MONTHS.indexOf(dateLabel);
                            displayDateLabel = new Date(this.selectedDate.getFullYear(), monthIndex, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
                        }

                        const filtered = this.currentData.transactions.filter(t => {
                            const date = new Date(t.date);
                            if (this.viewMode === 'yearly') {
                                const monthIndex = TH_MONTHS.indexOf(dateLabel);
                                return date.getMonth() === monthIndex && (t.categories?.name || 'ไม่ระบุ') === catName && (t.type || '').toLowerCase() === 'expense';
                            }
                            // monthly view
                            const dLabel = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                            return dLabel === dateLabel && (t.categories?.name || 'ไม่ระบุ') === catName && (t.type || '').toLowerCase() === 'expense';
                        });
                        this.openDrillDownModal(filtered, `หมวดหมู่ ${catName}: ${displayDateLabel}`);
                    }
                }
            }
        });
    },

    /**
     * Create Multi-line Chart - Top Income Categories Trend (excluding Salary)
     */
    createIncomeTrendChart() {
        const ctx = document.getElementById('incomeTrendMultiLineChart');
        if (!ctx) return;

        if (this.charts.incomeMultiLine) {
            this.charts.incomeMultiLine.destroy();
        }

        const SALARY_KEYWORDS = ['salary', 'เงินเดือน'];
        const isSalary = (name) => {
            const n = (name || '').toLowerCase();
            return SALARY_KEYWORDS.some(k => n.includes(k));
        };

        // Find top income categories excluding salary
        const categoryTotals = {};
        this.currentData.filteredTransactions
            .filter(t => (t.type || '').toLowerCase() === 'income' && !isSalary(t.categories?.name))
            .forEach(t => {
                const catName = t.categories?.name || 'ไม่ระบุ';
                categoryTotals[catName] = (categoryTotals[catName] || 0) + parseFloat(t.amount || 0);
            });

        const topCategories = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, this.topIncomeTrendCount)
            .map(([name]) => name);

        // Group by period (daily or monthly)
        const aggregatedData = {};
        const periods = new Set();
        const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

        this.currentData.filteredTransactions
            .filter(t => (t.type || '').toLowerCase() === 'income' && t.categories?.name && topCategories.includes(t.categories.name))
            .forEach(t => {
                const date = t.date;
                const catName = t.categories.name;
                let periodKey, periodLabel;

                if (this.viewMode === 'monthly') {
                    periodKey = t.date;
                    periodLabel = new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                } else {
                    periodKey = `${new Date(date).getFullYear()}-${String(new Date(date).getMonth() + 1).padStart(2, '0')}`;
                    periodLabel = TH_MONTHS[new Date(date).getMonth()];
                }
                periods.add(periodKey);

                if (!aggregatedData[periodKey]) aggregatedData[periodKey] = { label: periodLabel };
                if (!aggregatedData[periodKey][catName]) aggregatedData[periodKey][catName] = 0;
                aggregatedData[periodKey][catName] += parseFloat(t.amount || 0);
            });

        const sortedPeriods = Array.from(periods).sort();
        let labels = sortedPeriods.map(p => aggregatedData[p].label);

        const colors = [
            '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#06B6D4',
            '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#A855F7', '#FBBF24', '#F43F5E'
        ];

        const datasets = topCategories.map((cat, index) => {
            let dataPoints;
            if (this.viewMode === 'yearly') {
                labels = TH_MONTHS;
                dataPoints = Array(12).fill(0);
                sortedPeriods.forEach(p => {
                    const monthIndex = parseInt(p.split('-')[1]) - 1;
                    if (monthIndex >= 0 && monthIndex < 12) {
                        dataPoints[monthIndex] = aggregatedData[p]?.[cat] || 0;
                    }
                });
            } else {
                dataPoints = sortedPeriods.map(p => aggregatedData[p]?.[cat] || 0);
            }
            return {
                label: cat,
                data: dataPoints,
                borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length] + '20',
                tension: 0.4,
                pointRadius: 3,
                fill: false
            };
        });

        this.charts.incomeMultiLine = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 10,
                            boxWidth: 8,
                            font: { size: 10 },
                            filter: function(legendItem, chartData) {
                                const dataset = chartData.datasets[legendItem.datasetIndex];
                                return dataset.data && dataset.data.length > 0 && dataset.data.some(point => point > 0);
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label || ''}: ${Format.currency(context.raw)}`
                        }
                    }
                },
                onClick: (evt, activeElements, chart) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const datasetIndex = activeElements[0].datasetIndex;
                        const dateLabel = chart.data.labels[index];
                        const catName = chart.data.datasets[datasetIndex].label;

                        let displayDateLabel = dateLabel;
                        if (this.viewMode === 'yearly') {
                            const monthIndex = TH_MONTHS.indexOf(dateLabel);
                            displayDateLabel = new Date(this.selectedDate.getFullYear(), monthIndex, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
                        }

                        const filtered = this.currentData.transactions.filter(t => {
                            const d = new Date(t.date);
                            if (this.viewMode === 'yearly') {
                                const monthIndex = TH_MONTHS.indexOf(dateLabel);
                                return d.getMonth() === monthIndex && (t.categories?.name || 'ไม่ระบุ') === catName && (t.type || '').toLowerCase() === 'income';
                            }
                            const dLabel = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                            return dLabel === dateLabel && (t.categories?.name || 'ไม่ระบุ') === catName && (t.type || '').toLowerCase() === 'income';
                        });
                        this.openDrillDownModal(filtered, `หมวดหมู่ ${catName}: ${displayDateLabel}`);
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => Format.compactNumber(v) } }
                }
            }
        });
    },

    // Helper function to get running balance data for charts
    _getRunningBalanceChartData(transactions, initialRunningBalance, accountGroupFilters = null) {
        const labels = [];
        const data = [];
        const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

        let currentRunning = initialRunningBalance;

        // Filter transactions by account group(s) if specified
        let filteredTxs = transactions;
        if (accountGroupFilters) {
            const filters = Array.isArray(accountGroupFilters) ? accountGroupFilters : [accountGroupFilters];
            filteredTxs = transactions.filter(t => filters.includes(t.account_group));
        }

        if (this.viewMode === 'monthly') {
            // Daily aggregation
            const dailyAggregated = {}; // Stores net change for each day
            filteredTxs.forEach(tx => {
                const date = tx.date;
                if (!dailyAggregated[date]) dailyAggregated[date] = 0;
                const amt = parseFloat(tx.amount || 0);
                const isInc = (tx.type || '').toLowerCase() === 'income';
                dailyAggregated[date] += isInc ? amt : -amt;
            });

            const sortedDates = Object.keys(dailyAggregated).sort();

            // Initial state at start of period
            labels.push(new Date(this.dateRange.start).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' (เริ่ม)');
            data.push(currentRunning);

            sortedDates.forEach(dateStr => {
                labels.push(new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
                currentRunning += dailyAggregated[dateStr];
                data.push(currentRunning);
            });

        } else { // Yearly viewMode - Monthly aggregation
            // Aggregate transactions by month
            const monthlyAggregated = {}; // Stores net change for each month
            for (let m = 0; m < 12; m++) {
                const monthKey = `${this.selectedDate.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
                monthlyAggregated[monthKey] = 0;
            }

            filteredTxs.forEach(tx => {
                const date = new Date(tx.date);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyAggregated.hasOwnProperty(monthKey)) {
                    const amt = parseFloat(tx.amount || 0);
                    const isInc = (tx.type || '').toLowerCase() === 'income';
                    monthlyAggregated[monthKey] += isInc ? amt : -amt;
                }
            });

            // Labels are always 12 months for yearly view
            labels.push(...TH_MONTHS);

            // Calculate running balance for each month
            for (let m = 0; m < 12; m++) {
                const monthKey = `${this.selectedDate.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
                currentRunning += monthlyAggregated[monthKey];
                data.push(currentRunning);
            }
        }

        return { labels, data };
    },

    /**
     * Open Drill-down Modal
     */
    openDrillDownModal(transactions, title) {
        if (!transactions || transactions.length === 0) {
            Toast.show('ไม่พบข้อมูลรายการ', 'info');
            return;
        }

        let modal = document.getElementById('drilldown-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'drilldown-modal';
            modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6';
            document.body.appendChild(modal);
        }

        this._modalData = {
            transactions: [...transactions],
            title: title,
            sort: { key: 'date', direction: 'desc' }
        };

        this.renderDrillDown();
        modal.classList.remove('hidden');
    },

    renderDrillDown() {
        const modal = document.getElementById('drilldown-modal');
        if (!modal || !this._modalData) return;

        const { transactions, title, sort } = this._modalData;

        // Sort data
        const sortedData = [...transactions].sort((a, b) => {
            let aVal, bVal;
            if (sort.key === 'amount') {
                aVal = parseFloat(a.amount) * (a.type === 'expense' ? -1 : 1);
                bVal = parseFloat(b.amount) * (b.type === 'expense' ? -1 : 1);
            } else if (sort.key === 'category') {
                aVal = a.categories?.name || '';
                bVal = b.categories?.name || '';
            } else {
                aVal = a[sort.key];
                bVal = b[sort.key];
            }

            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onclick="ReportsPage.closeDrillDown()"></div>
            <div class="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden relative animate-fade-in-up flex flex-col max-h-[85vh]">
                <!-- Header -->
                <div class="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h3 class="text-lg font-bold text-slate-800">${title}</h3>
                        <p class="text-xs text-slate-500 font-medium">พบ ${sortedData.length} รายการ</p>
                    </div>
                    <button onclick="ReportsPage.closeDrillDown()" class="w-10 h-10 rounded-full hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all shadow-sm">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-white">
                    <table class="w-full text-left text-sm border-separate border-spacing-y-2">
                        <thead>
                            <tr class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th class="px-4 py-2 cursor-pointer hover:text-blue-600" onclick="ReportsPage.sortDrillDown('date')">
                                    Date ${sort.key === 'date' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="px-4 py-2 cursor-pointer hover:text-blue-600" onclick="ReportsPage.sortDrillDown('category')">
                                    Category ${sort.key === 'category' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="px-4 py-2 text-right cursor-pointer hover:text-blue-600" onclick="ReportsPage.sortDrillDown('amount')">
                                    Amount ${sort.key === 'amount' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedData.map(t => `
                                <tr class="bg-slate-50/50 hover:bg-slate-50 transition-colors rounded-xl overflow-hidden cursor-pointer group" onclick="ReportsPage.editTransaction('${t.id}')">
                                    <td class="px-4 py-3 first:rounded-l-xl">
                                        <span class="font-medium text-slate-600">${new Date(t.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex flex-col">
                                            <div class="flex items-center gap-2">
                                                <span class="w-2 h-2 rounded-full" style="background-color: ${t.categories?.color || '#cbd5e1'}"></span>
                                                <span class="text-slate-700 font-bold">${t.categories?.name || 'อื่นๆ'}</span>
                                            </div>
                                            ${t.from_or_to ? `<span class="text-[10px] text-blue-500 font-medium ml-4">• ${t.from_or_to}</span>` : ''}
                                        </div>
                                    </td>
                                    <td class="px-4 py-3 text-right last:rounded-r-xl">
                                        <span class="font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}">
                                            ${t.type === 'income' ? '+' : '-'}${Format.money(t.amount)}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        lucide.createIcons();
    },

    editTransaction(id) {
        if (typeof TransactionsPage !== 'undefined') {
            // ตรวจสอบและเตรียมข้อมูลให้ TransactionsPage หากยังไม่มี
            if (!TransactionsPage.transactions || TransactionsPage.transactions.length === 0) {
                TransactionsPage.transactions = this.currentData.transactions || [];
            }
            if (!TransactionsPage.accounts || TransactionsPage.accounts.length === 0) {
                TransactionsPage.accounts = this.currentData.accounts || [];
            }
            
            // ปิด Modal รายละเอียดก่อน
            this.closeDrillDown();
            
            // เปิด Modal แก้ไข
            TransactionsPage.openModal(id);
        } else {
            console.warn('TransactionsPage is not loaded');
            Toast.show('ไม่สามารถเปิดหน้าแก้ไขได้ในขณะนี้', 'error');
        }
    },

    sortDrillDown(key) {
        if (!this._modalData) return;
        const current = this._modalData.sort;
        const direction = (current.key === key && current.direction === 'desc') ? 'asc' : 'desc';
        this._modalData.sort = { key, direction };
        this.renderDrillDown();
    },

    closeDrillDown() {
        const modal = document.getElementById('drilldown-modal');
        if (modal) modal.classList.add('hidden');
    },

    /**
     * Export chart data as JSON
     */
    exportData() {
        const exportTransactions = this.currentData.filteredTransactions || this.currentData.transactions || [];

        const exportPayload = {
            generatedAt: new Date().toISOString(),
            dateRange: this.dateRange,
            summary: {
                totalTransactions: exportTransactions.length,
                totalIncome: exportTransactions
                    .filter(t => t.type === 'income')
                    .reduce((sum, t) => sum + parseFloat(t.amount), 0),
                totalExpense: exportTransactions
                    .filter(t => t.type === 'expense')
                    .reduce((sum, t) => sum + parseFloat(t.amount), 0)
            },
            transactions: exportTransactions
        };

        const dataStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `expense-report-${this.dateRange.start}-to-${this.dateRange.end}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        Toast.show('ส่งออกข้อมูลเรียบร้อย', 'success');
    },

    /**
     * Mount the page
     */
    async mount() {
        const container = document.getElementById('page-content');
        if (!container) return;

        if (!this.dateRange.start) {
            this.setupDateDefaults();
        }

        // 1. Render loading UI
        container.innerHTML = `
            <div id="report-loading" class="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
                <div class="relative mb-6">
                    <div class="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <i data-lucide="bar-chart-2" class="w-6 h-6 text-blue-600"></i>
                    </div>
                </div>
                <h3 class="text-lg font-bold text-slate-700 mb-2">กำลังเตรียมรายงาน</h3>
                <p class="text-sm text-slate-400 mb-4" id="report-progress-text">กำลังเริ่มต้น...</p>
                <div class="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div id="report-progress-bar" class="h-full bg-blue-600 transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        const progressText = document.getElementById('report-progress-text');
        const progressBar = document.getElementById('report-progress-bar');
        const onProgress = (percent, text) => {
            if (progressText) progressText.textContent = text;
            if (progressBar) progressBar.style.width = `${percent}%`;
        };

        // 2. Load data, which will then render the full page
        try {
            await this.loadData(onProgress);
        } catch (e) {
            console.error("Error mounting Reports page:", e);
            container.innerHTML = `<div class="p-8 text-center text-red-500">Error loading reports: ${e.message}</div>`;
        }
    }
};
