#!/bin/bash

# エラーが発生した時点でスクリプトを即終了させる
set -e

# スクリプトの格納されているディレクトリを取得し、そこに移動（実行場所のズレ防止）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "DQXTool デプロイスクリプトを開始します..."
echo "=========================================="

# 1. ビルドの実行
echo "[1/3] プロジェクトをビルド中..."
npm run build

# 2. 公開用フォルダの作成とコピー
echo "[2/3] ビルド成果物を公開ディレクトリにコピー中..."
# コピー先ディレクトリが存在しない場合は作成
mkdir -p /var/www/html/dqxtool
# コピーを実行
cp -rf dist/* /var/www/html/dqxtool/

# 3. 権限の調整
echo "[3/3] パーミッションを調整中..."
chown -R www-data:www-data /var/www/html/dqxtool
chmod -R 755 /var/www/html/dqxtool

echo "=========================================="
echo "デプロイが正常に完了しました！"
echo "=========================================="
