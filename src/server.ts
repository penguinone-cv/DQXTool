import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { ForgeCoreEngine } from './utils/forgeCoreEngine';
import { InferenceClient, MctsSearch } from './utils/mcts';
import { estimateItem } from './utils/featureExtractor';
import { loadAndJoinItems, appendItemToCsv } from './utils/itemLoader';
import type { ItemData } from './data/masterData';

const app = reportShutdown(express());
app.use(cors());
app.use(express.json());

const engine = new ForgeCoreEngine();

// C++常駐推論プロセスおよび MCTS サーチエンジンの初期化
const inferenceClient = new InferenceClient();
const mctsSearch = new MctsSearch(inferenceClient);

// 現在リセットされたアイテムがモデルを使用するかどうかの状態管理
let activeUseModel = true;

// 動的アイテムデータのインメモリキャッシュと起動時ロード
let itemsCache: ItemData[] = [];
const initServer = async () => {
  try {
    itemsCache = await loadAndJoinItems();
    console.log(`[Server] Loaded and joined ${itemsCache.length} items from CSV.`);
  } catch (err) {
    console.error('[Server] Failed to initialize items cache:', err);
  }
};
initServer();

// 特化モデルの配置用フォルダの確保
const modelsDir = path.join(process.cwd(), 'cpp_backend', 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// POST /api/reset : Reset the forge board for a new item and hammer
app.post('/api/reset', async (req: express.Request, res: express.Response): Promise<any> => {
  try {
    const { itemName, hammerName, hammerQuality, seed, characterLevel } = req.body;
    if (!itemName || !hammerName || hammerQuality === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: itemName, hammerName, hammerQuality' });
    }

    // まずは鍛冶エンジンを初期リセット
    const state = engine.reset(itemName, hammerName, Number(hammerQuality), seed, characterLevel ? Number(characterLevel) : undefined);

    // リセットされたステートからアイテムデータを正確に特定
    const matchedItem = estimateItem(state, itemsCache);
    
    if (matchedItem && matchedItem.id) {
      const itemId = matchedItem.id; // すでに '10047' などの数値IDになっています
      
      // 特化モデルの存在確認 (例: cpp_backend/models/10047.onnx)
      const specialModelPath = path.join(modelsDir, `${itemId}.onnx`);
      
      if (fs.existsSync(specialModelPath)) {
        console.log(`[Model Engine] Special ONNX model found for "${itemName}" (Model ID: ${itemId}). Loading...`);
        await inferenceClient.loadModel(specialModelPath);
        activeUseModel = true;
      } else {
        console.log(`[Model Engine] No special model found for "${itemName}" (Model ID: ${itemId}). Using pure rule-based MCTS.`);
        activeUseModel = false;
      }
    } else {
      console.log(`[Model Engine] Could not match item "${itemName}". Using pure rule-based MCTS.`);
      activeUseModel = false;
    }

    return res.json(state);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/step : Execute a strike/skill action
app.post('/api/step', (req: express.Request, res: express.Response): any => {
  try {
    const { actionName, targetCellIndices } = req.body;
    if (!actionName || !targetCellIndices) {
      return res.status(400).json({ error: 'Missing required parameters: actionName, targetCellIndices' });
    }
    const state = engine.step(actionName, targetCellIndices);
    return res.json(state);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/finish : Execute the "しあげる" action and return final quality rating
app.post('/api/finish', (_req: express.Request, res: express.Response): any => {
  try {
    const state = engine.finish();
    return res.json(state);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/state : Get current state of the singleton engine
app.get('/api/state', (_req: express.Request, res: express.Response): any => {
  try {
    const state = engine.getCurrentState();
    return res.json(state);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/actions : Get available skills and target counts
app.get('/api/actions', (_req: express.Request, res: express.Response): any => {
  try {
    const actions = engine.getAvailableActions();
    return res.json(actions);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/recommend : ONNXモデル推論＋MCTS探索に基づき、推奨アクションを返すエンドポイント
app.post(['/api/recommend', '/DQXTool/api/recommend'], async (req: express.Request, res: express.Response): Promise<any> => {
  try {
    const { state } = req.body;
    if (!state) {
      return res.status(400).json({ error: 'Missing required parameters: state' });
    }

    // モデル予測＋MCTS探索 (2000回シミュレーション) の実行 (モデルの有無を動的に反映)
    const recommendations = await mctsSearch.search(state, 2000, activeUseModel, itemsCache);

    // トップ3を返却
    return res.json(recommendations.slice(0, 3));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/items : 動的に結合されたアイテム一覧を返す
app.get(['/api/items', '/DQXTool/api/items'], async (_req: express.Request, res: express.Response): Promise<any> => {
  try {
    if (itemsCache.length === 0) {
      itemsCache = await loadAndJoinItems();
    }
    return res.json(itemsCache);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/items : UIから送信された新規アイテム情報をデータファイルに永続追記するエンドポイント
app.post(['/api/items', '/DQXTool/api/items'], async (req: express.Request, res: express.Response): Promise<any> => {
  try {
    const item = req.body;
    
    // バリデーション
    if (!item.name || !item.categoryId || !item.materialType ||
        !item.minGreenValues || !item.maxGreenValues) {
      return res.status(400).json({ error: 'Missing required parameters: name, categoryId, materialType, minGreenValues, maxGreenValues' });
    }

    // 1. 新しい数値IDの自動生成
    if (itemsCache.length === 0) {
      itemsCache = await loadAndJoinItems();
    }
    const currentMaxId = itemsCache.reduce((max, it) => {
      const idNum = parseInt(it.id);
      return isNaN(idNum) ? max : Math.max(max, idNum);
    }, 10000);
    const newId = (currentMaxId + 1).toString();

    // 2. items.csv へのCSVデータ追記 (唯一の物理的な追加先)
    const csvRow = `${newId},${item.name},${item.categoryId},${item.materialType},"${item.minGreenValues.join(',')}","${item.maxGreenValues.join(',')}"\n`;
    await appendItemToCsv(csvRow);

    // 3. インメモリキャッシュを再ロード同期
    itemsCache = await loadAndJoinItems();

    const newItemObject = itemsCache.find(it => it.id === newId);
    console.log(`[Item Creator] Successfully created new item "${item.name}" with ID "${newId}" (Permanent target: items.csv)`);
    return res.json({ success: true, item: newItemObject });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// プロセス終了時の後処理（C++プロセスの適切なクリーンアップ）
const cleanUp = () => {
  console.log("Shutting down Express API server...");
  inferenceClient.close();
  process.exit(0);
};
process.on('SIGINT', cleanUp);
process.on('SIGTERM', cleanUp);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`DQX Blacksmith Simulator API server listening on port ${PORT}`);
});

function reportShutdown(arg0: any): any {
  return arg0;
}
