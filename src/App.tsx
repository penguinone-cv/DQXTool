import { useState, useEffect, useRef } from 'react';
import { defaultTemperatureDamageTables } from './data/damageTables';
import type { DamageTable } from './data/damageTables';
import { defaultSkills } from './data/skills';
import type { Skill } from './data/skills';
import {
  evaluateForgeStatus,
  applyMove,
  getHitIndices
} from './utils/simulatorEngine';
import type { ForgeState, Move } from './utils/simulatorEngine';

interface FloatingDamage {
  id: string;
  cellIndex: number;
  amount: number;
  isCrit: boolean;
}

const parseInputVal = (value: string): number | '' => {
  if (value === '') return '';
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? '' : parsed;
};

export default function App() {
  // --- Game Layout Setup ---
  const [boardSize, setBoardSize] = useState<4 | 6 | 8>(6);
  
  // Custom Success Ranges
  const [successRanges, setSuccessRanges] = useState<{ min: number | ''; max: number | '' }[]>(() => 
    Array.from({ length: 8 }, () => ({ min: 120, max: 150 }))
  );
  
  const [requiredCriticalLocks, setRequiredCriticalLocks] = useState<number | ''>(3);
  
  // Custom focus capacities
  const [maxFocus, setMaxFocus] = useState<number | ''>(150);
  
  // Initial Temperature
  const [initialTemp, setInitialTemp] = useState<number | ''>(1000);

  // --- Game State ---
  const [boardValues, setBoardValues] = useState<(number | '')[]>([]);
  const [boardLocked, setBoardLocked] = useState<boolean[]>([]);
  const [currentFocus, setCurrentFocus] = useState<number | ''>(150);
  const [currentTemp, setCurrentTemp] = useState<number | ''>(1000);
  const [actionHistory, setActionHistory] = useState<string[]>([]);
  
  // Active Skill Selection
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

  // Floating damage values
  const [floatingDamages, setFloatingDamages] = useState<FloatingDamage[]>([]);

  // --- Custom Config State ---
  const [damageTable, setDamageTable] = useState<DamageTable>(defaultTemperatureDamageTables);
  const [showDamageTableEditor, setShowDamageTableEditor] = useState<boolean>(false);
  const [skills] = useState<Skill[]>(defaultSkills);
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);

  // --- AI Advisor State ---
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchProgress, setSearchProgress] = useState<number>(0);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  
  // Web Worker Ref
  const solverWorkerRef = useRef<Worker | null>(null);

  // Initialize Simulator when presets change
  useEffect(() => {
    resetSimulator();
  }, [boardSize]);

  // Sync currentFocus and currentTemp with initial settings before any actions are taken
  useEffect(() => {
    if (actionHistory.length === 0) {
      setCurrentFocus(maxFocus);
    }
  }, [maxFocus, actionHistory.length]);

  useEffect(() => {
    if (actionHistory.length === 0) {
      setCurrentTemp(initialTemp);
    }
  }, [initialTemp, actionHistory.length]);

  // Cleanup Web Worker on unmount
  useEffect(() => {
    return () => {
      if (solverWorkerRef.current) {
        solverWorkerRef.current.terminate();
      }
    };
  }, []);

  const resetSimulator = () => {
    const size = boardSize;
    setBoardValues(Array.from({ length: size }, () => 0));
    setBoardLocked(Array.from({ length: size }, () => false));
    
    let finalMaxFocus = maxFocus;
    let finalInitialTemp = initialTemp;
    if (maxFocus === '') {
      finalMaxFocus = 150;
      setMaxFocus(150);
    }
    if (initialTemp === '') {
      finalInitialTemp = 1000;
      setInitialTemp(1000);
    }
    
    setCurrentFocus(finalMaxFocus);
    setCurrentTemp(finalInitialTemp);
    setActionHistory([]);
    setActiveSkillId(null);
    setFloatingDamages([]);
    setAiSuggestions([]);
    
    // Automatically set default required critical locks
    setRequiredCriticalLocks(size === 4 ? 2 : size === 6 ? 3 : 4);
  };

  // Helper to change individual success range
  const handleRangeChange = (index: number, key: 'min' | 'max', val: number | '') => {
    setSuccessRanges(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: val };
      return updated;
    });
  };

  // UI helpers for Layout Columns
  const getColCount = () => {
    return 2;
  };

  const activeSkill = skills.find(s => s.id === activeSkillId);

  // Check which indices are highlighted on hover
  const [hoveredTargetIndex, setHoveredTargetIndex] = useState<number | null>(null);
  
  const getHoveredCellIndices = () => {
    if (!activeSkill || hoveredTargetIndex === null) return [];
    const damageEffect = activeSkill.effects.find(e => e.type === 'damage');
    if (!damageEffect) return [];
    
    const targetType = damageEffect.target || 'single';
    return getHitIndices(targetType, hoveredTargetIndex, boardSize);
  };

  // Trigger Action (Manually Strike or apply effect)
  const handleCellInteraction = (targetIndex: number, targetType: 'single' | 'vertical' | 'diagonal' | 'quad' | 'none') => {
    if (!activeSkill) return;

    if ((Number(currentFocus) || 0) < activeSkill.cost) {
      alert("集中力が足りません！");
      return;
    }

    const hitCells = getHitIndices(targetType, targetIndex, boardSize);
    
    // Skill execution
    const damageEffect = activeSkill.effects.find(e => e.type === 'damage');
    const isNerai = damageEffect?.is_nerai || false;
    
    // Determine critical outcomes
    const critRolls = hitCells.map(() => {
      const critChance = isNerai ? 0.50 : 0.01;
      return Math.random() < critChance;
    });

    const randomDamageIdx = Math.floor(Math.random() * 7);

    // Apply simulation
    const stateBefore: ForgeState = {
      values: boardValues.map(v => Number(v) || 0),
      locked: boardLocked,
      focus: Number(currentFocus) || 0,
      temp: Number(currentTemp) || 1000
    };

    const move: Move = {
      skillId: activeSkill.id,
      targetType,
      targetIndex
    };

    const successRangesClean = successRanges.map(r => ({
      min: Number(r.min) || 0,
      max: Number(r.max) || 0
    }));

    const stateAfter = applyMove(stateBefore, move, skills, successRangesClean, randomDamageIdx, critRolls, damageTable);

    // Render damage numbers
    const newFloatingDamages: FloatingDamage[] = [];
    if (damageEffect && damageEffect.multiplier !== undefined) {
      const damageArray = damageTable[Math.round(Math.max(50, Math.min(2000, Number(currentTemp) || 1000)) / 50) * 50] || damageTable[50];
      const baseDamage = damageArray[randomDamageIdx];
      
      hitCells.forEach((cellIdx, i) => {
        if (boardLocked[cellIdx]) return;
        const isCrit = critRolls[i];
        let amount = 0;
        
        const cellVal = Number(boardValues[cellIdx]) || 0;
        const maxLimit = Number(successRanges[cellIdx]?.max) || 0;
        if (isCrit && cellVal <= maxLimit) {
          amount = stateAfter.values[cellIdx] - cellVal;
        } else {
          amount = Math.round(baseDamage * (damageEffect.multiplier ?? 1.0));
        }

        newFloatingDamages.push({
          id: `${Date.now()}-${cellIdx}-${Math.random()}`,
          cellIndex: cellIdx,
          amount,
          isCrit
        });
      });
    }

    // Set floating damages
    setFloatingDamages(prev => [...prev, ...newFloatingDamages]);

    // Apply values
    setBoardValues(stateAfter.values);
    setBoardLocked(stateAfter.locked);
    setCurrentFocus(stateAfter.focus);
    setCurrentTemp(stateAfter.temp);

    // Record History
    let targetName = "";
    if (targetType === 'single') targetName = `マス${targetIndex}`;
    else if (targetType === 'vertical') targetName = `${targetIndex + 1}列目`;
    else if (targetType === 'diagonal') targetName = `ななめ範囲${targetIndex + 1}`;
    else if (targetType === 'quad') targetName = `4連範囲${targetIndex + 1}`;
    else targetName = "全体";

    setActionHistory(prev => [
      `[${activeSkill.name}] ${targetName} ➔ ${newFloatingDamages.map(d => `${d.isCrit ? '会心!' : ''}${d.amount}`).join(', ') || '効果適用'} (${stateAfter.temp}℃)`,
      ...prev
    ]);

    // Reset temporary highlight and select
    setActiveSkillId(null);
    setHoveredTargetIndex(null);
  };

  // Run AI Solver
  const triggerAiAdvisor = () => {
    if (isSearching) return;

    if (solverWorkerRef.current) {
      solverWorkerRef.current.terminate();
    }

    solverWorkerRef.current = new Worker(
      new URL('./workers/solverWorker.ts', import.meta.url),
      { type: 'module' }
    );

    setIsSearching(true);
    setSearchProgress(0);
    setAiSuggestions([]);

    solverWorkerRef.current.onmessage = (e) => {
      const { type, progress, recommendations, error } = e.data;
      if (type === 'PROGRESS') {
        setSearchProgress(progress);
      } else if (type === 'RESULT') {
        setAiSuggestions(recommendations);
        setIsSearching(false);
      } else if (type === 'ERROR') {
        alert("エラーが発生しました: " + error);
        setIsSearching(false);
      }
    };

    const successRangesClean = successRanges.slice(0, boardSize).map(r => ({
      min: Number(r.min) || 0,
      max: Number(r.max) || 0
    }));

    solverWorkerRef.current.postMessage({
      state: {
        values: boardValues.map(v => Number(v) || 0),
        locked: boardLocked,
        focus: Number(currentFocus) || 0,
        temp: Number(currentTemp) || 1000
      },
      ranges: successRangesClean,
      requiredCriticalLocks: Number(requiredCriticalLocks) || 0,
      skills,
      damageTable
    });
  };

  // Get description for target location
  const getMoveTargetLabel = (type: string, index: number) => {
    if (type === 'none') return "全体";
    if (type === 'single') return `マス ${index}`;
    if (type === 'vertical') {
      return `縦 (マス ${index} & ${index + 2})`;
    }
    if (type === 'diagonal') {
      return `ななめ (マス ${index + 1} & ${index + 2})`;
    }
    if (type === 'quad') {
      return `4連 (マス ${index}, ${index + 1}, ${index + 2}, ${index + 3})`;
    }
    return `ターゲット ${index}`;
  };

  // Apply suggestion directly from AI
  const applyAiSuggestion = (move: Move) => {
    const skill = skills.find(s => s.id === move.skillId);
    if (!skill) return;
    
    // Setup hit indicators and execute
    const hitCells = move.targetType === 'none' 
      ? [] 
      : getHitIndices(move.targetType, move.targetIndex, boardSize);
      
    const isNerai = skill.effects.find(e => e.type === 'damage')?.is_nerai || false;
    const critRolls = hitCells.map(() => Math.random() < (isNerai ? 0.5 : 0.01));
    const randomDamageIdx = Math.floor(Math.random() * 7);

    const stateBefore: ForgeState = {
      values: boardValues.map(v => Number(v) || 0),
      locked: boardLocked,
      focus: Number(currentFocus) || 0,
      temp: Number(currentTemp) || 1000
    };

    const successRangesClean = successRanges.map(r => ({
      min: Number(r.min) || 0,
      max: Number(r.max) || 0
    }));

    const stateAfter = applyMove(stateBefore, move, skills, successRangesClean, randomDamageIdx, critRolls, damageTable);

    const newFloatingDamages: FloatingDamage[] = [];
    const damageEffect = skill.effects.find(e => e.type === 'damage');
    if (damageEffect && damageEffect.multiplier !== undefined && move.targetType !== 'none') {
      const damageArray = damageTable[Math.round(Math.max(50, Math.min(2000, Number(currentTemp) || 1000)) / 50) * 50] || damageTable[50];
      const baseDamage = damageArray[randomDamageIdx];
      
      hitCells.forEach((cellIdx, i) => {
        if (boardLocked[cellIdx]) return;
        const isCrit = critRolls[i];
        let amount = 0;
        
        const cellVal = Number(boardValues[cellIdx]) || 0;
        const maxLimit = Number(successRanges[cellIdx]?.max) || 0;
        if (isCrit && cellVal <= maxLimit) {
          amount = stateAfter.values[cellIdx] - cellVal;
        } else {
          amount = Math.round(baseDamage * (damageEffect.multiplier ?? 1.0));
        }

        newFloatingDamages.push({
          id: `${Date.now()}-${cellIdx}-${Math.random()}`,
          cellIndex: cellIdx,
          amount,
          isCrit
        });
      });
    }

    setFloatingDamages(prev => [...prev, ...newFloatingDamages]);
    setBoardValues(stateAfter.values);
    setBoardLocked(stateAfter.locked);
    setCurrentFocus(stateAfter.focus);
    setCurrentTemp(stateAfter.temp);

    const targetLabel = getMoveTargetLabel(move.targetType, move.targetIndex);
    setActionHistory(prev => [
      `[${skill.name}] ${targetLabel} ➔ ${newFloatingDamages.map(d => `${d.isCrit ? '会心!' : ''}${d.amount}`).join(', ') || '効果適用'} (${stateAfter.temp}℃)`,
      ...prev
    ]);

    setActiveSkillId(null);
    setAiSuggestions([]);
  };

  // Damage table import handler
  const handleJsonImport = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (parsed.temperature_damage_tables) {
        setDamageTable(parsed.temperature_damage_tables);
        setJsonImportError(null);
      } else {
        setJsonImportError("JSON構造に 'temperature_damage_tables' キーが見つかりません。");
      }
    } catch (e: any) {
      setJsonImportError("JSONパースエラー: " + e.message);
    }
  };

  const handleJsonExport = () => {
    const dataStr = JSON.stringify({ temperature_damage_tables: damageTable }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'temperature_damage_tables.json';
    link.click();
  };

  const resetDamageTable = () => {
    setDamageTable(defaultTemperatureDamageTables);
    setJsonImportError(null);
  };

  // Evaluate final status for UI
  const successRangesClean = successRanges.slice(0, boardSize).map(r => ({
    min: Number(r.min) || 0,
    max: Number(r.max) || 0
  }));

  const forgeStatus = evaluateForgeStatus(
    {
      values: boardValues.map(v => Number(v) || 0),
      locked: boardLocked,
      focus: Number(currentFocus) || 0,
      temp: Number(currentTemp) || 1000
    },
    successRangesClean,
    Number(requiredCriticalLocks) || 0
  );

  return (
    <div className="min-h-screen bg-[#07080c] text-slate-100 flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-7xl mb-8 flex flex-col md:flex-row items-center justify-between border-b border-indigo-900/40 pb-4">
        <div className="flex items-center space-x-3 mb-4 md:mb-0">
          <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="font-extrabold text-xl text-white font-mono">D</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
              DQXTool <span className="ml-2 text-sm bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-normal">鍛冶シミュレーター & AI</span>
            </h1>
            <p className="text-xs text-slate-400">最適ルート逆算探索 AIアドバイザー</p>
          </div>
        </div>

        {/* Global Reset */}
        <button
          onClick={resetSimulator}
          className="flex items-center space-x-2 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-semibold py-2 px-6 rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all duration-200 cursor-pointer"
        >
          <span>リセット & 再スタート</span>
        </button>
      </header>

      {/* Main Grid */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Preset & configuration */}
        <section className="lg:col-span-3 space-y-6">
          {/* Presets Card */}
          <div className="glass-panel rounded-xl p-5 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-2">盤面・目標設定</h2>
            
            {/* Presets */}
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">盤面レイアウト</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[4, 6, 8].map(size => (
                    <button
                      key={size}
                      onClick={() => setBoardSize(size as 4 | 6 | 8)}
                      className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
                        boardSize === size 
                          ? 'bg-indigo-600 text-white border-2 border-indigo-400 shadow-md shadow-indigo-500/20' 
                          : 'bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      {size === 4 ? '4マス (2x2)' : size === 6 ? '6マス (2x3)' : '8マス (2x4)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Focus and Temp Settings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-semibold">初期集中力</label>
                  <input
                    type="number"
                    value={maxFocus}
                    onChange={(e) => setMaxFocus(parseInputVal(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 mt-1 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-semibold">初期温度 (℃)</label>
                  <input
                    type="number"
                    step="50"
                    value={initialTemp}
                    onChange={(e) => setInitialTemp(parseInputVal(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 mt-1 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Locks requirement */}
              <div>
                <label className="text-xs text-slate-400 font-semibold">大成功に必要な会心ロック数</label>
                <input
                  type="number"
                  min="0"
                  max={boardSize}
                  value={requiredCriticalLocks}
                  onChange={(e) => setRequiredCriticalLocks(parseInputVal(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 mt-1 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Success ranges customize inputs */}
          <div className="glass-panel rounded-xl p-5 shadow-xl max-h-72 overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-2">マス別基準値 [最小 - 最大]</h2>
            <div className="space-y-3">
              {Array.from({ length: boardSize }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                  <span className="text-sm font-semibold font-mono text-indigo-400">マス {idx}</span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={successRanges[idx]?.min}
                      onChange={(e) => handleRangeChange(idx, 'min', parseInputVal(e.target.value))}
                      className="w-16 bg-slate-950 border border-slate-850 rounded py-1 px-1.5 text-center text-white font-mono text-xs"
                    />
                    <span className="text-slate-600">-</span>
                    <input
                      type="number"
                      value={successRanges[idx]?.max}
                      onChange={(e) => handleRangeChange(idx, 'max', parseInputVal(e.target.value))}
                      className="w-16 bg-slate-950 border border-slate-850 rounded py-1 px-1.5 text-center text-white font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Damage Tables JSON Card */}
          <div className="glass-panel rounded-xl p-5 shadow-xl">
            <button
              onClick={() => setShowDamageTableEditor(!showDamageTableEditor)}
              className="w-full text-left font-bold text-white flex items-center justify-between"
            >
              <span>温度ダメージテーブル設定</span>
              <span className="text-xs text-indigo-400">{showDamageTableEditor ? '閉じる' : '開く'}</span>
            </button>
            
            {showDamageTableEditor && (
              <div className="mt-4 space-y-4">
                <div className="flex space-x-2">
                  <button
                    onClick={handleJsonExport}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-xs py-1.5 rounded text-indigo-300 border border-slate-800 font-semibold"
                  >
                    JSON書き出し
                  </button>
                  <button
                    onClick={resetDamageTable}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-xs py-1.5 rounded text-red-400 border border-slate-800 font-semibold"
                  >
                    初期化
                  </button>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">JSONから読み込み/貼り付け</label>
                  <textarea
                    placeholder='{"temperature_damage_tables": {...}}'
                    onChange={(e) => handleJsonImport(e.target.value)}
                    className="w-full h-32 bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                  {jsonImportError && <p className="text-[11px] text-red-500 mt-1">{jsonImportError}</p>}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Center/Right Column: Simulator Main Area */}
        <main className="lg:col-span-6 space-y-6">
          {/* Status HUD Card */}
          <div className="glass-panel rounded-xl p-5 shadow-xl relative overflow-hidden">
            {/* Ambient indicator lights */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl pointer-events-none" />

            <div className="grid grid-cols-3 gap-4 text-center">
              {/* Temp Indicator */}
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-850">
                <span className="text-xs font-semibold text-slate-400 uppercase">現在温度</span>
                <div className="mt-1 flex items-center justify-center space-x-2">
                  {/* Glowing flame point */}
                  <span className={`h-2.5 w-2.5 rounded-full inline-block animate-ping ${
                    (Number(currentTemp) || 1000) >= 1500 ? 'bg-red-500' : (Number(currentTemp) || 1000) >= 900 ? 'bg-orange-400' : 'bg-sky-400'
                  }`} />
                  <span className={`text-2xl font-bold font-mono ${
                    (Number(currentTemp) || 1000) >= 1500 ? 'text-red-500 text-glow-red' : (Number(currentTemp) || 1000) >= 900 ? 'text-orange-400 text-glow-yellow' : 'text-sky-400 text-glow-blue'
                  }`}>
                    {currentTemp === '' ? '-' : currentTemp}℃
                  </span>
                </div>
              </div>

              {/* Focus/Concentration Bar */}
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-850">
                <span className="text-xs font-semibold text-slate-400 uppercase">残り集中力</span>
                <div className="flex items-center justify-center space-x-1 mt-1">
                  <input
                    type="number"
                    min="0"
                    max={maxFocus}
                    value={currentFocus}
                    onChange={(e) => setCurrentFocus(parseInputVal(e.target.value))}
                    className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center text-white font-mono text-lg focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-500">/ {maxFocus}</span>
                </div>
                {/* Bar */}
                <div className="w-full bg-slate-900 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-800">
                  <div 
                    className="bg-gradient-to-r from-violet-600 to-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, ((Number(currentFocus) || 0) / (Number(maxFocus) || 1)) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Status Badge */}
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-850 flex flex-col justify-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">現在のステータス</span>
                <div className="mt-1.5">
                  {forgeStatus === 'great_success' && (
                    <span className="text-sm px-3 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold uppercase tracking-wider text-glow-green">大成功 !!</span>
                  )}
                  {forgeStatus === 'success' && (
                    <span className="text-sm px-3 py-1 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 font-bold uppercase tracking-wider text-glow-blue">成功 !</span>
                  )}
                  {forgeStatus === 'failed' && (
                    <span className="text-sm px-3 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold uppercase tracking-wider text-glow-red">失敗 (オーバー)</span>
                  )}
                  {forgeStatus === 'ongoing' && (
                    <span className="text-sm px-3 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 font-bold uppercase tracking-wider">叩き中</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Smithing Grid Board */}
          <div className="glass-panel-accent rounded-2xl p-6 shadow-2xl relative">
            <h2 className="text-lg font-bold text-indigo-300 mb-4 flex items-center justify-between">
              <span>鍛冶盤面 (たたき台)</span>
              {activeSkill && (
                <span className="text-xs bg-amber-500/20 text-amber-300 px-3 py-1 rounded border border-amber-500/40 animate-pulse">
                  特技: {activeSkill.name} を選択中 - マスをクリックして叩く
                </span>
              )}
            </h2>

            {/* Grid Container */}
            <div 
              className="grid gap-4 mx-auto w-full max-w-lg"
              style={{ gridTemplateColumns: `repeat(${getColCount()}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: boardSize }).map((_, idx) => {
                const value = boardValues[idx] || 0;
                const range = successRanges[idx] || { min: 120, max: 150 };
                const isLocked = boardLocked[idx];
                
                // Color states
                let borderClass = 'border-slate-850 hover:border-slate-750 bg-slate-950/60';
                let textGlow = '';
                let statusLabel = '未到達';

                if (isLocked) {
                  borderClass = 'border-blue-500 bg-blue-950/35 shadow-lg shadow-blue-500/10 text-glow-blue';
                  textGlow = 'text-glow-blue text-blue-400';
                  statusLabel = '会心ロック';
                } else if (value > (Number(range.max) || 0)) {
                  borderClass = 'border-red-500 bg-red-950/30 shadow-lg shadow-red-500/10 text-glow-red';
                  textGlow = 'text-glow-red text-red-400';
                  statusLabel = 'オーバー';
                } else if (value >= (Number(range.min) || 0) && value <= (Number(range.max) || 0)) {
                  borderClass = 'border-emerald-500 bg-emerald-950/30 shadow-lg shadow-emerald-500/10 text-glow-green';
                  textGlow = 'text-glow-green text-emerald-400';
                  statusLabel = '成功ゾーン内';
                } else if (value > 0) {
                  borderClass = 'border-amber-600 bg-amber-950/20';
                  textGlow = 'text-amber-500';
                  statusLabel = '進行中';
                }

                // Interactive Highlight triggers
                const isHovered = getHoveredCellIndices().includes(idx);
                const isInteractable = activeSkill && (
                  (activeSkill.effects.find(e => e.type === 'damage')?.target === 'single' && !isLocked) ||
                  (activeSkill.effects.find(e => e.type === 'damage')?.target === 'vertical') ||
                  (activeSkill.effects.find(e => e.type === 'damage')?.target === 'diagonal') ||
                  (activeSkill.effects.find(e => e.type === 'damage')?.target === 'quad')
                );

                // Helper to map index for multi-target clicks
                const triggerTargetInteraction = () => {
                  if (!activeSkill) return;
                  const targetType = activeSkill.effects.find(e => e.type === 'damage')?.target || 'single';
                  
                  if (targetType === 'single') {
                    if (isLocked) return;
                    handleCellInteraction(idx, 'single');
                  } else if (targetType === 'vertical') {
                    const startIdx = idx < boardSize - 2 ? idx : idx - 2;
                    handleCellInteraction(startIdx, 'vertical');
                  } else if (targetType === 'diagonal' || targetType === 'quad') {
                    const startIdx = Math.min(Math.floor(idx / 2), boardSize / 2 - 2) * 2;
                    handleCellInteraction(startIdx, targetType);
                  }
                };

                const handleMouseEnter = () => {
                  if (!activeSkill) return;
                  const targetType = activeSkill.effects.find(e => e.type === 'damage')?.target || 'single';
                  if (targetType === 'single') {
                    setHoveredTargetIndex(idx);
                  } else if (targetType === 'vertical') {
                    const startIdx = idx < boardSize - 2 ? idx : idx - 2;
                    setHoveredTargetIndex(startIdx);
                  } else {
                    const startIdx = Math.min(Math.floor(idx / 2), boardSize / 2 - 2) * 2;
                    setHoveredTargetIndex(startIdx);
                  }
                };

                // Find active damage number
                const currentDamage = floatingDamages.find(d => d.cellIndex === idx);

                return (
                  <div
                    key={idx}
                    onClick={triggerTargetInteraction}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={() => setHoveredTargetIndex(null)}
                    className={`relative rounded-xl border p-4 md:p-6 transition-all duration-200 text-center flex flex-col justify-between select-none ${borderClass} ${
                      isHovered ? 'ring-4 ring-indigo-500/40 bg-indigo-950/20 scale-[1.02]' : ''
                    } ${isInteractable ? 'cursor-pointer' : ''}`}
                  >
                    {/* Floating Damage Floating Animation */}
                    {currentDamage && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <span className={`text-3xl font-extrabold font-mono animate-float-damage ${
                          currentDamage.isCrit ? 'text-amber-400 text-glow-yellow' : 'text-white'
                        }`}>
                          {currentDamage.isCrit ? '🔥会心! ' : ''}{currentDamage.amount}
                        </span>
                      </div>
                    )}

                    {/* Cell Index Label */}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">#{idx}</span>
                      <span className="text-[10px] font-semibold">{statusLabel}</span>
                    </div>

                    {/* Numeric Progress */}
                    <div className="my-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={value}
                        onChange={(e) => {
                          const val = parseInputVal(e.target.value);
                          const newVal = val === '' ? '' : Math.max(0, Math.min(999, val));
                          setBoardValues(prev => {
                            const next = [...prev];
                            next[idx] = newVal;
                            return next;
                          });
                        }}
                        className={`text-3xl md:text-4xl font-extrabold font-mono text-white tracking-tight text-center w-24 bg-slate-900/40 border-b border-dashed border-slate-700 focus:outline-none focus:border-indigo-500 rounded px-1 ${textGlow}`}
                      />
                      <div className="text-[11px] text-slate-500 mt-1.5 font-semibold">
                        目標: {range.min} - {range.max}
                      </div>
                    </div>

                    {/* Miniature Progress Slider */}
                    <div className="w-full bg-slate-900/60 h-2 rounded mt-2 border border-slate-850 relative overflow-hidden">
                      {/* Success zone overlay */}
                      <div 
                        className="absolute h-full bg-emerald-500/15 border-l border-r border-emerald-500/30"
                        style={{
                          left: `${((Number(range.min) || 0) / 300) * 100}%`,
                          width: `${(((Number(range.max) || 0) - (Number(range.min) || 0)) / 300) * 100}%`
                        }}
                      />
                      {/* Current Value pointer */}
                      <div 
                        className={`absolute top-0 h-full rounded-full transition-all duration-300 ${
                          isLocked ? 'bg-blue-400 shadow shadow-blue-500' : (Number(value) || 0) > (Number(range.max) || 0) ? 'bg-red-500' : (Number(value) || 0) >= (Number(range.min) || 0) ? 'bg-emerald-400' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, ((Number(value) || 0) / 300) * 100)}%` }}
                      />
                    </div>

                    {/* Lock Toggle Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBoardLocked(prev => {
                          const next = [...prev];
                          next[idx] = !next[idx];
                          return next;
                        });
                      }}
                      title={isLocked ? "会心ロック解除" : "会心ロック設定"}
                      className={`absolute top-2 right-2 p-1 rounded-full shadow transition-all duration-150 cursor-pointer ${
                        isLocked 
                          ? 'bg-blue-500 text-slate-950 hover:bg-blue-400' 
                          : 'bg-slate-900/60 text-slate-500 hover:text-slate-350 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        {isLocked ? (
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                        ) : (
                          <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6-5c1.66 0 3 1.34 3 3v2H9V6c0-1.66 1.34-3 3-3zm6 15H6V10h12v8z"/>
                        )}
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* If skill target is global */}
            {activeSkill && activeSkill.effects.every(e => e.type !== 'damage') && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => handleCellInteraction(0, 'none')}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-8 rounded-lg shadow-lg hover:shadow-amber-500/20 text-sm tracking-wide cursor-pointer"
                >
                  【{activeSkill.name}】を全体に実行する
                </button>
              </div>
            )}
          </div>

          {/* Action Log / History */}
          <div className="glass-panel rounded-xl p-5 shadow-xl max-h-52 overflow-y-auto">
            <h2 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider border-b border-slate-850 pb-1">行動ログ履歴</h2>
            <div className="space-y-1.5">
              {actionHistory.length === 0 ? (
                <p className="text-xs text-slate-600 italic">行動履歴はまだありません</p>
              ) : (
                actionHistory.map((log, i) => (
                  <p key={i} className="text-xs font-mono text-slate-350 bg-slate-950/40 p-1.5 rounded border border-slate-900/60">
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>
        </main>

        {/* Right Column: Skill Selection & AI Advisor */}
        <section className="lg:col-span-3 space-y-6">
          {/* Skill Selection Box */}
          <div className="glass-panel rounded-xl p-5 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-2">鍛冶特技一覧</h2>
            <div className="grid grid-cols-2 gap-2">
              {skills.map(skill => {
                const isSelected = activeSkillId === skill.id;
                const canAfford = (Number(currentFocus) || 0) >= skill.cost;
                const isFinished = forgeStatus !== 'ongoing';

                return (
                  <button
                    key={skill.id}
                    disabled={!canAfford || isFinished}
                    onClick={() => setActiveSkillId(isSelected ? null : skill.id)}
                    className={`p-2.5 rounded-lg flex flex-col justify-between text-left transition-all border ${
                      isSelected 
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold shadow-lg shadow-amber-500/15'
                        : !canAfford || isFinished
                          ? 'bg-slate-950 border-slate-950 text-slate-700 opacity-40 cursor-not-allowed'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-750 text-slate-200'
                    }`}
                  >
                    <span className="text-sm font-semibold truncate">{skill.name}</span>
                    <span className={`text-[10px] mt-1 inline-block font-mono ${isSelected ? 'text-slate-900' : 'text-indigo-400'}`}>
                      消費: {skill.cost} FP
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Advisor Assistant */}
          <div className="glass-panel rounded-xl p-5 shadow-xl relative overflow-hidden border border-indigo-900/30">
            {/* Background design */}
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl" />

            <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-2 flex items-center justify-between">
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-indigo-400 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
                AIアドバイザー
              </span>
              <span className="text-xs bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded font-normal font-mono">LOOKAHEAD</span>
            </h2>

            {/* Run Solver Trigger Button */}
            <button
              onClick={triggerAiAdvisor}
              disabled={isSearching || forgeStatus !== 'ongoing'}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-850 disabled:to-slate-850 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg hover:shadow-indigo-500/15 transition-all duration-200 flex items-center justify-center space-x-2 text-sm cursor-pointer"
            >
              {isSearching ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>計算中 ({searchProgress}%)</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
                  </svg>
                  <span>最適ルートを計算</span>
                </>
              )}
            </button>

            {/* Suggestions Render */}
            <div className="mt-5 space-y-3">
              {isSearching && (
                <div className="text-center py-6 text-xs text-slate-500">
                  <p className="animate-pulse">Web Workers上でビームサーチ探索を行っています...</p>
                </div>
              )}

              {!isSearching && aiSuggestions.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-500">
                  <p>ボタンをクリックすると、大成功期待値の高い上位3つのアクションを提示します。</p>
                </div>
              )}

              {!isSearching && aiSuggestions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">推奨アクション TOP3</h3>
                  
                  {aiSuggestions.map((rec, i) => {
                    const skill = skills.find(s => s.id === rec.move.skillId);
                    if (!skill) return null;

                    const label = getMoveTargetLabel(rec.move.targetType, rec.move.targetIndex);
                    
                    return (
                      <div
                        key={i}
                        className="bg-slate-950 border border-slate-900 hover:border-slate-800 p-3 rounded-lg flex flex-col transition-all cursor-pointer hover:scale-[1.01]"
                        onMouseEnter={() => {
                          const targetType = rec.move.targetType;
                          if (targetType !== 'none') {
                            setHoveredTargetIndex(rec.move.targetIndex);
                            setActiveSkillId(skill.id);
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredTargetIndex(null);
                          setActiveSkillId(null);
                        }}
                        onClick={() => applyAiSuggestion(rec.move)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs bg-indigo-500/10 text-indigo-400 font-mono px-1.5 py-0.5 rounded font-bold">
                            第 {i + 1} 案
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">期待値: {rec.expectedScore.toFixed(1)}</span>
                        </div>

                        <div className="font-bold text-white text-sm mt-1.5 flex items-center justify-between">
                          <span>{skill.name}</span>
                          <span className="text-xs text-slate-400 font-mono">{label}</span>
                        </div>

                        {/* Probabilities */}
                        <div className="mt-3 space-y-1.5">
                          {/* Success probability */}
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>成功確率</span>
                              <span className="font-mono text-emerald-400">{(rec.successRate * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-900 h-1 rounded overflow-hidden">
                              <div 
                                className="bg-emerald-400 h-full rounded" 
                                style={{ width: `${rec.successRate * 100}%` }}
                              />
                            </div>
                          </div>

                          {/* Great Success probability */}
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>大成功確率</span>
                              <span className="font-mono text-indigo-400">{(rec.greatSuccessRate * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-900 h-1 overflow-hidden">
                              <div 
                                className="bg-indigo-500 h-full rounded" 
                                style={{ width: `${rec.greatSuccessRate * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Apply recommendation button */}
                        <span className="text-[10px] text-slate-500 font-semibold mt-3 text-right hover:text-white transition-all">
                          クリックしてこの手を実行 ➔
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

      </div>

      {/* Footer */}
      <footer className="w-full max-w-7xl mt-12 border-t border-slate-900 pt-6 text-center text-xs text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <p>© 2026 DQXTool Smithing Assistant. Powered by React + TailwindCSS + Web Workers.</p>
        </div>
        <div className="flex space-x-4">
          <span className="text-[10px] text-indigo-400/60 font-semibold bg-indigo-500/5 px-2 py-1 rounded">CLIENT-SIDE SECURE</span>
        </div>
      </footer>
    </div>
  );
}
