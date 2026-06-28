import type { ForgeState } from '../utils/forgeCoreEngine';
import { ModelSolver } from '../utils/solver';

interface WorkRequest {
  state: ForgeState;
}

// 接続先APIサーバーURLの自動判定
// CloudflareやHTTPS環境、リバースプロキシに対応するため、アクセスしているドメイン（origin）をそのまま使用します。
const getApiUrl = (): string => {
  if (typeof self !== 'undefined' && self.location && self.location.origin) {
    // 開発環境の Vite ポート(例: 5173)の場合は localhost:3001 に直接繋ぐ
    if (self.location.port === '5173') {
      return 'http://localhost:3001';
    }
    // 本番環境（HTTPS等）では、同じドメインの相対パス（リバースプロキシ経由）で通信します
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
