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

test('parseFile honors the active worksheet when multiple sheets contain compatible chlorite data', async () => {
  const filePath = path.join(process.cwd(), '数据/绿泥石计算结果(1).xlsx');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: '绿泥石计算结果(1).xlsx' } as any);

    assert.equal(rows.length, 121);
    assert.equal(rows.at(-1)?.Sample, '703-211-1');
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

test('parseFile falls back from an incompatible active worksheet to a compatible muscovite sheet', async () => {
  const filePath = path.join(process.cwd(), '数据/白云母计算.xlsx');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: '白云母计算.xlsx' } as any);

    assert.ok(rows.length >= 20, 'expected muscovite rows to be returned from a non-active worksheet');
    assert.match(rows[0].Sample, /ZK712-921M-01/i);
    assert.equal(Number(rows[0].SiO2), 44.19);
    assert.equal(Number(rows[0].K2O), 8.79);
  });
});

test('parseFile ignores template instructions when transposed sheets do not provide sample labels', async () => {
  const filePath = path.join(process.cwd(), '数据/Muscovite(1).xls');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: 'Muscovite(1).xls' } as any);

    assert.ok(rows.length >= 10, 'expected transposed rows to be returned');
    assert.equal(rows[0].Sample, 'Sample-1');
    assert.equal(Number(rows[0].K2O), 9.914);
  });
});

test('parseFile extracts repeated oxide blocks as individual samples', async () => {
  const filePath = path.join(process.cwd(), '数据/氧化物分子式推导.xls');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: '氧化物分子式推导.xls' } as any);

    assert.equal(rows.length, 3);
    assert.equal(rows[0].Sample, '1502-126.6-1.1');
    assert.equal(Number(rows[0].FeO), 66.8);
  });
});

test('parseFile reads peak-search reports from xlsx workbooks', async () => {
  const filePath = path.join(process.cwd(), '数据/20210304  寻峰结果.xlsx');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: '20210304  寻峰结果.xlsx' } as any);

    assert.ok(rows.length >= 70, 'expected peak rows to be returned');
    assert.match(rows[0].Sample, /qlek403-320\.3\.raw/i);
    assert.equal(Number(rows[0].TwoTheta), 8.814);
    assert.equal(Number(rows[0].Height), 140);
  });
});

test('parseFile reads continuous XRD txt spectra as two-column series', async () => {
  const filePath = path.join(process.cwd(), '数据/qlek403-353.2.txt');
  await withMockFileReader(filePath, async () => {
    const rows = await parseFile({ name: 'qlek403-353.2.txt' } as any);

    assert.ok(rows.length >= 300, 'expected XRD points to be returned');
    assert.equal(rows[0].Sample, 'qlek403-353.2');
    assert.equal(Number(rows[0].TwoTheta), 3.0001);
    assert.equal(Number(rows[0].Intensity), 225);
  });
});
