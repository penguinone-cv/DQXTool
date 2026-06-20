import { items, hammers, skills, levelFocusMap } from '../data/masterData';
import type { ItemData, HammerData } from '../data/masterData';

export interface ForgeCell {
  index: number;
  isActive: boolean;
  currentValue: number;
  targetValue: number;      // 基準値（成功ライン内から初期化時にランダムに選ばれる）
  minGreenValue: number;    // 緑ゲージの最小値
  maxGreenValue: number;    // 緑ゲージの最大値
  isGlowing: boolean;       // 光地金で光っているか
  isLocked: boolean;        // 会心ロック状態か
}

export interface ForgeState {
  temperature: number;
  focus: number;
  maxFocus: number;
  turn: number;
  materialType: string;     // 通常, 戻り地金, 倍半地金, 集中変化地金, 光地金
  cells: ForgeCell[];
  isDone: boolean;
  result?: {
    totalError: number;
    quality: string;        // ★3, ★2, ★1, ★0, 失敗
  };
  seed: string;
  characterLevel?: number;  // 職人レベル
}

export interface AvailableAction {
  name: string;
  cost: number;
  selectableTargetsCount: number; // 選択する必要のあるマス数（0: 盤面全体/温度変化、1: 単発、2: 上下など）
}

export interface IForgeCoreEngine {
  reset(itemName: string, hammerName: string, hammerQuality: number, seed?: string, characterLevel?: number): ForgeState;
  step(actionName: string, targetCellIndices: number[]): ForgeState;
  finish(): ForgeState;
  getCurrentState(): ForgeState;
  getAvailableActions(): AvailableAction[];
}

// Mulberry32 Pseudo-Random Number Generator
export class PRNG {
  private state: number;

  constructor(seed: string) {
    this.state = this.hash(seed);
  }

  private hash(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    }
    return h >>> 0;
  }

  random(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  pick<T>(arr: T[]): T {
    const idx = Math.floor(this.random() * arr.length);
    return arr[idx];
  }
}

export class ForgeCoreEngine implements IForgeCoreEngine {
  private state!: ForgeState;
  private prng!: PRNG;
  private activeItem!: ItemData;
  private activeHammer!: HammerData;
  private hammerQuality!: number;

  reset(itemName: string, hammerName: string, hammerQuality: number, seed?: string, characterLevel?: number): ForgeState {
    const matchedItem = items.find(i => i.name === itemName || i.id === itemName);
    if (!matchedItem) {
      throw new Error(`Item not found: ${itemName}`);
    }
    const matchedHammer = hammers.find(h => h.name === hammerName || h.id === hammerName);
    if (!matchedHammer) {
      throw new Error(`Hammer not found: ${hammerName}`);
    }
    if (hammerQuality < 0 || hammerQuality > 3) {
      throw new Error(`Invalid hammer quality: ${hammerQuality}. Must be 0 to 3.`);
    }

    const actualSeed = seed || Math.random().toString(36).substring(2);
    this.prng = new PRNG(actualSeed);
    this.activeItem = matchedItem;
    this.activeHammer = matchedHammer;
    this.hammerQuality = hammerQuality;

    const actualLevel = characterLevel || 80;
    const baseFocusVal = levelFocusMap[actualLevel] || 207;
    let startingFocus = baseFocusVal + matchedHammer.focusBonus;
    if (matchedHammer.id === 'miracle_hammer') {
      if (this.prng.random() < 0.20) {
        startingFocus += 30;
      }
    }

    const cells: ForgeCell[] = [];
    for (let i = 0; i < 8; i++) {
      const activeIdx = matchedItem.activeIndices.indexOf(i);
      const isActive = activeIdx !== -1;
      if (isActive) {
        const minVal = matchedItem.minGreenValues[activeIdx];
        const maxVal = matchedItem.maxGreenValues[activeIdx];
        const targetVal = this.prng.randomInt(minVal, maxVal);

        cells.push({
          index: i,
          isActive: true,
          currentValue: 0,
          targetValue: targetVal,
          minGreenValue: minVal,
          maxGreenValue: maxVal,
          isGlowing: false,
          isLocked: false
        });
      } else {
        cells.push({
          index: i,
          isActive: false,
          currentValue: 0,
          targetValue: 0,
          minGreenValue: 0,
          maxGreenValue: 0,
          isGlowing: false,
          isLocked: false
        });
      }
    }

    this.state = {
      temperature: 1000,
      focus: startingFocus,
      maxFocus: startingFocus,
      turn: 1,
      materialType: matchedItem.materialType,
      cells,
      isDone: false,
      seed: actualSeed,
      characterLevel: actualLevel
    };

    return this.getCurrentState();
  }

