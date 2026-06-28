import fs from 'fs';
import path from 'path';
import { categories } from '../data/masterData';
import type { ItemData } from '../data/masterData';

const csvPath = path.join(process.cwd(), 'src', 'data', 'items.csv');
const lockPath = path.join(process.cwd(), 'src', 'data', 'items.csv.lock');

// 簡易スリープ
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ロックの取得 (EEXIST フラグによる排他制御)
const acquireLock = async (maxRetries = 50, retryDelay = 20): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // wxフラグ: ファイルが存在する場合はエラーを吐く（アトミック操作）
      fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
      return true; // ロック取得成功
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // ロックがすでに取得されているので待機
        await sleep(retryDelay);
      } else {
        throw err; // その他のエラーはそのままスロー
      }
    }
  }
  return false; // 最大リトライオーバー
};

// ロックの解放
const releaseLock = () => {
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch (err) {
    console.error('[ItemLoader] Failed to release lock:', err);
  }
};

export const loadAndJoinItems = async (): Promise<ItemData[]> => {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`[ItemLoader] items.csv not found at ${csvPath}`);
  }

  // ロックの取得を待機
  const locked = await acquireLock();
  if (!locked) {
    throw new Error('[ItemLoader] Failed to acquire file lock for items.csv (Timeout)');
  }

  try {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n');
    const items: ItemData[] = [];

    lines.forEach((line, index) => {
      if (index === 0 || !line.trim()) return; // ヘッダーおよび空行スキップ

      // CSVパース (ダブルクォーテーション対応)
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current);

      if (parts.length < 6) return;

      const id = parts[0].trim();
      const name = parts[1].trim();
      const categoryId = parts[2].trim();
      const materialType = parts[3].trim();
      const minGreenValues = parts[4].split(',').map(Number);
      const maxGreenValues = parts[5].split(',').map(Number);

      // categories から活性マスと誤差制限を結合 (JOIN)
      const category = categories.find(c => c.id === categoryId);
      if (!category) {
        console.warn(`[ItemLoader] Unknown categoryId "${categoryId}" for item "${name}". Skipping.`);
        return;
      }

      items.push({
        id,
        name,
        category: category.name, // 既存ロジックとの互換性のため日本語名をセット
        materialType,
        activeIndices: category.activeIndices,
        minGreenValues,
        maxGreenValues,
        maxError3: category.errors[0],
        maxError2: category.errors[1],
        maxError1: category.errors[2],
        maxError0: category.errors[3]
      });
    });

    // グローバルキャッシュを同期
    globalItemsRegistry = items;
    return items;
  } finally {
    // 確実にロックを解放
    releaseLock();
  }
};

// CSVへの安全な1行追記 (ロック制御付き)
export const appendItemToCsv = async (row: string): Promise<void> => {
  const locked = await acquireLock();
  if (!locked) {
    throw new Error('[ItemLoader] Failed to acquire file lock for items.csv (Timeout during append)');
  }

  try {
    fs.appendFileSync(csvPath, row, 'utf8');
  } finally {
    releaseLock();
  }
};

// --- 同期型ロードおよびグローバルレジストリサポート ---
export let globalItemsRegistry: ItemData[] = [];

export const setGlobalItemsRegistry = (items: ItemData[]) => {
  globalItemsRegistry = items;
};

export const loadAndJoinItemsSync = (): ItemData[] => {
  try {
    if (!fs.existsSync(csvPath)) return [];
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n');
    const items: ItemData[] = [];

    lines.forEach((line, index) => {
      if (index === 0 || !line.trim()) return;
      
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current);

      if (parts.length < 6) return;

      const id = parts[0].trim();
      const name = parts[1].trim();
      const categoryId = parts[2].trim();
      const materialType = parts[3].trim();
      const minGreenValues = parts[4].split(',').map(Number);
      const maxGreenValues = parts[5].split(',').map(Number);

      const category = categories.find(c => c.id === categoryId);
      if (!category) return;

      items.push({
        id,
        name,
        category: category.name,
        materialType,
        activeIndices: category.activeIndices,
        minGreenValues,
        maxGreenValues,
        maxError3: category.errors[0],
        maxError2: category.errors[1],
        maxError1: category.errors[2],
        maxError0: category.errors[3]
      });
    });

    globalItemsRegistry = items;
    return items;
  } catch (err) {
    // fs が存在しないブラウザ環境などでは何もしない
    return [];
  }
};

// 呼び出し元が同期的に items リストを取得する用
export const getGlobalItems = (): ItemData[] => {
  if (globalItemsRegistry.length === 0) {
    loadAndJoinItemsSync();
  }
  return globalItemsRegistry;
};
