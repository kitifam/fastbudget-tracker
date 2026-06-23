// Config — SQLite local database version

// ================================================================
// แก้ที่นี่เพียงจุดเดียว เมื่อต้องการเปลี่ยนชื่อหรือ version ของแอป
// หลังแก้: ให้ bump CACHE_NAME ใน sw.js ด้วย (เพื่อ clear service worker cache)
// ================================================================
window.AppConfig = {
  name: 'FastBudget Tracker',
  version: 'v5.2',
  get fullName() { return `${this.name} ${this.version}`; },
};

window.AppUrl = {
  resolve(path = '') {
    const normalizedPath = String(path).replace(/^\//, '');
    return new URL(normalizedPath, window.location.href).toString();
  },
  currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  },
  dashboard() {
    return this.resolve('dashboard.html');
  }
};

const Theme = {
  color(varName, fallback = '') {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
    } catch (_) {
      return fallback;
    }
  },
  alpha(hex, opacity = 1) {
    const clean = String(hex || '').replace('#', '');
    const parsed = clean.length === 3
      ? clean.split('').map(ch => ch + ch).join('')
      : clean;
    const intVal = Number.parseInt(parsed, 16);
    if (Number.isNaN(intVal)) return `rgba(59,130,246,${opacity})`;
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return `rgba(${r},${g},${b},${opacity})`;
  },
  palette() {
    return {
      primary: '#3B82F6',
      success: '#10B981',
      danger: '#EF4444',
      warning: '#F59E0B',
      warningStrong: '#F97316',
      purple: '#8B5CF6',
      pink: '#EC4899',
      cyan: '#06B6D4',
      slate: '#6B7280',
      slateLight: '#94A3B8',
      white: '#FFFFFF',
      chart: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#6B7280', '#14B8A6'],
    };
  },
};

window.BrandColors = {
  rules: [
    { tokens: ['gold', 'ทองคำ'], color: '#fdc921' },
    { tokens: ['SET', 'หุ้น'], color: '#55a630' },
    { tokens: ['citi', 'ซิตี้'], color: '#215AE4' },
    { tokens: ['icbc', 'ไอซีบีซี'], color: '#D70418' },
    { tokens: ['aeon', 'อิออน'], color: '#7564CC' },
    { tokens: ['tmrw'], color: '#F9599A' },
    { tokens: ['kkp'], color: '#645E9C' },
    { tokens: ['cimb'], color: '#E30505' },
    { tokens: ['uob', 'ยูโอบี'], color: '#E21620' },
    { tokens: ['กสิกร', 'TFB'], color: '#138B2E' },
    { tokens: ['ไทยพาณิชย์', 'scb'], color: '#4E2E7F' },
    { tokens: ['กรุงเทพ', 'bbl'], color: '#1E4598' },
    { tokens: ['กรุงไทย', 'ktb'], color: '#00AEEF' },
    { tokens: ['กรุงศรี', 'bay'], color: '#FFCC00' },
    { tokens: ['ทหารไทย', 'TMB'], color: '#004C92' },
    { tokens: ['ออมสิน', 'gsb'], color: '#EC008C' }
  ],

  resolve(name, userColor, type = null, fallback = '#64748b') {
    const normalized = String(name || '').toLowerCase();
    for (const rule of this.rules) {
      if (rule.tokens.some(token => normalized.includes(String(token).toLowerCase()))) {
        return rule.color;
      }
    }
    if (type === 'cash') return '#6366f1';
    return userColor || fallback;
  }
};

window.getBrandColor = function(name, userColor, type = null, fallback = '#64748b') {
  return window.BrandColors.resolve(name, userColor, type, fallback);
};

window.AccountPrefs = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem('expense_account_prefs') || '{}');
    } catch {
      return {};
    }
  },
  get(id) {
    return this.getAll()[id] || { hidden: false, excludeSum: false, order: 0 };
  },
  set(id, prefs) {
    const all = this.getAll();
    all[id] = { ...this.get(id), ...prefs };
    localStorage.setItem('expense_account_prefs', JSON.stringify(all));
  }
};

window.Format = {
  money(val) {
    const n = parseFloat(val || 0);
    return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },
  currency(val) {
    const n = parseFloat(val || 0);
    return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },
  number(val) {
    return parseFloat(val || 0).toLocaleString('th-TH');
  },
  compactNumber(val) {
    const n = parseFloat(val || 0);
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString('th-TH');
  },
  date(val) {
    if (!val) return '-';
    return new Date(val).toLocaleDateString('th-TH');
  }
};

window.FUND_ACCOUNTS = [
  // กองทุนหุ้น (ชื่อ account ต้องตรงกับ Fast Budget)
  { name: 'FND SCBS&P500A',   type: 'mutual_fund', source: 'scbam',    navKey: 'SCBS&P500A',    scbamPath: '/th/fund/foreign-investment-fund-equity/fund-information/scbs-p500a' },
  { name: 'FND SCBS&P500E',   type: 'mutual_fund', source: 'scbam',    navKey: 'SCBS&P500E',    scbamPath: '/th/fund/morningstar/fund-information/scbs-p500e' },
  // RMF (ชื่อ account ใช้รูปแบบ R+เลข ตาม Fast Budget)
  { name: 'R1 SCBRMS&P500',   type: 'mutual_fund', source: 'scbam',    navKey: 'SCBRMS&P500',   scbamPath: '/en/fund/rmf/fund-information/scbrms-p500' },
  { name: 'R2 KFGTECHRMF',    type: 'mutual_fund', source: 'navtable', navKey: 'KFGTECHRMF',    color: '#FFCC00' },
  { name: 'R3 TMBGQGRMF',     type: 'mutual_fund', source: 'navtable', navKey: 'TMBGQGRMF' ,  color: '#004C92' },
  { name: 'R4 B-INNOTECHRMF', type: 'mutual_fund', source: 'navtable', navKey: 'B-INNOTECHRMF', color: '#1E4598' },
  { name: 'R4 B-USAlphaRMF',  type: 'mutual_fund', source: 'navtable', navKey: 'B-USAlpha-RMF' , color: '#1E4598'},
  // กองทุนพันธบัตร/ตลาดเงิน
  { name: 'FND BFIXED',       type: 'mutual_fund', source: 'navtable', navKey: 'BFIXED',         color: '#1E4598' },
  { name: 'FND PVDWORLD',     type: 'mutual_fund', source: 'navtable', navKey: 'BFIXED',         color: '#4E2E7F' },
  // หุ้น
  { name: 'ST SKY',           type: 'stock',       source: 'yahoo',    ticker: 'SKY.BK',         color: '#55a630' },
  { name: 'ST BRKB80',        type: 'stock',       source: 'yahoo',    ticker: 'BRKB80.BK',      color: '#55a630' },
];

// Initialize sql.js and load a .bak file
window.sqlDbFileName = '';

async function initSqliteFromFile(file) {
  const SQL = await initSqlJs({
    locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`
  });
  const buffer = await file.arrayBuffer();
  window.sqliteDB = new SQL.Database(new Uint8Array(buffer));
  window.sqlDbFileName = file.name;
  return window.sqliteDB;
}
