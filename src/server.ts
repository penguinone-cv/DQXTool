import express from 'express';
import cors from 'cors';
import { ForgeCoreEngine } from './utils/forgeCoreEngine';
import { InferenceClient, MctsSearch } from './utils/mcts';

const app = express();
app.use(cors());
app.use(express.json());

const engine = new ForgeCoreEngine();

// C++常駐推論プロセスおよび MCTS サーチエンジンの初期化
const inferenceClient = new InferenceClient();
const mctsSearch = new MctsSearch(inferenceClient);

// POST /api/reset : Reset the forge board for a new item and hammer
app.post('/api/reset', (req: express.Request, res: express.Response): any => {
  try {
    const { itemName, hammerName, hammerQuality, seed, characterLevel } = req.body;
    if (!itemName || !hammerName || hammerQuality === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: itemName, hammerName, hammerQuality' });
    }
    const state = engine.reset(itemName, hammerName, Number(hammerQuality), seed, characterLevel ? Number(characterLevel) : undefined);
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

    // モデル予測＋MCTS探索 (100回シミュレーション) の実行
    const recommendations = await mctsSearch.search(state, 100);

    // トップ3を返却
    return res.json(recommendations.slice(0, 3));
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
