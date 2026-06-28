import type { ForgeState } from '../utils/forgeCoreEngine';
import { ModelSolver } from '../utils/solver';

interface WorkRequest {
  state: ForgeState;
}

// 接続先APIサーバーURLの自動判定
// Cloudflareやリバースプロキシで /DQXTool/ などのサブディレクトリでホストされている環境に対応します。
const getApiUrl = (): string => {
  if (typeof self !== 'undefined' && self.location && self.location.origin) {
    // 開発環境の Vite ポート(例: 5173)の場合は localhost:3001 に直接繋ぐ
    if (self.location.port === '5173') {
      return 'http://localhost:3001';
    }
    
    // URLのパスから「DQXTool」や「dqxtool」などのベースディレクトリ名を抽出する
    // 例: https://example.com/DQXTool/index.html -> /DQXTool/
    const pathParts = self.location.pathname.split('/');
    const subDir = pathParts.find(p => p.toLowerCase() === 'dqxtool');
    
    if (subDir) {
      return `${self.location.origin}/${subDir}`;
    }
    return self.location.origin;
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
