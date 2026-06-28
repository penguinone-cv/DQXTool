#include "predictor.h"
#include <iostream>
#include <vector>
#include <chrono>
#include <numeric>
#include <random>
#include <string>
#include <sstream>

int main(int argc, char* argv[]) {
    try {
        // デフォルトのモデルファイル名
#if defined(_WIN32)
        std::wstring model_path = L"policy_value_net.onnx";
#else
        std::string model_path = "policy_value_net.onnx";
#endif

        // 引数解析: モデルパスの上書き
        for (int i = 1; i < argc; ++i) {
            std::string arg = argv[i];
            if (arg == "--model" && i + 1 < argc) {
                std::string path_str = argv[i + 1];
#if defined(_WIN32)
                model_path = std::wstring(path_str.begin(), path_str.end());
#else
                model_path = path_str;
#endif
                i++;
            }
        }

        // 引数解析: CLIモード判定
        bool cli_mode = false;
        for (int i = 1; i < argc; ++i) {
            if (std::string(argv[i]) == "--cli") {
                cli_mode = true;
                break;
            }
        }

        if (cli_mode) {
            // ==================================================================
            // CLIモード: 標準入力から74個のfloat特徴量を読み込んで推論し、JSONで出力
            // ==================================================================
            PolicyValuePredictor predictor(model_path);
            
            std::vector<float> input_features;
            float val;
            
            // 74個の値が読み込めるまで標準入力から取得
            while (input_features.size() < 74 && (std::cin >> val)) {
                input_features.push_back(val);
            }

            if (input_features.size() != 74) {
                std::cout << "{\"error\":\"Invalid input dimension. Expected 74 values, got " 
                          << input_features.size() << "\"}" << std::endl;
                return 1;
            }

            std::vector<float> policy_logits;
            float value = 0.0f;

            predictor.Predict(input_features, policy_logits, value);

            // 軽量化・簡素化のためにマニュアルでJSONを構築して出力
            std::cout << "{\"policy\":[";
            for (size_t i = 0; i < policy_logits.size(); ++i) {
                std::cout << policy_logits[i];
                if (i + 1 < policy_logits.size()) std::cout << ",";
            }
            std::cout << "],\"value\":" << value << "}" << std::endl;

            return 0;
        }

        // ==================================================================
        // 通常モード: 引数なしの場合のベンチマーク・テスト
        // ==================================================================
#if defined(_WIN32)
        std::wcout << L"Loading ONNX Model from: " << model_path << std::endl;
#else
        std::cout << "Loading ONNX Model from: " << model_path << std::endl;
#endif
        
        PolicyValuePredictor predictor(model_path);
        std::cout << "Model successfully loaded." << std::endl;

        // ダミー入力の準備 (74次元)
        std::vector<float> input_features(74);
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<float> dis(0.0f, 1.0f);
        for (int i = 0; i < 74; ++i) {
            input_features[i] = dis(gen);
        }

        std::vector<float> policy_logits;
        float value = 0.0f;

        // 1. 初回の動作テスト (ウォームアップ)
        predictor.Predict(input_features, policy_logits, value);

        std::cout << "\n=== Test Inference Output ===" << std::endl;
        std::cout << "Value (Expected win rate): " << value << std::endl;
        std::cout << "Policy dimension: " << policy_logits.size() << " (Expected: 160)" << std::endl;
        std::cout << "First 5 Policy logits: ";
        for (int i = 0; i < 5 && i < policy_logits.size(); ++i) {
            std::cout << policy_logits[i] << " ";
        }
        std::cout << "...\n" << std::endl;

        // 2. ベンチマークテスト (100回連続推論)
        std::cout << "=== Running Inference Benchmark (100 runs) ===" << std::endl;
        const int num_runs = 100;
        
        auto start_time = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < num_runs; ++i) {
            input_features[0] = static_cast<float>(i) / num_runs;
            predictor.Predict(input_features, policy_logits, value);
        }
        auto end_time = std::chrono::high_resolution_clock::now();

        auto total_duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
        double avg_duration_ms = (static_cast<double>(total_duration) / num_runs) / 1000.0;

        std::cout << "Total time for " << num_runs << " runs: " 
                  << (static_cast<double>(total_duration) / 1000.0) << " ms" << std::endl;
        std::cout << "Average time per single inference: " << avg_duration_ms << " ms" << std::endl;

        std::cout << "\n=== MCTS Performance Estimate (CPU single thread) ===" << std::endl;
        std::cout << "  - 400 evaluations per move: " << (avg_duration_ms * 400.0) << " ms" << std::endl;
        std::cout << "  - 800 evaluations per move: " << (avg_duration_ms * 800.0) << " ms" << std::endl;
        std::cout << "======================================================" << std::endl;

    } catch (const std::exception& e) {
        std::cerr << "[ERROR] Exception occurred: " << e.what() << std::endl;
        std::cerr << "Make sure that 'policy_value_net.onnx' is placed in the working directory." << std::endl;
        return 1;
    }
    return 0;
}
