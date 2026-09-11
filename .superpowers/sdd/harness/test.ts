const FE = '/Users/panupongdonkrathok16/Desktop/FlowChart/frontend';
const { Window } = await import(`${FE}/node_modules/happy-dom/lib/index.js`);
const win = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const origErr = console.error;
console.error = (...a: any[]) => { if (String(a[0]).startsWith('Failed to fetch leaderboard')) return; origErr(...a); };

// เก็บสถิติการเรียก setTimeout/clearTimeout ของ global เพื่อตรวจ H4b (ตัวจับเวลาพัลส์
// ต้องถูกเคลียร์ตอน unmount) โดยยัง forward ไปเรียกของจริงตามปกติ ไม่กระทบพฤติกรรมอื่น
const liveTimeouts = new Set<any>();
const origSetTimeout = globalThis.setTimeout;
const origClearTimeout = globalThis.clearTimeout;
(globalThis as any).setTimeout = ((...args: any[]) => {
    const id = (origSetTimeout as any)(...args);
    liveTimeouts.add(id);
    return id;
}) as any;
(globalThis as any).clearTimeout = ((...args: any[]) => {
    liveTimeouts.delete(args[0]);
    return (origClearTimeout as any)(...args);
}) as any;

const React = (await import(`${FE}/node_modules/react/index.js`)).default;
const { createRoot } = (await import(`${FE}/node_modules/react-dom/client.js`)).default;
const { act } = React;
const { calls, sockets } = await import('./mocks.ts');
const { useMissionLeaderboard } = await import('./hook.ts');

const board = (page: number, total = 25) => {
    const totalPages = Math.max(1, Math.ceil(Math.max(0, total - 3) / 10));
    const p = Math.min(page, totalPages);
    const start = 3 + (p - 1) * 10;
    const rows = Array.from({ length: Math.max(0, Math.min(10, total - start)) }, (_, i) => ({ user_id: start + i + 1, name: 'u', avatar_url: null, points: 1, total_time: 0, rank: start + i + 1 }));
    return { top3: [1, 2, 3].map((r) => ({ user_id: r, name: 'p', avatar_url: 'x', points: 9, total_time: 0, rank: r })), rows, page: p, page_size: 10, total, total_pages: totalPages, my_rank: 20, my_page: 2, my_user_id: 20 };
};

let H: any;
function Probe() { H = useMissionLeaderboard('14'); return null; }

async function mount() {
    calls.length = 0; sockets.length = 0;
    const el = document.createElement('div');
    const root = createRoot(el as any);
    await act(async () => { root.render(React.createElement(Probe)); });
    await act(async () => { calls[0].resolve(board(1)); });
    return root;
}

// mount ที่ไม่ resolve คำขอแรกให้อัตโนมัติ ใช้ตอนอยากคุมเองว่าคำขอแรกจะสำเร็จหรือพัง
async function mountBare() {
    calls.length = 0; sockets.length = 0;
    const el = document.createElement('div');
    const root = createRoot(el as any);
    await act(async () => { root.render(React.createElement(Probe)); });
    return root;
}

let failCount = 0;
function reportEq(name: string, expected: any, actual: any) {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
    if (!pass) failCount++;
}

// ---- H1: กดปุ่มเปลี่ยนหน้า แล้ว socket แทรกคำขอเงียบเข้ามาก่อนคำตอบของปุ่มจะกลับมา
// คำตอบของปุ่มถูกทิ้งเพราะไม่ใช่คำขอล่าสุด ส่วนคำตอบเงียบ (ล่าสุด) ต้องเคลียร์ switching
// ให้ด้วย ไม่งั้นปุ่มจะค้าง disabled ตลอดไป (ต้องรีโหลดหน้าเว็บถึงจะหาย)
{
    const root = await mount();
    await act(async () => { H.goToPage(2); });
    const clickReq = calls[calls.length - 1];
    await act(async () => { sockets[0].handlers.points_awarded(); }); // socket แทรกคำขอเงียบ
    const silentReq = calls[calls.length - 1];
    await act(async () => { clickReq.resolve(board(2)); }); // ถูกทิ้งเพราะไม่ใช่คำขอล่าสุดแล้ว
    await act(async () => { silentReq.resolve(board(2)); }); // ล่าสุดและเงียบ ต้องเคลียร์ switching
    reportEq('H1 switching เคลียร์เมื่อคำตอบล่าสุดมาถึงแม้จะเป็นคำขอเงียบ',
        { switching: false }, { switching: H.switching });
    root.unmount();
}

