export interface SkillEffect {
  type: 'damage' | 'temp_change';
  multiplier?: number; // for damage
  target?: 'single' | 'vertical' | 'diagonal' | 'quad'; // target range
  is_nerai?: boolean;  // for critical rate boost (50%)
  value?: number;      // for temp_change
}

export interface Skill {
  id: string;
  name: string;
  cost: number;
  effects: SkillEffect[];
}

export const defaultSkills: Skill[] = [
  { id: 'tataku', name: 'たたく', cost: 5, effects: [{ type: 'damage', multiplier: 1.0, target: 'single' }] },
  { id: 'tekagen_uchi', name: 'てかげん打ち', cost: 10, effects: [{ type: 'damage', multiplier: 0.5, target: 'single' }] },
  { id: 'naname_uchi', name: 'ななめ打ち', cost: 7, effects: [{ type: 'damage', multiplier: 1.0, target: 'diagonal' }] },
  { id: 'joge_uchi', name: '上下打ち', cost: 8, effects: [{ type: 'damage', multiplier: 1.2, target: 'vertical' }] },
  { id: 'yon_ren_uchi', name: '4連打ち', cost: 12, effects: [{ type: 'damage', multiplier: 1.2, target: 'quad' }] },
  { id: 'ni_bai_uchi', name: '2倍打ち', cost: 8, effects: [{ type: 'damage', multiplier: 2.0, target: 'single' }] },
  { id: 'cho_yon_ren_uchi', name: '超4連打ち', cost: 18, effects: [{ type: 'damage', multiplier: 2.0, target: 'quad' }] },
  {
    id: 'neppu_oroshi',
    name: '熱風おろし',
    cost: 6,
    effects: [
      { type: 'damage', multiplier: 2.5, target: 'single' },
      { type: 'temp_change', value: -150 }
    ]
  },
  { id: 'san_bai_uchi', name: '3倍打ち', cost: 11, effects: [{ type: 'damage', multiplier: 3.0, target: 'single' }] },
  { id: 'nerai_uchi', name: 'ねらい打ち', cost: 16, effects: [{ type: 'damage', multiplier: 1.0, target: 'single', is_nerai: true }] },
  { id: 'karyoku_age', name: '火力上げ', cost: 10, effects: [{ type: 'temp_change', value: 300 }] },
  { id: 'hiyashikomi', name: '冷やしこみ', cost: 12, effects: [{ type: 'temp_change', value: -100 }] }
];
