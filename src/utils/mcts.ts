import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import type { ForgeState } from './forgeCoreEngine';
import { ForgeCoreEngine } from './forgeCoreEngine';
import { cloneForgeState, getPossibleMovesForSolver, evaluateStateScore } from './solverUtils';
import { extractFeatures } from './featureExtractor';
import { skills } from '../data/masterData';
import type { ItemData } from '../data/masterData';

// 常駐プロセスとしてC++推論エンジンと対話するクライアント
export class InferenceClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private pendingRequests: Array<{ resolve: (val: any) => void; reject: (err: any) => void }> = [];

  constructor() {
    this.startProcess();
  }

  private startProcess() {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'test_predictor.exe' : 'test_predictor';
    
    const possiblePaths = [
      path.join(process.cwd(), 'cpp_backend', 'build', binName),
      path.join(process.cwd(), 'cpp_backend', 'build', 'Release', binName),
      path.join(process.cwd(), 'cpp_backend', binName)
    ];

    let binPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        binPath = p;
        break;
      }
    }

    if (!binPath) {
      console.warn("[WARNING] C++ Inference binary not found. Running in local MOCK mode.");
      return;
    }

    const args = ['--cli'];
    const modelPath = path.join(process.cwd(), 'cpp_backend', 'policy_value_net.onnx');
    if (fs.existsSync(modelPath)) {
      args.push('--model', modelPath);
    }

    const env = { ...process.env };
    if (!isWin) {
      // Linux本番環境用の ONNX Runtime 動的リンクライブラリのロード設定
      const ortLibPath = path.join(process.cwd(), 'cpp_backend', 'third_party', 'onnxruntime', 'lib');
      env.LD_LIBRARY_PATH = `${ortLibPath}:${env.LD_LIBRARY_PATH || ''}`;
    }

    this.child = spawn(binPath, args, { env, cwd: path.join(process.cwd(), 'cpp_backend') });

    this.rl = readline.createInterface({
      input: this.child.stdout,
      terminal: false
    });

    this.rl.on('line', (line) => {
      const req = this.pendingRequests.shift();
      if (!req) return;
      try {
        const json = JSON.parse(line);
        if (json.error) {
          req.reject(new Error(json.error));
        } else {
          req.resolve(json);
        }
      } catch (err: any) {
        req.reject(new Error(`Failed to parse C++ stdout: ${line}. Error: ${err.message}`));
      }
    });

    this.child.stderr.on('data', (data) => {
      console.error(`[C++ Inference Stderr]: ${data.toString()}`);
    });

    this.child.on('close', (code) => {
      console.log(`C++ Inference process closed with code ${code}`);
      while (this.pendingRequests.length > 0) {
        const req = this.pendingRequests.shift();
        req?.reject(new Error("C++ Inference process terminated."));
      }
      this.child = null;
    });
  }

  // モデルの動的ロード切り替え
  async loadModel(modelPath: string): Promise<void> {
    if (!this.child) return;

    return new Promise((resolve, reject) => {
      this.pendingRequests.push({
        resolve: () => resolve(),
        reject: (err) => reject(err)
      });
      // Windowsパスのバックスラッシュをスラッシュに正規化してコマンド送信
      const normalizedPath = modelPath.replace(/\\/g, '/');
      this.child!.stdin.write(`load ${normalizedPath}\n`);
    });
  }

  predict(features: number[]): Promise<{ policy: number[], value: number }> {
    if (!this.child) {
      // ローカル開発環境用のモック推論フォールバック
      const mockPolicy = new Array<number>(160).fill(0.0).map(() => Math.random() * 2.0 - 1.0);
      mockPolicy[16 * 8] = 5.0; // 「しあげる」のインデックス16のロジットを高めにする
      const mockValue = 0.8;
      return Promise.resolve({ policy: mockPolicy, value: mockValue });
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.push({ resolve, reject });
      const inputStr = features.join(' ') + '\n';
      this.child!.stdin.write(inputStr);
    });
  }

  // 明示的なプロセス終了
  close() {
    if (this.child) {
      this.child.stdin.write("exit\n");
      this.child.kill();
    }
  }
}

// MCTS 探索ノード定義
export class MCTSNode {
  state: ForgeState;
  parent: MCTSNode | null;
  action: { actionName: string; targets: number[] } | null;
  children: MCTSNode[] = [];
  
  visitCount = 0;
  totalValue = 0;
  priorProbability = 0; // Policy による行動の事前確率

  constructor(
    state: ForgeState, 
    parent: MCTSNode | null = null, 
    action: { actionName: string; targets: number[] } | null = null, 
    priorProb = 0
  ) {
    this.state = state;
    this.parent = parent;
    this.action = action;
    this.priorProbability = priorProb;
  }

  get meanValue(): number {
    return this.visitCount === 0 ? 0 : this.totalValue / this.visitCount;
  }

  get isExpanded(): boolean {
    return this.children.length > 0;
  }
}

// AlphaZero風 MCTS 探索エンジン
export class MctsSearch {
  private client: InferenceClient;
  private cPuct = 0.8; // 探索度を調整する PUCT 定数

  constructor(client: InferenceClient) {
    this.client = client;
  }

