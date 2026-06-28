cmake_minimum_required(VERSION 3.12)
project(test_predictor)

# C++17 を使用
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ONNX Runtime の配置場所 (デフォルトはプロジェクト直下の third_party/onnxruntime)
set(ONNXRUNTIME_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/third_party/onnxruntime")

# インクルードパスの設定
include_directories(${ONNXRUNTIME_ROOT}/include)

# ソースコード一覧
set(SOURCES
    src/predictor.cpp
    src/main.cpp
)

# 実行バイナリの定義
add_executable(test_predictor ${SOURCES})

# ユニットテスト用の実行バイナリ定義
set(TEST_SOURCES
    src/predictor.cpp
    src/unit_tests.cpp
)
add_executable(unit_tests ${TEST_SOURCES})

# OSに応じたライブラリのリンク設定
if(WIN32)
    # Windows 環境 (Windowsでの動作検証用)
    link_directories(${ONNXRUNTIME_ROOT}/lib)
    target_link_libraries(test_predictor onnxruntime)
    target_link_libraries(unit_tests onnxruntime)
    
    # 実行フォルダに dll をコピーする処理 (Windows用)
    if(EXISTS "${ONNXRUNTIME_ROOT}/lib/onnxruntime.dll")
        add_custom_command(TARGET test_predictor POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${ONNXRUNTIME_ROOT}/lib/onnxruntime.dll"
            $<TARGET_FILE_DIR:test_predictor>
        )
        add_custom_command(TARGET unit_tests POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${ONNXRUNTIME_ROOT}/lib/onnxruntime.dll"
            $<TARGET_FILE_DIR:unit_tests>
        )
    endif()
else()
    # Linux 環境 (本番環境用)
    find_library(ORT_LIB NAMES onnxruntime PATHS ${ONNXRUNTIME_ROOT}/lib NO_DEFAULT_PATH)
    if(NOT ORT_LIB)
        message(FATAL_ERROR "ONNX Runtime library not found in ${ONNXRUNTIME_ROOT}/lib")
    endif()
    target_link_libraries(test_predictor ${ORT_LIB})
    target_link_libraries(unit_tests ${ORT_LIB})
    
    # 本番環境で libonnxruntime.so を解決しやすくするため、実行バイナリ自体に rpath を埋め込む設定
    # これにより、実行バイナリの相対パス ../third_party/onnxruntime/lib から直接ライブラリをロード可能にします
    set_target_properties(test_predictor PROPERTIES
        BUILD_WITH_INSTALL_RPATH TRUE
        INSTALL_RPATH "$ORIGIN/../third_party/onnxruntime/lib"
    )
    set_target_properties(unit_tests PROPERTIES
        BUILD_WITH_INSTALL_RPATH TRUE
        INSTALL_RPATH "$ORIGIN/../third_party/onnxruntime/lib"
    )
endif()
