const NAVTABLE_FUNDS = new Set(['B-INNOTECHRMF', 'BFIXED', 'KFGTECHRMF', 'TMBGQGRMF', 'B-USAlpha-RMF']);

// navtable URL slug differs from navKey for some funds
const NAVTABLE_SLUG_OVERRIDES = {
  'B-USAlpha-RMF': 'B-USALPHARMF',
};

const SCBAM_FUNDS = {
  'SCBS&P500A':  '/th/fund/foreign-investment-fund-equity/fund-information/scbs-p500a',
  'SCBS&P500E':  '/th/fund/morningstar/fund-information/scbs-p500e',
  'SCBRMS&P500': '/en/fund/rmf/fund-information/scbrms-p500',
};

const THAI_MONTHS = {
  'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03', 'เม.ย.': '04',
  'พ.ค.': '05', 'มิ.ย.': '06', 'ก.ค.': '07', 'ส.ค.': '08',
  'ก.ย.': '09', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12',
};

function parseThaiDate(text) {
  const m = text.match(/(\d{1,2})\s+([^\s\d<]+)\s+(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = THAI_MONTHS[m[2]];
  const year = String(parseInt(m[3], 10) - 543);
  return month ? `${year}-${month}-${day}` : null;
}

const FETCH_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; ExpenseTracker/1.0)' };

async function fetchNavtable(fund) {
  const slug = NAVTABLE_SLUG_OVERRIDES[fund] ?? fund;
  const url = `https://navtable.com/funds/${encodeURIComponent(slug)}/`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  const html = await res.text();
  const navMatch = html.match(/<h3[^>]*flex-grow-1[^>]*>([\d.]+)<\/h3>/);
  const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
  if (!navMatch) throw new Error(`NAV not found for ${fund}`);
  return {
    nav: parseFloat(navMatch[1]),
    date: dateMatch ? dateMatch[1] : null,
  };
}

async function fetchScbam(fund, path) {
  const url = `https://www.scbam.com${path}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  const html = await res.text();
  const navMatch = html.match(/<h4[^>]*>\s*([\d.]+)[\s\S]*?<\/h4>/);
  const dateMatch = html.match(/ข้อมูล ณ วันที่([\s\S]{1,200}?)(?:<|$)/);
  if (!navMatch) throw new Error(`NAV not found for ${fund}`);
  return {
    nav: parseFloat(navMatch[1]),
    date: dateMatch ? parseThaiDate(dateMatch[1]) : null,
  };
}

async function fetchYahoo(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  const json = await res.json();
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price == null) throw new Error(`price not found for ${ticker}`);
  return { nav: price, date: null };
}

export default async function handler(req, res) {
  const { funds, tickers } = req.query;
  if (!funds && !tickers) return res.status(400).json({ error: 'funds or tickers param required' });

  const result = {};

  if (funds) {
    const requested = funds.split(',').map(f => f.trim()).filter(Boolean);
    await Promise.all(requested.map(async fund => {
      try {
        if (NAVTABLE_FUNDS.has(fund)) {
          result[fund] = await fetchNavtable(fund);
        } else if (SCBAM_FUNDS[fund]) {
          result[fund] = await fetchScbam(fund, SCBAM_FUNDS[fund]);
        } else {
          result[fund] = { nav: null, date: null, error: 'unknown fund' };
        }
      } catch (e) {
        result[fund] = { nav: null, date: null, error: e.message };
      }
    }));
  }

  if (tickers) {
    const requestedTickers = tickers.split(',').map(t => t.trim()).filter(Boolean);
    await Promise.all(requestedTickers.map(async ticker => {
      try {
        result[ticker] = await fetchYahoo(ticker);
      } catch (e) {
        result[ticker] = { nav: null, date: null, error: e.message };
      }
    }));
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  res.status(200).json(result);
}
