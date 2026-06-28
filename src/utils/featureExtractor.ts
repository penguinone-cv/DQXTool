import type { ForgeState } from './forgeCoreEngine';
import { hammers, levelFocusMap, items } from '../data/masterData';
import type { ItemData } from '../data/masterData';

// stateからハンマーの種類と品質を推定するヘルパー
export function estimateHammerInfo(state: ForgeState): { hammerId: string; hammerQuality: number } {
  const level = state.characterLevel || 80;
  const baseFocus = levelFocusMap[level] || 207;
  const focusDiff = state.maxFocus - baseFocus;

  let bestHammerId = 'iron_hammer';
  let minDiff = Infinity;

  for (const h of hammers) {
    // 奇跡のハンマーの場合は +30 される可能性（シミュレータ独自の確率発動）を考慮
    if (h.id === 'miracle_hammer') {
      const diff1 = Math.abs(focusDiff - h.focusBonus);
      const diff2 = Math.abs(focusDiff - (h.focusBonus + 30));
      const currentMin = Math.min(diff1, diff2);
      if (currentMin < minDiff) {
        minDiff = currentMin;
        bestHammerId = h.id;
      }
    } else {
      const diff = Math.abs(focusDiff - h.focusBonus);
      if (diff < minDiff) {
        minDiff = diff;
        bestHammerId = h.id;
      }
    }
  }

  // 品質はデフォルトで3(★3)とする
  return { hammerId: bestHammerId, hammerQuality: 3 };
}

// stateからアイテムデータを推定する逆引き関数 (緑ゲージ値も照合して一意特定)
export function estimateItem(state: ForgeState): ItemData | null {
  const activeCells = state.cells.filter(c => c.isActive);
  
  for (const item of items) {
    if (item.materialType !== state.materialType) continue;
    if (item.activeIndices.length !== activeCells.length) continue;
    
    // 各活性セルのインデックスおよび緑ゲージの最小・最大値が一致するかチェック
    let isMatch = true;
    for (let i = 0; i < item.activeIndices.length; i++) {
      const idx = item.activeIndices[i];
      const stateCell = state.cells[idx];
      
      if (!stateCell || !stateCell.isActive) {
        isMatch = false;
        break;
      }
      
      if (stateCell.minGreenValue !== item.minGreenValues[i] ||
          stateCell.maxGreenValue !== item.maxGreenValues[i]) {
        isMatch = false;
        break;
      }
    }
    
    if (isMatch) return item;
  }
  
  // 完全一致が無い場合のフォールバック（地金タイプが一致する最初のアイテム）
  return items.find(item => item.materialType === state.materialType) || null;
}

// 74次元特徴量ベクトルの抽出
export function extractFeatures(state: ForgeState, hammerQuality: number = 3): number[] {
  const features = new Array<number>(74).fill(0.0);

  // 1. 盤面セル特徴量 (0 〜 55: 計 56次元)
  for (let i = 0; i < 8; i++) {
    const cell = state.cells[i];
    const offset = i * 7;

    if (cell && cell.isActive) {
      features[offset + 0] = cell.targetValue === 0 ? 0.0 : cell.currentValue / cell.targetValue;
      features[offset + 1] = cell.targetValue / 450.0;
      features[offset + 2] = cell.minGreenValue / 450.0;
      features[offset + 3] = cell.maxGreenValue / 450.0;
      features[offset + 4] = 1.0;
      features[offset + 5] = cell.isGlowing ? 1.0 : 0.0;
      features[offset + 6] = cell.isLocked ? 1.0 : 0.0;
    } else {
      // 非活性セルの場合は offset + 4 (isActive) を含むすべてが 0.0
      features[offset + 4] = 0.0;
    }
  }

  // 2. グローバル特徴量 (56 〜 73: 計 18次元)
  features[56] = state.temperature / 2000.0;
  features[57] = state.focus / 500.0;
  features[58] = state.maxFocus / 500.0;
  features[59] = state.turn / 30.0;
  
  const charLevel = state.characterLevel || 80;
  features[60] = charLevel / 80.0;
  features[61] = hammerQuality / 3.0;

  // アイテム情報からの許容誤差の取得
  const matchedItem = estimateItem(state);
  const maxError3 = matchedItem ? matchedItem.maxError3 : 2;
  const maxError2 = matchedItem ? matchedItem.maxError2 : 8;
  const maxError1 = matchedItem ? matchedItem.maxError1 : 13;
  const maxError0 = matchedItem ? matchedItem.maxError0 : 23;

  features[62] = maxError3 / 20.0;
  features[63] = maxError2 / 20.0;
  features[64] = maxError1 / 20.0;
  features[65] = maxError0 / 20.0;

  // ハンマーの種類フラグ (66: 奇跡, 67: 光, 68: 通常)
  const { hammerId } = estimateHammerInfo(state);
  features[66] = hammerId === 'miracle_hammer' ? 1.0 : 0.0;
  features[67] = hammerId === 'light_hammer' ? 1.0 : 0.0;
  features[68] = (hammerId !== 'miracle_hammer' && hammerId !== 'light_hammer') ? 1.0 : 0.0;

  // 地金タイプフラグ (69: 通常, 70: 戻り, 71: 倍半, 72: 集中変化, 73: 光)
  const mType = state.materialType;
  features[69] = mType === '通常' ? 1.0 : 0.0;
  features[70] = mType === '戻り地金' ? 1.0 : 0.0;
  features[71] = mType === '倍半地金' ? 1.0 : 0.0;
  features[72] = mType === '集中変化地金' ? 1.0 : 0.0;
  features[73] = mType === '光地金' ? 1.0 : 0.0;

  return features;
}
