import type { ForgeState } from './forgeCoreEngine';
import { skills } from '../data/masterData';

export function cloneForgeState(state: ForgeState): ForgeState {
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

// 状態から実行可能なすべてのアクションとターゲットの組み合わせを生成する
export function getPossibleMovesForSolver(state: ForgeState): { actionName: string; targets: number[] }[] {
  const moves: { actionName: string; targets: number[] }[] = [];
  const activeIndices = state.cells.filter(c => c.isActive).map(c => c.index);
  const level = state.characterLevel || 80;

  for (const skill of skills) {
    if (skill.level > level) continue; // 未習得のスキルはスキップ
    
    // 地金ルールによる消費集中力の計算
    let cost = skill.cost;
    if (state.materialType === '集中変化地金') {
      if (state.temperature % 400 === 0) {
        cost = Math.floor(cost * 0.5);
      } else if (state.temperature % 200 === 0) {
        cost = Math.floor(cost * 1.5);
      }
    }
    
    if (cost > state.focus) continue; // 集中力不足

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

  // 終了していなければ「しあげる」は常に選択肢に入る
  if (!state.isDone) {
    moves.push({ actionName: 'しあげる', targets: [] });
  }

  return moves;
}

// 局面の評価スコア
export function evaluateStateScore(state: ForgeState): number {
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

    // 目標値からのズレに対するペナルティ
    score -= Math.abs(cell.targetValue - cell.currentValue);
  }
  return score;
}