// ---- H2: กดเปลี่ยนหน้าแล้วคำขอพัง page ที่คืนออกไปต้องตรงกับหน้าที่ตารางแสดงจริง
// (ไม่ใช่หน้าที่ขอไปแล้วพัง) และการรีเฟรชเงียบครั้งถัดไปต้องขอหน้าที่ถูกต้อง ไม่ใช่หน้า
// ที่พังค้างอยู่ ส่วนการกดปุ่มครั้งถัดไปก็ต้องยังทำงาน ไม่ติดค้าง
{
    const root = await mount(); // แสดงหน้า 1 อยู่
    await act(async () => { H.goToPage(2); });
    const failReq = calls[calls.length - 1];
    await act(async () => { failReq.reject(new Error('net')); });
    const pageAfterFail = H.page;
    await act(async () => { sockets[0].handlers.points_awarded(); });
    const silentReq = calls[calls.length - 1];
    const reqsBeforeClick = calls.length;
    await act(async () => { H.goToPage(5); });
    const reqsAfterClick = calls.length;
    reportEq('H2 คำขอเปลี่ยนหน้าพัง: page ตรงกับหน้าที่แสดงจริง, รีเฟรชเงียบขอหน้าที่ถูกต้อง, กดต่อยังทำงาน',
        { pageAfterFail: 1, silentRefreshRequestsPage: 1, nextClickIssuesRequest: true },
        { pageAfterFail, silentRefreshRequestsPage: silentReq.page, nextClickIssuesRequest: reqsAfterClick > reqsBeforeClick });
    root.unmount();
}

// ---- H3: อันดับหดตอนอยู่หน้าสุดท้าย รีเฟรชเงียบได้หน้าที่เซิร์ฟเวอร์บีบมาต่ำลง
// ต้องไม่ยิงคำขอเพิ่มเอง และต้องไม่โชว์ switching (ผู้ใช้ไม่ได้กดอะไร)
{
    const root = await mount();
    await act(async () => { H.goToPage(3); });
    await act(async () => { calls[calls.length - 1].resolve(board(3)); });
    const before = calls.length;
    await act(async () => { sockets[0].handlers.points_awarded(); }); // รีเฟรชเงียบ 1 ครั้ง
    await act(async () => { calls[calls.length - 1].resolve(board(3, 20)); }); // เซิร์ฟเวอร์บีบ 3 -> 2
    const extraReqs = calls.length - before - 1; // ลบคำขอรีเฟรชเงียบตัวมันเองออก 1
    reportEq('H3 รีเฟรชเงียบที่ถูกบีบหน้า ไม่ยิงคำขอเพิ่มและไม่โชว์ switching',
        { extraReqs: 0, switching: false }, { extraReqs, switching: H.switching });
    root.unmount();
}

// ---- H4a: มีคนทำด่านเสร็จสองครั้งห่างกัน 1 วิ ไฟ "เพิ่งอัปเดต" ต้องถูกต่ออายุ
// ไม่ใช่ดับตามตัวจับเวลาของพัลส์แรก (ซึ่งจะดับตอน 1.5 วิหลังพัลส์แรก คือก่อน 1.6 วิที่เช็ก)
{
    const root = await mount();
    await act(async () => { sockets[0].handlers.points_awarded(); }); // พัลส์แรก t=0
    await act(async () => { await new Promise((r) => setTimeout(r, 1000)); sockets[0].handlers.points_awarded(); }); // พัลส์สอง t=1000
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); }); // t=1600
    reportEq('H4a พัลส์ที่สองต่ออายุไฟ ไม่ดับตามตัวจับเวลาของพัลส์แรก',
        { justUpdatedAt1600ms: true }, { justUpdatedAt1600ms: H.justUpdated });
    root.unmount();
}

