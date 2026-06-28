export interface ItemData {
  id: string;
  name: string;
  category: string;
  materialType: string;
  activeIndices: number[];
  minGreenValues: number[];
  maxGreenValues: number[];
  maxError3: number;
  maxError2: number;
  maxError1: number;
  maxError0: number;
}

export interface CategoryData {
  id: string;
  name: string;
  activeIndices: number[];
  errors: [number, number, number, number];
}

export interface HammerData {
  id: string;
  name: string;
  focusBonus: number;
  critRates: [number, number, number, number]; // ★0, ★1, ★2, ★3
}

export interface SkillData {
  id: string;
  name: string;
  level: number;
  cost: number;
  multiplier: number;
  targetPattern: 'single' | 'vertical' | 'horizontal' | 'diagonal' | 'quad' | 'chaos' | 'none';
  isAim: boolean;
}

export const categories: CategoryData[] = [
  { id: 'onehanded_sword', name: '片手剣', activeIndices: [0, 2, 4], errors: [2, 8, 13, 23] },
  { id: 'twohanded_sword', name: '両手剣', activeIndices: [0, 1, 2, 3, 4, 5, 6, 7], errors: [10, 18, 33, 49] },
  { id: 'dagger', name: '短剣', activeIndices: [0, 2], errors: [0, 4, 9, 17] },
  { id: 'spear', name: 'ヤリ', activeIndices: [0, 2, 4, 6], errors: [4, 10, 17, 29] },
  { id: 'axe', name: 'オノ', activeIndices: [0, 1, 2, 3, 4, 6], errors: [7, 14, 25, 39] },
  { id: 'claw', name: 'ツメ', activeIndices: [0, 1, 2, 3], errors: [3, 9, 17, 29] },
  { id: 'whip', name: 'ムチ', activeIndices: [0, 1, 2, 3, 4, 5, 6], errors: [9, 16, 29, 44] },
  { id: 'hammer', name: 'ハンマー', activeIndices: [0, 1, 2, 3, 4, 5], errors: [7, 14, 25, 39] },
  { id: 'boomerang', name: 'ブーメラン', activeIndices: [0, 1, 3, 4, 5], errors: [6, 13, 23, 36] },
  { id: 'scythe', name: '鎌', activeIndices: [0, 1, 2, 4, 6], errors: [5, 13, 21, 33] },
  { id: 'shield', name: '盾', activeIndices: [0, 1, 2, 3], errors: [3, 9, 17, 29] },
  { id: 'head', name: 'あたま', activeIndices: [0, 1, 2, 3], errors: [3, 9, 17, 29] },
  { id: 'body_up', name: 'からだ上', activeIndices: [0, 1, 2, 3, 4, 5], errors: [7, 14, 25, 39] },
  { id: 'body_down', name: 'からだ下', activeIndices: [0, 1, 2, 3, 4, 5, 6, 7], errors: [10, 18, 33, 49] },
  { id: 'arm', name: 'うで', activeIndices: [0, 2, 4], errors: [2, 8, 13, 23] },
  { id: 'foot', name: 'あし', activeIndices: [1, 3, 4, 5], errors: [4, 10, 17, 29] },
  { id: 'smith_hammer', name: '鍛冶ハンマー', activeIndices: [0, 1, 2, 3, 4], errors: [5, 13, 21, 33] },
  { id: 'wood_knife', name: '木工刀', activeIndices: [0, 2, 4], errors: [2, 8, 13, 23] },
  { id: 'sewing_needle', name: '裁縫針', activeIndices: [0, 2], errors: [0, 4, 9, 17] },
  { id: 'frying_pan', name: 'フライパン', activeIndices: [0, 1, 2, 3, 4, 5, 6], errors: [9, 16, 29, 44] },
  { id: 'lamp', name: 'ランプ', activeIndices: [0, 1, 2, 3], errors: [3, 9, 17, 29] },
  { id: 'tsubo', name: 'ツボ', activeIndices: [0, 1, 2, 3, 4, 5], errors: [7, 14, 25, 39] },
  { id: 'lure', name: 'ルアー', activeIndices: [0, 1, 2], errors: [2, 8, 13, 23] },
  { id: 'material', name: '素材', activeIndices: [0, 1, 2, 3, 4, 5], errors: [7, 14, 24, 27] },
  { id: 'other', name: 'その他', activeIndices: [0, 1, 2, 3, 4, 5, 6, 7], errors: [10, 18, 33, 49] }
];

