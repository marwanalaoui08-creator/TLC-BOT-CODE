import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { closeDatabase, getDb, initDatabase } from '../server/db/client.ts';
import { importJsonStateIfMissing } from '../server/db/sync.ts';
import type { TlcDatabaseState } from '../src/shared/types.ts';

async function main() {
  const targetArg = process.argv[2];
  const filePath = path.resolve(
    process.cwd(),
    targetArg || path.join('data', 'tlc-database.json')
  );

  if (!fs.existsSync(filePath)) {
    console.error(`[TLC Migration] JSON file not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as TlcDatabaseState;

  const init = await initDatabase();
  if (!init.ok) {
    console.error('[TLC Migration] Database connection failed:', init.error);
    process.exit(1);
  }

  try {
    const db = getDb();
    await importJsonStateIfMissing(db, parsed);
    console.log(
      `[TLC Migration] Safely imported non-conflicting records from ${path.basename(filePath)} into PostgreSQL.`
    );
  } finally {
    await closeDatabase();
  }
}

main().catch((err) => {
  console.error('[TLC Migration] Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
