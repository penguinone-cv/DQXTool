import type { ForgeState } from '../utils/forgeCoreEngine';
import { ModelSolver } from '../utils/solver';

interface WorkRequest {
  state: ForgeState;
}

// 接続先APIサーバーURLの自動動的判定 (Web Worker内では self.location を使用)
const getApiUrl = (): string => {
  if (typeof self !== 'undefined' && self.location && self.location.hostname) {
    const host = self.location.hostname;
    // localhost や 127.0.0.1 以外の本番サーバーIP/ドメインにアクセスしている場合、そのIPのポート3001に接続する
    if (host && host !== '' && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3001`;
    }
  }
  return 'http://localhost:3001';
};

const solver = new ModelSolver(getApiUrl());

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
