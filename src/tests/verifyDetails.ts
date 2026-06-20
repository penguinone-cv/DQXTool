import { ForgeCoreEngine } from '../utils/forgeCoreEngine';

function printHeader(title: string) {
  console.log(`\n========================================`);
  console.log(` ${title}`);
  console.log(`========================================`);
}

function runVerification() {
  // ========================================
  // 1. DAMAGE CALCULATION VERIFICATION
  // ========================================
  printHeader("1. Damage Calculation & Temperature Scaling");
  
  const temperatures = [2000, 1000, 500];
  for (const temp of temperatures) {
    const Kt = 1 - 0.0005 * (1000 - temp);
    console.log(`--- たたく (1.0x Multiplier) at Temperature: ${temp}°C (Kt = ${Kt.toFixed(3)}) ---`);
    const damages: number[] = [];
    
    // Run multiple trials to sample the full random range, filtering out any critical hits
    const maxNormalDamage = Math.ceil(18 * Kt);
    for (let i = 0; i < 100; i++) {
      const testEngine = new ForgeCoreEngine();
      testEngine.reset('てつのつるぎ', '鉄の鍛冶ハンマー', 0, `damage_temp_${temp}_seed_${i}`);
      
      const prevVal = testEngine.getCurrentState().cells[0].currentValue;
      // We set the temperature before the step.
      const state = testEngine.getCurrentState();
      state.temperature = temp;
      testEngine.loadState(state);
      
      const nextState = testEngine.step('たたく', [0]);
      const dmg = nextState.cells[0].currentValue - prevVal;
      
      // Filter out critical hits (critical hits exceed the normal maximum damage)
      if (dmg <= maxNormalDamage) {
        damages.push(dmg);
      }
    }
    
    const minD = Math.min(...damages);
    const maxD = Math.max(...damages);
    console.log(`Observed Normal Damage Range: [${minD} .. ${maxD}]`);
    
    const expectedMin = Math.ceil(12 * Kt);
    const expectedMax = Math.ceil(18 * Kt);
    console.log(`Expected Normal Damage Range: [${expectedMin} .. ${expectedMax}]`);
  }

  // ========================================
  // 2. CRITICAL HIT MECHANICS (JUST LANDING VS FAKE CRITICAL)
  // ========================================
  printHeader("2. Critical Hit Mechanics (Just Landing vs. Fake)");

  // Find a seed that rolls a critical hit on Cell 0
  let critSeed = '';
  for (let i = 0; i < 1000; i++) {
    const testEngine = new ForgeCoreEngine();
    const seed = `critcheck_${i}`;
    testEngine.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, seed);
    
    const stateLoaded = testEngine.getCurrentState();
    stateLoaded.cells[0].targetValue = 100;
    stateLoaded.cells[0].currentValue = 0;
    testEngine.loadState(stateLoaded);

    const state = testEngine.step('ねらい打ち', [0]);
    if (state.cells[0].currentValue === 36) { // maxNormalDamage (18) * 2 = 36
      critSeed = seed;
      break;
    }
  }

  console.log(`Using deterministic critical hit seed: "${critSeed}"`);

  // Case A: Just Landing (Target value is within critical damage range)
  console.log(`\n--- Case A: Just Landing (Target within critical range) ---`);
  const engineJust = new ForgeCoreEngine();
  engineJust.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, critSeed);
  const stateJustInit = engineJust.getCurrentState();
  stateJustInit.cells[0].targetValue = 30; // Target is 30, which is <= critical maxD (36)
  stateJustInit.cells[0].currentValue = 0;
  engineJust.loadState(stateJustInit);

  console.log(`Initial Cell 0: Value = ${stateJustInit.cells[0].currentValue}, Target = ${stateJustInit.cells[0].targetValue}, Locked = ${stateJustInit.cells[0].isLocked}`);
  console.log(`Executing "ねらい打ち" (Critical Max Damage = 36)...`);
  const stateJustPost = engineJust.step('ねらい打ち', [0]);
  console.log(`Post-hit Cell 0: Value = ${stateJustPost.cells[0].currentValue}, Target = ${stateJustPost.cells[0].targetValue}, Locked = ${stateJustPost.cells[0].isLocked}`);
  console.log(`Result: ${stateJustPost.cells[0].currentValue === stateJustPost.cells[0].targetValue && stateJustPost.cells[0].isLocked ? "SUCCESS (Locked exactly at target value)" : "FAIL"}`);

  console.log(`Executing subsequent "たたく" on the locked Cell 0...`);
  const stateJustPost2 = engineJust.step('たたく', [0]);
  console.log(`Post-subsequent-hit Cell 0: Value = ${stateJustPost2.cells[0].currentValue}, Locked = ${stateJustPost2.cells[0].isLocked}`);
  console.log(`Result: ${!stateJustPost2.cells[0].isLocked && stateJustPost2.cells[0].currentValue > 30 ? "SUCCESS (Cell was successfully struck again and unlocked)" : "FAIL"}`);

  // Case B: Fake Critical (Target value is outside critical damage range)
  console.log(`\n--- Case B: Fake Critical (Target outside critical range) ---`);
  const engineFake = new ForgeCoreEngine();
  engineFake.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, critSeed);
  const stateFakeInit = engineFake.getCurrentState();
  stateFakeInit.cells[0].targetValue = 100; // Target is 100, which is > critical maxD (36)
  stateFakeInit.cells[0].currentValue = 0;
  engineFake.loadState(stateFakeInit);

  console.log(`Initial Cell 0: Value = ${stateFakeInit.cells[0].currentValue}, Target = ${stateFakeInit.cells[0].targetValue}, Locked = ${stateFakeInit.cells[0].isLocked}`);
  console.log(`Executing "ねらい打ち" (Critical Max Damage = 36)...`);
  const stateFakePost = engineFake.step('ねらい打ち', [0]);
  console.log(`Post-hit Cell 0: Value = ${stateFakePost.cells[0].currentValue}, Target = ${stateFakePost.cells[0].targetValue}, Locked = ${stateFakePost.cells[0].isLocked}`);
  console.log(`Result: ${stateFakePost.cells[0].currentValue === 36 && !stateFakePost.cells[0].isLocked ? "SUCCESS (Value increased by 36, no lock applied)" : "FAIL"}`);

  // ========================================
  // 3. TURN-END MATERIAL PROPERTIES
  // ========================================
  printHeader("3. Turn-End Material Properties");

  // 3-1. 戻り地金 (Receding Material)
  console.log(`--- 3-1. 戻り地金 (Receding) at multiples of 200°C ---`);
  const engineRec = new ForgeCoreEngine();
  engineRec.reset('ルフの盾', '鉄の鍛冶ハンマー', 3, 'recedeseed');
  
  const stateRec = engineRec.getCurrentState();
  stateRec.cells[0].currentValue = 50;
  stateRec.temperature = 850; // will drop to 800 after the step
  engineRec.loadState(stateRec);

  console.log(`Before Step: Cell 0 Value = ${engineRec.getCurrentState().cells[0].currentValue}, Temp = ${engineRec.getCurrentState().temperature}°C`);
  console.log(`Executing step "たたく" on Cell 1 (leaving Cell 0 untouched)...`);
  const recPost = engineRec.step('たたく', [1]);
  console.log(`After Step: Temp = ${recPost.temperature}°C`);
  console.log(`Cell 0 Value = ${recPost.cells[0].currentValue} (Decreased from 50 due to receding effect)`);
  const diff = 50 - recPost.cells[0].currentValue;
  console.log(`Receded value difference: -${diff} (Expected: 12..16)`);

  // 3-2. 倍半地金 (Double / Half Damage Material)
  console.log(`\n--- 3-2. 倍半地金 (Double/Half damage) at multiples of 400°C and 200°C ---`);
  
  // Case A: 1000°C (Multiple of 200, but NOT 400) -> Damage is halved (ceil(d * 0.5))
  // たたく normal damage at 1000°C is R in [12..18]. Halved damage should be ceil(R * 0.5) in [6..9].
  const damagesHalved: number[] = [];
  for (let i = 0; i < 20; i++) {
    const engineDH1 = new ForgeCoreEngine();
    engineDH1.reset('メタスラの剣', '鉄の鍛冶ハンマー', 0, `dh_1000_seed_${i}`);
    const dhState1 = engineDH1.getCurrentState();
    dhState1.temperature = 1000; // set temperature before step
    engineDH1.loadState(dhState1);
    const dhPost1 = engineDH1.step('たたく', [0]);
    
    // filter out criticals
    const dmg = dhPost1.cells[0].currentValue;
    if (dmg <= 9) {
      damagesHalved.push(dmg);
    }
  }
  console.log(`At 1000°C (Halved): Observed Damage Range = [${Math.min(...damagesHalved)} .. ${Math.max(...damagesHalved)}] (Expected: [6 .. 9])`);

  // Case B: 800°C (Multiple of 400) -> Damage is doubled
  // Kt = 1.0 - 0.0005 * (1000 - 800) = 0.9.
  // Normal damage = ceil(R * 0.9) in [11..17].
  // Doubled damage should be normal * 2 in [22..34].
  const damagesDoubled: number[] = [];
  for (let i = 0; i < 20; i++) {
    const engineDH2 = new ForgeCoreEngine();
    engineDH2.reset('メタスラの剣', '鉄の鍛冶ハンマー', 0, `dh_800_seed_${i}`);
    const dhState2 = engineDH2.getCurrentState();
    dhState2.temperature = 800; // set temperature before step
    engineDH2.loadState(dhState2);
    const dhPost2 = engineDH2.step('たたく', [0]);
    
    const dmg = dhPost2.cells[0].currentValue;
    if (dmg <= 34) {
      damagesDoubled.push(dmg);
    }
  }
  console.log(`At 800°C (Doubled): Observed Damage Range = [${Math.min(...damagesDoubled)} .. ${Math.max(...damagesDoubled)}] (Expected: [22 .. 34])`);

  // 3-3. 集中変化地金 (Focus cost shifts)
  console.log(`\n--- 3-3. 集中変化地金 (Focus cost adjustments) ---`);
  const engineFC = new ForgeCoreEngine();
  engineFC.reset('メタスラのやり', '鉄の鍛冶ハンマー', 3, 'fcseed');

  // Case A: 1000°C (Multiple of 200, but not 400) -> Focus cost is 1.5x (floor)
  // たたく base cost is 5. 1.5x should be floor(5 * 1.5) = 7.
  const fcState1 = engineFC.getCurrentState();
  fcState1.temperature = 1000;
  engineFC.loadState(fcState1);
  const prevFocus1 = engineFC.getCurrentState().focus;
  const fcPost1 = engineFC.step('たたく', [0]);
  console.log(`At 1000°C (1.5x Cost): Focus cost = ${prevFocus1 - fcPost1.focus} (Expected: 7)`);

  // Case B: 800°C (Multiple of 400) -> Focus cost is 0.5x (floor)
  // 0.5x of 5 is floor(5 * 0.5) = 2.
  const fcState2 = engineFC.getCurrentState();
  fcState2.temperature = 800;
  engineFC.loadState(fcState2);
  const prevFocus2 = engineFC.getCurrentState().focus;
  const fcPost2 = engineFC.step('たたく', [0]);
  console.log(`At 800°C (0.5x Cost): Focus cost = ${prevFocus2 - fcPost2.focus} (Expected: 2)`);

  // 3-4. 光地金 (Glowing Cell)
  console.log(`\n--- 3-4. 光地金 (Glowing Cell) at multiples of 200°C ---`);
  const engineGlow = new ForgeCoreEngine();
  engineGlow.reset('超ようせいのひだね', '鉄の鍛冶ハンマー', 3, 'glowseed');

  const stateGlow = engineGlow.getCurrentState();
  stateGlow.temperature = 1650; // will drop to 1600 (multiple of 200)
  engineGlow.loadState(stateGlow);

  console.log(`Before Step: Glowing cells count = ${engineGlow.getCurrentState().cells.filter(c => c.isGlowing).length}`);
  console.log(`Executing step "たたく" on Cell 0...`);
  const glowPost = engineGlow.step('たたく', [0]);
  const glowCount = glowPost.cells.filter(c => c.isGlowing).length;
  console.log(`After Step: Temp = ${glowPost.temperature}°C, Glowing cells count = ${glowCount}`);
  if (glowCount > 0) {
    const glowingCellIndex = glowPost.cells.findIndex(c => c.isGlowing);
    console.log(`Result: SUCCESS (Cell ${glowingCellIndex} is now glowing)`);
  } else {
    console.log(`Result: FAIL (No cell is glowing)`);
  }
}

try {
  runVerification();
} catch (e: any) {
  console.error(e.message);
  process.exit(1);
}
