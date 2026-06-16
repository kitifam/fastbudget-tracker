# Git Manual (Local)

## เริ่มต้นโปรเจกต์ใหม่

```bash
git init                        # สร้าง repository ในโฟลเดอร์ปัจจุบัน
```

---

## ดูสถานะ

```bash
git status                      # ดูว่าไฟล์ไหนเปลี่ยน / ยังไม่ได้ commit
git log                         # ดูประวัติ commit ทั้งหมด
git log --oneline               # ดูประวัติแบบสั้น (แนะนำ)
git diff                        # ดูว่าแก้ไขอะไรไปบ้าง (ก่อน add)
```

---

## บันทึกการเปลี่ยนแปลง (Add + Commit)

```bash
git add .                       # เพิ่มทุกไฟล์เข้า staging
git add index.html              # เพิ่มเฉพาะไฟล์ที่ระบุ
git commit -m "ข้อความอธิบาย"  # บันทึก snapshot
```

ทำทั้งสองขั้นตอนทุกครั้ง: add แล้วค่อย commit

---

## ย้อนกลับ / แก้ไข

```bash
git restore index.html          # ยกเลิกการแก้ไขไฟล์ (คืนกลับเป็นตอน commit ล่าสุด)
git restore --staged index.html # เอาไฟล์ออกจาก staging (ยังไม่ได้ commit)
git revert HEAD                 # สร้าง commit ใหม่ที่ยกเลิก commit ล่าสุด (ปลอดภัย)
```

---

## Branch (สาขา)

```bash
git branch                      # ดู branch ทั้งหมด
git branch feature-login        # สร้าง branch ใหม่
git switch feature-login        # สลับไป branch นั้น
git switch master               # กลับ branch หลัก
git merge feature-login         # รวม branch เข้า branch ปัจจุบัน
git branch -d feature-login     # ลบ branch (หลัง merge แล้ว)
```

---

## เปรียบเทียบ

```bash
git diff HEAD~1                 # เทียบกับ commit ก่อนหน้า 1 อัน
git show abc1234                # ดูรายละเอียด commit นั้น (ใช้ hash จาก git log)
```

---

## Flow ที่ใช้บ่อย

1. แก้โค้ด
2. `git status` -- ดูว่าไฟล์ไหนเปลี่ยน
3. `git add .`
4. `git commit -m "แก้ bug ปุ่ม submit"`
5. ทำซ้ำ

---

## Tips

- Commit บ่อย ๆ ดีกว่า commit ใหญ่ก้อนเดียว
- ข้อความ commit ให้บอกว่า "ทำอะไร" เช่น `เพิ่มหน้า dashboard`, `แก้ bug คำนวณยอดรวม`
- ถ้าพังแล้วไม่รู้จะแก้ยังไง ใช้ `git log --oneline` หา commit ที่ดี แล้วค่อยตัดสินใจ
