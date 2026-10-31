import crypto from 'crypto';
import { db } from '../db/index.js';

export interface AuditLogEntry {
  userAction: string;
  entityType: string;
  entityId?: string;
  payload?: any;
  ipAddress?: string;
}

export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const payloadStr = entry.payload ? JSON.stringify(entry.payload) : null;
    await db.query(
      `INSERT INTO audit_logs (id, timestamp, user_action, entity_type, entity_id, payload, ip_address)
       VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6)`,
      [id, entry.userAction, entry.entityType, entry.entityId || null, payloadStr, entry.ipAddress || null]
    );
  } catch (err) {
    console.error('[AUDIT LOG ERROR] Gagal menyimpan log:', err);
  }
}