  getCurrentState(): ForgeState {
    // Deep clone state to prevent external mutations
    return {
      temperature: this.state.temperature,
      focus: this.state.focus,
      maxFocus: this.state.maxFocus,
      turn: this.state.turn,
      materialType: this.state.materialType,
      cells: this.state.cells.map(c => ({ ...c })),
      isDone: this.state.isDone,
      result: this.state.result ? { ...this.state.result } : undefined,
      seed: this.state.seed,
      characterLevel: this.state.characterLevel
    };
  }

  loadState(state: ForgeState) {
    const actualLevel = state.characterLevel || 80;
    this.state = {
      temperature: state.temperature,
      focus: state.focus,
      maxFocus: state.maxFocus,
      turn: state.turn,
      materialType: state.materialType,
      cells: state.cells.map(c => ({ ...c })),
      isDone: state.isDone,
      result: state.result ? { ...state.result } : undefined,
      seed: state.seed,
      characterLevel: actualLevel
    };
    this.prng = new PRNG(state.seed);
    
    // Resolve matching item/hammer databases
    const matchedItem = items.find(i => i.materialType === state.materialType);
    this.activeItem = matchedItem || items[0];
    const levelFocus = levelFocusMap[actualLevel] || 207;
    this.activeHammer = hammers.find(h => levelFocus + h.focusBonus === state.maxFocus || levelFocus + h.focusBonus + 30 === state.maxFocus) || hammers[5];
    this.hammerQuality = 3; // Default fallback
  }

  getAvailableActions(): AvailableAction[] {
    const level = this.state.characterLevel || 80;
    return skills
      .filter(s => s.level <= level)
      .map(s => {
      let selectableCount = 1;
      if (s.targetPattern === 'none') {
        selectableCount = 0;
      } else if (s.targetPattern === 'vertical' || s.targetPattern === 'horizontal' || s.targetPattern === 'diagonal') {
        selectableCount = 2;
      } else if (s.targetPattern === 'quad') {
        selectableCount = 4;
      } else if (s.targetPattern === 'chaos') {
        selectableCount = 0;
      }
      return {
        name: s.name,
        cost: this.calculateSkillCost(s.cost),
        selectableTargetsCount: selectableCount
      };
    });
  }

  private calculateSkillCost(baseCost: number): number {
    if (this.state.materialType === '集中変化地金') {
      const temp = this.state.temperature;
      if (temp % 400 === 0) {
        return Math.floor(baseCost * 0.5);
      } else if (temp % 200 === 0) {
        return Math.floor(baseCost * 1.5);
      }
    }
    return baseCost;
  }

