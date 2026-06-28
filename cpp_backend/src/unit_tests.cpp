#include "predictor.h"
#include <iostream>
#include <vector>
#include <cassert>
#include <cmath>
#include <stdexcept>
#include <cstdlib>

// シンプルなアサーションマクロ
#define TEST_ASSERT(cond) \
    do { \
        if (!(cond)) { \
            std::cerr << "[FAIL] Assertion failed: " << #cond << " at " << __FILE__ << ":" << __LINE__ << std::endl; \
            std::exit(1); \
        } \
    } while (0)

// テスト 1: モデルが例外を出さずにロードできるか検証
void test_model_loading() {
    std::cout << "[Test] Model Loading..." << std::endl;
#if defined(_WIN32)
    std::wstring model_path = L"policy_value_net.onnx";
#else
    std::string model_path = "policy_value_net.onnx";
#endif
    
    try {
        PolicyValuePredictor predictor(model_path);
        std::cout << "  -> [PASS] Model loaded successfully." << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "  -> [FAIL] Exception thrown during load: " << e.what() << std::endl;
        TEST_ASSERT(false);
    }
}

// テスト 2: 正常な入力特徴量に対する出力形状と出力範囲の妥当性を検証
void test_inference_shape_and_range() {
    std::cout << "[Test] Inference Shape and Output Ranges..." << std::endl;
#if defined(_WIN32)
    std::wstring model_path = L"policy_value_net.onnx";
#else
    std::string model_path = "policy_value_net.onnx";
#endif
    
    PolicyValuePredictor predictor(model_path);
    
    // 入力特徴量 74次元 (全て 0.5f で埋めたダミー入力)
    std::vector<float> input_features(74, 0.5f);
    std::vector<float> policy_logits;
    float value = 0.0f;
    
    predictor.Predict(input_features, policy_logits, value);
    
    // Policy 出力ロジットのサイズ確認 (20スキル × 8マス = 160次元)
    TEST_ASSERT(policy_logits.size() == 160);
    std::cout << "  -> [PASS] Policy logits size is exactly 160." << std::endl;
    
    // Value 出力範囲の確認 (勝率期待値は tanh 出力のため -1.0 から 1.0 の連続値)
    TEST_ASSERT(value >= -1.0f && value <= 1.0f);
    std::cout << "  -> [PASS] Value output is within bounds [-1.0, 1.0]: " << value << std::endl;
    
    // NaN (非数) のチェック
    TEST_ASSERT(!std::isnan(value));
    for (float logit : policy_logits) {
        TEST_ASSERT(!std::isnan(logit));
    }
    std::cout << "  -> [PASS] No NaN values found in outputs." << std::endl;
}

// テスト 3: 不正な入力サイズに対して適切に例外がスローされるか検証
void test_invalid_input_handling() {
    std::cout << "[Test] Invalid Input Size Handling..." << std::endl;
#if defined(_WIN32)
    std::wstring model_path = L"policy_value_net.onnx";
#else
    std::string model_path = "policy_value_net.onnx";
#endif
    
    PolicyValuePredictor predictor(model_path);
    
    // 誤った入力次元（73次元）
    std::vector<float> invalid_features(73, 0.5f);
    std::vector<float> policy_logits;
    float value = 0.0f;
    
    bool exception_thrown = false;
    try {
        predictor.Predict(invalid_features, policy_logits, value);
    } catch (const std::invalid_argument& e) {
        exception_thrown = true;
        std::cout << "  -> [PASS] Correctly caught std::invalid_argument: " << e.what() << std::endl;
    } catch (...) {
        std::cerr << "  -> [FAIL] Threw unexpected exception type." << std::endl;
        TEST_ASSERT(false);
    }
    TEST_ASSERT(exception_thrown);
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "Running PolicyValuePredictor Unit Tests" << std::endl;
    std::cout << "========================================" << std::endl;
    
    test_model_loading();
    test_inference_shape_and_range();
    test_invalid_input_handling();
    
    std::cout << "========================================" << std::endl;
    std::cout << "All unit tests passed successfully!" << std::endl;
    std::cout << "========================================" << std::endl;
    
    return 0;
}
