import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { decideIdle, IDLE_LIMIT_MS, REFRESH_AFTER_MS } =
    await server.ssrLoadModule('/src/utils/idleTimer.ts');

const NOW = 1_700_000_000_000;
const minutes = (m) => m * 60 * 1000;
// token ที่เพิ่งออกมาสด ๆ ยังไม่ถึงเวลาต่ออายุ ใช้เป็นค่าตั้งต้นของเทสต์ส่วนใหญ่
const decide = (idleMinutes, tokenAgeMinutes = 0) => decideIdle({
    now: NOW,
    lastActivityAt: NOW - minutes(idleMinutes),
    tokenIssuedAt: NOW - minutes(tokenAgeMinutes),
});

test('ยังไม่ถึงเวลาเตือน ถือว่าปกติ', () => {
    const d = decide(28);
    assert.equal(d.state, 'ok');
    assert.equal(d.secondsLeft, 120);
});

test('ครบ 29 นาที เริ่มเตือน', () => {
    assert.equal(decide(29).state, 'warn');
    assert.equal(decide(29.5).state, 'warn');
    assert.equal(decide(29.5).secondsLeft, 30);
});

test('ครบ 30 นาที สั่งออกจากระบบ', () => {
    const d = decide(30);
    assert.equal(d.state, 'logout');
    assert.equal(d.secondsLeft, 0);
});

test('มีกิจกรรมใหม่ระหว่างเตือน กลับมาเป็นปกติ', () => {
    assert.equal(decide(29).state, 'warn');
    assert.equal(decide(0).state, 'ok');
});

test('token อายุเกินครึ่งและยังมีกิจกรรม สั่งต่ออายุ', () => {
    assert.equal(decide(1, 16).shouldRefresh, true);
});

test('token ยังใหม่ ไม่ต้องต่ออายุ', () => {
    assert.equal(decide(1, 5).shouldRefresh, false);
});

test('token อายุเกินครึ่งแต่ผู้ใช้เงียบไปนานแล้ว ห้ามต่ออายุ', () => {
    // ยังไม่ถึงเวลาเตือน แต่เงียบมา 20 นาทีแล้ว ถ้าต่ออายุตรงนี้ token ใบใหม่จะมีชีวิต
    // ต่อไปอีก 30 นาทีนับจากตอนนี้ รวมเป็น 50 นาทีนับจากกิจกรรมสุดท้าย เกินที่รับปากไว้
    assert.equal(decide(20, 16).state, 'ok');
    assert.equal(decide(20, 16).shouldRefresh, false);
    assert.equal(decide(14, 16).shouldRefresh, true);
});

test('token อายุเกินครึ่งแต่ผู้ใช้หายไปแล้ว ห้ามต่ออายุ', () => {
    // ถ้าต่ออายุตอนนี้ รอบจะไม่มีวันหมดอายุ แล้วทั้งงานนี้ก็ไร้ความหมาย
    assert.equal(decide(29, 16).shouldRefresh, false);
    assert.equal(decide(31, 16).shouldRefresh, false);
});

test('ค่าคงที่ตรงตามที่ตกลงไว้', () => {
    assert.equal(IDLE_LIMIT_MS, minutes(30));
    assert.equal(REFRESH_AFTER_MS, minutes(15));
});
