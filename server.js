require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');
const db = require('./src/db');
const { crawlAll } = require('./src/crawlers/index');
const { startScheduler, sendNotification, getDaysUntil } = require('./src/scheduler');

const FMANS_TEMPLATE = path.join(__dirname, '꽃집청년들 custom_order_excel (2).xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 상품 API ──────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  const { vendor, maxPrice, q } = req.query;
  const products = db.getProducts({
    vendor,
    maxPrice: maxPrice ? parseInt(maxPrice) : null,
    q,
  });
  res.json(products);
});

app.post('/api/crawl', async (req, res) => {
  res.json({ message: '크롤링 시작됨' });
  try {
    await crawlAll();
  } catch (err) {
    console.error('크롤링 오류:', err.message);
  }
});

// ── 기념일 API ────────────────────────────────────────────
app.get('/api/anniversaries', (req, res) => {
  const list = db.getAllAnniversaries().map(ann => ({
    ...ann,
    daysLeft: getDaysUntil(ann.date),
  }));
  res.json(list);
});

app.post('/api/anniversaries', (req, res) => {
  const { person_name, relation, anniversary_type, date, notify_days } = req.body;
  if (!person_name || !date) {
    return res.status(400).json({ error: '이름과 날짜는 필수입니다' });
  }
  const ann = db.createAnniversary({ person_name, relation, anniversary_type, date, notify_days });
  res.json({ ...ann, products: [], daysLeft: getDaysUntil(date) });
});

app.put('/api/anniversaries/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { person_name, relation, anniversary_type, date, notify_days } = req.body;
  const updated = db.updateAnniversary(id, { person_name, relation, anniversary_type, date, notify_days });
  if (!updated) return res.status(404).json({ error: '기념일을 찾을 수 없습니다' });
  const products = db.getSelections(id);
  res.json({ ...updated, products, daysLeft: getDaysUntil(updated.date) });
});

app.delete('/api/anniversaries/:id', (req, res) => {
  db.deleteAnniversary(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── 상품 선택 API ─────────────────────────────────────────
app.post('/api/selections', (req, res) => {
  const { anniversary_id, product_id } = req.body;
  const annId = parseInt(anniversary_id);
  const prodId = parseInt(product_id);

  const count = db.countSelections(annId);
  if (count >= 2) {
    return res.status(400).json({ error: '최대 2개까지 선택 가능합니다' });
  }

  const currentTotal = db.getSelectionsTotal(annId);
  const product = db.getProductById(prodId);
  if (!product) return res.status(404).json({ error: '상품을 찾을 수 없습니다' });

  if (currentTotal + product.price > 150000) {
    return res.status(400).json({
      error: `예산(15만원)을 초과합니다. 현재 ${currentTotal.toLocaleString()}원 + ${product.price.toLocaleString()}원`,
    });
  }

  try {
    db.addSelection(annId, prodId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/selections/:anniversary_id/:product_id', (req, res) => {
  db.removeSelection(parseInt(req.params.anniversary_id), parseInt(req.params.product_id));
  res.json({ ok: true });
});

// ── 설정 API ──────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const s = db.getAllSettings();
  if (s.email_pass) s.email_pass = '••••••••';
  if (s.admin_pw) s.admin_pw = '••••••••';
  res.json(s);
});

app.post('/api/verify-admin', (req, res) => {
  const { password } = req.body;
  const stored = db.getSetting('admin_pw') || 'contec@admin';
  res.json({ ok: password === stored });
});

app.post('/api/settings', (req, res) => {
  const allowed = ['email_to', 'email_user', 'email_pass', 'admin_pw', 'employee_list',
    'google_form_url', 'google_form_entry1', 'google_form_entry2', 'google_form_entry_occasion',
    'vendor_fmansname', 'vendor_fmansemail', 'vendor_fmansphone',
    'vendor_sirloinname', 'vendor_sirloinemail', 'vendor_sirloinphone',
    'vendor_allfreshname', 'vendor_alfreshemail', 'vendor_allfreshphone'];
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== '••••••••') {
      db.setSetting(key, req.body[key]);
    }
  }
  res.json({ ok: true });
});

// ── 이미지 프록시 (핫링크 차단 우회) ─────────────────────
app.get('/api/img', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('http')) return res.status(400).end();
  try {
    const origin = new URL(url).origin;
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: {
        'Referer': origin + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    const ct = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(response.data));
  } catch {
    res.status(404).end();
  }
});

// ── 찜하기 (IP 기반) ──────────────────────────────────────
app.get('/api/wishlist', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  res.json(db.getWishlist(ip));
});
app.post('/api/wishlist', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  db.setWishlist(ip, req.body.ids || []);
  res.json({ ok: true });
});

