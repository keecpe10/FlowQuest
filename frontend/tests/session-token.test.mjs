import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { tokenIssuedAt, tokenExpiresAt } =
    await server.ssrLoadModule('/src/utils/sessionToken.ts');

// JWT จริงประกอบด้วยสามส่วนคั่นด้วยจุด ตัวกลางเป็น base64url ของ payload
const makeToken = (payload) => {
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `header.${b64}.signature`;
};

test('อ่านเวลาออก token และเวลาหมดอายุเป็นมิลลิวินาที', () => {
    const t = makeToken({ iat: 1700000000, exp: 1700001800, sub: 1 });
    assert.equal(tokenIssuedAt(t), 1700000000 * 1000);
    assert.equal(tokenExpiresAt(t), 1700001800 * 1000);
});

test('token ที่ไม่มีฟิลด์เวลา คืน 0 ไม่ใช่ NaN', () => {
    const t = makeToken({ sub: 1 });
    assert.equal(tokenIssuedAt(t), 0);
    assert.equal(tokenExpiresAt(t), 0);
});

test('payload ที่ไม่มี padding ก็ยังอ่านได้', () => {
    // ความยาวที่ทำให้ base64 ต้องมี = ต่อท้าย ซึ่ง JWT จริงตัดทิ้ง
    const t = makeToken({ iat: 1700000000, exp: 1700001800, sub: 12345, sid: 'abcdef' });
    assert.equal(tokenExpiresAt(t), 1700001800 * 1000);
});

test('ค่าที่ไม่ใช่ JWT ไม่ทำให้พัง คืน 0', () => {
    for (const bad of ['', 'ไม่ใช่โทเคน', 'a.b', 'a.!!!.c', 'a.' + Buffer.from('ไม่ใช่ json').toString('base64') + '.c']) {
        assert.equal(tokenIssuedAt(bad), 0, `ค่าที่ทดสอบ: ${bad}`);
        assert.equal(tokenExpiresAt(bad), 0, `ค่าที่ทดสอบ: ${bad}`);
    }
});

test('เวลาที่ไม่ใช่ตัวเลข ถือว่าอ่านไม่ได้', () => {
    const t = makeToken({ iat: 'เมื่อวาน', exp: null });
    assert.equal(tokenIssuedAt(t), 0);
    assert.equal(tokenExpiresAt(t), 0);
});