  async search(initialState: ForgeState, numSimulations = 100, useModel = true, itemsList: ItemData[] = []): Promise<any[]> {
    const root = new MCTSNode(cloneForgeState(initialState));
    
    // ルートノードの初期評価・展開
    await this.expandAndEvaluate(root, useModel, itemsList);

    for (let sim = 0; sim < numSimulations; sim++) {
      let node = root;

      // 1. Selection (PUCT 値が最大の子を再帰的に選択)
      while (node.isExpanded) {
        node = this.selectChild(node);
      }

      // 2. Expansion & Evaluation
      let value = 0.0;
      if (!node.state.isDone) {
        value = await this.expandAndEvaluate(node, useModel, itemsList);
      } else {
        value = this.evaluateTerminalState(node.state);
      }

      // 3. Backup (Q値・訪問回数のルートへの伝搬)
      let curr: MCTSNode | null = node;
      while (curr !== null) {
        curr.visitCount++;
        curr.totalValue += value;
        curr = curr.parent;
      }
    }

    // 最終的に最も訪問回数が多いものを推奨アクションとして選択
    const recommendations = root.children.map(child => {
      const q = child.state.result?.quality || '失敗';
      
      const expectedScore = child.visitCount;
      const successRate = child.meanValue;
      const greatSuccessRate = q === '★3' ? 1.0 : 0.0;

      return {
        move: child.action!,
        expectedScore,
        greatSuccessRate,
        successRate
      };
    });

    recommendations.sort((a, b) => b.expectedScore - a.expectedScore);
    return recommendations;
  }

  private selectChild(node: MCTSNode): MCTSNode {
    let bestChild = node.children[0];
    let bestScore = -Infinity;

    const totalVisits = node.visitCount;

    for (const child of node.children) {
      const q = child.meanValue;
      // PUCT (Predictor Upper Confidence Bound) 式
      const u = this.cPuct * child.priorProbability * Math.sqrt(totalVisits) / (1 + child.visitCount);
      const score = q + u;

      if (score > bestScore) {
        bestScore = score;
        bestChild = child;
      }
    }

    return bestChild;
  }

  private async expandAndEvaluate(node: MCTSNode, useModel = true, itemsList: ItemData[] = []): Promise<number> {
    const possibleMoves = getPossibleMovesForSolver(node.state);
    const engine = new ForgeCoreEngine();

    // 簡易物理スコアの計算 (共通)
    const rawScore = evaluateStateScore(node.state);
    const activeCount = node.state.cells.filter(c => c.isActive).length;
    const maxPossible = activeCount * 250; // 最大250点/マスと仮定
    const heuristicVal = Math.min(1.0, Math.max(0.0, (rawScore + 300) / (maxPossible + 300)));

    let value = 0.0;
    const childCandidates: { move: { actionName: string; targets: number[] }; prob: number }[] = [];

    if (useModel) {
      // 1. モデルあり探索 (AlphaZero風)
      const features = extractFeatures(node.state, 3, itemsList);
      const res = await this.client.predict(features);
      const policy = res.policy;
      const modelValue = res.value;

      let totalWeight = 0;
      for (const move of possibleMoves) {
        let skillIdx = skills.findIndex(s => s.name === move.actionName);
        if (move.actionName === 'しあげる') {
          skillIdx = 16;
        }

        const targetIdx = move.targets.length > 0 ? move.targets[0] : 0;
        let logit = -9.0;
        if (skillIdx !== -1 && skillIdx < 20) {
          logit = policy[skillIdx * 8 + targetIdx];
        }

        const prob = Math.exp(logit);
        totalWeight += prob;
        childCandidates.push({ move, prob });
      }

      // 確率の正規化
      for (const candidate of childCandidates) {
        candidate.prob = totalWeight > 0 ? candidate.prob / totalWeight : 1.0 / childCandidates.length;
      }

      const modelVal = (modelValue + 1.0) / 2.0;
      const blendBeta = 0.5;
      value = blendBeta * modelVal + (1.0 - blendBeta) * heuristicVal;
    } else {
      // 2. モデルなしの純粋MCTS (ヒューリスティック評価ベース)
      // 事前確率はすべて均等に割り当てる
      const uniformProb = 1.0 / possibleMoves.length;
      for (const move of possibleMoves) {
        childCandidates.push({ move, prob: uniformProb });
      }

      // 期待値には物理スコアをそのまま使用
      value = heuristicVal;
    }

    // 子ノードの展開
    for (const candidate of childCandidates) {
      const nextState = cloneForgeState(node.state);
      engine.loadState(nextState);
      
      try {
        let testState;
        if (candidate.move.actionName === 'しあげる') {
          testState = engine.finish();
        } else {
          testState = engine.step(candidate.move.actionName, candidate.move.targets);
        }
        node.children.push(new MCTSNode(testState, node, candidate.move, candidate.prob));
      } catch (err) {
        // 無効なアクションは追加しない
      }
    }

    return value;
  }

  private evaluateTerminalState(state: ForgeState): number {
    const q = state.result?.quality || '失敗';
    if (q === '★3') return 1.0;
    if (['★2', '★1', '★0'].includes(q)) return 0.5;
    return 0.0;
  }
}
