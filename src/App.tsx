import { useState, useEffect, useRef } from 'react';
import { items, hammers, skills, levelFocusMap } from './data/masterData';
import { ForgeCoreEngine } from './utils/forgeCoreEngine';
import type { ForgeState } from './utils/forgeCoreEngine';

interface FloatingDamage {
  id: string;
  cellIndex: number;
  amount: number;
  isCrit: boolean;
}

const SEARCH_MESSAGES = [
  'ハムスターにエナジードリンクを与えています...',
  'コーヒーが沸くのを待っています...',
  '1 と 0 を手作業で丁寧に並び替えています...',
  'ピザのトッピングについて議論が白熱しています...',
  '今週分の強戦士の書をやっていないのを思い出しました...',
  '今デイリーをやっているのでちょっと待ってください...',
  '開発者が裏で『動けってんだよこのポンコツがぁ！』とコックピットを叩いています...',
  'バタフライエフェクトを考慮した結果、処理を3秒遅らせることにしました...',
  'ハムスターが『有給をくれ』とデモを起こしています...',
  'ハムスターたちが、誰が一番えらいかで揉めています...',
  '進捗バーが『もっとゆっくり歩きたい』と言うので、付き合っています...'
];

export default function App() {
  // --- Theme State ---
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('dqx_theme') as 'dark' | 'light') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('dqx_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // --- Help Modal State ---
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // --- Game Setup State ---
  const [selectedItemId, setSelectedItemId] = useState<string>(items[0].id);
  const [selectedHammerId, setSelectedHammerId] = useState<string>(hammers[5].id); // Default: 奇跡の鍛冶ハンマー
  const [selectedQuality, setSelectedQuality] = useState<number>(3); // Default: ★3
  const [selectedLevel, setSelectedLevel] = useState<number>(80); // Default: レベル80
  const [customSeed, setCustomSeed] = useState<string>('');

  // --- Game Engine Instance ---
  const engineRef = useRef<ForgeCoreEngine | null>(null);
  const [forgeState, setForgeState] = useState<ForgeState | null>(null);
  const [actionHistory, setActionHistory] = useState<string[]>([]);
  const [floatingDamages, setFloatingDamages] = useState<FloatingDamage[]>([]);

  // --- UI Interactive State ---
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [hoveredCellIndex, setHoveredCellIndex] = useState<number | null>(null);

  // --- AI Advisor State ---
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchProgress, setSearchProgress] = useState<number>(0);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [searchMessage, setSearchMessage] = useState<string>('');

  // Web Worker Ref
  const solverWorkerRef = useRef<Worker | null>(null);

  // Initialize/reset engine
  const handleReset = () => {
    const engine = new ForgeCoreEngine();
    engineRef.current = engine;

    const seedVal = customSeed.trim() || Math.random().toString(36).substring(2);
    const state = engine.reset(selectedItemId, selectedHammerId, selectedQuality, seedVal, selectedLevel);

    setForgeState(state);
    setActionHistory([]);
    setFloatingDamages([]);
    setActiveSkillId(null);
    setHoveredCellIndex(null);
    setAiSuggestions([]);
    setIsSearching(false);
  };

  // Run initial setup on mount
  useEffect(() => {
    handleReset();
  }, []);

  // Cleanup Web Worker on unmount
  useEffect(() => {
    return () => {
      if (solverWorkerRef.current) {
        solverWorkerRef.current.terminate();
      }
    };
  }, []);

  // Rotate search message every 3 seconds while searching
  useEffect(() => {
    if (!isSearching) return;

    const selectRandomMessage = () => {
      setSearchMessage(prev => {
        const available = SEARCH_MESSAGES.filter(msg => msg !== prev);
        return available[Math.floor(Math.random() * available.length)];
      });
    };

    const interval = setInterval(selectRandomMessage, 3000);
    return () => clearInterval(interval);
  }, [isSearching]);

  // Sync state values and compute hit targets for hovering highlights
  const activeSkill = skills.find(s => s.id === activeSkillId);

  const getHoveredCellIndices = (): number[] => {
    if (!activeSkill || hoveredCellIndex === null || !forgeState) return [];

    const targetType = activeSkill.targetPattern;
    const size = 8;

    if (targetType === 'single') {
      return [hoveredCellIndex];
    }
    if (targetType === 'vertical') {
      const startIdx = hoveredCellIndex < size - 2 ? hoveredCellIndex : hoveredCellIndex - 2;
      return [startIdx, startIdx + 2];
    }
    if (targetType === 'horizontal') {
      const startIdx = Math.min(Math.floor(hoveredCellIndex / 2), size / 2 - 1) * 2;
      return [startIdx, startIdx + 1];
    }
    if (targetType === 'diagonal') {
      const startIdx = Math.min(Math.floor(hoveredCellIndex / 2), size / 2 - 2) * 2;
      return [startIdx + 1, startIdx + 2];
    }
    if (targetType === 'quad') {
      const startIdx = Math.min(Math.floor(hoveredCellIndex / 2), size / 2 - 2) * 2;
      return [startIdx, startIdx + 1, startIdx + 2, startIdx + 3];
    }
    return [];
  };

  // Perform strike step
  const handleCellInteraction = (targetIndex: number) => {
    if (!activeSkill || !engineRef.current || !forgeState) return;

    // Calculate current cost
    let cost = activeSkill.cost;
    if (forgeState.materialType === '集中変化地金') {
      if (forgeState.temperature % 400 === 0) {
        cost = Math.floor(cost * 0.5);
      } else if (forgeState.temperature % 200 === 0) {
        cost = Math.floor(cost * 1.5);
      }
    }

    if (forgeState.focus < cost) {
      alert("集中力が足りません！");
      return;
    }

    // Determine target index argument based on layout pattern
    let targets: number[] = [];
    const size = 8;

    if (activeSkill.targetPattern === 'single') {
      targets = [targetIndex];
    } else if (activeSkill.targetPattern === 'vertical') {
      const start = targetIndex < size - 2 ? targetIndex : targetIndex - 2;
      targets = [start];
    } else if (activeSkill.targetPattern === 'horizontal') {
      const start = Math.min(Math.floor(targetIndex / 2), size / 2 - 1) * 2;
      targets = [start];
    } else if (activeSkill.targetPattern === 'diagonal' || activeSkill.targetPattern === 'quad') {
      const start = Math.min(Math.floor(targetIndex / 2), size / 2 - 2) * 2;
      targets = [start];
    }

    const prevCells = forgeState.cells;

    try {
      const nextState = engineRef.current.step(activeSkill.name, targets);

      // Calculate damage and detect critical locks by comparing cells
      const newFloating: FloatingDamage[] = [];
      const hitLogs: string[] = [];

      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive) {
          const diff = cell.currentValue - prevCells[idx].currentValue;
          const lockedNow = cell.isLocked && !prevCells[idx].isLocked;
          if (diff > 0) {
            newFloating.push({
              id: `${Date.now()}-${idx}-${Math.random()}`,
              cellIndex: idx,
              amount: diff,
              isCrit: lockedNow
            });
            hitLogs.push(`マス${idx}: +${diff}${lockedNow ? ' (会心!)' : ''}`);
          }
        }
      });

      // Clear glows that might have changed
      setFloatingDamages(newFloating);
      setForgeState(nextState);

      // Record logs
      let logMsg = `[${activeSkill.name}] ${hitLogs.join(', ') || '効果適用'} (温度: ${nextState.temperature}℃, 集中力消費: ${cost})`;
      setActionHistory(prev => [logMsg, ...prev]);

      // Check receding logs (if 戻り地金 occurred)
      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive) {
          const diff = prevCells[idx].currentValue - cell.currentValue;
          if (diff > 0) {
            setActionHistory(prev => [`[戻り地金効果] ターン終了時にマス${idx}が ${diff} 戻りました`, ...prev]);
          }
        }
      });

      // Check glowing light logs (if 光地金 selected a cell)
      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive && cell.isGlowing && !prevCells[idx].isGlowing) {
          setActionHistory(prev => [`[光地金効果] マス${idx}が光り輝いています！`, ...prev]);
        }
      });

      setActiveSkillId(null);
      setHoveredCellIndex(null);
      setAiSuggestions([]); // Clear recommendations to prompt recalculation
    } catch (e: any) {
      alert("エラーが発生しました: " + e.message);
    }
  };

  // Perform global strike (火力上げ, 冷やし込み, みだれ打ち)
  const handleGlobalInteraction = () => {
    if (!activeSkill || !engineRef.current || !forgeState) return;

    let cost = activeSkill.cost;
    if (forgeState.materialType === '集中変化地金') {
      if (forgeState.temperature % 400 === 0) {
        cost = Math.floor(cost * 0.5);
      } else if (forgeState.temperature % 200 === 0) {
        cost = Math.floor(cost * 1.5);
      }
    }

    if (forgeState.focus < cost) {
      alert("集中力が足りません！");
      return;
    }

    const prevCells = forgeState.cells;

    try {
      const nextState = engineRef.current.step(activeSkill.name, []);

      const newFloating: FloatingDamage[] = [];
      const hitLogs: string[] = [];

      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive) {
          const diff = cell.currentValue - prevCells[idx].currentValue;
          const lockedNow = cell.isLocked && !prevCells[idx].isLocked;
          if (diff > 0) {
            newFloating.push({
              id: `${Date.now()}-${idx}-${Math.random()}`,
              cellIndex: idx,
              amount: diff,
              isCrit: lockedNow
            });
            hitLogs.push(`マス${idx}: +${diff}${lockedNow ? ' (会心!)' : ''}`);
          }
        }
      });

      setFloatingDamages(newFloating);
      setForgeState(nextState);

      let logMsg = `[${activeSkill.name}] ${hitLogs.join(', ') || '温度変化実行'} (温度: ${nextState.temperature}℃, 集中力消費: ${cost})`;
      setActionHistory(prev => [logMsg, ...prev]);

      // Check receding logs (if 戻り地金 occurred)
      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive) {
          const diff = prevCells[idx].currentValue - cell.currentValue;
          if (diff > 0) {
            setActionHistory(prev => [`[戻り地金効果] ターン終了時にマス${idx}が ${diff} 戻りました`, ...prev]);
          }
        }
      });

      // Check glowing light logs (if 光地金 selected a cell)
      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive && cell.isGlowing && !prevCells[idx].isGlowing) {
          setActionHistory(prev => [`[光地金効果] マス${idx}が光り輝いています！`, ...prev]);
        }
      });

      setActiveSkillId(null);
      setAiSuggestions([]);
    } catch (e: any) {
      alert("エラーが発生しました: " + e.message);
    }
  };

  // Run AI Advisor Solver via Web Worker
  const triggerAiAdvisor = () => {
    if (isSearching || !forgeState) return;

    if (solverWorkerRef.current) {
      solverWorkerRef.current.terminate();
    }

    // Spawn the solverWorker Web Worker
    solverWorkerRef.current = new Worker(
      new URL('./workers/solverWorker.ts', import.meta.url),
      { type: 'module' }
    );

    const randomMsg = SEARCH_MESSAGES[Math.floor(Math.random() * SEARCH_MESSAGES.length)];
    setSearchMessage(randomMsg);
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
        alert("AI計算エラー: " + error);
        setIsSearching(false);
      }
    };

    // Post the current state to the web worker for Monte Carlo rollout
    solverWorkerRef.current.postMessage({
      state: cloneForgeState(forgeState)
    });
  };

  // Apply suggestion directly from AI Recommendation
  const applyAiRecommendation = (recMove: { actionName: string; targets: number[] }) => {
    if (!engineRef.current || !forgeState) return;

    if (recMove.actionName === 'しあげる') {
      handleFinish();
      return;
    }

    // Setup skill active and trigger interaction
    const skill = skills.find(s => s.name === recMove.actionName || s.id === recMove.actionName);
    if (!skill) return;

    let cost = skill.cost;
    if (forgeState.materialType === '集中変化地金') {
      if (forgeState.temperature % 400 === 0) {
        cost = Math.floor(cost * 0.5);
      } else if (forgeState.temperature % 200 === 0) {
        cost = Math.floor(cost * 1.5);
      }
    }

    if (forgeState.focus < cost) {
      alert("集中力が足りません！");
      return;
    }

    const prevCells = forgeState.cells;

    try {
      const nextState = engineRef.current.step(skill.name, recMove.targets);

      const newFloating: FloatingDamage[] = [];
      const hitLogs: string[] = [];

      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive) {
          const diff = cell.currentValue - prevCells[idx].currentValue;
          const lockedNow = cell.isLocked && !prevCells[idx].isLocked;
          if (diff > 0) {
            newFloating.push({
              id: `${Date.now()}-${idx}-${Math.random()}`,
              cellIndex: idx,
              amount: diff,
              isCrit: lockedNow
            });
            hitLogs.push(`マス${idx}: +${diff}${lockedNow ? ' (会心!)' : ''}`);
          }
        }
      });

      setFloatingDamages(newFloating);
      setForgeState(nextState);

      let logMsg = `[AI推奨: ${skill.name}] ${hitLogs.join(', ') || '実行'} (温度: ${nextState.temperature}℃, 集中力消費: ${cost})`;
      setActionHistory(prev => [logMsg, ...prev]);

      // Check receding logs (if 戻り地金 occurred)
      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive) {
          const diff = prevCells[idx].currentValue - cell.currentValue;
          if (diff > 0) {
            setActionHistory(prev => [`[戻り地金効果] ターン終了時にマス${idx}が ${diff} 戻りました`, ...prev]);
          }
        }
      });

      // Check glowing light logs (if 光地金 selected a cell)
      nextState.cells.forEach((cell, idx) => {
        if (cell.isActive && cell.isGlowing && !prevCells[idx].isGlowing) {
          setActionHistory(prev => [`[光地金効果] マス${idx}が光り輝いています！`, ...prev]);
        }
      });

      setActiveSkillId(null);
      setAiSuggestions([]);
    } catch (e: any) {
      alert("推奨実行エラー: " + e.message);
    }
  };

  // Perform "しあげる" (Finish)
  const handleFinish = () => {
    if (!engineRef.current) return;
    const finalState = engineRef.current.finish();
    setForgeState(finalState);
    setActionHistory(prev => [`--- 仕上げ実行: 品質評価 [${finalState.result?.quality}] (誤差合計: ${finalState.result?.totalError}) ---`, ...prev]);
  };

  // Manually update cell values
  const handleCellValueChange = (cellIndex: number, newValue: number) => {
    if (!forgeState || !engineRef.current) return;
    const updatedState = cloneForgeState(forgeState);
    updatedState.cells[cellIndex].currentValue = newValue;

    // Unlock if value is changed from targetValue
    if (updatedState.cells[cellIndex].isLocked && newValue !== updatedState.cells[cellIndex].targetValue) {
      updatedState.cells[cellIndex].isLocked = false;
    }

    setForgeState(updatedState);
    engineRef.current.loadState(updatedState);
    setAiSuggestions([]); // Clear recommendations to prompt recalculation
  };

  // Manually update remaining focus
  const handleFocusChange = (newFocus: number) => {
    if (!forgeState || !engineRef.current) return;
    const updatedState = cloneForgeState(forgeState);
    updatedState.focus = newFocus;
    setForgeState(updatedState);
    engineRef.current.loadState(updatedState);
    setAiSuggestions([]);
  };

  // Manually update turn count
  const handleTurnChange = (newTurn: number) => {
    if (!forgeState || !engineRef.current) return;
    const updatedState = cloneForgeState(forgeState);
    updatedState.turn = newTurn;
    setForgeState(updatedState);
    engineRef.current.loadState(updatedState);
    setAiSuggestions([]);
  };

  // Manually update current temperature
  const handleTemperatureChange = (newTemp: number) => {
    if (!forgeState || !engineRef.current) return;
    const updatedState = cloneForgeState(forgeState);
    updatedState.temperature = newTemp;
    setForgeState(updatedState);
    engineRef.current.loadState(updatedState);
    setAiSuggestions([]);
  };

  // Helper function to clone state
  const cloneForgeState = (state: ForgeState): ForgeState => {
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
  };

  // Helper description of active material characteristics
  const getMaterialDescription = (type: string) => {
    switch (type) {
      case '戻り地金':
        return '戻り地金特性: 温度が200℃の倍数ターン終了時、緑ゲージ外で最も進んでいるマスが 12〜16 戻ります。(ロック箇所は戻りません)';
      case '倍半地金':
        return '倍半地金特性: 温度が400℃の倍数で叩きダメージ2倍。200℃の倍数(400除く)で叩きダメージ半減(端数切上げ)。';
      case '集中変化地金':
        return '集中変化特性: 温度が400℃の倍数で消費集中力半分。200℃の倍数(400除く)で消費集中力1.5倍＆会心率+4倍加算。';
      case '光地金':
        return '光地金特性: 温度が200℃の倍数ターン終了時、ランダムな緑ゲージ外の1箇所が「光るマス」になり、そこを叩くとダメージ2倍＆会心率大幅アップ！';
      default:
        return '通常地金特性: 特殊効果はありません。';
    }
  };

  const getMoveTargetLabel = (actionName: string, targets: number[]) => {
    if (actionName === 'しあげる') return '盤面全体';
    const skill = skills.find(s => s.name === actionName || s.id === actionName);
    if (!skill || skill.targetPattern === 'none' || skill.targetPattern === 'chaos') return '全体';
    if (skill.targetPattern === 'single') return `マス ${targets[0]}`;
    if (skill.targetPattern === 'vertical') return `縦列 (${targets.join(', ')})`;
    if (skill.targetPattern === 'horizontal') return `横列 (${targets.join(', ')})`;
    if (skill.targetPattern === 'diagonal') return `ななめ (${targets.join(', ')})`;
    if (skill.targetPattern === 'quad') return `4連 (${targets.join(', ')})`;
    return `マス ${targets.join(', ')}`;
  };

  const hoveredCellIndices = getHoveredCellIndices();

  return (
    <div className={`min-h-screen bg-[#06070a] text-slate-100 flex flex-col items-center p-4 md:p-8 font-sans ${theme === 'light' ? 'light-theme' : ''}`}>
      {/* Header Banner */}
      <header className="w-full max-w-7xl mb-8 flex flex-col md:flex-row items-center justify-between border-b border-indigo-900/30 pb-5">
        <div className="flex items-center space-x-3 mb-4 md:mb-0">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <span className="font-extrabold text-2xl text-white font-mono">鍛</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-white flex items-center">
              ドラクエ10 鍛冶シミュレーター <span className="ml-3 text-xs bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded-full font-semibold border border-indigo-500/30">Hexagonal Core v2</span>
            </h1>
            {/* Subtitle removed */}
          </div>
        </div>

        {/* Actions Container */}
        <div className="flex items-center space-x-3">
          {/* Info Button */}
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center justify-center h-10.5 w-10.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-350 hover:text-white rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md"
            title="使い方を表示"
          >
            <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center h-10.5 w-10.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md"
            title={theme === 'dark' ? 'ライトテーマに切替' : 'ダークテーマに切替'}
          >
            {theme === 'dark' ? (
              <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Global Reset */}
          <button
            onClick={handleReset}
            className="btn-reset flex items-center space-x-2 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg hover:shadow-indigo-500/15 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer text-sm"
          >
            <span>リセット & 初期化</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Column: Preset Setup */}
        <section className="lg:col-span-3 space-y-6">
          <div className="glass-panel rounded-2xl p-5 shadow-xl">
            <h2 className="text-md font-bold text-white mb-4 border-b border-slate-800 pb-2 tracking-wide flex items-center justify-between">
              <span>鍛冶の前提設定</span>
              <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">Master</span>
            </h2>

            <div className="space-y-4">
              {/* Item Selection */}
              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">作成するアイテム</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 mt-1.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
                >
                  {items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.category} / {item.materialType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Hammer Selection */}
              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">使用するハンマー</label>
                <select
                  value={selectedHammerId}
                  onChange={(e) => setSelectedHammerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 mt-1.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
                >
                  {hammers.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} (集中力: {(levelFocusMap[selectedLevel] || 207) + h.focusBonus})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quality Selection */}
              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">ハンマーのできの良さ</label>
                <div className="flex items-center space-x-2 mt-1.5">
                  {[0, 1, 2, 3].map(stars => (
                    <button
                      key={stars}
                      onClick={() => setSelectedQuality(stars)}
                      className={`flex-1 py-1.5 rounded-lg font-bold text-xs border transition-all duration-150 cursor-pointer ${selectedQuality === stars
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-extrabold shadow shadow-amber-500/20'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-750'
                        }`}
                    >
                      {stars === 0 ? '無印' : '★'.repeat(stars)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Level Selection */}
              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">職人レベル (1〜80)</label>
                <div className="flex items-center space-x-2 mt-1.5">
                  <input
                    type="number"
                    min="1"
                    max="80"
                    value={selectedLevel}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(80, Number(e.target.value) || 80));
                      setSelectedLevel(val);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 mt-1.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 font-semibold font-mono text-center"
                  />
                </div>
              </div>

              {/* Custom Seed */}
              <div>
                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">シード値指定 (任意)</label>
                <input
                  type="text"
                  value={customSeed}
                  onChange={(e) => setCustomSeed(e.target.value)}
                  placeholder="未指定時は自動生成"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 mt-1.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Active Material Description Card */}
          {forgeState && (
            <div className="glass-panel rounded-2xl p-5 shadow-xl relative overflow-hidden border border-indigo-950/60">
              <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 blur-xl rounded-full" />
              <h2 className="text-xs font-bold text-slate-400 mb-2.5 uppercase tracking-wider">現在有効な地金特性</h2>
              <span className="text-sm font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg inline-block mb-3">
                {forgeState.materialType}
              </span>
              <p className="text-xs text-slate-350 leading-relaxed font-medium">
                {getMaterialDescription(forgeState.materialType)}
              </p>
            </div>
          )}
        </section>

        {/* Center Column: Interactive Forge Board */}
        <main className="lg:col-span-6 space-y-6">

          {/* HUD Info Card */}
          {forgeState && (
            <div className="glass-panel rounded-2xl p-5 shadow-xl relative overflow-hidden border border-slate-900">
              <div className="grid grid-cols-4 gap-4 text-center">
                {/* Temp */}
                <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">現在の温度</span>
                  <div className="mt-1 flex items-center justify-center space-x-1">
                    <span className={`h-2 w-2 rounded-full inline-block animate-pulse ${forgeState.temperature >= 1500 ? 'bg-red-500' : forgeState.temperature >= 900 ? 'bg-orange-400' : 'bg-sky-400'
                      }`} />
                    <input
                      type="number"
                      min="0"
                      max="3000"
                      step="50"
                      value={forgeState.temperature}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(3000, Number(e.target.value) || 0));
                        handleTemperatureChange(val);
                      }}
                      className={`w-16 text-center bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none text-xl font-bold font-mono ${forgeState.temperature >= 1500 ? 'text-red-500 text-glow-red' : forgeState.temperature >= 900 ? 'text-orange-400 text-glow-yellow' : 'text-sky-400 text-glow-blue'
                        }`}
                      disabled={forgeState.isDone}
                    />
                    <span className={`text-sm font-semibold font-mono ${forgeState.temperature >= 1500 ? 'text-red-500' : forgeState.temperature >= 900 ? 'text-orange-400' : 'text-sky-400'
                      }`}>℃</span>
                  </div>
                </div>

                {/* Focus */}
                <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 flex flex-col justify-between col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">残り集中力 / 最大集中力</span>
                  <div className="mt-1 flex items-center justify-center space-x-1">
                    <input
                      type="number"
                      value={forgeState.focus}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(forgeState.maxFocus, Number(e.target.value) || 0));
                        handleFocusChange(val);
                      }}
                      className="w-16 text-center bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none text-xl font-extrabold font-mono text-glow-blue text-indigo-400"
                      disabled={forgeState.isDone}
                    />
                    <span className="text-xs text-slate-500 font-mono"> / {forgeState.maxFocus}</span>
                  </div>
                  {/* Slider input container with overlay fill */}
                  <div className="relative w-full h-5 mt-1 flex items-center">
                    {/* Background track & Left-side fill */}
                    <div className="absolute left-[10px] right-[10px] h-1.5 bg-slate-950 border border-slate-850 rounded-full overflow-hidden flex items-center pointer-events-none">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-l-full"
                        style={{ width: `${Math.max(0, Math.min(100, (forgeState.focus / forgeState.maxFocus) * 100))}%` }}
                      />
                    </div>
                    {/* Transparent overlay range input */}
                    <input
                      type="range"
                      min="0"
                      max={forgeState.maxFocus}
                      value={forgeState.focus}
                      onChange={(e) => handleFocusChange(Number(e.target.value) || 0)}
                      className="custom-range-slider absolute inset-0 w-full h-full cursor-pointer focus:outline-none z-10"
                      disabled={forgeState.isDone}
                    />
                  </div>
                </div>

                {/* Turn count */}
                <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">経過ターン</span>
                  <div className="mt-1 flex items-center justify-center space-x-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={forgeState.turn}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                        handleTurnChange(val);
                      }}
                      className={`w-12 text-center bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none text-xl font-bold font-mono text-white ${theme === 'light' ? 'focus:border-indigo-650' : ''}`}
                      disabled={forgeState.isDone}
                    />
                    <span className="text-xs text-slate-500"> ターン</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Smithing Grid Board */}
          {forgeState && (
            <div className="glass-panel-accent rounded-3xl p-6 shadow-2xl relative border border-indigo-900/20">
              <h2 className="text-lg font-bold text-indigo-300 mb-5 flex items-center justify-between border-b border-indigo-950/50 pb-3">
                <span>たたき台 (鍛冶盤面)</span>
                {activeSkill && (
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full border border-amber-500/40 animate-pulse font-medium">
                    とくぎ: {activeSkill.name} (集中力消費: {activeSkill.cost}) を選択中
                  </span>
                )}
              </h2>

              {/* Grid 2x4 (indices 0..7) */}
              <div className="grid grid-cols-2 gap-4 mx-auto w-full max-w-lg">
                {forgeState.cells.map((cell) => {
                  if (!cell.isActive) {
                    // Render empty cell slot placeholder
                    return (
                      <div
                        key={cell.index}
                        className="h-28 rounded-2xl border border-dashed border-slate-900/60 bg-slate-950/20 opacity-20 flex items-center justify-center"
                      >
                        <span className="text-xs font-mono text-slate-700">#{cell.index} (無効)</span>
                      </div>
                    );
                  }

                  // Determine colors and label states based on lock and values
                  let borderClass = 'border-slate-850 hover:border-slate-750 bg-slate-950/55';
                  let textGlowClass = '';
                  let progressStatusLabel = '未到達';

                  if (cell.isLocked) {
                    borderClass = 'border-blue-500 bg-blue-950/25 shadow-lg shadow-blue-500/10 text-glow-blue';
                    textGlowClass = 'text-glow-blue text-blue-400';
                    progressStatusLabel = '会心ロック';
                  } else if (cell.currentValue > cell.maxGreenValue) {
                    borderClass = 'border-rose-500 bg-rose-950/20 shadow-lg shadow-rose-500/10 text-glow-red';
                    textGlowClass = 'text-glow-red text-rose-400';
                    progressStatusLabel = 'オーバー';
                  } else if (cell.currentValue >= cell.minGreenValue && cell.currentValue <= cell.maxGreenValue) {
                    borderClass = 'border-emerald-500 bg-emerald-950/25 shadow-lg shadow-emerald-500/10 text-glow-green';
                    textGlowClass = 'text-glow-green text-emerald-400';
                    progressStatusLabel = '成功ゾーン';
                  } else if (cell.currentValue > 0) {
                    borderClass = 'border-amber-600 bg-amber-950/15';
                    textGlowClass = 'text-amber-500';
                    progressStatusLabel = '叩き中';
                  }

                  // Handle light glowing spot
                  if (cell.isGlowing) {
                    borderClass += ' border-amber-400 bg-amber-950/35 ring-2 ring-amber-400/40 animate-pulse';
                  }

                  // Interactive handlers
                  const isHovered = hoveredCellIndices.includes(cell.index);

                  let isInteractable = activeSkill && !forgeState.isDone;
                  if (isInteractable && activeSkill) {
                    // Check if the cell can be targeted by this skill based on shape layout
                    if (activeSkill.targetPattern === 'vertical') {
                      const start = cell.index < 6 ? cell.index : cell.index - 2;
                      const c1 = forgeState.cells[start];
                      const c2 = forgeState.cells[start + 2];
                      isInteractable = !!(c1?.isActive || c2?.isActive);
                    } else if (activeSkill.targetPattern === 'horizontal') {
                      const start = Math.min(Math.floor(cell.index / 2), 3) * 2;
                      const c1 = forgeState.cells[start];
                      const c2 = forgeState.cells[start + 1];
                      isInteractable = !!(c1?.isActive || c2?.isActive);
                    } else if (activeSkill.targetPattern === 'diagonal') {
                      const start = Math.min(Math.floor(cell.index / 2), 2) * 2;
                      const c1 = forgeState.cells[start + 1];
                      const c2 = forgeState.cells[start + 2];
                      isInteractable = !!(c1?.isActive || c2?.isActive);
                    } else if (activeSkill.targetPattern === 'quad') {
                      const start = Math.min(Math.floor(cell.index / 2), 2) * 2;
                      const indices = [start, start + 1, start + 2, start + 3];
                      const activeCount = indices.filter(idx => forgeState.cells[idx]?.isActive).length;
                      isInteractable = activeCount >= 1;
                    }
                  }

                  // Find damage number matching this cell
                  const currentDamage = floatingDamages.find(d => d.cellIndex === cell.index);

                  return (
                    <div
                      key={cell.index}
                      onMouseEnter={() => isInteractable && setHoveredCellIndex(cell.index)}
                      onMouseLeave={() => isInteractable && setHoveredCellIndex(null)}
                      onClick={() => isInteractable && handleCellInteraction(cell.index)}
                      className={`relative rounded-2xl border p-4.5 transition-all duration-200 text-center flex flex-col justify-between select-none ${borderClass} ${isHovered ? 'ring-4 ring-indigo-500/40 bg-indigo-950/20 scale-[1.02]' : ''
                        } ${isInteractable ? 'cursor-pointer hover:border-indigo-500' : ''}`}
                    >
                      {/* Floating damage numbers */}
                      {currentDamage && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                          <span className={`text-3xl font-extrabold font-mono animate-float-damage ${currentDamage.isCrit ? 'text-amber-400 text-glow-yellow' : 'text-white'
                            }`}>
                            {currentDamage.isCrit ? '🔥会心! ' : ''}{currentDamage.amount}
                          </span>
                        </div>
                      )}

                      {/* Header row */}
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800/80 text-[10px]">#{cell.index}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{progressStatusLabel}</span>
                      </div>

                      {/* Values rendering */}
                      <div className="my-3 flex flex-col items-center">
                        <input
                          type="number"
                          value={cell.currentValue}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(350, Number(e.target.value) || 0));
                            handleCellValueChange(cell.index, val);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`w-24 text-center bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none text-3xl font-extrabold font-mono ${textGlowClass || 'text-white'} ${theme === 'light' ? 'focus:border-indigo-600' : ''}`}
                          disabled={forgeState.isDone}
                        />
                        <div className="text-[10px] text-slate-500 mt-1 font-semibold">
                          目標: <span className="font-mono">{cell.minGreenValue}</span> ~ <span className="font-mono">{cell.maxGreenValue}</span>
                        </div>
                      </div>

                      {/* Green success zone slider bar */}
                      <div className="w-full bg-slate-950 h-2.5 rounded-full border border-slate-900 relative overflow-hidden">
                        {/* Success range indicator */}
                        <div
                          className="absolute h-full bg-emerald-500/20 border-l border-r border-emerald-500/45"
                          style={{
                            left: `${(cell.minGreenValue / 300) * 100}%`,
                            width: `${((cell.maxGreenValue - cell.minGreenValue) / 300) * 100}%`
                          }}
                        />
                        {/* Current progress pointer bar */}
                        <div
                          className={`absolute top-0 h-full rounded-full transition-all duration-300 ${cell.isLocked
                            ? 'bg-blue-400 shadow shadow-blue-500'
                            : cell.currentValue > cell.maxGreenValue
                              ? 'bg-rose-500'
                              : cell.currentValue >= cell.minGreenValue
                                ? 'bg-emerald-400 shadow shadow-emerald-500/50'
                                : 'bg-amber-500'
                            }`}
                          style={{ width: `${Math.min(100, (cell.currentValue / 300) * 100)}%` }}
                        />
                      </div>

                      {/* Glow Indicator badge */}
                      {cell.isGlowing && (
                        <div className="absolute -top-1.5 -left-1.5 bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider shadow animate-pulse border border-amber-300">
                          🌟 光る
                        </div>
                      )}

                      {/* Critical Lock Indicator */}
                      {cell.isLocked && (
                        <div className="absolute top-2.5 right-2.5 text-blue-400 drop-shadow">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Finish block OR Global Action Apply (when targetPattern === 'none') */}
              {activeSkill && activeSkill.targetPattern === 'none' && !forgeState.isDone && (
                <div className="mt-5 flex justify-center">
                  <button
                    onClick={handleGlobalInteraction}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-10 rounded-xl shadow-lg hover:shadow-amber-500/25 transition-all cursor-pointer text-sm tracking-wide"
                  >
                    【{activeSkill.name}】を発動する
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Log History */}
          <div className="glass-panel rounded-2xl p-5 shadow-xl max-h-56 overflow-y-auto">
            <h2 className="text-[11px] font-bold text-slate-400 mb-3.5 uppercase tracking-wider border-b border-slate-800 pb-1.5">行動ログ履歴</h2>
            <div className="space-y-1.5">
              {actionHistory.length === 0 ? (
                <p className="text-xs text-slate-600 italic">行動ログはありません</p>
              ) : (
                actionHistory.map((log, i) => (
                  <p key={i} className="text-xs font-mono text-slate-350 bg-slate-950/30 p-2 rounded-lg border border-slate-900/50">
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>
        </main>

        {/* Right Column: Skills list & AI recommendations */}
        <section className="lg:col-span-3 space-y-6">

          {/* Finish Game Panel (Celebration quality screen) */}
          {forgeState && (
            <div className="glass-panel rounded-2xl p-5 shadow-xl">
              <h2 className="text-md font-bold text-white mb-4 border-b border-slate-800 pb-2 tracking-wide">鍛冶の仕上げ</h2>

              {!forgeState.isDone ? (
                <button
                  onClick={handleFinish}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-emerald-500/15 transition-all text-sm tracking-wide cursor-pointer hover:scale-[1.01]"
                >
                  「しあげる」を実行
                </button>
              ) : (
                <div className="bg-slate-950/60 p-4 rounded-xl border border-emerald-500/25 text-center">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">評価結果</span>
                  <div className="text-3xl font-extrabold text-white mt-1 text-glow-green animate-bounce">
                    {forgeState.result?.quality}
                  </div>
                  <div className="text-xs text-slate-400 mt-2 font-semibold">
                    最終総誤差: <span className="font-mono text-indigo-400">{forgeState.result?.totalError}</span>
                  </div>
                  <button
                    onClick={handleReset}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold py-2 mt-4 rounded-lg hover:bg-slate-850 hover:text-white transition-all cursor-pointer"
                  >
                    もう一度つくる
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Skill List Box */}
          {forgeState && (
            <div className="glass-panel rounded-2xl p-5 shadow-xl">
              <h2 className="text-md font-bold text-white mb-4 border-b border-slate-800 pb-2 tracking-wide">とくぎ一覧</h2>
              <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                {skills.map(skill => {
                  const isSelected = activeSkillId === skill.id;

                  // Compute dynamic cost under material changes
                  let cost = skill.cost;
                  if (forgeState.materialType === '集中変化地金') {
                    if (forgeState.temperature % 400 === 0) {
                      cost = Math.floor(cost * 0.5);
                    } else if (forgeState.temperature % 200 === 0) {
                      cost = Math.floor(cost * 1.5);
                    }
                  }

                  const hasLevel = (forgeState.characterLevel || 80) >= skill.level;
                  const canAfford = forgeState.focus >= cost;
                  const isDisabled = forgeState.isDone || !canAfford || !hasLevel;

                  return (
                    <button
                      key={skill.id}
                      disabled={isDisabled}
                      onClick={() => setActiveSkillId(isSelected ? null : skill.id)}
                      className={`p-2.5 rounded-xl flex flex-col justify-between text-left border h-20 transition-all duration-150 cursor-pointer ${isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold shadow-lg shadow-amber-500/10'
                        : isDisabled
                          ? 'bg-slate-950/60 border-slate-950 text-slate-600 opacity-35 cursor-not-allowed'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-750 text-slate-200'
                        }`}
                    >
                      <span className="text-xs font-bold truncate">{skill.name}</span>
                      <span className={`text-[9px] font-mono font-semibold mt-1 inline-block ${isSelected ? 'text-slate-950' : hasLevel ? 'text-indigo-400' : 'text-rose-500/80'}`}>
                        {hasLevel ? `${cost} 集中力` : `Lv.${skill.level}修得`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Advisor Panel */}
          {forgeState && (
            <div className="glass-panel rounded-2xl p-5 shadow-xl relative overflow-hidden border border-indigo-900/20">
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-indigo-500/5 rounded-full blur-2xl" />
              <h2 className="text-md font-bold text-white mb-4 border-b border-slate-800 pb-2 flex items-center justify-between">
                <span className="flex items-center">
                  <svg className="w-5 h-5 mr-1.5 text-indigo-400 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                  </svg>
                  AIアドバイザー
                </span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded font-bold font-mono">MCTS</span>
              </h2>

              <button
                onClick={triggerAiAdvisor}
                disabled={isSearching || forgeState.isDone}
                className="w-full bg-gradient-to-r from-indigo-650 to-violet-650 hover:from-indigo-600 hover:to-violet-650 disabled:from-slate-850 disabled:to-slate-850 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg hover:shadow-indigo-500/15 transition-all duration-200 flex items-center justify-center space-x-2 text-xs cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              >
                {isSearching ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>思考中 ({searchProgress}%)</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
                    </svg>
                    <span>最善手ルートを探索</span>
                  </>
                )}
              </button>

              <div className="mt-4 space-y-3.5">
                {isSearching && (
                  <div className="text-center py-6 text-[10px] text-slate-500 font-medium">
                    <p className="animate-pulse">{searchMessage}</p>
                  </div>
                )}

                {!isSearching && aiSuggestions.length === 0 && (
                  <p className="text-center py-4 text-[10px] text-slate-500 leading-normal font-medium">
                    探索ボタンを押すと、大成功確率を高める上位3つの推奨手がここに表示されます。
                  </p>
                )}

                {!isSearching && aiSuggestions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">推奨アクション TOP3</h3>

                    {aiSuggestions.map((rec, i) => {
                      const label = getMoveTargetLabel(rec.move.actionName, rec.move.targets);

                      return (
                        <div
                          key={i}
                          onClick={() => applyAiRecommendation(rec.move)}
                          className="bg-slate-950 border border-slate-900 hover:border-slate-800/80 p-3 rounded-xl flex flex-col transition-all cursor-pointer hover:scale-[1.01]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] bg-indigo-500/10 text-indigo-400 font-mono px-2 py-0.5 rounded font-bold">
                              案 {i + 1}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">期待値: {rec.expectedScore.toFixed(0)}</span>
                          </div>

                          <div className="font-bold text-white text-xs mt-1.5 flex items-center justify-between">
                            <span>{rec.move.actionName}</span>
                            <span className="text-[10px] text-slate-450 font-medium">{label}</span>
                          </div>

                          {/* Probabilities progress */}
                          <div className="mt-2.5 space-y-1.5">
                            <div>
                              <div className="flex justify-between text-[9px] text-slate-500">
                                <span>成功率</span>
                                <span className="font-mono text-emerald-400">{(rec.successRate * 100).toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-slate-900 h-1 rounded overflow-hidden">
                                <div
                                  className="bg-emerald-400 h-full rounded"
                                  style={{ width: `${rec.successRate * 100}%` }}
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[9px] text-slate-500">
                                <span>大成功率</span>
                                <span className="font-mono text-indigo-400">{(rec.greatSuccessRate * 100).toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-slate-900 h-1 overflow-hidden">
                                <div
                                  className="bg-indigo-550 h-full rounded"
                                  style={{ width: `${rec.greatSuccessRate * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <span className="text-[9px] text-indigo-400/80 hover:text-white transition-all text-right mt-2 font-bold uppercase tracking-wider">
                            クリックでこの手を実行 ➔
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

      </div>

      {/* Footer */}
      <footer className="w-full max-w-7xl mt-12 border-t border-slate-900 pt-6 text-center text-xs text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-center md:text-left">
          <p>© 2026 DQXTool Smithing Simulator. Powered by Hexagonal Architecture Core engine.</p>
          <p className="text-[11px] text-slate-600 mt-1">"DRAGON QUEST X / ドラゴンクエスト10" is copyrighted by ARMOR PROJECT/BIRD STUDIO/SQUARE ENIX. All rights reserved.</p>
        </div>
        <div className="flex space-x-4">
          <span className="text-[10px] text-indigo-400/60 font-semibold bg-indigo-500/5 px-2 py-1 rounded">CLIENT-SIDE SECURE</span>
        </div>
      </footer>

      {/* Floating Modal Help Window */}
      {showHelp && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-panel rounded-3xl p-6 md:p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-indigo-550/20 relative animate-fade-in">
            {/* Close Button */}
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-all cursor-pointer h-8 w-8 rounded-full bg-slate-900/60 flex items-center justify-center border border-slate-800 hover:border-slate-750"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Help Content */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">シミュレーターの使い方</h3>
              </div>

              <div className="space-y-4 text-sm text-slate-300 leading-relaxed font-medium">
                <div>
                  <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider mb-1">1. 前提設定と初期化</h4>
                  <p>左パネルで作成したい「アイテム」と使用する「ハンマー」、「できの良さ（★0〜3）」、「職人レベル」を設定し、右上の<strong>「リセット & 初期化」</strong>を押してシミュレーションを開始します（任意のシード値を入力して、同じ乱数盤面を再現することも可能です）。</p>
                </div>

                <div>
                  <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider mb-1">2. 数値の直接編集 (手動調整)</h4>
                  <p>現在の「温度」「残り集中力」「経過ターン」、および「盤面の各セルの数値」を<strong>直接クリックしてキーボードで数値を書き換え</strong>られます。また、残り集中力はスライダーをドラッグすることでも変更できます。</p>
                </div>

                <div>
                  <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider mb-1">3. とくぎの使用</h4>
                  <p>右の「とくぎ一覧」から使用したい特技を選び、アクティブにします。その後、盤面で狙いたいマスをクリックすると特技が発動します（ななめ打ち・4連打ちなどの範囲攻撃は、対象となるマスのいずれかをクリックすることで適用されます）。</p>
                </div>

                <div>
                  <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider mb-1">4. AIアドバイザー（最善手探索）</h4>
                  <p>「最善手ルートを探索」ボタンを押すと、AIが高速にシミュレーションを実行し、★3（大成功）となる確率を高める上位3つの候補手を提案します。<strong>提案されたカードをクリックするだけで、その手を実行できます。</strong></p>
                </div>

                <div>
                  <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider mb-1">5. 仕上げ</h4>
                  <p>各マスの数値を緑ゲージ内に収めたら、右パネルの<strong>「しあげるを実行」</strong>ボタンを押します。最終誤差の合計値から、作成できた品質評価（★0〜★3）が表示されます。</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowHelp(false)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all cursor-pointer text-xs shadow-lg hover:shadow-indigo-500/20"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