// ---- H4b: unmount ต้องเคลียร์ตัวจับเวลาของพัลส์ที่ค้างอยู่ ไม่งั้น setState จะยิงใส่
// component ที่ถอดไปแล้ว ตรวจผ่านการนับ setTimeout/clearTimeout ของจริง
{
    const root = await mount();
    liveTimeouts.clear();
    await act(async () => { sockets[0].handlers.points_awarded(); }); // ตั้งตัวจับเวลาพัลส์ 1 ตัว
    const pendingBeforeUnmount = liveTimeouts.size;
    root.unmount();
    const pendingAfterUnmount = liveTimeouts.size;
    reportEq('H4b unmount เคลียร์ตัวจับเวลาพัลส์และ throttle ที่ค้างอยู่',
        { pendingBeforeUnmount: 2, pendingAfterUnmount: 0 },
        { pendingBeforeUnmount, pendingAfterUnmount });
}

// ---- H5: โหลดครั้งแรกพัง ต้องบอกตรง ๆ ว่าโหลดไม่สำเร็จ (loadFailed) ไม่ใช่ทำเนียนว่า
// "ยังไม่มีใครได้คะแนน" แล้วพอมีคำตอบสำเร็จมาทีหลัง ต้องเคลียร์ loadFailed ออก
{
    const root = await mountBare();
    await act(async () => { calls[0].reject(new Error('net')); });
    const loadFailedAfterFirstFail = H.loadFailed;
    await act(async () => { sockets[0].handlers.points_awarded(); });
    await act(async () => { calls[calls.length - 1].resolve(board(1)); });
    const loadFailedAfterSuccess = H.loadFailed;
    reportEq('H5 โหลดครั้งแรกพัง -> loadFailed=true, สำเร็จภายหลัง -> loadFailed=false',
        { afterFirstFail: true, afterSuccess: false },
        { afterFirstFail: loadFailedAfterFirstFail, afterSuccess: loadFailedAfterSuccess });
    root.unmount();
}

// ---- Regression: คำตอบเก่ากว่า (silent) มาถึงทีหลังคำขอหน้าใหม่ที่ผู้ใช้ตั้งใจดู
// ต้องไม่ทับข้อมูลที่ผู้ใช้กำลังดูอยู่
{
    const root = await mount();
    await act(async () => { sockets[0].handlers.points_awarded(); }); // รีเฟรชเงียบหน้า 1
    const sockReq = calls[calls.length - 1];
    await act(async () => { H.goToPage(2); }); // ผู้ใช้กดไปหน้า 2
    const clickReq = calls[calls.length - 1];
    await act(async () => { clickReq.resolve(board(2)); });
    await act(async () => { sockReq.resolve(board(1)); }); // คำตอบเก่ากว่าของหน้า 1 มาทีหลัง ต้องถูกทิ้ง
    reportEq('Regression คำตอบเก่ากว่าที่มาทีหลังไม่ทับหน้าใหม่ที่ผู้ใช้ตั้งใจดู',
        { page: 2, firstRowRank: 14 }, { page: H.page, firstRowRank: H.rows[0]?.rank });
    root.unmount();
}

