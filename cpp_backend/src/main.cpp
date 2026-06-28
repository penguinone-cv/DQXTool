#include "predictor.h"
#include <iostream>
#include <vector>
#include <chrono>
#include <numeric>
#include <random>
#include <string>
#include <sstream>
#include <memory>

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
            // CLIモード: 標準入力から1行（74個のfloat）読み込むたびに推論し、JSONで出力 (常駐対話モード)
            // ==================================================================
            std::unique_ptr<PolicyValuePredictor> predictor;
            try {
                predictor = std::make_unique<PolicyValuePredictor>(model_path);
            } catch (const std::exception& e) {
                std::cerr << "[WARNING] Failed to load initial model: " << e.what() << std::endl;
            }
            
            std::string line;
            // 標準入力から行単位でEOFまで待ち受ける
            while (std::getline(std::cin, line)) {
                if (line.empty()) continue;
                if (line == "exit" || line == "quit") break;

                // オンデマンド・モデル動的ロードコマンドの処理
                if (line.rfind("load ", 0) == 0) {
                    std::string new_path_str = line.substr(5);
#if defined(_WIN32)
                    std::wstring new_model_path(new_path_str.begin(), new_path_str.end());
#else
                    std::string new_model_path = new_path_str;
#endif
                    try {
                        predictor = std::make_unique<PolicyValuePredictor>(new_model_path);
                        std::cout << "{\"status\":\"loaded\"}" << std::endl;
                    } catch (const std::exception& e) {
                        std::cout << "{\"error\":\"Failed to load model: " << e.what() << "\"}" << std::endl;
                    }
                    continue;
                }

                if (!predictor) {
                    std::cout << "{\"error\":\"No model is currently loaded. Send 'load <model_path>' first.\"}" << std::endl;
                    continue;
                }

                std::stringstream ss(line);
                std::vector<float> input_features;
                float val;
                
                while (ss >> val) {
                    input_features.push_back(val);
                }

                if (input_features.size() != 74) {
                    std::cout << "{\"error\":\"Invalid input dimension. Expected 74 values, got " 
                              << input_features.size() << "\"}" << std::endl;
                    continue;
                }

                std::vector<float> policy_logits;
                float value = 0.0f;

                predictor.Predict(input_features, policy_logits, value);

                // 軽量化・簡素化のためにマニュアルでJSONを構築して出力 (1行で出力)
                std::cout << "{\"policy\":[";
                for (size_t i = 0; i < policy_logits.size(); ++i) {
                    std::cout << policy_logits[i];
                    if (i + 1 < policy_logits.size()) std::cout << ",";
                }
                std::cout << "],\"value\":" << value << "}" << std::endl;
            }

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
