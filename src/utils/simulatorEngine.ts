import { getDamageArrayForTemp } from '../data/damageTables';
import type { DamageTable } from '../data/damageTables';
import type { Skill } from '../data/skills';

export interface ForgeState {
  values: number[];       // current value of each cell
  locked: boolean[];      // critical lock state of each cell
  focus: number;          // remaining concentration
  temp: number;           // current temperature in °C
}

export interface CellRange {
  min: number;
  max: number;
}

export interface Move {
  skillId: string;
  targetType: 'single' | 'vertical' | 'diagonal' | 'quad' | 'none';
  targetIndex: number; // grid index or column index depending on targetType
}

// Check if a state is failed (any cell value has exceeded max success range)
export function isFailedState(state: ForgeState, ranges: CellRange[]): boolean {
  const len = Math.min(state.values.length, ranges.length);
  for (let i = 0; i < len; i++) {
    if (state.values[i] > ranges[i].max) {
      return true; // Exceeded limit, failed!
    }
  }
  return false;
}

// Check if all cells are within success ranges
export function isSuccessState(state: ForgeState, ranges: CellRange[]): boolean {
  const len = Math.min(state.values.length, ranges.length);
  for (let i = 0; i < len; i++) {
    const val = state.values[i];
    if (val < ranges[i].min || val > ranges[i].max) {
      return false;
    }
  }
  return true;
}

// Count how many cells are critical locked
export function getCriticalLockCount(state: ForgeState): number {
  return state.locked.filter(Boolean).length;
}

// Evaluate status: 'great_success' | 'success' | 'failed' | 'ongoing'
export function evaluateForgeStatus(
  state: ForgeState,
  ranges: CellRange[],
  requiredCriticalLocks: number
): 'great_success' | 'success' | 'failed' | 'ongoing' {
  if (isFailedState(state, ranges)) {
    return 'failed';
  }

  // If focus runs out, we must stop and determine final result
  const isFinished = state.focus <= 0;
  if (isFinished) {
    if (isSuccessState(state, ranges) && getCriticalLockCount(state) >= requiredCriticalLocks) {
      return 'great_success';
    }
    if (isSuccessState(state, ranges)) {
      return 'success';
    }
    return 'failed'; // If focus is 0 and not all cells are in success zone, it's failed/not high quality
  }

  // If all cells are locked, it is effectively finished and successful
  if (state.locked.every(Boolean)) {
    if (isSuccessState(state, ranges) && getCriticalLockCount(state) >= requiredCriticalLocks) {
      return 'great_success';
    }
    if (isSuccessState(state, ranges)) {
      return 'success';
    }
  }

  return 'ongoing';
}

// Evaluation score function for search algorithm
export function evaluateStateScore(state: ForgeState, ranges: CellRange[]): number {
  let successCellsCount = 0;
  let criticalLockCount = 0;
  let devOffsetSum = 0;

  const len = Math.min(state.values.length, ranges.length);
  for (let i = 0; i < len; i++) {
    const val = state.values[i];
    const r = ranges[i];
    const center = (r.min + r.max) / 2;

    if (val >= r.min && val <= r.max) {
      successCellsCount++;
    }
    if (state.locked[i]) {
      criticalLockCount++;
    }

    // Penalize distance from success zone center
    devOffsetSum += Math.abs(val - center);
  }

  // Adjust weights:
  // (successCellsCount * 100) + (criticalLockCount * 50) - (devOffsetSum)
  return (successCellsCount * 100) + (criticalLockCount * 50) - devOffsetSum;
}

// Translate grid target to specific hit cell indices (always 2 columns)
export function getHitIndices(
  targetType: 'single' | 'vertical' | 'diagonal' | 'quad' | 'none',
  targetIndex: number,
  _boardSize: number
): number[] {
  if (targetType === 'single') {
    return [targetIndex];
  }
  if (targetType === 'vertical') {
    // targetIndex is the top cell of the vertical pair
    return [targetIndex, targetIndex + 2];
  }
  if (targetType === 'diagonal') {
    // targetIndex is the top-left cell of the 2x2 subgrid
    return [targetIndex + 1, targetIndex + 2];
  }
  if (targetType === 'quad') {
    // targetIndex is the top-left cell of the 2x2 subgrid
    return [targetIndex, targetIndex + 1, targetIndex + 2, targetIndex + 3];
  }
  return [];
}

// Generate all possible valid moves from a given state (2-column layout)
export function getPossibleMoves(state: ForgeState, skills: Skill[]): Move[] {
  const moves: Move[] = [];
  const boardSize = state.values.length;

  for (const skill of skills) {
    // Exclude if not enough focus
    if (skill.cost > state.focus) {
      continue;
    }

    // Find target type
    const damageEffect = skill.effects.find(e => e.type === 'damage');
    
    if (!damageEffect) {
      // Global effects (e.g. karyoku_age, hiyashikomi)
      moves.push({ skillId: skill.id, targetType: 'none', targetIndex: 0 });
    } else {
      const targetType = damageEffect.target || 'single';
      
      if (targetType === 'single') {
        // Any cell that is not locked
        for (let i = 0; i < boardSize; i++) {
          if (!state.locked[i]) {
            moves.push({ skillId: skill.id, targetType: 'single', targetIndex: i });
          }
        }
      } else if (targetType === 'vertical') {
        // Can start at any cell except the bottom row (which is indices boardSize-2 and boardSize-1)
        for (let i = 0; i < boardSize - 2; i++) {
          const locked1 = state.locked[i];
          const locked2 = state.locked[i + 2];
          if (!locked1 || !locked2) {
            moves.push({ skillId: skill.id, targetType: 'vertical', targetIndex: i });
          }
        }
      } else if (targetType === 'diagonal' || targetType === 'quad') {
        // Can start at any even index that has a 2x2 space below it (even indices < boardSize - 2)
        for (let i = 0; i < boardSize - 2; i += 2) {
          const cells = getHitIndices(targetType, i, boardSize);
          const anyUnlocked = cells.some(idx => !state.locked[idx]);
          if (anyUnlocked) {
            moves.push({ skillId: skill.id, targetType, targetIndex: i });
          }
        }
      }
    }
  }

  return moves;
}

