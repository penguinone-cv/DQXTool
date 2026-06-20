import { ForgeCoreEngine } from '../utils/forgeCoreEngine';
import type { ForgeState } from '../utils/forgeCoreEngine';
import { skills } from '../data/masterData';

interface WorkRequest {
  state: ForgeState;
}

interface WorkerRecommendation {
  move: {
    actionName: string;
    targets: number[];
  };
  expectedScore: number;
  greatSuccessRate: number;
  successRate: number;
}

function cloneForgeState(state: ForgeState): ForgeState {
  return {
    temperature: state.temperature,
    focus: state.focus,
    maxFocus: state.maxFocus,
    turn: state.turn,
    materialType: state.materialType,
    cells: state.cells.map(c => ({ ...c })),
    isDone: state.isDone,
    result: state.result ? { ...state.result } : undefined,
    seed: state.seed,
    characterLevel: state.characterLevel
  };
}

// Generate all possible valid moves from the current state
function getPossibleMovesForSolver(state: ForgeState): { actionName: string; targets: number[] }[] {
  const moves: { actionName: string; targets: number[] }[] = [];
  const activeIndices = state.cells.filter(c => c.isActive).map(c => c.index);
  const level = state.characterLevel || 80;

  for (const skill of skills) {
    if (skill.level > level) continue; // Skip unlearned skills
    // Calculate current cost under material rules
    let cost = skill.cost;
    if (state.materialType === '集中変化地金') {
      if (state.temperature % 400 === 0) {
        cost = Math.floor(cost * 0.5);
      } else if (state.temperature % 200 === 0) {
        cost = Math.floor(cost * 1.5);
      }
    }
    
    if (cost > state.focus) continue;

    if (skill.targetPattern === 'single') {
      for (const idx of activeIndices) {
        if (!state.cells[idx].isLocked) {
          moves.push({ actionName: skill.name, targets: [idx] });
        }
      }
    } else if (skill.targetPattern === 'vertical') {
      for (let i = 0; i <= 5; i++) {
        const c1 = state.cells[i];
        const c2 = state.cells[i + 2];
        if (c1?.isActive && c2?.isActive) {
          if (!c1?.isLocked || !c2?.isLocked) {
            moves.push({ actionName: skill.name, targets: [i, i + 2] });
          }
        }
      }
    } else if (skill.targetPattern === 'horizontal') {
      for (let i = 0; i <= 6; i += 2) {
        const c1 = state.cells[i];
        const c2 = state.cells[i + 1];
        if (c1?.isActive && c2?.isActive) {
          if (!c1?.isLocked || !c2?.isLocked) {
            moves.push({ actionName: skill.name, targets: [i, i + 1] });
          }
        }
      }
    } else if (skill.targetPattern === 'diagonal') {
      for (let i = 0; i <= 4; i += 2) {
        const c1 = state.cells[i + 1];
        const c2 = state.cells[i + 2];
        if (c1?.isActive && c2?.isActive) {
          if (!c1?.isLocked || !c2?.isLocked) {
            moves.push({ actionName: skill.name, targets: [i + 1, i + 2] });
          }
        }
      }
    } else if (skill.targetPattern === 'quad') {
      for (let i = 0; i <= 4; i += 2) {
        const indices = [i, i + 1, i + 2, i + 3];
        const activeIdxs = indices.filter(idx => state.cells[idx]?.isActive);
        const anyUnlocked = indices.some(idx => state.cells[idx]?.isActive && !state.cells[idx]?.isLocked);
        if (activeIdxs.length >= 2 && anyUnlocked) {
          moves.push({ actionName: skill.name, targets: indices });
        }
      }
    } else if (skill.targetPattern === 'chaos') {
      moves.push({ actionName: skill.name, targets: [] });
    } else if (skill.targetPattern === 'none') {
      moves.push({ actionName: skill.name, targets: [] });
    }
  }

  // 'しあげる' (Finish) is always a valid move option if the game is not done
  if (!state.isDone) {
    moves.push({ actionName: 'しあげる', targets: [] });
  }

  return moves;
}