// ---- missions_updated ต้องไม่ถูกฟังอีกต่อไป: กระดานระดมสมองบรอดคาสต์ event นี้ให้ทุกคน
// ทุกครั้งที่มีใครแก้การ์ด (ดู backend/brainstorm_routes.py) ซึ่งไม่เกี่ยวกับคะแนนเลย
// ถ้ายังฟังอยู่จะดึงซ้ำแบบไม่มีประโยชน์ทุกครั้งที่มีคนแก้การ์ดระหว่างเรียน
{
    const root = await mount();
    const handlerRegistered = typeof sockets[0].handlers.missions_updated === 'function';
    const before = calls.length;
    if (handlerRegistered) sockets[0].handlers.missions_updated();
    await act(async () => {});
    const after = calls.length;
    reportEq('missions_updated ไม่ถูกฟังอีกต่อไป และยิงมาก็ไม่มีคำขอเพิ่ม',
        { handlerRegistered: false, extraRequests: 0 },
        { handlerRegistered, extraRequests: after - before });
    root.unmount();
}

// ---- Regression: socket ถูกสร้างครั้งเดียวตลอดการเปลี่ยนหน้า และถูกตัดตอน unmount
{
    const root = await mount();
    for (const p of [2, 3, 1]) {
        await act(async () => { H.goToPage(p); });
        await act(async () => { calls[calls.length - 1].resolve(board(p)); });
    }
    const s = sockets[0];
    root.unmount();
    reportEq('Regression socket สร้างครั้งเดียวตลอดการเปลี่ยนหน้า และถูกตัดตอน unmount',
        { socketsCreated: 1, disconnectedAfterUnmount: true },
        { socketsCreated: sockets.length, disconnectedAfterUnmount: s.disconnected });
}

// ---- H6: points_awarded จากด่านอื่นไม่ทำให้ refresh (Important 2)
{
    const root = await mount();
    const before = calls.length;
    await act(async () => { sockets[0].handlers.points_awarded({ mission_id: 99 }); });
    reportEq('H6 points_awarded จากด่านอื่น (mission_id=99) ไม่มีคำขอเพิ่ม',
        { extraRequests: 0, justUpdated: false },
        { extraRequests: calls.length - before, justUpdated: H.justUpdated });
    root.unmount();
}

// ---- H7: points_awarded จากด่านเดียวกันทำ refresh (Important 2)
{
    const root = await mount();
    const before = calls.length;
    await act(async () => { sockets[0].handlers.points_awarded({ mission_id: 14 }); });
    reportEq('H7 points_awarded จากด่านเดียวกัน (mission_id=14) มีคำขอเพิ่ม + pulse',
        { extraRequests: 1, justUpdated: true },
        { extraRequests: calls.length - before, justUpdated: H.justUpdated });
    root.unmount();
}

// ---- H8: throttle — emit รัว ๆ 3 ครั้งใน 100ms ได้คำขอแค่ครั้งเดียว (leading-edge)
{
    const root = await mount();
    const before = calls.length;
    await act(async () => {
        sockets[0].handlers.points_awarded({ mission_id: 14 });
        await new Promise(r => setTimeout(r, 50));
        sockets[0].handlers.points_awarded({ mission_id: 14 });
        await new Promise(r => setTimeout(r, 50));
        sockets[0].handlers.points_awarded({ mission_id: 14 });
    });
    reportEq('H8 throttle: 3 events ใน 100ms ได้คำขอแค่ 1 (leading-edge)',
        { extraRequests: 1 }, { extraRequests: calls.length - before });
    root.unmount();
}

// ---- H9: shape guard — response ผิดรูป (backend เก่าตอบเป็น array) → loadFailed (Important 3)
{
    const root = await mountBare();
    await act(async () => { calls[0].resolve([{ user_id: 1, name: 'x', points: 10 }]); });
    reportEq('H9 response ผิดรูป (array เหมือน backend เก่า) → loadFailed',
        { loadFailed: true, total: 0 }, { loadFailed: H.loadFailed, total: H.total });
    root.unmount();
}

console.log();
console.log(failCount === 0 ? 'ผ่านทั้งหมด' : `ยังมีปัญหา: ${failCount} สถานการณ์ไม่ผ่าน`);
process.exit(failCount === 0 ? 0 : 1);
