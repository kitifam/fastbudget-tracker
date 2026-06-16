const { useState, useEffect, useMemo, useCallback } = React;
const {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Line, Area, AreaChart, ReferenceLine
} = Recharts;

const CATEGORY_COLORS = ['#ef4444', '#3b82f6', '#4ade80', '#f59e0b', '#facc15', '#a3e635', '#818cf8', '#fb7185', '#2dd4bf', '#a78bfa'];
const BLUE_PALETTE = ['#0D47A1', '#1565C0', '#1976D2', '#1E88E5', '#2196F3', '#42A5F5', '#64B5F6', '#90CAF9', '#BBDEFB', '#E3F2FD'];
const ORANGE_PALETTE = ['#E65100', '#EF6C00', '#F57C00', '#FB8C00', '#FF9800', '#FFA726', '#FFB74D', '#FFCC80', '#FFE0B2', '#FFF3E0'];
const OVERVIEW_TX_RULES = window.TransactionRules;

// Use local date methods to avoid UTC offset shifting the date string (toISOString converts to UTC)
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const OverviewDashboard = ({ userId, initialTransactions = [], allAccounts, allCategories }) => {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [viewMode, setViewMode] = useState('weekly'); // 'weekly', 'monthly', 'yearly'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMetric, setCurrentMetric] = useState('Net'); // Default to 'Net'
  const [drillDown, setDrillDown] = useState({ category: null, account: null, date: null, type: null });

  const [sortConfig, setSortConfig] = useState({ key: 'amount', direction: 'desc' });
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showTransfers, setShowTransfers] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });
  const [prevYearTransactions, setPrevYearTransactions] = useState([]);
  const [prevMonthTransactions, setPrevMonthTransactions] = useState([]);
  const [monthlyBudget, setMonthlyBudget] = useState(0);

  useEffect(() => {
    if (window.lucide) lucide.createIcons();
  }, [viewMode, selectedDate, transactions, showTransfers, isMenuOpen]);

  // Date Range Logic
  const dateRange = useMemo(() => {
    const d = new Date(selectedDate);
    if (viewMode === 'yearly') {
      const start = new Date(d.getFullYear(), 0, 1);
      const end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    } else if (viewMode === 'monthly') {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    } else {
      // Weekly: Find start of week (Monday)
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
      const start = new Date(d.setDate(diff));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }, [selectedDate, viewMode]);

  // ดึงข้อมูลเมื่อ Date Range เปลี่ยน (ข้ามรอบแรกเพราะใช้ initialTransactions)
  const isFirstMount = React.useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const dateFrom = toLocalDateStr(dateRange.start);
        const dateTo = toLocalDateStr(dateRange.end);
        
        const fetchTasks = [
          DB.getTransactions(userId, { dateFrom, dateTo, sortBy: 'date', limit: 10000, onProgress: (loaded, total) => setLoadProgress({ loaded, total }) })
        ];

        // ถ้าเป็นโหมด Yearly ให้ดึงข้อมูลปีก่อนหน้ามาเทียบด้วย
        if (viewMode === 'yearly') {
          const prevYearStart = new Date(dateRange.start);
          prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
          const prevYearEnd = new Date(dateRange.end);
          prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);

          fetchTasks.push(DB.getTransactions(userId, {
            dateFrom: toLocalDateStr(prevYearStart),
            dateTo: toLocalDateStr(prevYearEnd),
            sortBy: 'date',
            limit: 10000
          }));
        }

        // ถ้าเป็นโหมด Monthly ให้ดึงข้อมูลเดือนก่อนหน้ามาเทียบด้วย
        if (viewMode === 'monthly') {
          const prevMonthStart = new Date(dateRange.start);
          prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
          const prevMonthEnd = new Date(dateRange.end);
          prevMonthEnd.setMonth(prevMonthEnd.getMonth() - 1);

          fetchTasks.push(DB.getTransactions(userId, {
            dateFrom: toLocalDateStr(prevMonthStart),
            dateTo: toLocalDateStr(prevMonthEnd),
            sortBy: 'date',
            limit: 10000
          }));

          // ดึงงบประมาณเฉพาะโหมด Monthly (ใช้แสดง BudgetPace ใน Trend chart)
          fetchTasks.push(DB.getBudgets(userId));
        }

        const results = await Promise.all(fetchTasks);
        setTransactions(results[0].data || []);

        if (viewMode === 'yearly') {
          setPrevYearTransactions(results[1]?.data || []);
          setPrevMonthTransactions([]);
        } else if (viewMode === 'monthly') {
          setPrevMonthTransactions(results[1]?.data || []);
          setPrevYearTransactions([]);
          const budgets = results[2] || [];
          const totalMonthlyBudget = budgets
            .filter(b => b.period === 'monthly')
            .reduce((s, b) => s + parseFloat(b.amount), 0);
          setMonthlyBudget(totalMonthlyBudget);
        } else {
          // weekly: ไม่ต้องการข้อมูล prev period หรือ budget
          setPrevYearTransactions([]);
          setPrevMonthTransactions([]);
        }

      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [dateRange, userId, viewMode]);

  // Reset drillDown and showAll when viewMode changes
  useEffect(() => {
    setDrillDown({ category: null, account: null, date: null, type: null });
    setShowAllTransactions(false);
  }, [viewMode]);

  // Available Years for Year Selector
  const availableYears = useMemo(() => {
    const yearSet = {};
    transactions.forEach(t => {
      const y = new Date(t.date).getFullYear();
      yearSet[y] = true;
    });
    const currentYear = new Date().getFullYear();
    yearSet[currentYear] = true;
    const years = Object.keys(yearSet).map(Number).sort();
    return years;
  }, [transactions]);

  const label = useMemo(() => {
    const start = dateRange.start;
    const end = dateRange.end;
    const year = end.getFullYear();

    if (viewMode === 'yearly') return year.toString();

    if (viewMode === 'monthly') {
      return start.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    }

    // Weekly mode:
    const sMonth = start.toLocaleString('en-US', { month: 'short' });
    const eMonth = end.toLocaleString('en-US', { month: 'short' });
    const sDay = start.getDate();
    const eDay = end.getDate();

    if (sMonth === eMonth) {
      return `${sMonth} ${sDay} - ${eDay}, ${year}`;
    }
    return `${sMonth} ${sDay} - ${eMonth} ${eDay}, ${year}`;
  }, [dateRange, viewMode]);

  const changePeriod = (offset) => {
    const nextDate = new Date(selectedDate);
    if (viewMode === 'yearly') {
      nextDate.setFullYear(nextDate.getFullYear() + offset);
    } else if (viewMode === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + offset);
    } else {
      nextDate.setDate(nextDate.getDate() + (offset * 7));
    }
    setSelectedDate(nextDate);
    setDrillDown({ category: null, account: null, date: null, type: null });
  };

  const handleResetFilters = () => {
    setDrillDown({ category: null, account: null, date: null, type: null });
    setShowAllTransactions(false);
    setShowTransfers(false);
  };

  const baseFilteredData = useMemo(() => {
    return OVERVIEW_TX_RULES.filterVisible(transactions, showTransfers);
  }, [transactions, showTransfers]);

  const prevYearFilteredData = useMemo(() => {
    let data = prevYearTransactions;
    data = OVERVIEW_TX_RULES.filterVisible(data, showTransfers);
    if (drillDown.category) {
      data = data.filter(t => {
        const cat = (t.categories && t.categories.name) ? t.categories.name : 'อื่นๆ';
        return cat === drillDown.category;
      });
    }
    if (drillDown.account) {
      data = data.filter(t => {
        const acc = (t.accounts && t.accounts.name) ? t.accounts.name : null;
        return acc === drillDown.account;
      });
    }
    return data;
  }, [prevYearTransactions, drillDown.category, drillDown.account, showTransfers]);

  const prevMonthFilteredData = useMemo(() => {
    let data = prevMonthTransactions;
    data = OVERVIEW_TX_RULES.filterVisible(data, showTransfers);
    if (drillDown.category) {
      data = data.filter(t => {
        const cat = (t.categories && t.categories.name) ? t.categories.name : 'อื่นๆ';
        return cat === drillDown.category;
      });
    }
    if (drillDown.account) {
      data = data.filter(t => {
        const acc = (t.accounts && t.accounts.name) ? t.accounts.name : null;
        return acc === drillDown.account;
      });
    }
    return data;
  }, [prevMonthTransactions, drillDown.category, drillDown.account, showTransfers]);

  // Data that is filtered by Category/Account/Transfers but NOT by Date
  const globalFilteredData = useMemo(() => {
    let data = baseFilteredData;
    if (drillDown.category) {
      data = data.filter(t => {
        const cat = (t.categories && t.categories.name) ? t.categories.name : 'อื่นๆ';
        return cat === drillDown.category;
      });
    }
    if (drillDown.account) {
      data = data.filter(t => {
        const acc = (t.accounts && t.accounts.name) ? t.accounts.name : null;
        return acc === drillDown.account;
      });
    }
    return data;
  }, [baseFilteredData, drillDown.category, drillDown.account]);

  const dateFilteredData = useMemo(() => {
    let base = globalFilteredData;
    if (drillDown.date) {
      base = base.filter(t => {
        const d = new Date(t.date);
        if (viewMode === 'weekly') return t.date === drillDown.date;
        if (viewMode === 'monthly') {
          const start = new Date(dateRange.start);
          const diffDays = Math.floor(Math.abs(d - start) / (1000 * 60 * 60 * 24));
          return Math.floor(diffDays / 7) === drillDown.date;
        }
        if (viewMode === 'yearly') return d.getMonth() === drillDown.date;
        return true;
      });
    }
    if (drillDown.type) {
      base = base.filter(t => t.type === drillDown.type);
    }
    return base;
  }, [globalFilteredData, drillDown.date, drillDown.type, viewMode, dateRange]);

  const allocationData = useMemo(() => {
    const map = {};
    const typeFilter = currentMetric === 'Net' ? 'expense' : currentMetric.toLowerCase();
    dateFilteredData.filter(t => t.type === typeFilter).forEach(t => {
      const cat = (t.categories && t.categories.name) ? t.categories.name : 'อื่นๆ';
      map[cat] = (map[cat] || 0) + Math.abs(parseFloat(t.amount));
    });
    const sortedNames = Object.keys(map).sort((a, b) => map[b] - map[a]);
    const top = sortedNames.slice(0, 7).map(name => ({ name, value: map[name] }));
    const others = sortedNames.slice(7).reduce((s, name) => s + map[name], 0);
    const result = top;
    if (others > 0) result.push({ name: 'Others', value: others });
    return result;
  }, [dateFilteredData, currentMetric]);

  const filteredData = useMemo(() => {
    // ดึงรายชื่อหมวดหมู่ที่ติด Top 7 เพื่อใช้สำหรับกรณีคลิก 'Others'
    const top7Categories = allocationData.filter(d => d.name !== 'Others').map(d => d.name);

    return dateFilteredData.filter(t => {
      const cat = (t.categories && t.categories.name) ? t.categories.name : 'อื่นๆ';

      if (drillDown.category) {
        if (drillDown.category === 'Others') {
          // ถ้าเลือก 'Others' ให้แสดงรายการที่ไม่อยู่ใน Top 7
          if (top7Categories.includes(cat)) return false;
        } else {
          // ถ้าเลือกหมวดหมู่ปกติ
          if (cat !== drillDown.category) return false;
        }
      }

      const accName = (t.accounts && t.accounts.name) ? t.accounts.name : null;
      if (drillDown.account && accName !== drillDown.account) return false;
      return true;
    });
  }, [dateFilteredData, drillDown, allocationData]);

  const sortedFilteredData = useMemo(() => {
    let sortableData = [...filteredData];
    if (sortConfig.key !== null) {
      sortableData.sort((a, b) => {
        let aValue, bValue;
        if (sortConfig.key === 'category') { aValue = (a.categories && a.categories.name) || 'อื่นๆ'; bValue = (b.categories && b.categories.name) || 'อื่นๆ'; }
        else if (sortConfig.key === 'account') { aValue = (a.accounts && a.accounts.name) || 'อื่นๆ'; bValue = (b.accounts && b.accounts.name) || 'อื่นๆ'; }
        else if (sortConfig.key === 'amount') { aValue = parseFloat(a.amount || 0); bValue = parseFloat(b.amount || 0); }
        else { aValue = a[sortConfig.key]; bValue = b[sortConfig.key]; }

        // Handle string comparison for non-numeric keys
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }

        // Handle numeric/date comparison
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableData;
  }, [filteredData, sortConfig]);

  const requestSort = (key) => {
    let direction = key === 'amount' ? 'desc' : 'asc';
    if (sortConfig.key === key) {
      direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    }
    setSortConfig({ key, direction });
  };

  // Summaries (KPIs)
  const summary = useMemo(() => {
    const income = filteredData.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const expense = filteredData.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const investmentProfit = allAccounts
      .filter(a => a && ['investment', 'mutual_fund', 'stock', 'gold'].includes(a.type))
      .reduce((s, a) => {
        const inv = (a.investments && a.investments[0]) ? a.investments[0] : null;
        return s + (inv ? (Number(inv.current_value) - Number(inv.invested_amount)) : 0);
      }, 0);
    const creditDebt = allAccounts
      .filter(a => a && a.type === 'credit_card')
      .reduce((s, a) => s + Math.abs(Number(a.balance || 0)), 0);
    const net = income - expense;
    const savingsRate = income > 0 ? (net / income) * 100 : 0;
    return { income, expense, net, savingsRate, investmentProfit, creditDebt };
  }, [filteredData, allAccounts]);

  // Efficiency & Volume Data
  const efficiencyData = useMemo(() => {
    const data = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    if (viewMode === 'weekly') {
      for (let i = 0; i < 7; i++) {
        const d = new Date(dateRange.start);
        d.setDate(d.getDate() + i);
        const dateStr = toLocalDateStr(d);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const inc = globalFilteredData.filter(t => t.date === dateStr && t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const exp = globalFilteredData.filter(t => t.date === dateStr && t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const netVal = inc - exp;
        const rate = inc > 0 ? (netVal / inc) * 100 : 0;
        data.push({ name: dayName, dateKey: dateStr, Income: inc, Expense: exp, Net: netVal, SavingsRate: rate });
      }
    } else if (viewMode === 'monthly') {
      let current = new Date(dateRange.start);
      let weekIdx = 0;
      while (current <= dateRange.end) {
        const wStart = new Date(current);
        const wEnd = new Date(current);
        wEnd.setDate(wEnd.getDate() + 6);
        if (wEnd > dateRange.end) wEnd.setTime(dateRange.end.getTime());
        const trans = globalFilteredData.filter(t => { const d = new Date(t.date); return d >= wStart && d <= wEnd; });
        const inc = trans.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const exp = trans.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const netVal = inc - exp;
        const rate = inc > 0 ? (netVal / inc) * 100 : 0;
        data.push({ name: `W${weekIdx + 1}`, dateKey: weekIdx, Income: inc, Expense: exp, Net: netVal, SavingsRate: rate });
        current.setDate(current.getDate() + 7);
        weekIdx++;
      }
    } else {
      for (let m = 0; m < 12; m++) {
        const year = dateRange.start.getFullYear();
        const trans = globalFilteredData.filter(t => {
          const d = new Date(t.date);
          return d.getFullYear() === year && d.getMonth() === m;
        });
        const inc = trans.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const exp = trans.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const netVal = inc - exp;
        const rate = inc > 0 ? (netVal / inc) * 100 : 0;
        data.push({ name: monthNames[m], dateKey: m, Income: inc, Expense: exp, Net: netVal, SavingsRate: rate });
      }
    }
    return data;
  }, [globalFilteredData, dateRange, viewMode]);

  const trendData = useMemo(() => {
    const data = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    if (viewMode === 'weekly') {
      let totalExp = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(dateRange.start);
        d.setDate(d.getDate() + i);
        const dateStr = toLocalDateStr(d);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const exp = globalFilteredData.filter(t => t.date === dateStr && t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        totalExp += exp;
        data.push({ name: dayName, Expense: exp, dateKey: dateStr });
      }
      const avg = totalExp / 7;
      data.forEach(item => item.Average = avg);
    } else if (viewMode === 'monthly') {
      let current = new Date(dateRange.start);
      let weekIdx = 0;
      let cumulativeExp = 0;
      let prevCumulativeExp = 0;
      const totalWeeks = Math.ceil((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24 * 7));
      
      const pmStart = new Date(dateRange.start);
      pmStart.setMonth(pmStart.getMonth() - 1);

      while (current <= dateRange.end) {
        const wStart = new Date(current);
        const wEnd = new Date(current);
        wEnd.setDate(wEnd.getDate() + 6);
        
        // Previous Month Window
        const pwStart = new Date(wStart);
        pwStart.setMonth(pwStart.getMonth() - 1);
        const pwEnd = new Date(wEnd);
        pwEnd.setMonth(pwEnd.getMonth() - 1);

        const trans = globalFilteredData.filter(t => { const d = new Date(t.date); return d >= wStart && d <= wEnd; });
        const exp = trans.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        cumulativeExp += exp;

        const pTrans = prevMonthFilteredData.filter(t => { const d = new Date(t.date); return d >= pwStart && d <= pwEnd; });
        const pExp = pTrans.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        prevCumulativeExp += pExp;

        data.push({ 
          name: `W${weekIdx + 1}`, 
          CumulativeExpense: cumulativeExp,
          PrevMonthCumulative: prevCumulativeExp,
          BudgetPace: (monthlyBudget / totalWeeks) * (weekIdx + 1)
        });
        current.setDate(current.getDate() + 7);
        weekIdx++;
      }
    } else {
      const year = dateRange.start.getFullYear();
      const monthlyTotals = [];
      for (let m = 0; m < 12; m++) {
        const exp = globalFilteredData.filter(t => {
          const d = new Date(t.date);
          return d.getFullYear() === year && d.getMonth() === m && t.type === 'expense';
        }).reduce((s, t) => s + parseFloat(t.amount), 0);
        const prevExp = prevYearFilteredData.filter(t => {
          const d = new Date(t.date);
          return d.getMonth() === m && t.type === 'expense';
        }).reduce((s, t) => s + parseFloat(t.amount), 0);
        monthlyTotals.push({ name: monthNames[m], Expense: exp, PrevYearExpense: prevExp, dateKey: m });
      }
      const sorted = [...monthlyTotals].sort((a,b) => b.Expense - a.Expense);
      const top3 = sorted.slice(0, 3).map(m => m.name);
      monthlyTotals.forEach(m => m.isTopMonth = top3.includes(m.name));
      data.push(...monthlyTotals);
    }
    return data;
  }, [globalFilteredData, dateRange, viewMode, monthlyBudget, prevYearFilteredData, prevMonthFilteredData]);

  // Chart Rankings
  const categoryRanking = useMemo(() => {
    const map = {};
    const typeFilter = currentMetric === 'Net' ? 'expense' : currentMetric.toLowerCase();
    dateFilteredData.filter(t => t.type === typeFilter).forEach(t => {
      const cat = (t.categories && t.categories.name) ? t.categories.name : 'อื่นๆ';
      map[cat] = (map[cat] || 0) + Math.abs(parseFloat(t.amount));
    });
    return Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, 10).map(name => ({ name, value: map[name] }));
  }, [dateFilteredData, currentMetric]);

  const accountWeight = useMemo(() => {
    const map = {};
    const typeFilter = currentMetric === 'Net' ? 'expense' : currentMetric.toLowerCase();
    dateFilteredData.filter(t => t.type === typeFilter).forEach(t => {
      const acc = (t.accounts && t.accounts.name) ? t.accounts.name : 'อื่นๆ';
      map[acc] = (map[acc] || 0) + Math.abs(parseFloat(t.amount));
    });
    return Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, 10).map(name => ({ name, value: map[name] }));
  }, [dateFilteredData, currentMetric]);



  const renderCustomLabel = (props) => {
    const { x, y, width, height, value, index, maxLabels } = props;
    if (maxLabels && index >= maxLabels) return null;
    const formatted = value >= 1000 ? (value / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k' : Math.round(value).toLocaleString();
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill="#64748b"
        fontSize={9}
        fontWeight="bold"
        textAnchor="middle"
      >
        {formatted}
      </text>
    );
  };

  const renderRankingLabel = (props) => {
    const { x, y, width, height, value, index } = props;
    if (index >= 5) return null;
    const formatted = value >= 1000 ? (value / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k' : Math.round(value).toLocaleString();
    return (
      <text
        x={x + width + 5}
        y={y + height / 2}
        fill="#64748b"
        fontSize={9}
        fontWeight="bold"
        dominantBaseline="middle"
      >
        {formatted}
      </text>
    );
  };

  const formatMoney = (val) => '฿' + Number(Math.round(Math.abs(val))).toLocaleString();

  const handleEditTransaction = (txId) => {
    console.log('Editing transaction:', txId);
    if (window.TransactionsPage) {
      // ตรวจสอบและเติมข้อมูลที่จำเป็นให้ TransactionsPage
      if (!window.TransactionsPage.accounts || window.TransactionsPage.accounts.length === 0) {
        window.TransactionsPage.accounts = allAccounts;
      }
      if (!window.TransactionsPage.categories || window.TransactionsPage.categories.length === 0) {
        window.TransactionsPage.categories = allCategories || [];
      }
      // ใช้ state 'transactions' ที่มีข้อมูลของช่วงเวลาปัจจุบัน
      window.TransactionsPage.transactions = transactions;

      // ค้นหา transaction จาก state ปัจจุบัน
      const tx = transactions.find(t => t.id === txId);
      if (tx) {
        // อัปเดตข้อมูลใน TransactionsPage เผื่อมีการแก้ไข
        const idx = window.TransactionsPage.transactions.findIndex(t => t.id === txId);
        if (idx !== -1) window.TransactionsPage.transactions[idx] = tx;
        else window.TransactionsPage.transactions.push(tx);

        window.TransactionsPage.openModal(txId);
      }
    } else {
      console.warn('TransactionsPage not found');
    }
  };

  const handleToggleDrillDown = (field, value) => {
    setDrillDown(prev => {
      const newVal = prev[field] === value ? null : value;
      return { ...prev, [field]: newVal };
    });
  };

  const handleToggleDateTime = (dateKey, typeValue) => {
    setDrillDown(prev => {
      // ถ้าคลิกซ้ำที่เดิม (ทั้งวันและประเภท) ให้ล้างค่า
      if (prev.date === dateKey && prev.type === typeValue) {
        return { ...prev, date: null, type: null };
      }
      // ถ้าคลิกวันเดิมแต่เปลี่ยนประเภท หรือเปลี่ยนวัน
      return { ...prev, date: dateKey, type: typeValue };
    });
  };

  const handleCardClick = (mode) => {
    if (window.OverviewPage && window.OverviewPage.viewTxSpecial) {
      window.OverviewPage.viewTxSpecial(mode, dateRange);
    }
  };

  const renderSavingsLabel = (props) => {
    const { x, y, value } = props;
    if (value === undefined || value === 0) return null;
    return (
      <text x={x} y={y - 10} fill="#4A148C" fontSize={10} fontWeight="bold" textAnchor="middle">
        {value.toFixed(0)}%
      </text>
    );
  };

  const handleQuickAdd = useCallback(async (type) => {
    if (window.TransactionsPage) {
      // 1. เติมข้อมูลที่จำเป็นให้ TransactionsPage (เผื่อกรณีเข้าหน้า Overview เป็นหน้าแรก)
      if (!window.TransactionsPage.accounts || window.TransactionsPage.accounts.length === 0) {
        window.TransactionsPage.accounts = allAccounts;
      }
      if (!window.TransactionsPage.categories || window.TransactionsPage.categories.length === 0) {
        window.TransactionsPage.categories = allCategories || [];
      }

      // 2. เรียกเปิด Modal เพื่อจัดการ Session/UserId
      await window.TransactionsPage.openModal();

      const modal = document.getElementById('tx-modal');
      if (modal) {
        modal.classList.remove('hidden');

        // 3. เรียกใช้ Full Form (Amount/Category/Account) ทันทีสำหรับทุกประเภท
        // วิธีนี้จะทำให้ รายรับ และ รายจ่าย เข้าสู่หน้า "Transaction Form" ได้โดยตรงและรวดเร็ว
        window.TransactionsPage._renderFullForm({
          type: type,
          category_id: '',
          account_id: (allAccounts && allAccounts.length > 0) ? allAccounts[0].id : '',
          amount: '',
          note: '',
          date: toLocalDateStr(new Date())
        });

        // 4. บังคับสร้างไอคอนใหม่
        setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 10);
      }
    }
  }, [allAccounts, allCategories]);

  const SummaryCard = ({ title, value, colorClass, icon, onClick, mode }) => (
    <div onClick={onClick} className="bg-white border border-slate-100 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all animate-fade-in-up flex flex-col gap-1">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
      <div className="flex items-center justify-between">
        <p className={`text-xl font-black ${colorClass}`}>{value}</p>
        <div className={`w-8 h-8 rounded-lg ${colorClass.replace('text-', 'bg-').replace('800', '500').replace('700', '500')} flex items-center justify-center text-white shadow-sm`}>
          <i data-lucide={icon} className="w-4 h-4"></i>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-col gap-6 max-w-[1400px] mx-auto p-2 sm:p-4 rounded-3xl min-h-[600px]" style={{ backgroundColor: '#F3E5F5' }}>

      {/* Loading Toast (top-right) */}
      {isLoading && (
        <div className="fixed top-4 right-4 z-[200] flex items-center gap-2.5 bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg shadow-blue-200 animate-fade-in" style={{ backdropFilter: 'none' }}>
          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin flex-shrink-0"></div>
          <span>
            {loadProgress.total > 0
              ? `กำลังโหลด... ${loadProgress.loaded.toLocaleString()} / ${loadProgress.total.toLocaleString()}`
              : 'กำลังโหลดข้อมูล...'}
          </span>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-purple-100 flex flex-col gap-4 md:gap-6">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="p-2.5 md:p-3 bg-purple-600 text-white rounded-2xl shadow-lg flex-shrink-0">
              <i data-lucide="layout-dashboard" className="w-5 h-5 md:w-6 md:h-6"></i>
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-xl font-black text-[#4A148C] tracking-tight truncate">Periodic</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none truncate">Health Monitor</p>
            </div>
          </div>

          {/* Metric Selector (Mobile & Tablet) */}
          <div className="flex bg-slate-100 p-0.5 rounded-full border border-slate-200">
            {[
              { m: 'Income', icon: 'arrow-down-left' },
              { m: 'Expense', icon: 'arrow-up-right' },
              { m: 'Net', icon: 'scale' }
            ].map(item => (
              <button
                key={item.m}
                onClick={() => setCurrentMetric(item.m)}
                className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full transition-all ${currentMetric === item.m ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500'}`}
              >
                <i data-lucide={item.icon} className="w-3.5 h-3.5 md:w-4 md:h-4"></i>
              </button>
            ))}
          </div>
        </div>

        {/* PERIOD & VIEW SELECTORS */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-50">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200 shadow-inner w-full sm:w-auto justify-center">
            {['weekly', 'monthly', 'yearly'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-4 md:px-5 py-1.5 rounded-full text-[10px] font-black transition-all flex-1 sm:flex-none ${viewMode === m ? 'bg-white text-[#4A148C] shadow-md' : 'text-slate-500'}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>

        {/* Date Selector */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            <button onClick={() => changePeriod(-1)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-sm active:scale-90 transition-transform">
              <i data-lucide="chevron-left" className="w-4 h-4"></i>
            </button>

            <span className="text-[11px] md:text-sm font-black text-[#4A148C] px-2 min-w-[100px] text-center whitespace-nowrap">{label}</span>

            <button onClick={() => changePeriod(1)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-sm active:scale-90 transition-transform">
              <i data-lucide="chevron-right" className="w-4 h-4"></i>
            </button>

            <div className="flex items-center gap-2 ml-auto sm:ml-2">
              <button
                onClick={() => setShowTransfers(!showTransfers)}
                title={showTransfers ? 'แสดงรายการโอน' : 'ซ่อนรายการโอน'}
                aria-label={showTransfers ? 'แสดงรายการโอน' : 'ซ่อนรายการโอน'}
                className={`flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${showTransfers
                  ? 'bg-blue-500 text-white border-blue-500 shadow-blue-100'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  } px-2 py-2 sm:px-3 sm:py-1.5`}
              >
                <i data-lucide={showTransfers ? "eye" : "eye-off"} className="w-4 h-4"></i>
                <span className="hidden sm:inline whitespace-nowrap">{showTransfers ? 'แสดงรายการโอน' : 'ซ่อนรายการโอน'}</span>
              </button>

              <button
                onClick={handleResetFilters}
                title="รีเซ็ตฟิลเตอร์"
                aria-label="รีเซ็ตฟิลเตอร์"
                className="flex items-center justify-center gap-2 px-2 py-2 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all border border-slate-200 shadow-sm"
              >
                <i data-lucide="rotate-ccw" className="w-4 h-4"></i>
                <span className="hidden sm:inline whitespace-nowrap">รีเซ็ตฟิลเตอร์</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Income" value={formatMoney(summary.income)} colorClass="text-emerald-700" icon="arrow-down-left" onClick={() => handleCardClick('income')} />
        <SummaryCard title="Expenses" value={formatMoney(summary.expense)} colorClass="text-rose-700" icon="arrow-up-right" onClick={() => handleCardClick('expense')} />
        <SummaryCard title="Investment (Profit)" value={(summary.investmentProfit < 0 ? '-' : '') + formatMoney(summary.investmentProfit)} colorClass="text-blue-700" icon="trending-up" onClick={() => handleCardClick('investment')} />
        <SummaryCard title="Credit Card Debt" value={formatMoney(summary.creditDebt)} colorClass="text-purple-700" icon="credit-card" onClick={() => handleCardClick('credit')} />
      </div>

      {/* CHARTS ROW 1: Efficiency & Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-[400px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl shadow-inner"><i data-lucide="scale" className="w-5 h-5"></i></div>
            <div>
              <h4 className="text-[#4A148C] font-black text-sm uppercase tracking-wide">Efficiency & Volume</h4>
              <p className="text-[10px] text-slate-400 font-bold">{currentMetric} timeline</p>
            </div>
          </div>
          <div className="flex-1 w-full h-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={efficiencyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="money" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => v.toLocaleString(undefined, { notation: 'compact' })} />
                <YAxis yAxisId="percent" orientation="right" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(val, name) => name === "SavingsRate" ? [`${Number(val).toFixed(1)}%`, "Savings Rate"] : [Number(val).toLocaleString(), name]} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '15px' }} />
                {currentMetric === 'Income' || currentMetric === 'Net' ? (
                  <Bar yAxisId="money" dataKey="Income" fill="#60d394" radius={[6, 6, 0, 0]} barSize={24} onClick={(d) => handleToggleDateTime(d.dateKey, 'income')} cursor="pointer">
                    {efficiencyData.map((entry, index) => {
                      const isSelected = drillDown.date === entry.dateKey && drillDown.type === 'income';
                      const hasSpecificSelection = drillDown.date !== null || drillDown.type !== null;
                      // ถ้าไม่มีการเลือกในกราฟนี้เลย ให้เข้ม 100% แต่ถ้ามีการเลือกในกราฟนี้ ให้จางส่วนที่ไม่ใช่
                      return <Cell key={`cell-inc-${index}`} fillOpacity={isSelected ? 1 : (hasSpecificSelection ? 0.3 : 1)} />;
                    })}
                  </Bar>
                ) : null}
                {currentMetric === 'Expense' || currentMetric === 'Net' ? (
                  <Bar yAxisId="money" dataKey="Expense" fill="#ff686b" radius={[6, 6, 0, 0]} barSize={24} onClick={(d) => handleToggleDateTime(d.dateKey, 'expense')} cursor="pointer">
                    {efficiencyData.map((entry, index) => {
                      const isSelected = drillDown.date === entry.dateKey && drillDown.type === 'expense';
                      const hasSpecificSelection = drillDown.date !== null || drillDown.type !== null;
                      return <Cell key={`cell-exp-${index}`} fillOpacity={isSelected ? 1 : (hasSpecificSelection ? 0.3 : 1)} />;
                    })}
                  </Bar>
                ) : null}
                <Line yAxisId="percent" type="monotone" dataKey="SavingsRate" name="SavingsRate" stroke="#2196F3" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: '#2196F3' }} label={renderSavingsLabel} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-[400px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shadow-inner"><i data-lucide="trending-up" className="w-5 h-5"></i></div>
            <div>
              <h4 className="text-[#4A148C] font-black text-sm uppercase tracking-wide">Trend Analysis</h4>
              <p className="text-[10px] text-slate-400 font-bold">Spending pattern across period</p>
            </div>
          </div>
          <div className="flex-1 w-full h-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === 'weekly' ? (
                <BarChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? (v / 1000) + 'k' : v} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val) => Number(val).toLocaleString()} />
                  <ReferenceLine y={trendData[0]?.Average} stroke="#fb7185" strokeDasharray="3 3" label={{ position: 'right', value: 'AVG', fill: '#fb7185', fontSize: 10, fontWeight: 'bold' }} />
                  <Bar dataKey="Expense" radius={[4, 4, 0, 0]} barSize={30} onClick={(d) => handleToggleDrillDown('date', d.dateKey)} cursor="pointer">
                    {trendData.map((entry, index) => (
                      <Cell key={`cell-weekly-${index}`} fill={entry.Expense > entry.Average ? '#fb7185' : '#2dd4bf'} />
                    ))}
                  </Bar>
                </BarChart>
              ) : viewMode === 'monthly' ? (
                <ComposedChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? (v / 1000) + 'k' : v} />
                  <Tooltip formatter={(val) => Number(val).toLocaleString()} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                  <defs>
                    <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="CumulativeExpense" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorCumulative)" name="Current Month" />
                  <Line type="monotone" dataKey="PrevMonthCumulative" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={2} name="Prev Month" />
                  <Line type="monotone" dataKey="BudgetPace" stroke="#3b82f6" strokeDasharray="5 5" dot={false} strokeWidth={2} name="Budget Pace" />
                </ComposedChart>
              ) : (
                <ComposedChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? (v / 1000) + 'k' : v} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val) => Number(val).toLocaleString()} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                  <Bar dataKey="Expense" radius={[4, 4, 0, 0]} barSize={25} onClick={(d) => handleToggleDrillDown('date', d.dateKey)} cursor="pointer" name="This Year">
                    {trendData.map((entry, index) => (
                      <Cell key={`cell-yearly-${index}`} fill={entry.isTopMonth ? '#f59e0b' : '#c4b5fd'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="PrevYearExpense" stroke="#94a3b8" strokeDasharray="5 5" dot={{ r: 2 }} strokeWidth={2} name="Prev Year" />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CHARTS ROW 2: Allocation, Rankings, Weights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-50 flex flex-col h-[420px]">
          <h4 className="text-[#4A148C] font-black text-xs uppercase tracking-widest mb-6 opacity-80">{currentMetric} Allocation</h4>
          <div className="flex-1 w-full h-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationData} cx="50%" cy="50%" innerRadius={57} outerRadius={100} paddingAngle={2} dataKey="value" stroke="none"
                  onClick={(d) => handleToggleDrillDown('category', d.name)} cursor="pointer"
                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  label={(props) => {
                    const { x, y, name, textAnchor, percent } = props;
                    const percentage = (percent * 100).toFixed(0);
                    const displayName = name.length > 10 ? name.substring(0, 9) + '..' : name;
                    return (
                      <text x={x} y={y} fill="#333" textAnchor={textAnchor} dominantBaseline="central" fontSize={9} fontWeight="bold">
                        {`${displayName} (${percentage}%)`}
                      </text>
                    );
                  }}
                >
                  {allocationData.map((entry, index) => {
                    const isSelected = drillDown.category === entry.name;
                    const hasSelection = drillDown.category !== null;
                    // ปรับ opacity ให้ส่วนที่เหลือจางลงเหลือ 30% (0.3) เมื่อมีการเลือก
                    return <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} fillOpacity={isSelected ? 1 : (hasSelection ? 0.3 : 1)} />;
                  })}
                </Pie>
                <Tooltip formatter={(val) => Number(val).toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-50 flex flex-col h-[420px]">
          <h4 className="text-[#4A148C] font-black text-xs uppercase tracking-widest mb-6 opacity-80">Category Rankings</h4>
          <div className="flex-1 w-full h-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryRanking} layout="vertical" margin={{ right: 30, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f8fafc" />
                <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={100} fontSize={10} axisLine={false} tickLine={false} interval={0} tick={{ fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val) => Number(val).toLocaleString()} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} onClick={(d) => handleToggleDrillDown('category', d.name)} cursor="pointer" barSize={22} label={renderRankingLabel}>
                  {categoryRanking.map((entry, index) => {
                    const isSelected = drillDown.category === entry.name;
                    const hasSelection = drillDown.category !== null;
                    return <Cell key={`cell-${index}`} fill={BLUE_PALETTE[index % BLUE_PALETTE.length]} fillOpacity={isSelected ? 1 : (hasSelection ? 0.3 : 1)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-50 flex flex-col h-[420px]">
          <h4 className="text-[#4A148C] font-black text-xs uppercase tracking-widest mb-6 opacity-80">Account Weights</h4>
          <div className="flex-1 w-full h-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={accountWeight} layout="vertical" margin={{ right: 30, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f8fafc" />
                <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={100} fontSize={10} axisLine={false} tickLine={false} interval={0} tick={{ fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val) => Number(val).toLocaleString()} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} onClick={(d) => handleToggleDrillDown('account', d.name)} cursor="pointer" barSize={22} label={renderRankingLabel}>
                  {accountWeight.map((entry, index) => {
                    const isSelected = drillDown.account === entry.name;
                    const hasSelection = drillDown.account !== null;
                    return <Cell key={`cell-${index}`} fill={ORANGE_PALETTE[index % ORANGE_PALETTE.length]} fillOpacity={isSelected ? 1 : (hasSelection ? 0.3 : 1)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* RELATED TRANSACTIONS TABLE */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-purple-100 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <i data-lucide="list" className="w-5 h-5"></i>
            </div>
            <div>
              <h4 className="text-[#4A148C] font-black text-sm uppercase tracking-wide">Related Transactions</h4>
              <p className="text-[10px] text-slate-400 font-bold">
                {showAllTransactions ? `Showing all ${sortedFilteredData.length} entries` : `Showing top ${Math.min(10, sortedFilteredData.length)} of ${sortedFilteredData.length} entries`}
              </p>
            </div>
          </div>

          {sortedFilteredData.length > 10 && (
            <button
              onClick={() => setShowAllTransactions(!showAllTransactions)}
              className="px-4 py-2 bg-purple-50 text-purple-600 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors border border-purple-100"
            >
              {showAllTransactions ? 'Show Top 10 Only' : `Show All (${sortedFilteredData.length})`}
            </button>
          )}
        </div>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left text-sm border-separate border-spacing-y-2">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-4 py-2 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => requestSort('date')}>
                  Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => requestSort('type')}>
                  Type {sortConfig.key === 'type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => requestSort('category')}>
                  Category {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => requestSort('account')}>
                  Account {sortConfig.key === 'account' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => requestSort('from_or_to')}>
                  From/To {sortConfig.key === 'from_or_to' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => requestSort('note')}>
                  Note {sortConfig.key === 'note' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 text-right cursor-pointer hover:text-purple-600 transition-colors" onClick={() => requestSort('amount')}>
                  Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFilteredData.slice(0, showAllTransactions ? sortedFilteredData.length : 10).map((t, idx) => (
                <tr
                  key={t.id || idx}
                  onClick={() => handleEditTransaction(t.id)}
                  className="bg-slate-50/50 hover:bg-slate-50 transition-colors rounded-xl group cursor-pointer"
                >
                  <td className="px-4 py-3 first:rounded-l-xl">
                    <span className="font-medium text-slate-600">{new Date(t.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: ((t.categories && t.categories.color) || '#cbd5e1') + '20' }}>
                        <i data-lucide={(t.categories && t.categories.icon) || 'tag'} className="w-3.5 h-3.5" style={{ color: (t.categories && t.categories.color) || '#64748b' }}></i>
                      </div>
                      <span className="text-slate-700 font-bold">{(t.categories && t.categories.name) || 'อื่นๆ'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-500 text-xs font-medium">{(t.accounts && t.accounts.name) || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600 text-xs font-bold">{t.from_or_to || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-400 text-xs truncate max-w-[150px] italic">{t.note || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-right last:rounded-r-xl">
                    <span className={`font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MOBILE LIST VIEW */}
        <div className="md:hidden space-y-3">
          {sortedFilteredData.slice(0, showAllTransactions ? sortedFilteredData.length : 10).map((t, idx) => (
            <div
              key={t.id || idx}
              onClick={() => handleEditTransaction(t.id)}
              className="bg-slate-50/50 p-4 rounded-2xl flex items-center gap-4 relative overflow-hidden active:scale-[0.98] transition-transform"
            >
              {/* Color Strip Indicator */}
              <div className={`absolute right-0 top-0 bottom-0 w-1.5 ${t.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>

              {/* Icon */}
              <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm"
                style={{ backgroundColor: (t.categories && t.categories.color) || '#cbd5e1' }}>
                <i data-lucide={(t.categories && t.categories.icon) || 'tag'} className="w-6 h-6 text-white"></i>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-sm font-bold text-slate-800 truncate">
                    {(t.categories && t.categories.name) || 'อื่นๆ'}
                    {t.from_or_to && <span className="text-[11px] font-bold text-blue-600 ml-1"> • {t.from_or_to}</span>}
                    {t.note && <span className="text-[10px] font-normal text-slate-400 ml-1 italic truncate"> - {t.note}</span>}
                  </h5>
                  <span className={`text-sm font-black whitespace-nowrap ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500 font-medium truncate">
                    {(t.accounts && t.accounts.name) || '-'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold">
                    {new Date(t.date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {sortedFilteredData.length === 0 && (
            <div className="py-12 text-center text-slate-400 italic text-sm">
              No transactions found
            </div>
          )}
        </div>
      </div>

      {/* FLOATING ACTION BUTTON (FAB) */}
      <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 flex flex-col items-end gap-4 z-[100]">
        {/* Sub-menu options */}
        {isMenuOpen && (
          <div className="flex flex-col items-end gap-4 animate-fade-in-up pb-2">
            {/* 1. Transfer Money */}
            <button
              onClick={() => { handleQuickAdd('transfer'); setIsMenuOpen(false); }}
              className="group flex items-center gap-3 transition-all active:scale-95 outline-none"
            >
              <span className="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl text-sm font-bold text-slate-600 shadow-lg border border-slate-100 group-hover:bg-blue-500 group-hover:text-white transition-all duration-200">
                Transfer money
              </span>
              <div className="w-14 h-14 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg group-hover:bg-blue-600 group-hover:shadow-blue-200 transition-all duration-200">
                <span className="flex items-center justify-center">
                  <i data-lucide="arrow-right-left" className="w-7 h-7"></i>
                </span>
              </div>
            </button>

            {/* 2. Income */}
            <button
              onClick={() => { handleQuickAdd('income'); setIsMenuOpen(false); }}
              className="group flex items-center gap-3 transition-all active:scale-95 outline-none"
            >
              <span className="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl text-sm font-bold text-slate-600 shadow-lg border border-slate-100 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-200">
                Income
              </span>
              <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg group-hover:bg-emerald-600 group-hover:shadow-emerald-200 transition-all duration-200">
                <span className="flex items-center justify-center">
                  <i data-lucide="plus" className="w-8 h-8"></i>
                </span>
              </div>
            </button>

            {/* 3. Expense */}
            <button
              onClick={() => { handleQuickAdd('expense'); setIsMenuOpen(false); }}
              className="group flex items-center gap-3 transition-all active:scale-95 outline-none"
            >
              <span className="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl text-sm font-bold text-slate-600 shadow-lg border border-slate-100 group-hover:bg-rose-500 group-hover:text-white transition-all duration-200">
                Expense
              </span>
              <div className="w-14 h-14 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg group-hover:bg-rose-600 group-hover:shadow-rose-200 transition-all duration-200">
                <span className="flex items-center justify-center">
                  <i data-lucide="minus" className="w-8 h-8"></i>
                </span>
              </div>
            </button>
          </div>
        )}

        {/* Main Toggle Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-white shadow-2xl transition-all duration-300 active:scale-90 ${isMenuOpen
              ? 'bg-blue-500 rotate-0 shadow-blue-200'
              : 'bg-purple-600 rotate-0 hover:bg-purple-700'
            }`}
        >
          <span key={isMenuOpen ? "icon-x" : "icon-plus"} className="flex items-center justify-center">
            <i
              data-lucide={isMenuOpen ? "x" : "plus"}
              className={`w-8 h-8 md:w-9 md:h-9 transition-transform duration-300 ${isMenuOpen ? 'scale-110' : ''}`}
            ></i>
          </span>
        </button>

        {/* Backdrop overlay when menu is open */}
        {isMenuOpen && (
          <div
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[-1] transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          ></div>
        )}
      </div>
    </div>
  );
};

// Expose vanilla interface
window.OverviewPage = {
  _cachedData: null,
  async init(container, userId) {
    container.innerHTML = `
      <div id="overview-loading" class="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
        <div class="relative mb-6">
          <div class="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <div class="absolute inset-0 flex items-center justify-center">
             <i data-lucide="database" class="w-6 h-6 text-blue-600"></i>
          </div>
        </div>
        <h3 class="text-lg font-bold text-slate-700 mb-2">กำลังเตรียมข้อมูลแดชบอร์ด</h3>
        <p class="text-sm text-slate-400 mb-4" id="overview-progress-text">กำลังเริ่มต้นดึงข้อมูล...</p>
        <div class="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div id="overview-progress-bar" class="h-full bg-blue-600 transition-all duration-300" style="width: 0%"></div>
        </div>
      </div>
      <div id="overview-react-root" class="hidden"></div>
    `;

    if (window.lucide) lucide.createIcons();

    const rootElement = document.getElementById('overview-react-root');
    const loadingEl = document.getElementById('overview-loading');
    const progressText = document.getElementById('overview-progress-text');
    const progressBar = document.getElementById('overview-progress-bar');

    try {
      const today = new Date();
      const firstDay = toLocalDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
      const lastDay = toLocalDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));

      const updateProgress = (loaded, total) => {
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        if (progressText) progressText.textContent = `กำลังโหลดรายการธุรกรรมเดือนนี้... ${loaded.toLocaleString()} / ${total.toLocaleString()} (${percent}%)`;
        if (progressBar) progressBar.style.width = `${percent}%`;
      };

      const [txRes, accRes, catRes] = await Promise.all([
        DB.getTransactions(userId, {
          dateFrom: firstDay,
          dateTo: lastDay,
          sortBy: 'date',
          limit: 10000,
          onProgress: updateProgress
        }),
        DB.getAccounts(userId),
        DB.getCategories(userId)
      ]);

      const transactions = txRes.data || [];
      const accounts = accRes || [];
      const categories = catRes || [];
      this._cachedData = { transactions, accounts, categories };

      if (loadingEl) loadingEl.remove();
      if (rootElement) rootElement.classList.remove('hidden');

      const root = ReactDOM.createRoot(rootElement);
      root.render(<OverviewDashboard userId={userId} initialTransactions={transactions} allAccounts={accounts} allCategories={categories} />);

      setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="p-8 text-center text-red-500">Error loading Overview: ${e.message}</div>`;
    }
  },

  viewTxSpecial(mode, dateRange) {
    if (typeof TransactionsPage === 'undefined') return navigate('transactions');
    const toISO = (d) => toLocalDateStr(d);
    const firstDay = toISO(dateRange.start);
    const lastDay = toISO(dateRange.end);

    Object.assign(TransactionsPage.filters, {
      type: null, accountId: null, categoryId: null, search: null, showSearch: true,
      page: 1, dateFrom: firstDay, dateTo: lastDay, selectedYear: dateRange.start.getFullYear()
    });

    if (mode === 'income') TransactionsPage.filters.type = 'income';
    else if (mode === 'expense') TransactionsPage.filters.type = 'expense';
    else if (mode === 'investment') {
      const ids = (this._cachedData && this._cachedData.accounts ? this._cachedData.accounts : []).filter(a => ['investment', 'mutual_fund', 'stock', 'gold'].includes(a.type)).map(a => a.id);
      TransactionsPage.filters.accountId = ids.length ? ids : 'NONE';
    } else if (mode === 'credit') {
      const ids = (this._cachedData && this._cachedData.accounts ? this._cachedData.accounts : []).filter(a => a.type === 'credit_card').map(a => a.id);
      TransactionsPage.filters.accountId = ids.length ? ids : 'NONE';
    }
    navigate('transactions');
  }
};
