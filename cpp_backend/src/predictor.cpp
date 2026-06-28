#include "predictor.h"
#include <stdexcept>

PolicyValuePredictor::PolicyValuePredictor(const PathType& model_path) {
    // 1. ONNX Runtime 環境の初期化 (ロギングレベルを設定)
    env_ = Ort::Env(ORT_LOGGING_LEVEL_WARNING, "PolicyValueNet-Inference");

    // 2. 推論エンジンのオプション設定 (3コアCPU環境向けに最適化)
    Ort::SessionOptions session_options;

    // 【スレッド数制限】
    // CPUが3コアのサーバーでは、MCTSのマルチスレッド探索と競合してCPU使用率が100%を超えたり、
    // コンテキストスイッチによる遅延が発生するのを防ぐため、各推論呼び出しはシングルスレッドで動かします。
    session_options.SetIntraOpNumThreads(1);
    session_options.SetInterOpNumThreads(1);

    // 【最適化設定】
    // 演算の畳み込みや最適化（定数フォールディングなど）をすべて有効化
    session_options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);

    // 3. セッション（モデルインスタンス）の生成
    session_ = Ort::Session(env_, model_path.c_str(), session_options);

    // アロケータ情報の取得 (テンソル作成時にCPUメモリを指定するために必要)
    allocator_info_ = Ort::MemoryInfo::CreateCpu(OrtDeviceAllocator, OrtMemTypeCPU);
}

void PolicyValuePredictor::Predict(const std::vector<float>& input_features,
                                  std::vector<float>& out_policy_logits,
                                  float& out_value) 
{
    // 入力の次元チェック (盤面セル状態: 8×7=56次元 + グローバル状態: 18次元 = 計74次元)
    if (input_features.size() != 74) {
        throw std::invalid_argument("Input feature dimension must be exactly 74.");
    }

    // 入力テンソルの形状 (バッチサイズ=1, 入力特徴量=74)
    std::vector<int64_t> input_shape = {1, 74};

    // ONNX Runtime 用の Tensor オブジェクトを作成 (input_features のメモリ領域を直接参照し、コピーを回避)
    Ort::Value input_tensor = Ort::Value::CreateTensor<float>(
        allocator_info_,
        const_cast<float*>(input_features.data()),
        input_features.size(),
        input_shape.data(),
        input_shape.size()
    );

    // 推論を実行
    // 入力テンソル配列、出力先テンソル配列を渡し、モデルの実行を行います
    auto output_tensors = session_.Run(
        Ort::RunOptions{nullptr},
        input_names_,
        &input_tensor,
        1,  // 入力テンソル数
        output_names_,
        2   // 出力テンソル数
    );

    // 出力データを取り出す
    // 1. Policy 頭部 (出力名 "policy", 形状: 1 x 160)
    float* policy_data = output_tensors[0].GetTensorMutableData<float>();
    out_policy_logits.assign(policy_data, policy_data + 160);

    // 2. Value 頭部 (出力名 "value", 形状: 1 x 1)
    float* value_data = output_tensors[1].GetTensorMutableData<float>();
    out_value = value_data[0];
}
