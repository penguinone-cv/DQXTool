import { ForgeCoreEngine } from '../utils/forgeCoreEngine';
import { ModelSolver } from '../utils/solver';
import type { ForgeState } from '../utils/forgeCoreEngine';
import { getPossibleMovesForSolver } from '../utils/solverUtils';

import { loadAndJoinItems } from '../utils/itemLoader';

function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`PASS: ${message}`);
}

async function runSolverTests() {
  console.log('--- Starting ModelSolver TDD Unit Tests ---');

  // 新機能: itemLoaderによるCSV正規化結合のテスト
  console.log('[Test] ItemLoader and normalized categories JOIN');
  const items = await loadAndJoinItems();
  assertTrue(items.length > 0, 'Loaded items should not be empty');
  const firstItem = items[0];
  assertTrue(!!firstItem.id, 'Item should have an ID');
  assertTrue(!!firstItem.category, 'Item should have a category name mapped');
  assertTrue(firstItem.activeIndices.length > 0, 'Item should have inherited activeIndices from category');
  assertTrue(firstItem.maxError3 !== undefined, 'Item should have inherited maxError3 from category');


  const engine = new ForgeCoreEngine();
  const state: ForgeState = engine.reset('てつのつるぎ', '鉄の鍛冶ハンマー', 3, 'tddseed123', undefined, items);

  // Solverのインスタンス化テスト
  console.log('[Test] Solver Instantiation');
  const solver = new ModelSolver('http://localhost:3001'); // ExpressサーバーのAPIを使用する想定
  assertTrue(solver instanceof ModelSolver, 'solver should be an instance of ModelSolver');

  // 推奨手の取得テスト
  console.log('[Test] Solver Recommendation Output');
  const recommendations = await solver.recommend(state);

  // 検証1: トップ3の推奨手が返ってくること (空でなく、最大3件)
  assertTrue(recommendations.length > 0, 'Recommendations should not be empty');
  assertTrue(recommendations.length <= 3, 'Recommendations should contain at most 3 items');

  // 検証2: 最良推奨手の形式チェック
  const bestRec = recommendations[0];
  assertTrue(!!bestRec.move, 'Best recommendation should have a move object');
  assertTrue(typeof bestRec.move.actionName === 'string', 'move.actionName should be a string');
  assertTrue(Array.isArray(bestRec.move.targets), 'move.targets should be an array');
  assertTrue(typeof bestRec.expectedScore === 'number', 'expectedScore should be a number');
  assertTrue(typeof bestRec.greatSuccessRate === 'number', 'greatSuccessRate should be a number');
  assertTrue(typeof bestRec.successRate === 'number', 'successRate should be a number');

  // 検証3: 推奨されたアクションが有効手リストに含まれているか
  const possibleMoves = getPossibleMovesForSolver(state);
  const possibleActionNames = Array.from(new Set(possibleMoves.map(m => m.actionName)));
  assertTrue(
    possibleActionNames.includes(bestRec.move.actionName),
    `Recommended action "${bestRec.move.actionName}" should be one of the available actions: ${possibleActionNames.join(', ')}`
  );

  console.log('--- All ModelSolver TDD Tests Passed! ---');
}

runSolverTests().catch(e => {
  console.error('[TDD Test Failed Expectedly]:', e.message);
  process.exit(1);
});
