import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../server/index.js';
import { db } from '../server/db/index.js';
import { runMigrations } from '../server/db/migrate.js';

let server: http.Server;
let baseUrl: string;
let authToken: string;

beforeAll(async () => {
  await runMigrations();

  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const address = server.address() as any;
      baseUrl = `http://localhost:${address.port}`;
      resolve();
    });
  });

  // Login dengan PIN default 090203
  const loginRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '090203' }),
  });
  const loginJson = await loginRes.json();
  authToken = loginJson.token;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('Fase 7: Sinkronisasi Google Sheets, Backup & Status Koneksi', () => {
  it('1. GET /api/system/status harus melaporkan status engine DB dan Google Sheets secara jujur', async () => {
    const res = await fetch(`${baseUrl}/api/system/status`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.database).toBeDefined();
    expect(json.database.healthy).toBe(true);
    expect(json.googleSheets).toBeDefined();
    expect(typeof json.googleSheets.configured).toBe('boolean');
    expect(['READY', 'NOT_CONFIGURED']).toContain(json.googleSheets.status);
    expect(json.backup).toBeDefined();
    expect(typeof json.backup.totalSnapshots).toBe('number');
  });

  it('2. POST /api/system/test-connection harus menguji responsivitas database dan Google Apps Script', async () => {
    const res = await fetch(`${baseUrl}/api/system/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.results.database.online).toBe(true);
    expect(typeof json.durationMs).toBe('number');
  });

  it('3. GET /api/system/export-sheets-data harus mengekstrak 9 tab resmi dengan header dan baris rapi', async () => {
    const res = await fetch(`${baseUrl}/api/system/export-sheets-data`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const json = await res.json();
    if (res.status !== 200) console.log('ERROR /export-sheets-data:', json);
    expect(res.status).toBe(200);
    expect(json.status).toBe('success');
    const sheets = json.data;

    // Verifikasi keberadaan seluruh 9 tab master specification
    const expectedSheets = [
      'AyamMasuk',
      'Produksi',
      'StokRealtime',
      'PenjualanHQ',
      'LapakRO',
      'Pengeluaran',
      'GajiKaryawan',
      'KasPribadi',
      'NFC',
    ];

    for (const sheetName of expectedSheets) {
      expect(sheets[sheetName]).toBeDefined();
      expect(Array.isArray(sheets[sheetName].headers)).toBe(true);
      expect(sheets[sheetName].headers.length).toBeGreaterThan(0);
      expect(Array.isArray(sheets[sheetName].rows)).toBe(true);
    }

    // Tab StokRealtime harus memiliki produk-produk karkas/sampingan
    expect(sheets.StokRealtime.rows.length).toBeGreaterThanOrEqual(6);
  });

  it('4. POST /api/system/sync-sheets harus memproses siklus sinkronisasi tanpa error server', async () => {
    const res = await fetch(`${baseUrl}/api/system/sync-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.data.totalSheets).toBe(9);
    expect(Array.isArray(json.data.results)).toBe(true);
    expect(json.data.results.length).toBe(9);
  });

  it('5. POST /api/system/backup harus membuat snapshot database komprehensif ke direktori backups/', async () => {
    const res = await fetch(`${baseUrl}/api/system/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.data.fileName).toMatch(/^backup_rpa9s_.*\.json$/);

    const backupFilePath = path.resolve(process.cwd(), 'backups', json.data.fileName);
    expect(fs.existsSync(backupFilePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
    expect(content.metadata).toBeDefined();
    expect(content.metadata.totalTables).toBeGreaterThanOrEqual(25);
    expect(content.tables.stok_gudang).toBeDefined();
    expect(content.tables.audit_logs).toBeDefined();
  });
});