  step(actionName: string, targetCellIndices: number[]): ForgeState {
    if (this.state.isDone) {
      throw new Error('Game is already finished.');
    }

    const skill = skills.find(s => s.name === actionName || s.id === actionName);
    if (!skill) {
      throw new Error(`Skill not found: ${actionName}`);
    }
    const level = this.state.characterLevel || 80;
    if (skill.level > level) {
      throw new Error(`Skill not learned at level ${level}: ${actionName}`);
    }

    const currentCost = this.calculateSkillCost(skill.cost);
    if (this.state.focus < currentCost) {
      throw new Error(`Insufficient focus. Required: ${currentCost}, Current: ${this.state.focus}`);
    }

    // Resolve targeted hit cells based on action pattern (supports single-click UI and multi-target API formats)
    let hitIndices: number[] = [];
    if (skill.targetPattern === 'single') {
      if (targetCellIndices.length !== 1) {
        throw new Error('Single target skill requires exactly 1 index');
      }
      hitIndices = [targetCellIndices[0]];
    } else if (skill.targetPattern === 'vertical') {
      if (targetCellIndices.length === 1) {
        const start = targetCellIndices[0];
        hitIndices = [start, start + 2];
      } else if (targetCellIndices.length === 2) {
        hitIndices = [...targetCellIndices];
      } else {
        throw new Error('Vertical target skill requires 1 or 2 indices');
      }
    } else if (skill.targetPattern === 'horizontal') {
      if (targetCellIndices.length === 1) {
        const start = targetCellIndices[0];
        hitIndices = [start, start + 1];
      } else if (targetCellIndices.length === 2) {
        hitIndices = [...targetCellIndices];
      } else {
        throw new Error('Horizontal target skill requires 1 or 2 indices');
      }
    } else if (skill.targetPattern === 'diagonal') {
      if (targetCellIndices.length === 1) {
        const start = targetCellIndices[0];
        hitIndices = [start + 1, start + 2];
      } else if (targetCellIndices.length === 2) {
        hitIndices = [...targetCellIndices];
      } else {
        throw new Error('Diagonal target skill requires 1 or 2 indices');
      }
    } else if (skill.targetPattern === 'quad') {
      if (targetCellIndices.length === 1) {
        const start = targetCellIndices[0];
        hitIndices = [start, start + 1, start + 2, start + 3];
      } else if (targetCellIndices.length === 4) {
        hitIndices = [...targetCellIndices];
      } else {
        throw new Error('Quad target skill requires 1 or 4 indices');
      }
    } else if (skill.targetPattern === 'chaos') {
      // みだれ打ち (Chaos Strike): strikes 4 random active cells
      const activeCells = this.state.cells.filter(c => c.isActive);
      if (activeCells.length === 0) {
        hitIndices = [];
      } else {
        hitIndices = Array.from({ length: 4 }, () => this.prng.pick(activeCells).index);
      }
    } else if (skill.targetPattern === 'none') {
      hitIndices = [];
    }

    // Validate target pattern active cell requirements
    if (skill.targetPattern === 'vertical' || skill.targetPattern === 'horizontal' || skill.targetPattern === 'diagonal') {
      if (hitIndices.length < 2 || !this.state.cells[hitIndices[0]]?.isActive || !this.state.cells[hitIndices[1]]?.isActive) {
        throw new Error(`Target cells for ${skill.name} must both be active cells`);
      }
    } else if (skill.targetPattern === 'quad') {
      const activeCount = hitIndices.filter(idx => this.state.cells[idx]?.isActive).length;
      if (activeCount < 2) {
        throw new Error(`Target area for ${skill.name} must contain at least 2 active cells`);
      }
    }

    // Validate that input target indices are within bounds
    for (const idx of targetCellIndices) {
      if (idx < 0 || idx > 7) {
        throw new Error(`Target index ${idx} out of board bounds`);
      }
    }

    // The primary clicked/selected cell must be active (unless it's a global action with no targets)
    if (targetCellIndices.length > 0) {
      const primaryIdx = targetCellIndices[0];
      if (!this.state.cells[primaryIdx].isActive) {
        throw new Error(`Selected target cell ${primaryIdx} is not active for this item shape`);
      }
    }

    // Filter hit indices to only include active ones (inactive ones are ignored)
    hitIndices = hitIndices.filter(idx => this.state.cells[idx].isActive);

    // Deduct focus
    this.state.focus -= currentCost;

    // Apply hits
    for (const cellIdx of hitIndices) {
      const cell = this.state.cells[cellIdx];
      
      // Locked cells are not immune. Striking a locked cell unlocks it.
      if (cell.isLocked) {
        cell.isLocked = false;
      }

      // Calculate critical rate
      const baseCrit = this.activeHammer.critRates[this.hammerQuality];
      let finalCrit = baseCrit;

      if (skill.isAim) {
        finalCrit += 6 * baseCrit; // 600% added
      }
      if (this.state.materialType === '集中変化地金' && this.state.temperature % 400 !== 0 && this.state.temperature % 200 === 0) {
        finalCrit += 4 * baseCrit; // 400% added
      }
      if (cell.isGlowing) {
        finalCrit += 5 * baseCrit; // Glowing cells add 5x tool base critical rate
      }
      finalCrit = Math.min(1.0, Math.max(0.0, finalCrit));

      // Roll critical
      const isCritical = this.prng.random() < finalCrit;

      // Select random base damage R
      const R = this.prng.pick([12, 13, 14, 15, 16, 17, 18]);

      // Calculate damage under Pattern A or Pattern B rules
      const Kt = 1 - 0.0005 * (1000 - this.state.temperature);
      let multiplier = skill.multiplier;
      if (skill.targetPattern === 'chaos') {
        multiplier = 0.8; // みだれ打ち damage multiplier is 0.8
      }

      // Check if Pattern A (not integer multiples of 0.5)
      // Multipliers: 1.2 (ななめ, 上下, 左右, 上下ねらい), 0.8 (みだれ), 1.0 (4連 - Pattern A according to specs)
      const isPatternA = [1.2, 0.8].includes(multiplier) || (multiplier === 1.0 && skill.targetPattern === 'quad');

      let d = 0;
      if (isPatternA) {
        d = Math.ceil(Math.floor(R * multiplier + 1) * Kt);
      } else {
        d = Math.ceil(Math.ceil(R * multiplier) * Kt);
      }

      // Apply material multiplier rules:
      // 倍半地金 double / half damage
      if (this.state.materialType === '倍半地金') {
        if (this.state.temperature % 400 === 0) {
          d *= 2;
        } else if (this.state.temperature % 200 === 0) {
          d = Math.ceil(d * 0.5);
        }
      }

      // Glowing cell doubles damage
      if (cell.isGlowing) {
        d *= 2;
      }

      if (isCritical) {
        // Calculate max possible damage (with R = 18)
        let maxD = 0;
        if (isPatternA) {
          maxD = Math.ceil(Math.floor(18 * multiplier + 1) * Kt);
        } else {
          maxD = Math.ceil(Math.ceil(18 * multiplier) * Kt);
        }

        // Apply critical hit 2x multiplier
        maxD *= 2;

        if (this.state.materialType === '倍半地金') {
          if (this.state.temperature % 400 === 0) {
            maxD *= 2;
          } else if (this.state.temperature % 200 === 0) {
            maxD = Math.ceil(maxD * 0.5);
          }
        }
        if (cell.isGlowing) {
          maxD *= 2;
        }

        // Critical hit exact target resolution
        if (cell.currentValue < cell.targetValue && cell.currentValue + maxD >= cell.targetValue) {
          cell.currentValue = cell.targetValue;
          cell.isLocked = true;
        } else {
          // Fake critical (damage does not reach the target value)
          cell.currentValue = Math.min(999, cell.currentValue + maxD);
        }
      } else {
        // Normal hit damage accumulation
        cell.currentValue = Math.min(999, cell.currentValue + d);
      }

      // Consume the glow
      cell.isGlowing = false;
    }

    // Temperature changes
    if (skill.id === 'karyoku_age') {
      this.state.temperature += 300;
    } else if (skill.id === 'hiyashikomi') {
      this.state.temperature -= 300;
    } else if (skill.id === 'neppu_oroshi') {
      this.state.temperature -= 150;
    } else {
      this.state.temperature -= 50; // Normal temperature drop
    }
    this.state.temperature = Math.max(50, Math.min(2000, this.state.temperature));

    // Increment turn count
    this.state.turn += 1;

    // Apply turn-end material properties
    const endTemp = this.state.temperature;
    if (endTemp % 200 === 0) {
      if (this.state.materialType === '戻り地金') {
        // Find cell outside the green gauge with the highest currentValue/maxGreenValue ratio
        let targetCell: ForgeCell | null = null;
        let maxRatio = -1;

        for (const cell of this.state.cells) {
          if (!cell.isActive || cell.isLocked) continue;

          // Check if already within green gauge
          const inGreen = cell.currentValue >= cell.minGreenValue && cell.currentValue <= cell.maxGreenValue;
          if (inGreen) continue;

          const ratio = cell.currentValue / cell.maxGreenValue;
          if (ratio > maxRatio) {
            maxRatio = ratio;
            targetCell = cell;
          } else if (ratio === maxRatio && targetCell !== null) {
            // Tie breaking: pick cell with lower index
            if (cell.index < targetCell.index) {
              targetCell = cell;
            }
          }
        }

        if (targetCell !== null) {
          const recAmt = this.prng.randomInt(12, 16);
          targetCell.currentValue = Math.max(0, targetCell.currentValue - recAmt);
        }
      } else if (this.state.materialType === '光地金') {
        // Clear existing glows first
        for (const cell of this.state.cells) {
          cell.isGlowing = false;
        }

        // Select an eligible cell to glow
        const eligibleCells = this.state.cells.filter(c => 
          c.isActive && 
          !c.isLocked && 
          (c.currentValue < c.minGreenValue || c.currentValue > c.maxGreenValue)
        );

        if (eligibleCells.length > 0) {
          const picked = this.prng.pick(eligibleCells);
          picked.isGlowing = true;
        }
      }
    }

    return this.getCurrentState();
  }

  finish(): ForgeState {
    this.state.isDone = true;

    let totalError = 0;
    for (const cell of this.state.cells) {
      if (!cell.isActive) continue;

      let err = 0;
      if (cell.currentValue === cell.targetValue) {
        err = 0;
      } else if (cell.currentValue >= cell.minGreenValue && cell.currentValue <= cell.maxGreenValue) {
        err = Math.min(Math.abs(cell.targetValue - cell.currentValue), 4);
      } else {
        err = Math.max(Math.abs(cell.targetValue - cell.currentValue), 9);
      }
      totalError += err;
    }

    // Determine final quality
    let quality = '失敗';
    if (totalError <= this.activeItem.maxError3) {
      quality = '★3';
    } else if (totalError <= this.activeItem.maxError2) {
      quality = '★2';
    } else if (totalError <= this.activeItem.maxError1) {
      quality = '★1';
    } else if (totalError <= this.activeItem.maxError0) {
      quality = '★0';
    }

    this.state.result = {
      totalError,
      quality
    };

    return this.getCurrentState();
  }
}
