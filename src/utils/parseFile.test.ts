import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parseFile } from './parseFile';

function withMockFileReader(filePath: string, run: () => Promise<void>) {
  class MockFileReader {
    onload: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;

    readAsArrayBuffer() {
      const buffer = fs.readFileSync(filePath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      this.onload?.({ target: { result: arrayBuffer } });
    }

    readAsText() {
      const text = fs.readFileSync(filePath, 'utf8');
      this.onload?.({ target: { result: text } });
    }
  }

  const originalFileReader = (globalThis as any).FileReader;
  (globalThis as any).FileReader = MockFileReader;

  return run().finally(() => {
    (globalThis as any).FileReader = originalFileReader;
  });
}

test('parseFile handles xlsx sheets with blank header cells', async () => {
  const filePath = path.join(process.cwd(), '数据/绿泥石计算结果.xlsx');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: '绿泥石计算结果.xlsx' } as any);

    assert.ok(rows.length > 0, 'expected parsed rows to be returned');
    assert.equal(typeof rows[0].Sample, 'string');
    assert.equal(typeof rows[0].SiO2, 'string');
  });
});

test('parseFile prefers sheets with descriptive sample identifiers', async () => {
  const filePath = path.join(process.cwd(), '数据/绿泥石计算结果.xlsx');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: '绿泥石计算结果.xlsx' } as any);

    assert.ok(rows.length > 0, 'expected parsed rows to be returned');
    assert.match(rows[0].Sample, /1203-60\.5-01/i);
  });
});

test('parseFile handles transposed chlorite calculator templates', async () => {
  const filePath = path.join(process.cwd(), '数据/Chlorite.xls');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: 'Chlorite.xls' } as any);

    assert.ok(rows.length >= 10, 'expected chlorite calculator columns to be converted into rows');
    assert.match(rows[0].Sample, /PW519|FFH/i);
    assert.equal(rows[0].SiO2, '23.22');
    assert.equal(rows[0].FeO, '40.53');
  });
});

test('parseFile handles transposed muscovite calculator templates', async () => {
  const filePath = path.join(process.cwd(), '数据/Muscovite.xls');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: 'Muscovite.xls' } as any);

    assert.ok(rows.length >= 10, 'expected muscovite calculator columns to be converted into rows');
    assert.match(rows[0].Sample, /ZK403-122\.7-ser 03/i);
    assert.equal(Number(rows[0].SiO2), 46.26);
    assert.equal(Number(rows[0].K2O), 11.1);
  });
});
