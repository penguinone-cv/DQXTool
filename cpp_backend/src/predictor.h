#ifndef PREDICTOR_H
#define PREDICTOR_H

#include <vector>
#include <string>
#include <onnxruntime_cxx_api.h>

class PolicyValuePredictor {
public:
    // OSごとにファイルパスの型を決定 (Windowsはstd::wstring、Linux等はstd::string)
#if defined(_WIN32)
    using PathType = std::wstring;
#else
    using PathType = std::string;
#endif

    // コンストラクタ: モデルのロードと初期設定を行います
    explicit PolicyValuePredictor(const PathType& model_path);

    // デストラクタ
    ~PolicyValuePredictor() = default;

    // 局面の推論（バッチサイズ1）
    // [入力] input_features: 74次元の入力特徴量
    // [出力] out_policy_logits: 160次元の方策ロジット (関数内部で自動的にリサイズ・格納されます)
    // [出力] out_value: 現局面の期待勝率 (-1.0 から 1.0)
    void Predict(const std::vector<float>& input_features,
                 std::vector<float>& out_policy_logits,
                 float& out_value);

private:
    Ort::Env env_{nullptr};
    Ort::Session session_{nullptr};
    Ort::MemoryInfo allocator_info_{nullptr};

    // テンソル名定義 (エクスポート時に定義した名前)
    const char* input_names_[1] = {"input"};
    const char* output_names_[2] = {"policy", "value"};
};

#endif // PREDICTOR_H