// ── 신청 API ──────────────────────────────────────────────
// 사용 현황 조회 (이름으로)
app.get('/api/usage', (req, res) => {
  const { name } = req.query;
  const year = new Date().getFullYear();
  const usage = db.getUsageSummary(year, name);

  // 명단에 있는 사람이 신청 기록이 없으면 → 1회 사용·잔여 50,000원 디폴트
  if (name && usage.count === 0) {
    const s = db.getAllSettings();
    const list = (s.employee_list || '').split('\n').map(n => n.trim()).filter(Boolean);
    if (list.includes(name)) {
      return res.json({ count: 1, total: 100000, remaining_count: 1, remaining_budget: 50000 });
    }
  }

  res.json(usage);
});

// 신청 제출
app.post('/api/applications', (req, res) => {
  const {
    employee_name, department, employee_id, contact,
    anniversary_type, anniversary_date, recipient_name,
    products, delivery_address, delivery_contact, note,
  } = req.body;

  if (!employee_name || !anniversary_type || !anniversary_date || !products?.length) {
    return res.status(400).json({ error: '필수 항목을 모두 입력해주세요' });
  }

  const year = new Date().getFullYear();
  const usage = db.getUsageSummary(year, employee_name);

  if (usage.remaining_count <= 0) {
    return res.status(400).json({ error: '올해 신청 횟수(2회)를 모두 사용하셨습니다' });
  }

  const total_price = products.reduce((s, p) => s + (p.price || 0), 0);
  if (usage.total + total_price > 150000) {
    return res.status(400).json({
      error: `연간 한도(15만원)를 초과합니다. 잔여 예산: ${usage.remaining_budget.toLocaleString()}원`,
    });
  }

  const app = db.createApplication({
    employee_name, department, employee_id, contact,
    anniversary_type, anniversary_date, recipient_name,
    products, total_price,
    delivery_address, delivery_contact, note,
  });

  res.json(app);
});

// 신청 목록 (관리자용)
app.get('/api/applications', (req, res) => {
  res.json(db.getAllApplications());
});

// 신청 상태 변경
app.patch('/api/applications/:id/status', (req, res) => {
  const updated = db.updateApplicationStatus(parseInt(req.params.id), req.body.status);
  if (!updated) return res.status(404).json({ error: '신청을 찾을 수 없습니다' });
  res.json(updated);
});

// 신청 삭제
app.delete('/api/applications/:id', (req, res) => {
  db.deleteApplication(parseInt(req.params.id));
  res.json({ ok: true });
});

// 꽃집청년들 발주용 Excel (템플릿 기반)
app.get('/api/applications/fmans-excel', (req, res) => {
  try {
    const wb = XLSX.readFile(FMANS_TEMPLATE);
    const ws = wb.Sheets[wb.SheetNames[0]];

    const apps = db.getAllApplications().filter(a =>
      a.status !== 'cancelled' &&
      (a.products || []).some(p => p.vendor === 'fmans')
    ).sort((a, b) => (a.anniversary_date || '').localeCompare(b.anniversary_date || ''));

    // 템플릿 3행 예시 데이터 삭제
    const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(
      ['AA','AB','AC','AD','AE','AF','AG','AH','AI','AJ','AK','AL','AM','AN','AO']
    );
    COLS.forEach(col => { delete ws[col + '3']; });

    let rowNum = 3;

    apps.forEach(app => {
      const fmansProds = (app.products || []).filter(p => p.vendor === 'fmans');

      fmansProds.forEach(product => {
        // 상품 슬롯 최대 3개 구성
        const slots = [{ code: '', name: product.name, price: product.price, qty: 1 }];
        if (product.cakeAdded) slots.push({ code: 'ZZ00201', name: '케이크 [1호]', price: 34000, qty: 1 });

        // 우편번호 / 주소 분리
        const pcMatch = (app.delivery_address || '').match(/\[(\d{5})\]/);
        const postcode = pcMatch ? pcMatch[1] : '';
        const addr = (app.delivery_address || '').replace(/\[\d{5}\]\s*/, '').trim();

        // 희망배송일 → Excel date serial
        let excelDate = '';
        if (app.anniversary_date) {
          const d = new Date(app.anniversary_date);
          excelDate = Math.floor(d.getTime() / 86400000 + 25569);
        }

        const setCell = (col, val) => {
          const ref = col + rowNum;
          if (val === '' || val === null || val === undefined) return;
          ws[ref] = typeof val === 'number' ? { t: 'n', v: val } : { t: 's', v: String(val) };
        };

        setCell('A', '전화');
        setCell('B', '택배');
        setCell('C', app.employee_name || '');
        setCell('D', slots[0]?.code || '');
        setCell('E', slots[0]?.name || '');
        setCell('F', slots[0]?.price || '');
        setCell('G', slots[0]?.qty || 1);
        setCell('H', slots[1]?.code || '');
        setCell('I', slots[1]?.name || '');
        setCell('J', slots[1]?.price || '');
        setCell('K', slots[1]?.qty || '');
        setCell('L', slots[2]?.code || '');
        setCell('M', slots[2]?.name || '');
        setCell('N', slots[2]?.price || '');
        setCell('O', slots[2]?.qty || '');
        // P~S: 주문자 정보 (상호명, 휴대폰, 이메일, 연락처2)
        setCell('Q', app.contact || '');
        setCell('T', app.recipient_name || '');    // 받는분성함
        setCell('U', app.delivery_contact || '');  // 받는분휴대폰
        setCell('W', postcode);                    // 우편번호
        setCell('X', addr);                        // 배송주소1
        setCell('Y', excelDate);                   // 희망배송일
        setCell('AB', app.employee_name || '');    // 보내는분(좌측)
        setCell('AC', app.note || '');             // 카드메시지
        setCell('AD', app.note || '');             // 요구사항
        setCell('AO', String(app.id));             // 업체주문번호

        rowNum++;
      });
    });

    // 범위 업데이트
    ws['!ref'] = `A1:AO${Math.max(rowNum - 1, 3)}`;

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const today = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '').replace('.', '');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('꽃집청년들_발주서_' + today + '.xlsx')}`);
    res.send(buf);
  } catch (err) {
    console.error('fmans excel 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// CSV 내보내기
app.get('/api/applications/export', (req, res) => {
  const apps = db.getAllApplications();
  const headers = ['번호', '신청일', '이름', '부서', '사번', '연락처', '기념일종류', '기념일날짜', '수령인', '상품1', '상품2', '합계금액', '배송주소', '배송연락처', '메모', '상태'];
  const rows = apps.map(a => {
    const p1 = a.products?.[0];
    const p2 = a.products?.[1];
    return [
      a.id,
      new Date(a.submitted_at).toLocaleDateString('ko-KR'),
      a.employee_name, a.department, a.employee_id, a.contact,
      a.anniversary_type, a.anniversary_date, a.recipient_name,
      p1 ? `${p1.name}(${p1.price?.toLocaleString()}원)` : '',
      p2 ? `${p2.name}(${p2.price?.toLocaleString()}원)` : '',
      a.total_price?.toLocaleString() + '원',
      a.delivery_address, a.delivery_contact, a.note || '',
      { pending: '대기', processing: '처리중', done: '완료', cancelled: '취소' }[a.status] || a.status,
    ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',');
  });
  const csv = '﻿' + [headers.join(','), ...rows].join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="gift_applications_${Date.now()}.csv"`);
  res.send(csv);
});