function getDistanceToRange(val: number, min: number, max: number): number {
  if (val < min) return min - val;
  if (val > max) return val - max;
  return 0;
}

// Apply a single state transition given randomized choices (damageIndex: 0-6, critical rolls per hit cell)
// This is used for simulation/Monte Carlo rollouts
export function applyMove(
  state: ForgeState,
  move: Move,
  skills: Skill[],
  ranges: CellRange[],
  damageIndex: number, // 0 to 6 index representing which row of damage tables to select
  criticalRolls: boolean[], // true if critical hit triggered for index-matched target cell
  damageTable: DamageTable
): ForgeState {
  const skill = skills.find(s => s.id === move.skillId);
  if (!skill) return state;

  // Clone state
  const nextState: ForgeState = {
    values: [...state.values],
    locked: [...state.locked],
    focus: state.focus - skill.cost,
    temp: state.temp
  };

  const damageArray = getDamageArrayForTemp(state.temp, damageTable);
  const baseDamage = damageArray[damageIndex];

  // Process effects in order
  for (const effect of skill.effects) {
    if (effect.type === 'temp_change' && effect.value !== undefined) {
      nextState.temp = Math.max(50, Math.min(2000, nextState.temp + effect.value));
    } else if (effect.type === 'damage' && effect.multiplier !== undefined && effect.target) {
      const hitIndices = getHitIndices(move.targetType, move.targetIndex, state.values.length);
      
      hitIndices.forEach((cellIdx, i) => {
        // Skip if already locked
        if (nextState.locked[cellIdx]) {
          return;
        }

        const isCrit = criticalRolls[i];
        const minVal = Number(ranges[cellIdx]?.min) || 0;
        const maxVal = Number(ranges[cellIdx]?.max) || 0;
        const currentVal = Number(nextState.values[cellIdx]) || 0;

        if (isCrit) {
          // Critical hit: select the damage value from the predicted damage options (possibleDamages)
          // that gets the closest to the success range (minimizes distance).
          const multiplier = effect.multiplier ?? 1.0;
          const possibleDamages = damageArray.map(base => Math.round(base * multiplier));
          
          const distances = possibleDamages.map(d => getDistanceToRange(currentVal + d, minVal, maxVal));
          const minDistance = Math.min(...distances);
          
          const candidates: number[] = [];
          distances.forEach((dist, idx) => {
            if (dist === minDistance) {
              candidates.push(possibleDamages[idx]);
            }
          });
          
          const chosenDamage = candidates[Math.floor(Math.random() * candidates.length)];
          const newTargetVal = Math.min(999, currentVal + chosenDamage);
          
          nextState.values[cellIdx] = newTargetVal;
          // Locks if and only if it lands inside the success range
          if (newTargetVal >= minVal && newTargetVal <= maxVal) {
            nextState.locked[cellIdx] = true;
          }
        } else {
          // Normal hit
          const damage = Math.round(baseDamage * (effect.multiplier ?? 1.0));
          nextState.values[cellIdx] = Math.min(999, currentVal + damage);
        }
      });
    }
  }

  // Turn end temp drop
  nextState.temp = Math.max(50, Math.min(2000, nextState.temp - 50));

  return nextState;
}

// Apply move deterministically using the AVERAGE damage (index 3 of 7 is the median/middle value, which is close to average)
// Critical rolls are set to false unless critical rate is 100% (or we use a probability threshold)
// This is used for fast lookahead search
export function applyMoveDeterministic(
  state: ForgeState,
  move: Move,
  skills: Skill[],
  _ranges: CellRange[],
  damageTable: DamageTable
): ForgeState {
  const skill = skills.find(s => s.id === move.skillId);
  if (!skill) return state;

  // Clone state
  const nextState: ForgeState = {
    values: [...state.values],
    locked: [...state.locked],
    focus: state.focus - skill.cost,
    temp: state.temp
  };

  const damageArray = getDamageArrayForTemp(state.temp, damageTable);
  
  // Calculate average damage from the 7 entries
  const sum = damageArray.reduce((a, b) => a + b, 0);
  const avgDamage = sum / 7;

  // Process effects in order
  for (const effect of skill.effects) {
    if (effect.type === 'temp_change' && effect.value !== undefined) {
      nextState.temp = Math.max(50, Math.min(2000, nextState.temp + effect.value));
    } else if (effect.type === 'damage' && effect.multiplier !== undefined && effect.target) {
      const hitIndices = getHitIndices(move.targetType, move.targetIndex, state.values.length);
      
      hitIndices.forEach((cellIdx) => {
        if (nextState.locked[cellIdx]) {
          return;
        }

        // Apply average damage directly
        const damage = Math.round(avgDamage * (effect.multiplier ?? 1.0));
        nextState.values[cellIdx] = Math.min(999, nextState.values[cellIdx] + damage);

        // Note: deterministic path doesn't lock criticals unless it is critical already,
        // which helps us keep a fast check. We could estimate critical lock probabilities by scoring.
      });
    }
  }

  // Turn end temp drop
  nextState.temp = Math.max(50, Math.min(2000, nextState.temp - 50));

  return nextState;
}
