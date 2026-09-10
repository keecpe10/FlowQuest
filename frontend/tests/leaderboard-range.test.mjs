import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { rankRangeLabel, PODIUM_SIZE, LEADERBOARD_PAGE_SIZE } =
    await server.ssrLoadModule('/src/utils/leaderboardRange.ts');

test('ค่าคงที่ตรงกับฝั่งเซิร์ฟเวอร์', () => {
    assert.equal(PODIUM_SIZE, 3);
    assert.equal(LEADERBOARD_PAGE_SIZE, 10);
});

test('หน้าแรกเริ่มนับหลังโพเดียม', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 25 }), 'อันดับ 4–13 จาก 25');
});

test('หน้ากลาง', () => {
    assert.equal(rankRangeLabel({ page: 2, total: 25 }), 'อันดับ 14–23 จาก 25');
});

test('หน้าสุดท้ายที่ไม่เต็มหน้า', () => {
    assert.equal(rankRangeLabel({ page: 3, total: 25 }), 'อันดับ 24–25 จาก 25');
});

test('พอดีหน้าสุดท้าย', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 13 }), 'อันดับ 4–13 จาก 13');
});

test('มีแต่คนบนโพเดียม ไม่ต้องมีข้อความ', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 3 }), '');
    assert.equal(rankRangeLabel({ page: 1, total: 1 }), '');
});

test('ยังไม่มีใครเลย ไม่ต้องมีข้อความ', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 0 }), '');
});

test('หน้าที่เลยช่วงไป ไม่ต้องมีข้อความ', () => {
    assert.equal(rankRangeLabel({ page: 9, total: 25 }), '');
});
