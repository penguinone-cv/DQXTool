import type { ForgeState } from '../utils/forgeCoreEngine';
import { ModelSolver } from '../utils/solver';

interface WorkRequest {
  state: ForgeState;
}

// ModelSolver の初期化（デフォルトのAPIサーバー宛て）
// 本番環境や開発環境のドメインに合わせて引数で調整可能です
const solver = new ModelSolver('http://localhost:3001');

// Web Worker のメッセージリスナー
self.onmessage = async (e: MessageEvent) => {
  const { state } = e.data as WorkRequest;

  try {
    // UI側のプログレスインジケータに対応するためのダミー進捗
    self.postMessage({ type: 'PROGRESS', progress: 30 });

    // API経由でONNXモデルの推論推奨手（トップ3）を取得
    const recommendations = await solver.recommend(state);

    self.postMessage({ type: 'PROGRESS', progress: 100 });
    self.postMessage({ type: 'RESULT', recommendations });
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};