export const hammers: HammerData[] = [
  { id: '10073', name: '銅の鍛冶ハンマー', focusBonus: 0, critRates: [0.010, 0.011, 0.012, 0.020] },
  { id: '10074', name: '鉄の鍛冶ハンマー', focusBonus: 10, critRates: [0.015, 0.016, 0.017, 0.025] },
  { id: '10075', name: '銀の鍛冶ハンマー', focusBonus: 15, critRates: [0.020, 0.021, 0.022, 0.030] },
  { id: '10076', name: 'プラチナ鍛冶ハンマー', focusBonus: 25, critRates: [0.025, 0.026, 0.027, 0.035] },
  { id: '10077', name: '超鍛冶ハンマー', focusBonus: 35, critRates: [0.030, 0.031, 0.032, 0.040] },
  { id: '10078', name: '奇跡の鍛冶ハンマー', focusBonus: 40, critRates: [0.033, 0.034, 0.035, 0.043] },
  { id: '10079', name: '光の鍛冶ハンマー', focusBonus: 45, critRates: [0.036, 0.037, 0.038, 0.046] }
];

export const skills: SkillData[] = [
  { id: '10080', name: 'たたく', level: 1, cost: 5, multiplier: 1, targetPattern: 'single', isAim: false },
  { id: '10081', name: 'てかげん打ち', level: 3, cost: 10, multiplier: 0.5, targetPattern: 'single', isAim: false },
  { id: '10082', name: '2倍打ち', level: 5, cost: 8, multiplier: 2, targetPattern: 'single', isAim: false },
  { id: '10083', name: '3倍打ち', level: 16, cost: 11, multiplier: 3, targetPattern: 'single', isAim: false },
  { id: '10084', name: 'ねらい打ち', level: 23, cost: 16, multiplier: 1, targetPattern: 'single', isAim: true },
  { id: '10085', name: '弱ねらい打ち', level: 75, cost: 20, multiplier: 0.5, targetPattern: 'single', isAim: true },
  { id: '10086', name: '熱風おろし', level: 47, cost: 6, multiplier: 2.5, targetPattern: 'single', isAim: false },
  { id: '10087', name: 'ななめ打ち', level: 38, cost: 7, multiplier: 1.2, targetPattern: 'diagonal', isAim: false },
  { id: '10088', name: '上下打ち', level: 2, cost: 8, multiplier: 1.2, targetPattern: 'vertical', isAim: false },
  { id: '10089', name: '左右打ち', level: 80, cost: 8, multiplier: 1.2, targetPattern: 'horizontal', isAim: false },
  { id: '10090', name: '4連打ち', level: 11, cost: 12, multiplier: 1, targetPattern: 'quad', isAim: false },
  { id: '10091', name: 'みだれ打ち', level: 13, cost: 7, multiplier: 0.8, targetPattern: 'chaos', isAim: false },
  { id: '10092', name: '超4連打ち', level: 27, cost: 18, multiplier: 2, targetPattern: 'quad', isAim: false },
  { id: '10093', name: '上下ねらい打ち', level: 52, cost: 25, multiplier: 1.2, targetPattern: 'vertical', isAim: true },
  { id: '10094', name: '火力上げ', level: 7, cost: 10, multiplier: 0, targetPattern: 'none', isAim: false },
  { id: '10095', name: '冷やし込み', level: 33, cost: 12, multiplier: 0, targetPattern: 'none', isAim: false }
];

export const levelFocusMap: Record<number, number> = {
  1: 50, 2: 52, 3: 53, 4: 56, 5: 57, 6: 60, 7: 61, 8: 64, 9: 67, 10: 67,
  11: 70, 12: 73, 13: 73, 14: 76, 15: 79, 16: 79, 17: 82, 18: 84, 19: 87, 20: 87,
  21: 90, 22: 93, 23: 93, 24: 96, 25: 98, 26: 101, 27: 101, 28: 104, 29: 109, 30: 109,
  31: 112, 32: 113, 33: 113, 34: 115, 35: 119, 36: 122, 37: 123, 38: 123, 39: 125, 40: 129,
  41: 132, 42: 134, 43: 137, 44: 139, 45: 139, 46: 142, 47: 142, 48: 144, 49: 147, 50: 149,
  51: 152, 52: 152, 53: 154, 54: 157, 55: 159, 56: 162, 57: 162, 58: 164, 59: 167, 60: 169,
  61: 171, 62: 171, 63: 173, 64: 175, 65: 177, 66: 180, 67: 182, 68: 184, 69: 186, 70: 188,
  71: 189, 72: 191, 73: 193, 74: 195, 75: 197, 76: 199, 77: 201, 78: 203, 79: 205, 80: 207
};
