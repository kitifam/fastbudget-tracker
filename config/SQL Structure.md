# 🗄️ Supabase SQL Structure

กรุณาคัดลอกคำสั่ง SQL ด้านล่างนี้ไปรันใน **SQL Editor** ของโปรเจกต์ Supabase ของคุณ เพื่อสร้างตารางข้อมูลที่จำเป็น

## 1. Table: `schedules` (รายการธุรกรรมล่วงหน้า)

```sql
-- สร้างตาราง schedules
CREATE TABLE public.schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    next_run_date DATE NOT NULL,
    end_date DATE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    note TEXT,
    from_or_to TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- เปิดใช้งาน RLS
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- สร้าง Policy สำหรับเข้าถึงข้อมูลส่วนตัว
CREATE POLICY "Users can manage their own schedules" ON public.schedules
    FOR ALL USING (auth.uid() = user_id);
```

## 2. Supabase RPC Functions (Performance)

รันใน **SQL Editor** เพื่อเพิ่ม server-side functions ที่ช่วยลด network overhead

### Function: `get_transaction_year_range`
ใช้แทนการดึง transactions ทั้งหมดเพื่อหาแค่ช่วงปี (คืน 1 row แทน 100,000 rows)

```sql
CREATE OR REPLACE FUNCTION public.get_transaction_year_range(p_user_id UUID)
RETURNS TABLE(min_year INT, max_year INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR FROM MIN(date))::INT AS min_year,
    EXTRACT(YEAR FROM MAX(date))::INT AS max_year
  FROM transactions
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_transaction_year_range(UUID) TO authenticated;
```

### Function: `get_spending_by_category`
ใช้แทน `getHistoricalSpendingByCategory` — รวมยอดฝั่ง Postgres แล้วคืนแค่ ~20-50 rows แทนที่จะดึง raw transactions ทั้งหมด (ใช้ใน แนะนำงบ tab)

```sql
CREATE OR REPLACE FUNCTION public.get_spending_by_category(
  p_user_id  UUID,
  p_date_from DATE,
  p_date_to   DATE
)
RETURNS TABLE(
  category_id  UUID,
  total        NUMERIC,
  tx_count     BIGINT,
  cat_name     TEXT,
  cat_icon     TEXT,
  cat_color    TEXT,
  cat_parent_id UUID
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.category_id,
    SUM(t.amount)::NUMERIC        AS total,
    COUNT(*)::BIGINT              AS tx_count,
    c.name::TEXT                  AS cat_name,
    c.icon::TEXT                  AS cat_icon,
    c.color::TEXT                 AS cat_color,
    c.parent_id                   AS cat_parent_id
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.user_id      = p_user_id
    AND t.type         = 'expense'
    AND t.date        >= p_date_from
    AND t.date        <= p_date_to
    AND t.category_id IS NOT NULL
  GROUP BY t.category_id, c.name, c.icon, c.color, c.parent_id
  ORDER BY total DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_spending_by_category(UUID, DATE, DATE) TO authenticated;
```

### Function: `get_annual_spending_by_category`
ใช้ใน **เปรียบเทียบรายปี** — รวมยอดค่าใช้จ่ายต่อ category ต่อปี ฝั่ง Postgres คืนแค่ ~100 rows แทนที่จะดึง raw transactions ย้อนหลัง 5 ปี (อาจหลายแสน rows)

```sql
CREATE OR REPLACE FUNCTION public.get_annual_spending_by_category(
  p_user_id  UUID,
  p_year_from INT,
  p_year_to   INT
)
RETURNS TABLE(
  yr          INT,
  category_id UUID,
  total       NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR FROM t.date)::INT AS yr,
    t.category_id,
    SUM(t.amount)::NUMERIC         AS total
  FROM transactions t
  WHERE t.user_id      = p_user_id
    AND t.type         = 'expense'
    AND t.category_id IS NOT NULL
    AND EXTRACT(YEAR FROM t.date) BETWEEN p_year_from AND p_year_to
  GROUP BY EXTRACT(YEAR FROM t.date), t.category_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_annual_spending_by_category(UUID, INT, INT) TO authenticated;
```

### Index แนะนำ (ถ้ายังไม่มี)
```sql
-- ช่วยให้ทุก function ทำงานเร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON public.transactions (user_id, type, date);
```

---

## 3. โครงสร้างตารางอื่นๆ (สรุป)
หากคุณยังไม่ได้สร้างตารางหลักอื่นๆ สามารถดูโครงสร้างได้จากไฟล์นี้:

*   `profiles`: id, full_name, avatar_url, currency
*   `accounts`: id, user_id, name, type, balance, initial_balance, color
*   `categories`: id, user_id, name, type, icon, color, is_default, parent_id
*   `transactions`: id, user_id, account_id, category_id, amount, type, date, note, from_or_to, is_scheduled
*   `budgets`: id, user_id, category_id, amount, period, start_date
*   `credit_cards`: id, account_id, bank_name, credit_limit, statement_date, due_date
*   `investments`: id, account_id, principal_amount, current_value, dividend_schedule