// ── 구글 폼 API ───────────────────────────────────────────
// 선택한 상품으로 구글 폼 pre-filled URL 생성
app.post('/api/google-form-url', (req, res) => {
  const { anniversary_id } = req.body;

  const formUrl = db.getSetting('google_form_url');
  const entry1 = db.getSetting('google_form_entry1');  // 첫 번째 상품 필드 ID
  const entry2 = db.getSetting('google_form_entry2');  // 두 번째 상품 필드 ID
  const entryOccasion = db.getSetting('google_form_entry_occasion'); // 기념일 필드 ID

  if (!formUrl) {
    return res.status(400).json({ error: '구글 폼 URL을 먼저 설정해주세요 (설정 탭)' });
  }

  const annId = parseInt(anniversary_id);
  const ann = db.getAllAnniversaries().find(a => a.id === annId);
  const products = ann ? db.getSelections(annId) : [];

  // pre-filled URL 생성
  const baseUrl = formUrl.replace('/viewform', '').replace(/\/$/, '');
  const params = new URLSearchParams({ usp: 'pp_url' });

  if (entryOccasion && ann) {
    params.append(`entry.${entryOccasion}`, `${ann.person_name} ${ann.anniversary_type}`);
  }
  if (entry1 && products[0]) {
    params.append(`entry.${entry1}`, `${products[0].name} (${products[0].price.toLocaleString()}원)`);
  }
  if (entry2 && products[1]) {
    params.append(`entry.${entry2}`, `${products[1].name} (${products[1].price.toLocaleString()}원)`);
  }

  const prefilledUrl = `${baseUrl}/viewform?${params.toString()}`;
  res.json({ url: prefilledUrl });
});

app.post('/api/test-notification', async (req, res) => {
  const dummy = {
    person_name: '테스트',
    anniversary_type: '알림 테스트',
    date: '01-01',
    notify_days: '7,3,1',
  };
  const ok = await sendNotification(dummy, [], 7);
  res.json({ ok });
});

// ── 서버 시작 ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🎁 가족사랑기프트 서버 시작: http://localhost:${PORT}\n`);
  startScheduler();

  const count = db.countProducts();
  if (count === 0) {
    console.log('상품 데이터가 없어 자동 크롤링을 시작합니다...');
    try {
      await crawlAll();
    } catch (err) {
      console.error('초기 크롤링 실패:', err.message);
    }
  } else {
    console.log(`저장된 상품: ${count}개`);
  }
});
