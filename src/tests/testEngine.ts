import { ForgeCoreEngine } from '../utils/forgeCoreEngine';

function assertEquals(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}. Expected ${expected}, got ${actual}`);
  }
  console.log(`PASS: ${message}`);
}

function assertInRange(val: number, min: number, max: number, message: string) {
  if (val < min || val > max) {
    throw new Error(`FAIL: ${message}. Expected value in [${min}, ${max}], got ${val}`);
  }
  console.log(`PASS: ${message}`);
}

function runTests() {
  console.log('--- Starting ForgeCoreEngine Automated Tests ---');

  // Test 1: Reset with a specific seed and verify cell targetValues are deterministic
  const engine = new ForgeCoreEngine();
  const seed1 = 'testseed123';
  const state1 = engine.reset('てつのつるぎ', '鉄の鍛冶ハンマー', 3, seed1);

  assertEquals(state1.temperature, 1000, 'Initial temperature should be 1000');
  assertEquals(state1.focus, 217, 'Initial focus for Iron Hammer should be 217');
  assertEquals(state1.turn, 1, 'Initial turn should be 1');
  assertEquals(state1.cells.length, 8, 'Board size should be 8');

  // Check active cell layout for てつのつるぎ (0, 2, 4)
  assertEquals(state1.cells[0].isActive, true, 'Cell 0 should be active');
  assertEquals(state1.cells[1].isActive, false, 'Cell 1 should be inactive');
  assertEquals(state1.cells[2].isActive, true, 'Cell 2 should be active');
  assertEquals(state1.cells[3].isActive, false, 'Cell 3 should be inactive');
  assertEquals(state1.cells[4].isActive, true, 'Cell 4 should be active');

  // Confirm target values inside range for てつのつるぎ
  assertInRange(state1.cells[0].targetValue, 45, 55, 'Cell 0 target value');
  assertInRange(state1.cells[2].targetValue, 50, 62, 'Cell 2 target value');
  assertInRange(state1.cells[4].targetValue, 40, 48, 'Cell 4 target value');

  // Confirm seed reproducibility
  const engineCopy = new ForgeCoreEngine();
  const stateCopy = engineCopy.reset('てつのつるぎ', '鉄の鍛冶ハンマー', 3, seed1);
  assertEquals(stateCopy.cells[0].targetValue, state1.cells[0].targetValue, 'Seed reproduction cell 0');
  assertEquals(stateCopy.cells[2].targetValue, state1.cells[2].targetValue, 'Seed reproduction cell 2');
  assertEquals(stateCopy.cells[4].targetValue, state1.cells[4].targetValue, 'Seed reproduction cell 4');


  // Test 2: Standard Strike and Pattern B damage formula at 1000°C
  // Temperature Kt = 1 - 0.0005 * (1000 - 1000) = 1.0.
  // たたく multiplier = 1.0 (Pattern B: d = ceil(ceil(R * 1.0) * 1.0) = R).
  // R in [12..18].
  // Let's run step('たたく', [0]) and verify value increases by R.
  const state2 = engine.step('たたく', [0]);
  assertEquals(state2.turn, 2, 'Turn increases to 2');
  assertEquals(state2.temperature, 950, 'Temperature decreases by 50 to 950');
  assertEquals(state2.focus, 212, 'Focus decreases by 5 to 212');
  assertInRange(state2.cells[0].currentValue, 12, 18, 'Damage from standard hit');


  // Test 3: Temperature drop exception (火力上げ)
  // 火力上げ increases temperature by 300°C, cost is 10.
  // Next temp should be 950 + 300 = 1250°C.
  const state3 = engine.step('火力上げ', []);
  assertEquals(state3.temperature, 1250, 'Temperature increases by 300');
  assertEquals(state3.turn, 3, 'Turn increases to 3');
  assertEquals(state3.focus, 202, 'Focus decreases by 10 to 202');


  // Test 4: Pattern A damage calculation (ななめ打ち)
  // We use ルフの盾 (active: [0, 1, 2, 3]) which supports diagonal strike.
  const engineDiag = new ForgeCoreEngine();
  engineDiag.reset('ルフの盾', '鉄の鍛冶ハンマー', 3, 'diagseed');
  
  // Set temperature to 1255°C (so it drops to 1205°C, avoiding turn-end receding).
  // Kt = 1 - 0.0005 * (1000 - 1255) = 1.1275.
  const diagState = engineDiag.getCurrentState();
  diagState.temperature = 1255;
  engineDiag.loadState(diagState);

  const prevCell1 = diagState.cells[1].currentValue;
  const prevCell2 = diagState.cells[2].currentValue;

  const state4 = engineDiag.step('ななめ打ち', [0]); // strikes 1 and 2
  const diff1 = state4.cells[1].currentValue - prevCell1;
  const diff2 = state4.cells[2].currentValue - prevCell2;

  // Verify diff is computed via Pattern A formula: d = ceil(floor(R * 1.2 + 1) * 1.125)
  // R in [12..18].
  // R=12: ceil(floor(15.4) * 1.125) = ceil(15 * 1.125) = ceil(16.875) = 17.
  // R=18: ceil(floor(22.6) * 1.125) = ceil(22 * 1.125) = ceil(24.75) = 25.
  assertInRange(diff1, 17, 25, 'Pattern A damage on Cell 1 with Kt=1.125');
  assertInRange(diff2, 17, 25, 'Pattern A damage on Cell 2 with Kt=1.125');


  // Test 5: 倍半地金 Material Type
  // Let's load はやぶさの剣改 (倍半地金, active indices [0, 2, 4])
  const engineDoubleHalf = new ForgeCoreEngine();
  // We use a fixed seed to control rolls or test properties
  engineDoubleHalf.reset('はやぶさの剣改', '鉄の鍛冶ハンマー', 3, 'doublehalfseed');

  // Let's verify start temp = 1000°C (multiple of 200, but not 400).
  // Under 倍半地金, at 1000°C: damage is half (ceil(d * 0.5)).
  // Multiplier forたたく = 1.0 (Pattern B). Kt = 1.0. Normal damage = R in [12..18].
  // Half damage should be ceil(R * 0.5) in [6..9].
  const dhState1 = engineDoubleHalf.step('たたく', [0]);
  assertInRange(dhState1.cells[0].currentValue, 6, 9, 'Half damage at 1000°C');
  assertEquals(dhState1.temperature, 950, 'Temp is 950°C');

  // Cool down by 150°C using 熱風おろし to reach 800°C (multiple of 400).
  const dhState2 = engineDoubleHalf.step('熱風おろし', [0]);
  assertEquals(dhState2.temperature, 800, 'Temp reaches 800°C');

  // At 800°C (multiple of 400): damage is doubled (d * 2).
  // Kt = 1 - 0.0005 * (1000 - 800) = 0.9.
  // Multiplier forたたく = 1.0. Normal damage = ceil(R * Kt) = ceil(R * 0.9).
  // R=12: ceil(10.8) = 11. Doubled = 22.
  // R=18: ceil(16.2) = 17. Doubled = 34.
  const prevCell2Val = dhState2.cells[2].currentValue;
  const dhState3 = engineDoubleHalf.step('たたく', [2]);
  const diffVal = dhState3.cells[2].currentValue - prevCell2Val;
  assertInRange(diffVal, 22, 34, 'Double damage at 800°C');


  // Let's load メタスラの盾 (集中変化地金, size 4: [0, 1, 2, 3])
  const engineFocusChange = new ForgeCoreEngine();
  const fcState0 = engineFocusChange.reset('メタスラの盾', '超鍛冶ハンマー', 3, 'focusseed');

  // Temp is 1000°C. 1000 is multiple of 200, not 400.
  // Cost should be 1.5x (floor): たたく base cost 5 -> floor(5 * 1.5) = 7.
  const prevFocus = fcState0.focus;
  const fcState1 = engineFocusChange.step('たたく', [0]);
  assertEquals(prevFocus - fcState1.focus, 7, 'Skill cost is 1.5x at 1000°C');

  // Cool down to 800°C (multiple of 400).
  engineFocusChange.step('火力上げ', []); // 1000 -> 1300
  engineFocusChange.step('冷やし込み', []); // 1300 -> 1000
  engineFocusChange.step('冷やし込み', []); // 1000 -> 700
  // Heat up using たたく turns to reach 600 then 800.
  // We can just set the state temperature directly to test!
  const stateToLoad = engineFocusChange.getCurrentState();
  stateToLoad.temperature = 800; // Force temp to 800°C (multiple of 400)
  engineFocusChange.loadState(stateToLoad);

  // At 800°C: skill cost is 0.5x (floor): たたく base 5 -> floor(5 * 0.5) = 2.
  const fcStateTemp = engineFocusChange.getCurrentState();
  const prevFocusTemp = fcStateTemp.focus;
  const fcState2 = engineFocusChange.step('たたく', [0]);
  assertEquals(prevFocusTemp - fcState2.focus, 2, 'Skill cost is halved at 800°C');


  // ルフの盾: 戻り地金. Let's verify receding at turn-end 200°C multiples.
  const engineReceding = new ForgeCoreEngine();
  engineReceding.reset('ルフの盾', '鉄の鍛冶ハンマー', 3, 'recedingseed');

  // We hit cell 0 to increase its value.
  const recState1 = engineReceding.step('たたく', [0]);
  // Temp is 950°C. No receding (not multiple of 200).
  assertEquals(recState1.cells[0].currentValue > 0, true, 'Cell 0 value increased');

  // Let's force temperature to 800°C (multiple of 200).
  const stateToLoadRec = engineReceding.getCurrentState();
  stateToLoadRec.temperature = 850; // Next strike will drop to 800°C.
  engineReceding.loadState(stateToLoadRec);

  const prevCell0Val = engineReceding.getCurrentState().cells[0].currentValue;
  // Cell 0 is the only cell with value > 0, so it will have the highest ratio.
  const recState2 = engineReceding.step('たたく', [1]); // Strike cell 1, temperature drops to 800°C
  // End of turn: temperature is 800°C. Cell 0 should recede by 12..16.
  const postCell0Val = recState2.cells[0].currentValue;
  const decrease = prevCell0Val - postCell0Val;
  console.log(`Cell 0 values: prev=${prevCell0Val}, post=${postCell0Val}, decreased by ${decrease}`);
  assertInRange(decrease, 12, 16, 'Cell 0 receded by 12..16 at 800°C turn end');


  // Test 8: Quality evaluation logic
  const engineQuality = new ForgeCoreEngine();
  // Reset
  engineQuality.reset('てつのつるぎ', '鉄の鍛冶ハンマー', 3, 'qualityseed');
  // Set all cell values exactly to target values
  const qState = engineQuality.getCurrentState();
  qState.cells.forEach(c => {
    if (c.isActive) {
      c.currentValue = c.targetValue;
    }
  });
  engineQuality.loadState(qState);
  
  // Call finish
  const finalState = engineQuality.finish();
  assertEquals(finalState.result?.totalError, 0, 'Total error is 0 for exact match');
  assertEquals(finalState.result?.quality, '★3', 'Quality is ★3 for exact match');

  console.log('--- All ForgeCoreEngine Tests Passed! ---');
}

try {
  runTests();
} catch (e: any) {
  console.error(e.message);
  process.exit(1);
}
