<img src="public/brand/aowdee-logo-168.png" width="72" height="72" alt="ตรา AOWDEE" align="right" />

# AOWDEE GANG HQ

เว็บภายในภาษาไทยสำหรับแก๊ง AOWDEE (LUV TOWN / FiveM) ใช้ร่วมกัน 4–5 คน บันทึกสมาชิก อาวุธ คลังของ เงินแก๊ง ค่าหัว รถ แต้ม กิจกรรม และชุด โดยข้อมูลจริงอยู่ใน Supabase Postgres และล็อกอินด้วย Discord เท่านั้น

## สถานะ

M0 กำลังก่อสร้าง foundation ยังไม่มีข้อมูลสมาชิกหรือยอดเงินจริง และยังไม่เชื่อม Discord OAuth

## Stack

React + TypeScript + Vite · Tailwind CSS v4 · React Router · Supabase (Postgres, Auth, Storage) · Cloudflare Pages · Vitest

## คำสั่ง

```bash
npm install
npm run dev        # เปิด http://localhost:5173
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

## การตั้งค่า

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าจาก Supabase dashboard

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key>
```

ค่าทั้งสองเป็น public client config ที่ปลอดภัยเมื่อ RLS ถูกต้อง ห้ามใส่ `service_role` key หรือรหัสฐานข้อมูลในไฟล์นี้หรือในโค้ดที่ขึ้น GitHub

## เอกสาร

- `PRODUCT.md` ความจริงของสินค้า ผู้ใช้ และข้อจำกัด
- `DESIGN.md` ระบบดีไซน์ (seed) โลก "The Counting Room"
- `docs/DECISIONS.md` การตัดสินใจที่ห้ามกลับโดยไม่แจ้ง

## ความปลอดภัย

สิทธิ์ OWNER / EDITOR / VIEWER ต้องถูกบังคับที่ฐานข้อมูลด้วย RLS, GRANT และ RPC ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ ทุกการแก้ไขที่กระทบเงิน คลังของ แต้ม และสัญญารถต้องเป็น transaction เดียวและมี audit record
