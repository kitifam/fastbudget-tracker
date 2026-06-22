// DB — SQLite adapter for Fast Budget .bak files (read-only)
// All methods mirror the previous Supabase interface so components need minimal changes.

const DB = {

  // =========================
  // INTERNAL HELPERS
  // =========================

  get _sql() { return window.sqliteDB || null; },

  _query(sql, params = []) {
    if (!this._sql) return [];
    try {
      const stmt = this._sql.prepare(sql);
      if (params.length) stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (e) {
      console.error('SQLite query error:', e.message, '\nSQL:', sql);
      return [];
    }
  },

  _queryOne(sql, params = []) {
    return this._query(sql, params)[0] || null;
  },

  // 'YYYY-MM-DD' -> ms at start of that day (local time)
  _dateToStartMs(dateStr) {
    if (!dateStr) return 0;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  },

  // 'YYYY-MM-DD' -> ms at end of that day (local time)
  _dateToEndMs(dateStr) {
    if (!dateStr) return Date.now();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  },

  // ms timestamp -> 'YYYY-MM-DD' (local date)
  _msToDate(ms) {
    if (!ms) return null;
    const d = new Date(ms);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  },

  // Compute outstanding balance for a credit card from the last --cutoff transaction.
  // Sums all non-transfer expense transactions recorded after the cutoff date.
  // Returns null when no --cutoff transaction exists (caller falls back to stored value).
  _getCardOutstanding(cardName) {
    const cutoffRow = this._queryOne(
      `SELECT date FROM income_or_expense
       WHERE account = ? AND LOWER(notes) LIKE '%--cutoff%'
       ORDER BY date DESC LIMIT 1`,
      [cardName]
    );
    if (!cutoffRow) return null;
    const sumRow = this._queryOne(
      `SELECT SUM(value) as total
       FROM income_or_expense
       WHERE account = ?
         AND i_e = 0
         AND category != 'Transfer between accounts'
         AND date > ?`,
      [cardName, cutoffRow.date]
    );
    return sumRow ? (sumRow.total || 0) : 0;
  },

  // Classify account type from name
  // Investment accounts: "Fund mgt", "หุ้น", names starting with R + digit (e.g. R1 SCB RMF)
  // Gold accounts: names that clearly indicate gold portfolios (Thai/English variants)
  // Credit cards live in the credit_cards table only — not in the account table
  _accountType(name) {
    const n = (name || '').trim();
    if (n.startsWith('FND ')) return 'mutual_fund';
    if (n.startsWith('ST ')) return 'stock';
    const normalized = n.toLowerCase().replace(/[\s()\-_.]/g, '');
    if (n === 'Fund mgt') return 'mutual_fund';
    if (n === 'หุ้น') return 'stock';
    if (n.includes('ทองคำ')) return 'gold';
    if (normalized.includes('gold') || normalized.includes('xau')) return 'gold';
    if (/^R\d/i.test(n)) return 'mutual_fund';
    return 'bank';
  },

  // =========================
  // ACCOUNTS
  // =========================

  async getAccounts(_userId) {
    const rows = this._query(`
      SELECT _id as id, name, value as balance, initial_funds, notes, currency, use_account, position
      FROM account
      WHERE use_account >= 1
      ORDER BY position ASC, name ASC
    `);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: this._accountType(r.name),
      balance: r.balance || 0,
      currency: r.currency || 'THB',
      color: null,
      initial_funds: r.initial_funds || 0,
      notes: r.notes || '',
      use_account: r.use_account,
      investments: []
    }));
  },

  getInvestmentLots(accountName) {
    const rows = this._query(
      `SELECT value, date, notes, from_or_to, i_e
       FROM income_or_expense
       WHERE (
         (i_e = 2 AND (account = ? OR from_or_to = ?))
         OR (i_e != 2 AND account = ?)
       ) AND notes LIKE '%--units%'
       ORDER BY date ASC`,
      [accountName, accountName, accountName]
    );

    // หา --units-total ล่าสุด: ล้าง lots ก่อนหน้า เริ่มนับจากยอดนั้น + --units ที่ตามมา
    let checkpointIdx = -1;
    let checkpointUnits = 0;
    let checkpointDate = null;
    rows.forEach((row, i) => {
      const m = (row.notes || '').match(/--units-total\s+([\d.]+)/);
      if (m) { checkpointIdx = i; checkpointUnits = parseFloat(m[1]); checkpointDate = row.date; }
    });

    const result = [];
    if (checkpointIdx >= 0) {
      // synthetic lot ตัวแทน units ก่อน checkpoint (cost=0 เพราะไม่รู้ต้นทุนเก่า)
      result.push({ date: this._msToDate(checkpointDate), cost: 0, units: checkpointUnits, type: 'buy', _isCheckpoint: true });
      for (const r of rows.slice(checkpointIdx + 1)) {
        const m = (r.notes || '').match(/--units\s+([-\d.]+)/);
        const units = m ? parseFloat(m[1]) : 0;
        if (units !== 0) result.push({ date: this._msToDate(r.date), cost: r.value || 0, units, type: units >= 0 ? 'buy' : 'sell', from_or_to: r.from_or_to || '', i_e: r.i_e });
      }
    } else {
      for (const r of rows) {
        const m = (r.notes || '').match(/--units\s+([-\d.]+)/);
        const units = m ? parseFloat(m[1]) : 0;
        result.push({ date: this._msToDate(r.date), cost: r.value || 0, units, type: units >= 0 ? 'buy' : 'sell', from_or_to: r.from_or_to || '', i_e: r.i_e });
      }
    }
    return result;
  },

  // คำนวณ net balance จาก transactions รวม transfer (ใช้เมื่อ account.value = 0)
  // income(i_e=1) = +, expense(i_e=0) = -, transfer ออก(account=X,i_e=2) = -, transfer เข้า(from_or_to=X,i_e=2) = +
  getAccountNetBalance(accountName) {
    const row = this._queryOne(
      `SELECT SUM(
          CASE
            WHEN i_e = 1 THEN value
            WHEN i_e = 0 THEN -value
            WHEN i_e = 2 AND account = ? THEN -value
            WHEN i_e = 2 AND from_or_to = ? THEN value
            ELSE 0
          END
        ) as bal
       FROM income_or_expense
       WHERE account = ? OR (i_e = 2 AND from_or_to = ?)`,
      [accountName, accountName, accountName, accountName]
    );
    return Math.max(0, row?.bal ?? 0);
  },

  // หุ้นกู้: buy = income (notes=ชื่อหุ้นกู้)
  // ครบกำหนด/ขาย: แก้ Notes ของ transaction ซื้อให้เพิ่ม --expire ต่อท้าย
  getAccountBondHoldings(accountName) {
    const rows = this._query(
      `SELECT value, date, notes FROM income_or_expense
       WHERE account = ? AND i_e = 1
         AND notes IS NOT NULL AND notes != ''
         AND LOWER(notes) NOT LIKE '%bfixed%'
         AND LOWER(notes) NOT LIKE '%กองทุนรวม%'
       ORDER BY date ASC`,
      [accountName]
    );
    const map = {};
    for (const row of rows) {
      const raw = (row.notes || '').trim();
      const matured = /--expire/i.test(raw);
      const name = raw.replace(/\s*--expire.*/i, '').trim();
      if (!name) continue;
      if (!map[name]) map[name] = { name, totalValue: 0, firstBuyDate: this._msToDate(row.date), matured };
      map[name].totalValue += row.value || 0;
      if (matured) map[name].matured = true;
    }
    return Object.values(map).sort((a, b) => a.matured === b.matured ? 0 : a.matured ? 1 : -1);
  },

  // =========================
  // CATEGORIES
  // =========================

  async getCategories(_userId) {
    const rows = this._query(`
      SELECT _id as id, name, ei, icon_name, parent_id, position
      FROM categories_table
      ORDER BY position ASC, name ASC
    `);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.ei === 1 ? 'income' : 'expense',
      icon: r.icon_name || 'tag',
      color: null,
      parent_id: r.parent_id || null,
      is_default: true
    }));
  },

  buildCategoryTree(categories) {
    const roots = categories.filter(c => !c.parent_id || c.parent_id === 0);
    const subs = categories.filter(c => c.parent_id && c.parent_id !== 0);
    return roots.map(root => ({
      ...root,
      children: subs
        .filter(s => s.parent_id === root.id)
        .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name))
    }));
  },

  // =========================
  // TRANSACTIONS
  // =========================

  async getTransactions(_userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      accountId = null,
      excludeCategories = null,
      categoryId = null,
      type = null,
      dateFrom = null,
      dateTo = null,
      accountType = null,
      search = null,
      sortBy = 'date',
      ascending = false,
      onProgress = null
    } = options;

    const conditions = ['1=1'];
    const params = [];

    if (type === 'income') {
      conditions.push('e.i_e = 1');
    } else if (type === 'expense') {
      conditions.push('e.i_e = 0');
    } else if (type === 'transfer') {
      conditions.push('e.i_e = 2');
    }

    // accountId: numeric ID or array of IDs — resolved via JOIN
    if (accountId) {
      if (accountId === 'NONE') {
        conditions.push('1=0');
      } else if (Array.isArray(accountId)) {
        const ph = accountId.map(() => '?').join(',');
        conditions.push(`a._id IN (${ph})`);
        params.push(...accountId);
      } else {
        conditions.push('a._id = ?');
        params.push(accountId);
      }
    }

    // categoryId: numeric ID resolved via JOIN
    if (categoryId) {
      conditions.push('c._id = ?');
      params.push(categoryId);
    }

    if (excludeCategories && Array.isArray(excludeCategories) && excludeCategories.length > 0) {
      const normalized = excludeCategories
        .filter(Boolean)
        .map(cat => String(cat).toLowerCase());
      if (normalized.length > 0) {
        const ph = normalized.map(() => '?').join(',');
        conditions.push(`(e.category IS NULL OR LOWER(e.category) NOT IN (${ph}))`);
        params.push(...normalized);
      }
    }

    // accountType filter: match accounts by type heuristic
    if (accountType) {
      if (accountType === 'investment') {
        const allAccounts = await this.getAccounts(null);
        const matchedIds = allAccounts
          .filter(a => ['mutual_fund', 'stock', 'gold', 'investment'].includes(a.type))
          .map(a => a.id);
        if (matchedIds.length) {
          const ph = matchedIds.map(() => '?').join(',');
          conditions.push(`a._id IN (${ph})`);
          params.push(...matchedIds);
        } else {
          conditions.push('1=0');
        }
      } else if (accountType === 'credit_card') {
        const creditCards = await this.getCreditCards(null);
        const cardNames = creditCards.map(c => c.bank_name).filter(Boolean);
        if (cardNames.length) {
          const ph = cardNames.map(() => '?').join(',');
          conditions.push(`e.account IN (${ph})`);
          params.push(...cardNames);
        } else {
          conditions.push('1=0');
        }
      } else {
        const allAccounts = await this.getAccounts(null);
        const matchedIds = allAccounts
          .filter(a => a.type === accountType)
          .map(a => a.id);
        if (matchedIds.length) {
          const ph = matchedIds.map(() => '?').join(',');
          conditions.push(`a._id IN (${ph})`);
          params.push(...matchedIds);
        } else {
          conditions.push('1=0');
        }
      }
    }

    if (dateFrom) {
      conditions.push('e.date >= ?');
      params.push(this._dateToStartMs(dateFrom));
    }

    if (dateTo) {
      conditions.push('e.date <= ?');
      params.push(this._dateToEndMs(dateTo));
    }

    if (search) {
      conditions.push('(e.notes LIKE ? OR e.from_or_to LIKE ? OR e.account LIKE ? OR e.category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.join(' AND ');

    let orderClause;
    if (sortBy === 'amount') {
      orderClause = `e.value ${ascending ? 'ASC' : 'DESC'}, e.date DESC`;
    } else if (sortBy === 'account_name') {
      orderClause = `e.account ${ascending ? 'ASC' : 'DESC'}, e.date DESC`;
    } else if (sortBy === 'category_name') {
      orderClause = `e.category ${ascending ? 'ASC' : 'DESC'}, e.date DESC`;
    } else {
      orderClause = `e.date ${ascending ? 'ASC' : 'DESC'}`;
    }

    // categories_table can have duplicate names (parent + child with same name).
    // Using MIN(_id) subquery ensures each transaction matches exactly one category row,
    // preventing row multiplication in the JOIN.
    const categoryJoin = `LEFT JOIN categories_table c ON c._id = (SELECT MIN(_id) FROM categories_table WHERE name = e.category)`;
    const accountJoin  = `LEFT JOIN account a ON a.name = e.account`;

    const countRow = this._queryOne(
      `SELECT COUNT(*) as cnt FROM income_or_expense e
       ${categoryJoin} ${accountJoin}
       WHERE ${where}`,
      params
    );
    const totalCount = countRow ? (countRow.cnt || 0) : 0;

    const actualLimit = Math.min(limit, 50000);
    const dataRows = this._query(
      `SELECT e._id as id, e.i_e, e.value, e.category, e.account, e.date, e.from_or_to, e.notes,
              e.is_refund, e.exchange_rate, e.checked,
              c._id as cat_id, c.icon_name as cat_icon, c.ei as cat_ei, c.parent_id as cat_parent_id,
              a._id as acc_id, a.currency as acc_currency, a.use_account as acc_use
       FROM income_or_expense e
       ${categoryJoin} ${accountJoin}
       WHERE ${where}
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, actualLimit, offset]
    );

    if (onProgress) onProgress(dataRows.length, totalCount);

    const data = dataRows.map(r => {
      const tx = {
        id: r.id,
        type: r.i_e === 0 ? 'expense' : r.i_e === 1 ? 'income' : 'transfer',
        amount: r.value || 0,
        account_id: r.acc_id,
        category_id: r.cat_id,
        date: this._msToDate(r.date),
        note: r.notes || '',
        from_or_to: r.from_or_to || '',
        is_refund: !!r.is_refund,
        is_checked: !!r.checked,
        exchange_rate: r.exchange_rate || 1,
        accounts: {
          id: r.acc_id,
          name: r.account,
          type: this._accountType(r.account),
          currency: r.acc_currency || 'THB',
          color: null
        },
        categories: {
          id: r.cat_id,
          name: r.category,
          icon: r.cat_icon || 'tag',
          color: null,
          parent_id: r.cat_parent_id || null,
          type: r.cat_ei === 1 ? 'income' : 'expense'
        }
      };

      if (window.TransactionRules) {
        tx.is_transfer_related = window.TransactionRules.isTransferLike(tx);
        tx.is_modified_balance = window.TransactionRules.isModifiedBalance(tx);
        tx.is_hidden_from_summary = window.TransactionRules.isHiddenFromSummary(tx);
      } else {
        tx.is_transfer_related = false;
        tx.is_modified_balance = false;
        tx.is_hidden_from_summary = false;
      }

      return tx;
    });

    return { data, count: totalCount };
  },

  // Transactions after a given date — used for running-balance calculation
  getRawTransactionsSince(dateStr) {
    const ms = this._dateToEndMs(dateStr);
    return this._query(
      `SELECT value as amount, i_e FROM income_or_expense WHERE date > ?`,
      [ms]
    ).map(r => ({
      amount: r.amount || 0,
      type: r.i_e === 0 ? 'expense' : r.i_e === 1 ? 'income' : 'transfer'
    }));
  },

  // =========================
  // CREDIT CARDS
  // =========================

  async getCreditCards(_userId) {
    const rows = this._query(`
      SELECT cc._id as id, cc.name, cc.associated_account, cc.amount_limit,
             cc.interest_rate, cc.starting_day, cc.payment_day, cc.value,
             cc.use_account, cc.card_type,
             a._id as acc_id, a.currency as acc_currency
      FROM credit_cards cc
      LEFT JOIN account a ON a.name = cc.associated_account
      WHERE cc.use_account >= 1
      ORDER BY cc.position ASC, cc.name ASC
    `);

    return rows.map(r => {
      const cutoffOutstanding = this._getCardOutstanding(r.name);
      const outstanding = cutoffOutstanding !== null ? cutoffOutstanding : Math.abs(r.value || 0);
      return {
        id: r.id,
        bank_name: r.name,
        account_id: r.id,
        due_date: r.payment_day || 0,
        statement_date: r.starting_day || 0,
        credit_limit: r.amount_limit || 0,
        outstanding_balance: outstanding,
        interest_rate: r.interest_rate || 0,
        last_four: null,
        associated_account: r.associated_account,
        use_account: r.use_account,
        accounts: {
          id: r.acc_id,
          name: r.associated_account,
          balance: -outstanding,
          color: null,
          currency: r.acc_currency || 'THB'
        }
      };
    });
  },

  // =========================
  // ANALYTICS
  // =========================

  async getSpendingByCategory(_userId, dateFrom, dateTo) {
    const params = [this._dateToStartMs(dateFrom), this._dateToEndMs(dateTo)];
    const rows = this._query(`
      SELECT e.category, SUM(e.value) as total, COUNT(*) as txCount,
             c._id as cat_id, c.icon_name as cat_icon, c.parent_id as cat_parent_id
      FROM income_or_expense e
      LEFT JOIN categories_table c ON c._id = (SELECT MIN(_id) FROM categories_table WHERE name = e.category)
      WHERE e.i_e = 0 AND e.date >= ? AND e.date <= ?
      GROUP BY e.category
      ORDER BY total DESC
    `, params);

    return rows.map(r => ({
      category_id: r.cat_id,
      categories: {
        id: r.cat_id,
        name: r.category,
        icon: r.cat_icon || 'tag',
        color: null,
        parent_id: r.cat_parent_id || null
      },
      total: r.total || 0,
      txCount: r.txCount || 0
    }));
  },

  async getHistoricalSpendingByCategory(userId, dateFrom, dateTo) {
    return this.getSpendingByCategory(userId, dateFrom, dateTo);
  },

  async getTransactionYearRange(_userId) {
    const row = this._queryOne(
      `SELECT MIN(date) as min_ms, MAX(date) as max_ms FROM income_or_expense WHERE date > 0`
    );
    if (!row || !row.min_ms) {
      const y = new Date().getFullYear();
      return { min_year: y, max_year: y };
    }
    return {
      min_year: new Date(row.min_ms).getFullYear(),
      max_year: new Date(row.max_ms).getFullYear()
    };
  },

  async getAnnualSpendingByCategory(_userId, yearFrom, yearTo) {
    const fromMs = new Date(yearFrom, 0, 1).getTime();
    const toMs = new Date(yearTo, 11, 31, 23, 59, 59, 999).getTime();

    const rows = this._query(`
      SELECT e.category, SUM(e.value) as total, COUNT(*) as tx_count,
             c._id as cat_id, c.icon_name as cat_icon, c.parent_id as cat_parent_id,
             e.date as tx_date
      FROM income_or_expense e
      LEFT JOIN categories_table c ON c._id = (SELECT MIN(_id) FROM categories_table WHERE name = e.category)
      WHERE e.i_e = 0 AND e.date >= ? AND e.date <= ?
      GROUP BY e.category
      ORDER BY total DESC
    `, [fromMs, toMs]);

    return rows.map(r => ({
      year: yearFrom,
      category_id: r.cat_id,
      categories: {
        id: r.cat_id,
        name: r.category,
        icon: r.cat_icon || 'tag',
        color: null,
        parent_id: r.cat_parent_id || null
      },
      total: r.total || 0,
      txCount: r.tx_count || 0
    }));
  },

  // =========================
  // DEBUG (ลบทิ้งหลังใช้งาน)
  // =========================

  debugAccount(accountName) {
    const acct = this._queryOne(`SELECT _id, name, value, initial_funds FROM account WHERE name = ?`, [accountName]);
    const tx = this._queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN i_e = 1 THEN value ELSE 0 END) as income,
        SUM(CASE WHEN i_e = 0 THEN value ELSE 0 END) as expense,
        SUM(CASE WHEN i_e = 2 AND account = ? THEN value ELSE 0 END) as transfer_out,
        SUM(CASE WHEN i_e = 2 AND from_or_to = ? THEN value ELSE 0 END) as transfer_in
      FROM income_or_expense
      WHERE account = ? OR (i_e = 2 AND from_or_to = ?)
    `, [accountName, accountName, accountName, accountName]);
    console.table({ ...acct });
    console.table({ ...tx });
    console.log('net (i_e 0+1 only):', (tx.income || 0) - (tx.expense || 0));
    console.log('net (incl transfer):', (tx.income || 0) - (tx.expense || 0) - (tx.transfer_out || 0) + (tx.transfer_in || 0));
    return { acct, tx };
  },

  // =========================
  // STUB METHODS (removed features)
  // =========================

  async processSchedules(_userId) { return 0; },
  async getProfile(_userId) { return null; },
  async getBudgets(_userId) { return []; },
  async getSchedules(_userId) { return []; },
  async bulkUpdateTransactions(_updates) { return { data: [], error: null }; },
  async createTransaction(_data) { return { data: null, error: { message: 'Read-only mode' } }; },
  async updateTransaction(_id, _old, _data) { return { data: null, error: { message: 'Read-only mode' } }; },
  async createAccount(_data) { return { data: null, error: { message: 'Read-only mode' } }; },
  async updateAccount(_id, _data) { return { data: null, error: { message: 'Read-only mode' } }; },
  async deleteAccount(_id) { return { data: null, error: { message: 'Read-only mode' } }; },
  async updateCreditCard(_id, _data) { return { data: null, error: { message: 'Read-only mode' } }; },
  async createCreditCard(_data) { return { data: null, error: { message: 'Read-only mode' } }; },
  async deleteCreditCard(_id) { return { data: null, error: { message: 'Read-only mode' } }; }
};