// Evaluate status score
function evaluateStateScore(state: ForgeState): number {
  let score = 0;
  for (const cell of state.cells) {
    if (!cell.isActive) continue;

    const inGreen = cell.currentValue >= cell.minGreenValue && cell.currentValue <= cell.maxGreenValue;
    if (inGreen) {
      score += 150;
    }
    if (cell.isLocked) {
      score += 100;
    }

    // Penalize distance from targetValue
    score -= Math.abs(cell.targetValue - cell.currentValue);
  }
  return score;
}

// Web Worker onmessage listener
self.onmessage = (e: MessageEvent) => {
  const { state } = e.data as WorkRequest;

  try {
    const possibleMoves = getPossibleMovesForSolver(state);

    if (possibleMoves.length === 0) {
      self.postMessage({ type: 'RESULT', recommendations: [] });
      return;
    }

    const recommendations: WorkerRecommendation[] = [];
    const totalMoves = possibleMoves.length;
    const simEngine = new ForgeCoreEngine();

    possibleMoves.forEach((move, moveIdx) => {
      let totalRolloutScore = 0;
      let greatSuccessCount = 0;
      let successCount = 0;
      const numRollouts = 30; // 30 rollouts for Monte Carlo statistical average

      for (let r = 0; r < numRollouts; r++) {
        // Clone initial state and load it into simEngine
        const rolloutState = cloneForgeState(state);
        // Set unique random seed for this rollout
        const rolloutSeed = Math.random().toString(36).substring(2);
        rolloutState.seed = rolloutSeed;

        simEngine.loadState(rolloutState);

        // Execute first move
        let currentStatus;
        if (move.actionName === 'しあげる') {
          currentStatus = simEngine.finish();
        } else {
          currentStatus = simEngine.step(move.actionName, move.targets);
        }

        // Greedy rollout to completion
        let movesLimit = 15; // Limit steps to prevent infinite loop
        while (!currentStatus.isDone && currentStatus.focus > 0 && movesLimit > 0) {
          const nextMoves = getPossibleMovesForSolver(currentStatus);
          if (nextMoves.length === 0) break;

          // Greedy 1-step lookahead selection
          let bestNextMove = nextMoves[0];
          let bestNextScore = -Infinity;

          for (const nextMove of nextMoves) {
            const tempState = cloneForgeState(currentStatus);
            const testEngine = new ForgeCoreEngine();
            testEngine.loadState(tempState);
            try {
              let nextState;
              if (nextMove.actionName === 'しあげる') {
                nextState = testEngine.finish();
              } else {
                nextState = testEngine.step(nextMove.actionName, nextMove.targets);
              }
              const score = evaluateStateScore(nextState);
              if (score > bestNextScore) {
                bestNextScore = score;
                bestNextMove = nextMove;
              }
            } catch (err) {
              // Ignore invalid actions
            }
          }

          if (bestNextMove.actionName === 'しあげる') {
            currentStatus = simEngine.finish();
          } else {
            currentStatus = simEngine.step(bestNextMove.actionName, bestNextMove.targets);
          }
          movesLimit--;
        }

        // Finish if not done
        if (!currentStatus.isDone) {
          currentStatus = simEngine.finish();
        }

        const finalScore = evaluateStateScore(currentStatus);
        let bonus = 0;
        const q = currentStatus.result?.quality || '失敗';

        if (q === '★3') {
          greatSuccessCount++;
          successCount++;
          bonus = 500;
        } else if (['★2', '★1', '★0'].includes(q)) {
          successCount++;
          bonus = 150;
        } else if (q === '失敗') {
          bonus = -500;
        }

        totalRolloutScore += (finalScore + bonus);
      }

      const expectedScore = totalRolloutScore / numRollouts;
      const greatSuccessRate = greatSuccessCount / numRollouts;
      const successRate = successCount / numRollouts;

      recommendations.push({
        move,
        expectedScore,
        greatSuccessRate,
        successRate
      });

      // Send progress update back to UI
      const progress = Math.round(((moveIdx + 1) / totalMoves) * 100);
      self.postMessage({ type: 'PROGRESS', progress });
    });

    // Sort by expected score descending
    recommendations.sort((a, b) => b.expectedScore - a.expectedScore);

    // Keep top 3 recommendations
    const top3 = recommendations.slice(0, 3);

    self.postMessage({ type: 'RESULT', recommendations: top3 });

  } catch (error: any) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};
