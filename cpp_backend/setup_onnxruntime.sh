#!/bin/bash
set -e

# ==============================================================================
# ONNX Runtime C++ 環境構築 & ビルド自動化スクリプト (Linux専用)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THIRD_PARTY_DIR="${SCRIPT_DIR}/third_party"
BUILD_DIR="${SCRIPT_DIR}/build"
ORT_VERSION="1.18.0"
ORT_TAR="onnxruntime-linux-x64-${ORT_VERSION}.tgz"
ORT_URL="https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/${ORT_TAR}"

echo "=== 1. 依存ツールの確認とインストール ==="

# g++ の確認
if ! command -v g++ &> /dev/null; then
    echo "g++ が見つかりません。インストールを試みます..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y build-essential
    else
        echo "[ERROR] apt-get が見つかりません。手動で g++ (C++17対応) をインストールしてください。"
        exit 1
    fi
else
    echo "g++ は既にインストールされています。"
fi

# cmake の確認
if ! command -v cmake &> /dev/null; then
    echo "cmake が見つかりません。インストールを試みます..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y cmake
    else
        echo "[ERROR] apt-get が見つかりません。手動で cmake をインストールしてください。"
        exit 1
    fi
else
    echo "cmake は既にインストールされています。"
fi

# wget / tar の確認
for cmd in wget tar; do
    if ! command -v $cmd &> /dev/null; then
        echo "$cmd が見つかりません。インストールを試みます..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y $cmd
        else
            echo "[ERROR] $cmd をインストールできませんでした。手動でインストールしてください。"
            exit 1
        fi
    fi
done

echo "=== 2. ONNX Runtime C++ ライブラリのダウンロード ==="
mkdir -p "${THIRD_PARTY_DIR}"

if [ ! -d "${THIRD_PARTY_DIR}/onnxruntime" ]; then
    echo "ONNX Runtime v${ORT_VERSION} をダウンロードしています..."
    wget -q --show-progress -O "${THIRD_PARTY_DIR}/${ORT_TAR}" "${ORT_URL}"
    
    echo "解凍中..."
    tar -xzf "${THIRD_PARTY_DIR}/${ORT_TAR}" -C "${THIRD_PARTY_DIR}"
    
    echo "ディレクトリ名の整理..."
    mv "${THIRD_PARTY_DIR}/onnxruntime-linux-x64-${ORT_VERSION}" "${THIRD_PARTY_DIR}/onnxruntime"
    
    # 不要になった圧縮ファイルを削除
    rm "${THIRD_PARTY_DIR}/${ORT_TAR}"
    echo "ONNX Runtime の配置が完了しました。"
else
    echo "ONNX Runtime は既に ${THIRD_PARTY_DIR}/onnxruntime に配置されています。"
fi

echo "=== 3. C++ プロジェクトのビルド ==="
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

echo "CMake 設定を実行中..."
cmake ..

echo "ビルドを実行中..."
make -j$(nproc 2>/dev/null || echo 2)

echo "=== 4. テスト実行用スクリプトの作成 ==="
# C++実行ファイルは実行時に libonnxruntime.so.X.X.X をロードするために LD_LIBRARY_PATH を必要とします。
# これを自動で設定して実行するヘルパースクリプトを作成します。
cat << 'EOF' > "${SCRIPT_DIR}/run_test.sh"
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="${SCRIPT_DIR}/third_party/onnxruntime/lib:${LD_LIBRARY_PATH}"

if [ ! -f "${SCRIPT_DIR}/policy_value_net.onnx" ]; then
    echo "[WARNING] ${SCRIPT_DIR}/policy_value_net.onnx が見つかりません。"
    echo "テストを実行する前に、ONNXモデルファイルをこのディレクトリに配置してください。"
fi

echo "========================================"
echo "1/2: ユニットテストを実行します..."
echo "========================================"
if "${SCRIPT_DIR}/build/unit_tests"; then
    echo "ユニットテストが正常に完了しました。"
else
    echo "[ERROR] ユニットテストが失敗しました。終了します。"
    exit 1
fi

echo ""
echo "========================================"
echo "2/2: ベンチマークテストを実行します..."
echo "========================================"
"${SCRIPT_DIR}/build/test_predictor"
EOF

chmod +x "${SCRIPT_DIR}/run_test.sh"

echo "=============================================================================="
echo "環境構築およびビルドが完了しました！"
echo "すでにある ONNX モデルを以下のパスにコピーしてください："
echo "  ${SCRIPT_DIR}/policy_value_net.onnx"
echo "コピー後、以下のスクリプトを実行して推論テストを行ってください："
echo "  ${SCRIPT_DIR}/run_test.sh"
echo "=============================================================================="
