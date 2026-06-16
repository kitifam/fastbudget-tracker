// ===================================================
// Forecast Page — Monthly Forecast + Recurring + Runway + Statement Projection
// ===================================================

window.ForecastPage = {
  _charts: {},

  // ─── HELPERS ─────────────────────────────────────────────────

  _toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  _monthKey(s) { return s ? s.substring(0, 7) : null; },

  _fmtDate(s) {
    return s ? new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';
  },

  // Query all --cutoff transactions across all time, grouped by card name
  _getCutoffHistory() {
    if (!DB._sql) return {};
    try {
      const rows = DB._query(
        `SELECT account, date as ms FROM income_or_expense
         WHERE LOWER(notes) LIKE '%--cutoff%'
         ORDER BY account, date ASC`
      );
      const byCard = {};
      rows.forEach(r => {
        if (!byCard[r.account]) byCard[r.account] = [];
        const d = new Date(r.ms);
        byCard[r.account].push(
          `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        );
      });
      return byCard;
    } catch(e) { return {}; }
  },

  // ─── ENTRY POINT ─────────────────────────────────────────────

  async mount() {
    const container = document.getElementById('page-content');
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
        <i data-lucide="loader-2" class="w-8 h-8 animate-spin mb-3 text-indigo-500"></i>
        <p class="text-sm font-medium">กำลังวิเคราะห์ข้อมูล...</p>
      </div>`;
    if (window.lucide) lucide.createIcons();

    try {
      const today = new Date();
      const dateFrom = this._toISO(new Date(today.getFullYear(), today.getMonth() - 6, 1));
      const dateTo = this._toISO(today);

      const [txRes, accounts, creditCards] = await Promise.all([
        DB.getTransactions('local', { dateFrom, dateTo, limit: 50000, sortBy: 'date', ascending: true }),
        DB.getAccounts('local'),
        DB.getCreditCards('local')
      ]);

      const allTx = txRes.data || [];
      const tx = window.TransactionRules
        ? TransactionRules.filterVisible(allTx, false)
        : allTx.filter(t => t.type !== 'transfer');

      const cutoffHistory = this._getCutoffHistory();

      const runway    = this._computeRunway(tx, accounts);
      const forecast  = this._computeForecast(tx);
      const recurring = this._computeRecurring(tx);
      const stmts     = this._computeStatements(creditCards, cutoffHistory);

      container.innerHTML = this._render({ runway, forecast, recurring, stmts });
      if (window.lucide) lucide.createIcons();
      this._drawChart(runway.chartData);

    } catch(e) {
      console.error('ForecastPage:', e);
      container.innerHTML = `<div class="p-8 text-center text-red-500">ไม่สามารถโหลดข้อมูลได้: ${e.message}</div>`;
    }
  },

  // ─── COMPUTATIONS ────────────────────────────────────────────

  _computeRunway(tx, accounts) {
    const today = new Date();
    const is24M  = n => /24M$/i.test(n);

    // Last 3 complete months (index 0 = most recent = weight 0.5)
    const months = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }

    const monthly = {};
    months.forEach(m => { monthly[m] = { income: 0, expense: 0 }; });
    tx.forEach(t => {
      const mk = this._monthKey(t.date);
      if (!monthly[mk]) return;
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'income')  monthly[mk].income  += amt;
      else if (t.type === 'expense') monthly[mk].expense += amt;
    });

    const weights = [0.5, 0.3, 0.2];
    const monthlyData = months.map((m, i) => ({
      key:   m,
      label: new Date(m + '-15').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
      income:  monthly[m].income,
      expense: monthly[m].expense,
      net:     monthly[m].income - monthly[m].expense,
      weight:  weights[i]
    }));

    const avgIncome  = monthlyData.reduce((s, d) => s + d.income  * d.weight, 0);
    const avgExpense = monthlyData.reduce((s, d) => s + d.expense * d.weight, 0);
    const monthlyNet = avgIncome - avgExpense;

    // Liquid = visible bank/cash accounts EXCLUDING 24M (fixed deposits are not liquid)
    const visibleBankAccounts = accounts.filter(a =>
      a.use_account === 1 && ['cash','bank','savings','general'].includes(a.type)
    );
    const liquidBalance = visibleBankAccounts
      .filter(a => !is24M(a.name))
      .reduce((s, a) => s + parseFloat(a.balance || 0), 0);
    const fixedBalance = visibleBankAccounts
      .filter(a => is24M(a.name))
      .reduce((s, a) => s + parseFloat(a.balance || 0), 0);

    // 12-month projection
    const chartData = [];
    for (let i = 0; i <= 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      chartData.push({
        label: i === 0 ? 'ปัจจุบัน' : d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
        value: liquidBalance + monthlyNet * i
      });
    }

    const runwayMonths    = monthlyNet < 0 && liquidBalance > 0 ? liquidBalance / Math.abs(monthlyNet) : null;
    const emergencyMonths = avgExpense > 0 ? liquidBalance / avgExpense : null;

    return { monthlyData, avgIncome, avgExpense, monthlyNet, liquidBalance, fixedBalance, chartData, runwayMonths, emergencyMonths };
  },

  _computeForecast(tx) {
    const today = new Date();
    const months = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }

    const byCategory = {};
    tx.filter(t => t.type === 'expense').forEach(t => {
      const mk  = this._monthKey(t.date);
      const idx = months.indexOf(mk);
      if (idx === -1) return;
      const cat = t.categories?.name || 'อื่นๆ';
      if (!byCategory[cat]) byCategory[cat] = [0, 0, 0];
      byCategory[cat][idx] += parseFloat(t.amount) || 0;
    });

    const weights = [0.5, 0.3, 0.2];
    const monthLabels = months.map(m =>
      new Date(m + '-15').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
    );

    const items = Object.entries(byCategory)
      .map(([cat, amounts]) => {
        const forecast = amounts.reduce((s, a, i) => s + a * weights[i], 0);
        const nonZero  = amounts.filter(a => a > 0);
        const avg      = nonZero.length ? nonZero.reduce((s, a) => s + a, 0) / nonZero.length : 0;
        const cv       = avg > 0 && nonZero.length > 1
          ? Math.sqrt(nonZero.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / nonZero.length) / avg : 0;
        const trend = amounts[0] > avg * 1.1 ? 'up' : amounts[0] < avg * 0.9 ? 'down' : 'flat';
        return { cat, amounts, forecast, cv, trend };
      })
      .sort((a, b) => b.forecast - a.forecast);

    return { items, monthLabels };
  },

  _computeRecurring(tx) {
    const groups = {};
    tx.forEach(t => {
      if (t.type === 'transfer') return;
      const cat = t.categories?.name || 'อื่นๆ';
      const fot = (t.from_or_to || '').trim();
      const key = `${t.type}|${cat}|${fot}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ date: t.date, amount: parseFloat(t.amount) || 0 });
    });

    const today  = new Date();
    const result = [];

    Object.entries(groups).forEach(([key, txs]) => {
      if (txs.length < 2) return;
      txs.sort((a, b) => a.date.localeCompare(b.date));

      // Amount consistency
      const amounts = txs.map(t => t.amount);
      const avgAmt  = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const amtCV   = avgAmt > 0
        ? Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - avgAmt, 2), 0) / amounts.length) / avgAmt : 1;
      if (amtCV > 0.15) return;

      // Interval consistency
      const intervals = [];
      for (let i = 1; i < txs.length; i++) {
        intervals.push((new Date(txs[i].date) - new Date(txs[i-1].date)) / 86400000);
      }
      const avgInt = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      const intCV  = avgInt > 0
        ? Math.sqrt(intervals.reduce((s, v) => s + Math.pow(v - avgInt, 2), 0) / intervals.length) / avgInt : 1;

      const isMonthly = avgInt >= 25 && avgInt <= 38;
      const isWeekly  = avgInt >= 5  && avgInt <= 12;
      if ((!isMonthly && !isWeekly) || intCV > 0.35) return;

      const [type, cat, fot] = key.split('|');
      const last     = txs[txs.length - 1];
      const nextDate = new Date(new Date(last.date).getTime() + Math.round(avgInt) * 86400000);
      const daysUntil = Math.ceil((nextDate - today) / 86400000);

      result.push({
        type, cat, fot,
        avgAmount:  avgAmt,
        frequency:  isWeekly ? 'รายสัปดาห์' : 'รายเดือน',
        occurrences: txs.length,
        lastDate:   last.date,
        nextDate:   this._toISO(nextDate),
        daysUntil,
        status: daysUntil < -3 ? 'overdue' : daysUntil <= 5 ? 'soon' : 'upcoming'
      });
    });

    return result.sort((a, b) => a.daysUntil - b.daysUntil);
  },

  _computeStatements(creditCards, cutoffHistory) {
    const today = new Date();

    return creditCards.filter(c => c.use_account === 1).map(card => {
      const dates = cutoffHistory[card.bank_name] || [];
      const lastCutoff = dates.length > 0 ? dates[dates.length - 1] : null;

      // Derive cycle length from actual cutoff intervals (fallback 30 days)
      let cycleLength = 30;
      if (dates.length >= 2) {
        const intervals = [];
        for (let i = 1; i < dates.length; i++) {
          intervals.push((new Date(dates[i]) - new Date(dates[i-1])) / 86400000);
        }
        cycleLength = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
      }

      const outstanding = card.outstanding_balance || 0;

      // Days since cutoff → daily spending rate
      const daysSinceCutoff = lastCutoff
        ? Math.max(1, Math.ceil((today - new Date(lastCutoff)) / 86400000))
        : null;
      const dailyRate = daysSinceCutoff ? outstanding / daysSinceCutoff : null;

      // Next close = last cutoff + cycle length
      let nextCloseDate = null, daysUntilClose = null, projectedBal = outstanding;
      if (lastCutoff) {
        const closeD = new Date(new Date(lastCutoff).getTime() + cycleLength * 86400000);
        nextCloseDate = this._toISO(closeD);
        daysUntilClose = Math.ceil((closeD - today) / 86400000);
        projectedBal = outstanding + (dailyRate || 0) * Math.max(0, daysUntilClose);
      }

      // Due date: next occurrence of payment_day after next close
      const dueDay = card.due_date || 0;
      let dueDate = null;
      if (dueDay > 0 && nextCloseDate) {
        const closeD = new Date(nextCloseDate);
        let dy = closeD.getFullYear(), dm = closeD.getMonth();
        // Due date is typically in the month after the close
        dm++; if (dm > 11) { dm = 0; dy++; }
        dueDate = this._toISO(new Date(dy, dm, dueDay));
      }

      const limit    = card.credit_limit || 0;
      const utilPct  = limit > 0 ? projectedBal / limit * 100 : null;

      return {
        name: card.bank_name,
        outstanding,
        lastCutoff,
        daysSinceCutoff,
        dailyRate,
        cycleLength,
        daysUntilClose,
        nextCloseDate,
        projectedBal,
        dueDate,
        limit,
        utilPct,
        interestRate: card.interest_rate
      };
    });
  },

  // ─── RENDERING ───────────────────────────────────────────────

  _render({ runway, forecast, recurring, stmts }) {
    const fixedMonthlyCost = recurring
      .filter(r => r.type === 'expense' && r.frequency === 'รายเดือน')
      .reduce((s, r) => s + r.avgAmount, 0);
    const totalProjected = stmts.reduce((s, c) => s + c.projectedBal, 0);

    return `
      <div class="space-y-6 animate-fade-in">

        <!-- Header -->
        <div class="flex items-center gap-3">
          <div class="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shadow-sm">
            <i data-lucide="telescope" class="w-6 h-6"></i>
          </div>
          <div>
            <h1 class="text-2xl font-black text-slate-800 tracking-tight">Forecast</h1>
            <p class="text-slate-400 text-sm font-medium">คาดการณ์จากข้อมูลย้อนหลัง 6 เดือน · ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <!-- KPI Row -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${this._kpiCard('Net เฉลี่ย/เดือน', runway.monthlyNet, runway.monthlyNet >= 0 ? 'emerald' : 'rose', runway.monthlyNet >= 0 ? 'trending-up' : 'trending-down', 'weighted avg 3 เดือน', true)}
          ${this._kpiCard('Fixed Costs/เดือน', fixedMonthlyCost, 'orange', 'repeat', `${recurring.filter(r => r.type==='expense' && r.frequency==='รายเดือน').length} รายการ recurring`)}
          ${this._kpiCard('บิลบัตร (คาดการณ์)', totalProjected, 'purple', 'credit-card', `${stmts.length} บัตร รอบตัดหน้า`)}
        </div>

        <!-- Balance Runway -->
        ${this._renderRunway(runway)}

        <!-- Statement Projection -->
        ${stmts.length > 0 ? this._renderStatements(stmts) : ''}

        <!-- Category Forecast -->
        ${this._renderForecast(forecast)}

        <!-- Recurring Transactions -->
        ${this._renderRecurring(recurring)}

      </div>`;
  },

  _kpiCard(label, value, color, icon, sub, signed = false) {
    const colors = {
      emerald: { bg:'bg-emerald-500', text:'text-emerald-700', light:'bg-emerald-50' },
      rose:    { bg:'bg-rose-500',    text:'text-rose-700',    light:'bg-rose-50' },
      orange:  { bg:'bg-orange-500',  text:'text-orange-700',  light:'bg-orange-50' },
      purple:  { bg:'bg-purple-500',  text:'text-purple-700',  light:'bg-purple-50' },
    };
    const c = colors[color] || colors.purple;
    const display = (signed && value > 0 ? '+' : '') + Format.money(value);
    return `
      <div class="bg-white rounded-xl border border-slate-100 p-5 flex items-center justify-between shadow-sm">
        <div>
          <p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">${label}</p>
          <p class="text-2xl font-bold mt-1 ${c.text}">${display}</p>
          <p class="text-[10px] text-slate-400 mt-0.5">${sub}</p>
        </div>
        <div class="w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center shadow-sm flex-shrink-0">
          <i data-lucide="${icon}" class="w-6 h-6 text-white"></i>
        </div>
      </div>`;
  },

  _renderRunway(r) {
    const netColor  = r.monthlyNet >= 0 ? 'text-emerald-600' : 'text-rose-600';
    const efColor   = !r.emergencyMonths ? 'bg-slate-200'
                    : r.emergencyMonths >= 6 ? 'bg-emerald-500'
                    : r.emergencyMonths >= 3 ? 'bg-amber-500' : 'bg-rose-500';
    const efLabel   = !r.emergencyMonths ? '-'
                    : r.emergencyMonths >= 6 ? 'ปลอดภัย' : r.emergencyMonths >= 3 ? 'ควรเพิ่ม' : 'เสี่ยงสูง';
    const efPct     = r.emergencyMonths ? Math.min(100, (r.emergencyMonths / 6) * 100) : 0;

    const rows = r.monthlyData.map(d => `
      <tr class="border-b border-slate-50">
        <td class="px-4 py-2.5 text-sm font-medium text-slate-700">${d.label}</td>
        <td class="px-4 py-2.5 text-sm text-emerald-600 text-right font-number">+${Format.money(d.income)}</td>
        <td class="px-4 py-2.5 text-sm text-rose-600 text-right font-number">-${Format.money(d.expense)}</td>
        <td class="px-4 py-2.5 text-sm font-bold text-right font-number ${d.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
          ${d.net >= 0 ? '+' : ''}${Format.money(d.net)}
        </td>
      </tr>`).join('');

    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div class="flex items-center gap-3 mb-5">
          <div class="p-2 bg-blue-50 text-blue-600 rounded-lg"><i data-lucide="gauge" class="w-5 h-5"></i></div>
          <h3 class="font-bold text-slate-800">Balance Runway — คาดการณ์ยอดเงิน 12 เดือน</h3>
        </div>

        <!-- Stats row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div class="bg-slate-50 rounded-xl p-3 text-center">
            <p class="text-[10px] text-slate-400 font-bold uppercase">เงินสด (Liquid)</p>
            <p class="text-lg font-bold text-slate-700 mt-1">${Format.money(r.liquidBalance)}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3 text-center">
            <p class="text-[10px] text-slate-400 font-bold uppercase">ฝากประจำ (24M)</p>
            <p class="text-lg font-bold text-slate-500 mt-1">${Format.money(r.fixedBalance)}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3 text-center">
            <p class="text-[10px] text-slate-400 font-bold uppercase">Net/เดือน (คาดการณ์)</p>
            <p class="text-lg font-bold mt-1 ${netColor}">${r.monthlyNet >= 0 ? '+' : ''}${Format.money(r.monthlyNet)}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3 text-center">
            <p class="text-[10px] text-slate-400 font-bold uppercase">Emergency Fund</p>
            <p class="text-lg font-bold text-slate-700 mt-1">${r.emergencyMonths ? r.emergencyMonths.toFixed(1) + ' เดือน' : '-'}</p>
            <div class="w-full bg-slate-200 rounded-full h-1.5 mt-1">
              <div class="h-1.5 rounded-full ${efColor} transition-all" style="width:${efPct}%"></div>
            </div>
            <p class="text-[9px] mt-0.5 font-bold ${efColor.replace('bg-','text-')}">${efLabel}</p>
          </div>
        </div>

        ${r.runwayMonths && r.runwayMonths < 12 ? `
          <div class="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-sm text-rose-700">
            <i data-lucide="alert-triangle" class="w-4 h-4 flex-shrink-0"></i>
            <span>ถ้ายังใช้จ่ายแบบเดิม เงินสดจะหมดใน <strong>${r.runwayMonths.toFixed(1)} เดือน</strong></span>
          </div>` : ''}

        <!-- Chart -->
        <div class="relative h-56 mb-5">
          <canvas id="forecast-runway-chart"></canvas>
        </div>

        <!-- History table -->
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
              <th class="px-4 pb-2">เดือน</th>
              <th class="px-4 pb-2 text-right">รายรับ</th>
              <th class="px-4 pb-2 text-right">รายจ่าย</th>
              <th class="px-4 pb-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  _renderStatements(stmts) {
    const cards = stmts.map(c => {
      const utilColor = !c.utilPct ? 'bg-slate-300'
                      : c.utilPct >= 80 ? 'bg-rose-500'
                      : c.utilPct >= 50 ? 'bg-amber-500' : 'bg-emerald-500';
      const utilPct = Math.min(100, c.utilPct || 0);

      const rateStr = c.dailyRate !== null
        ? `${Format.money(c.dailyRate)}/วัน`
        : 'ไม่มีข้อมูล cutoff';

      const closeStr = c.nextCloseDate
        ? `${this._fmtDate(c.nextCloseDate)} ${c.daysUntilClose !== null ? `(${c.daysUntilClose > 0 ? 'อีก ' + c.daysUntilClose + ' วัน' : 'ผ่านไปแล้ว'})` : ''}`
        : '-';

      const urgency = c.daysUntilClose !== null && c.daysUntilClose <= 5
        ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-slate-200';

      return `
        <div class="bg-white rounded-xl border border-slate-100 p-5 shadow-sm ${urgency}">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h4 class="font-bold text-slate-800 text-sm">${c.name}</h4>
              ${c.cycleLength !== 30 || c.lastCutoff
                ? `<p class="text-[10px] text-slate-400">รอบ ~${c.cycleLength} วัน · cutoff ล่าสุด ${this._fmtDate(c.lastCutoff)}</p>`
                : `<p class="text-[10px] text-amber-500">ไม่พบประวัติ cutoff — ใช้ค่าประมาณ 30 วัน</p>`}
            </div>
            ${c.interestRate ? `<span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">${c.interestRate}% ต่อปี</span>` : ''}
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-slate-50 rounded-lg p-2.5 text-center">
              <p class="text-[9px] text-slate-400 uppercase font-bold">ค้างชำระปัจจุบัน</p>
              <p class="text-base font-bold text-slate-800 mt-0.5">${Format.money(c.outstanding)}</p>
            </div>
            <div class="bg-indigo-50 rounded-lg p-2.5 text-center">
              <p class="text-[9px] text-indigo-400 uppercase font-bold">คาดการณ์รอบตัด</p>
              <p class="text-base font-bold text-indigo-700 mt-0.5">${Format.money(c.projectedBal)}</p>
            </div>
          </div>

          <div class="space-y-1 text-xs text-slate-500 mb-3">
            <div class="flex justify-between"><span>อัตราใช้จ่าย</span><span class="font-medium text-slate-700">${rateStr}</span></div>
            <div class="flex justify-between"><span>วันที่รอบตัด (ประมาณ)</span><span class="font-medium text-slate-700">${closeStr}</span></div>
            <div class="flex justify-between"><span>กำหนดชำระ</span><span class="font-medium text-slate-700">${this._fmtDate(c.dueDate)}</span></div>
          </div>

          ${c.limit > 0 ? `
            <div>
              <div class="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>Utilization</span>
                <span class="${c.utilPct >= 80 ? 'text-rose-500 font-bold' : ''}">${utilPct.toFixed(0)}% / ${Format.money(c.limit)}</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-2">
                <div class="h-2 rounded-full ${utilColor} transition-all" style="width:${utilPct}%"></div>
              </div>
            </div>` : ''}
        </div>`;
    });

    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div class="flex items-center gap-3 mb-5">
          <div class="p-2 bg-purple-50 text-purple-600 rounded-lg"><i data-lucide="credit-card" class="w-5 h-5"></i></div>
          <div>
            <h3 class="font-bold text-slate-800">Statement Projection — คาดการณ์บิลรอบตัดถัดไป</h3>
            <p class="text-[10px] text-slate-400">คำนวณจากอัตราใช้จ่ายรายวัน ตั้งแต่ cutoff ล่าสุด</p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${cards.join('')}
        </div>
      </div>`;
  },

  _renderForecast(f) {
    const trendIcon = { up: 'trending-up', down: 'trending-down', flat: 'minus' };
    const trendColor = { up: 'text-rose-500', down: 'text-emerald-500', flat: 'text-slate-400' };
    const cvLabel = cv => cv < 0.15 ? ['เสถียร', 'text-emerald-600', 'bg-emerald-50']
                        : cv < 0.40 ? ['ปานกลาง', 'text-amber-600', 'bg-amber-50']
                        : ['ผันผวน', 'text-rose-600', 'bg-rose-50'];

    const maxForecast = f.items[0]?.forecast || 1;

    const rows = f.items.slice(0, 20).map(item => {
      const [cvText, cvTextColor, cvBg] = cvLabel(item.cv);
      const barPct = Math.min(100, (item.forecast / maxForecast) * 100);
      const monthCells = item.amounts.map((a, i) =>
        `<td class="px-3 py-2.5 text-right text-xs font-number ${a === 0 ? 'text-slate-300' : 'text-slate-600'}">${a > 0 ? Format.money(a) : '-'}</td>`
      ).join('');

      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50">
          <td class="px-4 py-2.5 text-sm font-medium text-slate-700 max-w-[140px]">
            <div class="flex items-center gap-2">
              <i data-lucide="${trendIcon[item.trend]}" class="w-3.5 h-3.5 flex-shrink-0 ${trendColor[item.trend]}"></i>
              <span class="truncate">${item.cat}</span>
            </div>
          </td>
          ${monthCells}
          <td class="px-4 py-2.5 text-right">
            <div>
              <span class="text-sm font-bold text-indigo-700">${Format.money(item.forecast)}</span>
              <div class="w-full bg-slate-100 rounded-full h-1 mt-1">
                <div class="h-1 rounded-full bg-indigo-400" style="width:${barPct}%"></div>
              </div>
            </div>
          </td>
          <td class="px-3 py-2.5 text-center">
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${cvBg} ${cvTextColor}">${cvText}</span>
          </td>
        </tr>`;
    }).join('');

    const headers = f.monthLabels.map(l =>
      `<th class="px-3 pb-2 text-right text-[10px] text-slate-400 font-bold uppercase">${l}</th>`
    ).join('');

    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div class="flex items-center gap-3 mb-5">
          <div class="p-2 bg-orange-50 text-orange-600 rounded-lg"><i data-lucide="activity" class="w-5 h-5"></i></div>
          <div>
            <h3 class="font-bold text-slate-800">Monthly Category Forecast — คาดการณ์รายจ่ายรายหมวด</h3>
            <p class="text-[10px] text-slate-400">Weighted avg: เดือนล่าสุด 50% + เดือนก่อน 30% + เดือนก่อนหน้า 20%</p>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-100">
                <th class="px-4 pb-2 text-[10px] text-slate-400 font-bold uppercase">หมวดหมู่</th>
                ${headers}
                <th class="px-4 pb-2 text-right text-[10px] text-indigo-500 font-bold uppercase">คาดการณ์</th>
                <th class="px-3 pb-2 text-center text-[10px] text-slate-400 font-bold uppercase">ความแม่น</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${f.items.length > 20 ? `<p class="text-[10px] text-slate-400 text-center mt-3">แสดง 20 รายการแรก จาก ${f.items.length}</p>` : ''}
      </div>`;
  },

  _renderRecurring(items) {
    if (items.length === 0) {
      return `
        <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="p-2 bg-teal-50 text-teal-600 rounded-lg"><i data-lucide="repeat" class="w-5 h-5"></i></div>
            <h3 class="font-bold text-slate-800">Recurring Transactions</h3>
          </div>
          <p class="text-center text-slate-400 text-sm py-8">ไม่พบรายการที่เกิดซ้ำสม่ำเสมอในช่วง 6 เดือน</p>
        </div>`;
    }

    const statusBg = { overdue: 'bg-rose-50 text-rose-700', soon: 'bg-amber-50 text-amber-700', upcoming: 'bg-slate-50 text-slate-500' };
    const statusLabel = { overdue: 'เลยกำหนด', soon: 'ใกล้มาถึง', upcoming: 'กำลังมา' };
    const typeBadge = t => t === 'income'
      ? '<span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-full">รายรับ</span>'
      : '<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-bold rounded-full">รายจ่าย</span>';

    const rows = items.map(r => {
      const daysStr = r.daysUntil === 0 ? 'วันนี้'
        : r.daysUntil > 0 ? `อีก ${r.daysUntil} วัน`
        : `เกิน ${Math.abs(r.daysUntil)} วัน`;
      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50">
          <td class="px-4 py-2.5">${typeBadge(r.type)}</td>
          <td class="px-4 py-2.5 text-sm font-medium text-slate-700 max-w-[120px] truncate">${r.cat}</td>
          <td class="px-4 py-2.5 text-xs text-slate-500 max-w-[100px] truncate">${r.fot || '-'}</td>
          <td class="px-4 py-2.5 text-sm font-number text-right font-bold text-slate-800">${Format.money(r.avgAmount)}</td>
          <td class="px-4 py-2.5 text-xs text-center text-slate-500">${r.frequency}</td>
          <td class="px-4 py-2.5 text-xs text-slate-600">${this._fmtDate(r.nextDate)}</td>
          <td class="px-4 py-2.5 text-center">
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${statusBg[r.status]}">${daysStr}</span>
          </td>
        </tr>`;
    }).join('');

    const totalFixedExpense = items.filter(r => r.type === 'expense' && r.frequency === 'รายเดือน').reduce((s, r) => s + r.avgAmount, 0);
    const totalFixedIncome  = items.filter(r => r.type === 'income'  && r.frequency === 'รายเดือน').reduce((s, r) => s + r.avgAmount, 0);

    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-teal-50 text-teal-600 rounded-lg"><i data-lucide="repeat" class="w-5 h-5"></i></div>
            <div>
              <h3 class="font-bold text-slate-800">Recurring Transactions — รายการที่เกิดซ้ำสม่ำเสมอ</h3>
              <p class="text-[10px] text-slate-400">ตรวจจากรายการที่มียอดใกล้เคียงกัน (CV ≤ 15%) และช่วงเวลาสม่ำเสมอ</p>
            </div>
          </div>
          <div class="text-right hidden sm:block">
            <p class="text-[10px] text-slate-400">Fixed expense/เดือน</p>
            <p class="text-sm font-bold text-rose-600">${Format.money(totalFixedExpense)}</p>
            ${totalFixedIncome > 0 ? `<p class="text-[10px] text-emerald-600 font-medium">+รายรับ ${Format.money(totalFixedIncome)}</p>` : ''}
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm min-w-[600px]">
            <thead>
              <tr class="border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <th class="px-4 pb-2">ประเภท</th>
                <th class="px-4 pb-2">หมวดหมู่</th>
                <th class="px-4 pb-2">รายละเอียด</th>
                <th class="px-4 pb-2 text-right">ยอดเฉลี่ย</th>
                <th class="px-4 pb-2 text-center">ความถี่</th>
                <th class="px-4 pb-2">ครั้งถัดไป (คาดการณ์)</th>
                <th class="px-4 pb-2 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  },

  // ─── CHART ───────────────────────────────────────────────────

  _drawChart(chartData) {
    const canvas = document.getElementById('forecast-runway-chart');
    if (!canvas) return;
    if (this._charts.runway) { this._charts.runway.destroy(); }

    const labels = chartData.map(d => d.label);
    const values = chartData.map(d => d.value);
    const baseline = values[0];
    const bgColors = values.map(v =>
      v < 0      ? 'rgba(239,68,68,0.75)' :
      v < baseline * 0.25 ? 'rgba(245,158,11,0.75)' :
      v < baseline ? 'rgba(251,191,36,0.75)' : 'rgba(99,102,241,0.75)'
    );

    this._charts.runway = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'ยอดเงินคาดการณ์ (เงินสด)',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `฿${Number(ctx.raw).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
            }
          }
        },
        scales: {
          y: {
            ticks: { callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'k' : v },
            grid: { color: '#f1f5f9' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }
};
