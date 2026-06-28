import express from 'express';
import cors from 'cors';
import { ForgeCoreEngine } from './utils/forgeCoreEngine';
import { extractFeatures } from './utils/featureExtractor';
import { getPossibleMovesForSolver } from './utils/solverUtils';
import { skills } from './data/masterData';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const engine = new ForgeCoreEngine();

// C++ 推論エンジンを呼び出すヘルパー関数
function runInference(features: number[]): Promise<{ policy: number[], value: number }> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'test_predictor.exe' : 'test_predictor';
    
    // 一般的なビルド配置（build/test_predictor, もしくは build/Release/test_predictor）
    const possiblePaths = [
      path.join(process.cwd(), 'cpp_backend', 'build', binName),
      path.join(process.cwd(), 'cpp_backend', 'build', 'Release', binName),
      path.join(process.cwd(), 'cpp_backend', binName)
    ];

    let binPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        binPath = p;
        break;
      }
    }

    if (!binPath) {
      // ローカル開発環境(C++ビルド環境がない場合)向けのモック推論フォールバック
      console.warn(`[WARNING] Inference binary not found. Falling back to Mock Inference Mode for local development.`);
      
      const mockPolicy = new Array<number>(160).fill(0.0).map(() => Math.random() * 2.0 - 1.0);
      // 「しあげる」(インデックス16)の確率を高めにしてテストしやすくする
      mockPolicy[16 * 8] = 5.0; 
      const mockValue = 0.8; // 大成功に近い期待値
      
      setTimeout(() => {
        resolve({ policy: mockPolicy, value: mockValue });
      }, 5);
      return;
    }

    const args = ['--cli'];
    const modelPath = path.join(process.cwd(), 'cpp_backend', 'policy_value_net.onnx');
    if (fs.existsSync(modelPath)) {
      args.push('--model', modelPath);
    }

    const env = { ...process.env };
    if (!isWin) {
      // Linux本番環境用の ONNX Runtime 動的リンクライブラリのロード設定
      const ortLibPath = path.join(process.cwd(), 'cpp_backend', 'third_party', 'onnxruntime', 'lib');
      env.LD_LIBRARY_PATH = `${ortLibPath}:${env.LD_LIBRARY_PATH || ''}`;
    }

    const child = spawn(binPath, args, { env, cwd: path.join(process.cwd(), 'cpp_backend') });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`C++ process exited with code ${code}. Stderr: ${stderr}`));
      }
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          return reject(new Error(result.error));
        }
        resolve(result);
      } catch (err: any) {
        reject(new Error(`Failed to parse C++ stdout: ${stdout}. Error: ${err.message}`));
      }
    });

    // 74次元特徴量をスペース区切りで標準入力に流し込む
    const inputStr = features.join(' ') + '\n';
    child.stdin.write(inputStr);
    child.stdin.end();
  });
}

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

// POST /api/recommend : ONNXモデル推論に基づき、推奨アクションを返すエンドポイント
app.post(['/api/recommend', '/DQXTool/api/recommend'], async (req: express.Request, res: express.Response): Promise<any> => {
  try {
    const { state } = req.body;
    if (!state) {
      return res.status(400).json({ error: 'Missing required parameters: state' });
    }

    // 1. 特徴量抽出 (74次元)
    const features = extractFeatures(state);

    // 2. C++推論エンジンを呼び出してモデル評価
    const inferenceResult = await runInference(features);
    const { policy, value } = inferenceResult;

    // 3. 現在の有効な候補手一覧を取得
    const possibleMoves = getPossibleMovesForSolver(state);

    // 4. 有効手ごとに Policy ロジットをマッピング
    const recommendations = possibleMoves.map(move => {
      let skillIdx = skills.findIndex(s => s.name === move.actionName);
      if (move.actionName === 'しあげる') {
        skillIdx = 16; // しあげるをインデックス16にマップ
      }

      // 代表マスのインデックス
      const targetIdx = move.targets.length > 0 ? move.targets[0] : 0;
      
      // Policy配列から該当アクションのロジットを取得
      let logit = -999.0;
      if (skillIdx !== -1 && skillIdx < 20) {
        const policyIdx = skillIdx * 8 + targetIdx;
        if (policyIdx < policy.length) {
          logit = policy[policyIdx];
        }
      }

      // 価値予測（-1.0 〜 1.0）から確率形式へマッピング
      const successRate = Math.min(1.0, Math.max(0.0, (value + 1.0) / 2.0));
      const greatSuccessRate = Math.min(1.0, Math.max(0.0, value > 0.0 ? value : 0.0));

      return {
        move,
        expectedScore: logit,
        greatSuccessRate,
        successRate
      };
    });

    // 5. expectedScore (ロジット) の高い順にソート
    recommendations.sort((a, b) => b.expectedScore - a.expectedScore);

    // トップ3を返却
    return res.json(recommendations.slice(0, 3));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`DQX Blacksmith Simulator API server listening on port ${PORT}`);
});
