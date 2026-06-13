import { 
  getPossibleMoves, 
  applyMove, 
  applyMoveDeterministic, 
  evaluateStateScore, 
  evaluateForgeStatus,
  getHitIndices
} from '../utils/simulatorEngine';
import type { 
  ForgeState, 
  CellRange, 
  Move 
} from '../utils/simulatorEngine';
import type { Skill } from '../data/skills';
import type { DamageTable } from '../data/damageTables';

interface WorkRequest {
  state: ForgeState;
  ranges: CellRange[];
  requiredCriticalLocks: number;
  skills: Skill[];
  damageTable: DamageTable;
}

interface WorkerRecommendation {
  move: Move;
  expectedScore: number;
  greatSuccessRate: number;
  successRate: number;
}

// Web Worker onmessage listener
self.onmessage = (e: MessageEvent) => {
  const { state, ranges, requiredCriticalLocks, skills, damageTable } = e.data as WorkRequest;

  try {
    const possibleMoves = getPossibleMoves(state, skills);

    if (possibleMoves.length === 0) {
      self.postMessage({ type: 'RESULT', recommendations: [] });
      return;
    }

    const recommendations: WorkerRecommendation[] = [];
    const totalMoves = possibleMoves.length;

    possibleMoves.forEach((move, moveIdx) => {
      let totalRolloutScore = 0;
      let greatSuccessCount = 0;
      let successCount = 0;
      const numRollouts = 30; // Number of Monte Carlo rollouts for statistical accuracy

      for (let r = 0; r < numRollouts; r++) {
        // 1. Simulate the first step with randomness
        const hitCells = getHitIndices(move.targetType, move.targetIndex, state.values.length);
        const skill = skills.find(s => s.id === move.skillId);
        
        // Determine critical outcomes
        const critRolls = hitCells.map(() => {
          if (!skill) return false;
          const damageEffect = skill.effects.find(eff => eff.type === 'damage');
          const isNerai = damageEffect?.is_nerai || false;
          const critChance = isNerai ? 0.50 : 0.01;
          return Math.random() < critChance;
        });

        const randomDamageIndex = Math.floor(Math.random() * 7);
        let simState = applyMove(state, move, skills, ranges, randomDamageIndex, critRolls, damageTable);

        // 2. Greedy rollout to completion
        let currentStatus = evaluateForgeStatus(simState, ranges, requiredCriticalLocks);
        let movesLimit = 15; // Safeguard against infinite loops

        while (currentStatus === 'ongoing' && movesLimit > 0) {
          const nextMoves = getPossibleMoves(simState, skills);
          if (nextMoves.length === 0) {
            break;
          }

          // Evaluate next moves deterministically
          let bestNextMove: Move | null = null;
          let bestNextScore = -Infinity;
          let bestNextState: ForgeState | null = null;

          for (const nextMove of nextMoves) {
            const nextSimState = applyMoveDeterministic(simState, nextMove, skills, ranges, damageTable);
            const score = evaluateStateScore(nextSimState, ranges);
            
            // Avoid choices that immediately fail
            let hasExceeded = false;
            for (let i = 0; i < nextSimState.values.length; i++) {
              if (nextSimState.values[i] > ranges[i].max) {
                hasExceeded = true;
                break;
              }
            }

            if (!hasExceeded && score > bestNextScore) {
              bestNextScore = score;
              bestNextMove = nextMove;
              bestNextState = nextSimState;
            }
          }

          if (bestNextState && bestNextMove) {
            simState = bestNextState;
          } else {
            // If all moves lead to failure, just pick the first one to force a conclusion
            const fallbackMove = nextMoves[0];
            simState = applyMoveDeterministic(simState, fallbackMove, skills, ranges, damageTable);
          }

          currentStatus = evaluateForgeStatus(simState, ranges, requiredCriticalLocks);
          movesLimit--;
        }

        // 3. Score the final state of this rollout
        const finalScore = evaluateStateScore(simState, ranges);
        let bonus = 0;

        if (currentStatus === 'great_success') {
          greatSuccessCount++;
          bonus = 500;
        } else if (currentStatus === 'success') {
          successCount++;
          bonus = 150;
        } else if (currentStatus === 'failed') {
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

      // Send progress update
      const progress = Math.round(((moveIdx + 1) / totalMoves) * 100);
      self.postMessage({ type: 'PROGRESS', progress });
    });

    // Sort by expected score descending
    recommendations.sort((a, b) => b.expectedScore - a.expectedScore);

    // Keep top 3
    const top3 = recommendations.slice(0, 3);

    self.postMessage({ type: 'RESULT', recommendations: top3 });

  } catch (error: any) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};
