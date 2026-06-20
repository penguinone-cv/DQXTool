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
        if (c1?.isActive || c2?.isActive) {
          const anyUnlocked = (c1?.isActive && !c1?.isLocked) || (c2?.isActive && !c2?.isLocked);
          if (anyUnlocked) {
            moves.push({ actionName: skill.name, targets: [i, i + 2] });
          }
        }
      }
    } else if (skill.targetPattern === 'horizontal') {
      for (let i = 0; i <= 6; i += 2) {
        const c1 = state.cells[i];
        const c2 = state.cells[i + 1];
        if (c1?.isActive || c2?.isActive) {
          const anyUnlocked = (c1?.isActive && !c1?.isLocked) || (c2?.isActive && !c2?.isLocked);
          if (anyUnlocked) {
            moves.push({ actionName: skill.name, targets: [i, i + 1] });
          }
        }
      }
    } else if (skill.targetPattern === 'diagonal') {
      for (let i = 0; i <= 4; i += 2) {
        const c1 = state.cells[i + 1];
        const c2 = state.cells[i + 2];
        if (c1?.isActive || c2?.isActive) {
          const anyUnlocked = (c1?.isActive && !c1?.isLocked) || (c2?.isActive && !c2?.isLocked);
          if (anyUnlocked) {
            moves.push({ actionName: skill.name, targets: [i + 1, i + 2] });
          }
        }
      }
    } else if (skill.targetPattern === 'quad') {
      for (let i = 0; i <= 4; i += 2) {
        const indices = [i, i + 1, i + 2, i + 3];
        const activeIdxs = indices.filter(idx => state.cells[idx]?.isActive);
        const anyUnlocked = indices.some(idx => state.cells[idx]?.isActive && !state.cells[idx]?.isLocked);
        if (activeIdxs.length >= 1 && anyUnlocked) {
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

// Lookahead evaluation for a move (greedy playout up to a specific depth)
function evaluateMoveWithLookahead(state: ForgeState, initialMove: { actionName: string; targets: number[] }, depth: number): number {
  const simEngine = new ForgeCoreEngine();
  const tempState = cloneForgeState(state);
  simEngine.loadState(tempState);

  // Apply initial move
  let currentState;
  try {
    if (initialMove.actionName === 'しあげる') {
      currentState = simEngine.finish();
    } else {
      currentState = simEngine.step(initialMove.actionName, initialMove.targets);
    }
  } catch (err) {
    return -Infinity;
  }

  // Playout remaining steps greedily
  for (let d = 1; d < depth; d++) {
    if (currentState.isDone || currentState.focus <= 0) {
      break;
    }

    const nextMoves = getPossibleMovesForSolver(currentState);
    if (nextMoves.length === 0) {
      break;
    }

    // 1-step lookahead selection
    let bestNextMove = nextMoves[0];
    let bestNextScore = -Infinity;

    for (const nextMove of nextMoves) {
      const stepState = cloneForgeState(currentState);
      const stepEngine = new ForgeCoreEngine();
      stepEngine.loadState(stepState);
      try {
        let testState;
        if (nextMove.actionName === 'しあげる') {
          testState = stepEngine.finish();
        } else {
          testState = stepEngine.step(nextMove.actionName, nextMove.targets);
        }
        const score = evaluateStateScore(testState);
        if (score > bestNextScore) {
          bestNextScore = score;
          bestNextMove = nextMove;
        }
      } catch (err) {
        // Ignore invalid actions
      }
    }

    // Apply best move
    try {
      if (bestNextMove.actionName === 'しあげる') {
        currentState = simEngine.finish();
      } else {
        currentState = simEngine.step(bestNextMove.actionName, bestNextMove.targets);
      }
    } catch (err) {
      break;
    }
  }

  // If the game ended during lookahead, we evaluate the final state score + bonus
  if (currentState.isDone) {
    const finalScore = evaluateStateScore(currentState);
    let bonus = 0;
    const q = currentState.result?.quality || '失敗';
    if (q === '★3') bonus = 500;
    else if (['★2', '★1', '★0'].includes(q)) bonus = 150;
    else if (q === '失敗') bonus = -500;
    return finalScore + bonus;
  }

  return evaluateStateScore(currentState);
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

    const startTime = performance.now();
    const TIME_LIMIT = 8500; // 8.5 seconds time budget to guarantee completion within 10 seconds

    const recommendations: WorkerRecommendation[] = [];
    const totalMoves = possibleMoves.length;
    const simEngine = new ForgeCoreEngine();

    // Initialize stats for each candidate move
    const moveStats = possibleMoves.map(move => ({
      move,
      totalRolloutScore: 0,
      greatSuccessCount: 0,
      successCount: 0,
      rolloutsCompleted: 0
    }));

    // Round-robin rollouts to distribute time budget evenly
    let iteration = 0;
    const MAX_ITERATIONS = 120; // Target maximum rollouts per candidate move
    let timeExceeded = false;

    while (iteration < MAX_ITERATIONS && !timeExceeded) {
      for (let i = 0; i < totalMoves; i++) {
        // Check if we exceeded our time budget
        if (performance.now() - startTime > TIME_LIMIT) {
          timeExceeded = true;
          break;
        }

        const stats = moveStats[i];
        
        // Clone initial state and load it into simEngine
        const rolloutState = cloneForgeState(state);
        const rolloutSeed = Math.random().toString(36).substring(2);
        rolloutState.seed = rolloutSeed;

        simEngine.loadState(rolloutState);

        // Execute first move
        let currentStatus;
        try {
          if (stats.move.actionName === 'しあげる') {
            currentStatus = simEngine.finish();
          } else {
            currentStatus = simEngine.step(stats.move.actionName, stats.move.targets);
          }
        } catch (err) {
          stats.totalRolloutScore += -1000;
          stats.rolloutsCompleted++;
          continue;
        }

        // Greedy playout using 3-step lookahead
        let movesLimit = 15;
        while (!currentStatus.isDone && currentStatus.focus > 0 && movesLimit > 0) {
          const nextMoves = getPossibleMovesForSolver(currentStatus);
          if (nextMoves.length === 0) break;

          // 3-step lookahead selection
          let bestNextMove = nextMoves[0];
          let bestNextScore = -Infinity;

          for (const nextMove of nextMoves) {
            const score = evaluateMoveWithLookahead(currentStatus, nextMove, 3);
            if (score > bestNextScore) {
              bestNextScore = score;
              bestNextMove = nextMove;
            }
          }

          try {
            if (bestNextMove.actionName === 'しあげる') {
              currentStatus = simEngine.finish();
            } else {
              currentStatus = simEngine.step(bestNextMove.actionName, bestNextMove.targets);
            }
          } catch (err) {
            break;
          }
          movesLimit--;
        }

        // Finish if not done
        if (!currentStatus.isDone) {
          try {
            currentStatus = simEngine.finish();
          } catch (err) {
            // Ignore finish errors
          }
        }

        const finalScore = evaluateStateScore(currentStatus);
        let bonus = 0;
        const q = currentStatus.result?.quality || '失敗';

        if (q === '★3') {
          stats.greatSuccessCount++;
          stats.successCount++;
          bonus = 500;
        } else if (['★2', '★1', '★0'].includes(q)) {
          stats.successCount++;
          bonus = 150;
        } else if (q === '失敗') {
          bonus = -500;
        }

        stats.totalRolloutScore += (finalScore + bonus);
        stats.rolloutsCompleted++;
      }

      iteration++;

      // Send a smooth progress update back to the UI based on time and completion
      const elapsed = performance.now() - startTime;
      const progress = Math.min(99, Math.round(Math.max((iteration / MAX_ITERATIONS) * 100, (elapsed / TIME_LIMIT) * 100)));
      self.postMessage({ type: 'PROGRESS', progress });
    }

    // Compile results
    moveStats.forEach(stats => {
      const completed = stats.rolloutsCompleted || 1;
      const expectedScore = stats.totalRolloutScore / completed;
      const greatSuccessRate = stats.greatSuccessCount / completed;
      const successRate = stats.successCount / completed;

      recommendations.push({
        move: stats.move,
        expectedScore,
        greatSuccessRate,
        successRate
      });
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
