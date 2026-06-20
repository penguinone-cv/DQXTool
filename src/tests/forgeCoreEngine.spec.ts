import { ForgeCoreEngine } from '../utils/forgeCoreEngine';
import { hammers } from '../data/masterData';

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
  console.log('--- Starting ForgeCoreEngine Specification Alignment Tests ---');

  // Test 1: Level 80 starting focus calculation for all hammers
  const engine = new ForgeCoreEngine();

  for (const h of hammers) {
    if (h.id === 'miracle_hammer') {
      // Miracle hammer has a 20% chance of +30 focus, so it can start with 247 or 277.
      // Let's verify it gets one of those.
      let got247 = false;
      let got277 = false;
      for (let i = 0; i < 100; i++) {
        const state = engine.reset('てつのつるぎ', h.id, 3, `miracleseed_${i}`);
        if (state.maxFocus === 247) got247 = true;
        if (state.maxFocus === 277) got277 = true;
      }
      assertEquals(got247 && got277, true, `Miracle Hammer starting focus can be either 247 or 277`);
    } else {
      const expectedFocus = 207 + h.focusBonus;
      const state = engine.reset('てつのつるぎ', h.id, 3, 'test_seed');
      assertEquals(state.maxFocus, expectedFocus, `Hammer ${h.name} starting focus should be ${expectedFocus}`);
    }
  }

  // Test 2: Double Critical Damage Factor
  // Let's verify that a critical hit performs 2 * normal max damage.
  // We use a seed that is known to result in a critical hit.
  let critSeed = '';
  for (let i = 0; i < 1000; i++) {
    const testEngine = new ForgeCoreEngine();
    const seed = `critcheck_${i}`;
    testEngine.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, seed);
    
    // Set targetValue of cell 0 to a very high number (e.g. 100) and currentValue to 0.
    const stateLoaded = testEngine.getCurrentState();
    stateLoaded.cells[0].targetValue = 100;
    stateLoaded.cells[0].currentValue = 0;
    testEngine.loadState(stateLoaded);

    const state = testEngine.step('ねらい打ち', [0]);
    if (state.cells[0].currentValue === 36) {
      critSeed = seed;
      break;
    }
  }

  if (critSeed === '') {
    throw new Error('FAIL: Could not find a seed that produces a non-locking critical hit.');
  }
  console.log(`Found critical hit seed: ${critSeed}`);

  // Test 3: Verify that a critical hit does 2x max normal damage (36 damage)
  const engineCrit = new ForgeCoreEngine();
  engineCrit.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, critSeed);
  const stateLoaded = engineCrit.getCurrentState();
  stateLoaded.cells[0].targetValue = 100;
  stateLoaded.cells[0].currentValue = 0;
  engineCrit.loadState(stateLoaded);

  const stateCritPost = engineCrit.step('ねらい打ち', [0]);
  assertEquals(stateCritPost.cells[0].currentValue, 36, 'Critical hit on 1000°C たたく multiplier=1.0 should deal exactly 36 damage (2 * 18)');

  // Test 4: Critical locking when target value is within range
  const engineLock = new ForgeCoreEngine();
  engineLock.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, critSeed);
  const stateLockInit = engineLock.getCurrentState();
  stateLockInit.cells[0].targetValue = 30; // Target is 30, which is <= 36
  stateLockInit.cells[0].currentValue = 0;
  engineLock.loadState(stateLockInit);

  const stateLockPost = engineLock.step('ねらい打ち', [0]);
  assertEquals(stateLockPost.cells[0].currentValue, 30, 'Critical hit should lock at target value 30');
  assertEquals(stateLockPost.cells[0].isLocked, true, 'Cell should be marked as locked');

  // Verify that striking the locked cell again unlocks it and inflicts damage
  const stateUnlockedPost = engineLock.step('たたく', [0]);
  assertEquals(stateUnlockedPost.cells[0].isLocked, false, 'Cell should become unlocked after a subsequent hit');
  assertInRange(stateUnlockedPost.cells[0].currentValue - 30, 12, 18, 'Cell should take damage from subsequent hit');

  // Test 4-B: Validation of multi-target cell active requirements
  const engineVal = new ForgeCoreEngine();
  engineVal.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, 'val_seed');
  let threwError = false;
  try {
    engineVal.step('左右打ち', [0]);
  } catch (e: any) {
    threwError = true;
    console.log(`PASS: Correctly threw error on invalid horizontal strike: ${e.message}`);
  }
  assertEquals(threwError, true, 'Engine should throw an error when executing a horizontal strike on a vertical shape');

  // Test 5: Glowing cell normal hit and glow consumption
  let normalSeed = '';
  for (let i = 0; i < 1000; i++) {
    const testEngine = new ForgeCoreEngine();
    const seed = `normalcheck_${i}`;
    testEngine.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, seed);
    const state = testEngine.step('たたく', [0]);
    if (state.cells[0].currentValue < 20) { // Normal damage is 12..18.
      normalSeed = seed;
      break;
    }
  }

  if (normalSeed === '') {
    throw new Error('FAIL: Could not find a seed that produces a normal hit.');
  }

  const engineGlow = new ForgeCoreEngine();
  engineGlow.reset('てつのつるぎ', '銅の鍛冶ハンマー', 3, normalSeed);
  const glowInit = engineGlow.getCurrentState();
  glowInit.cells[0].isGlowing = true;
  engineGlow.loadState(glowInit);

  const prevVal = glowInit.cells[0].currentValue;
  const glowPost = engineGlow.step('たたく', [0]);
  const glowDiff = glowPost.cells[0].currentValue - prevVal;
  assertInRange(glowDiff, 24, 36, 'Normal hit on glowing cell should deal double damage (24 to 36)');
  assertEquals(glowPost.cells[0].isGlowing, false, 'Glow should be consumed after hit');

  // Test 6: Level-Based Focus and Skill Restrictions
  const engineLevel = new ForgeCoreEngine();
  const stateL10 = engineLevel.reset('てつのつるぎ', '鉄の鍛冶ハンマー', 3, 'level_seed', 10);
  assertEquals(stateL10.maxFocus, 77, 'Max focus for level 10 with Iron Hammer should be 77 (67 + 10)');
  assertEquals(stateL10.characterLevel, 10, 'State should store characterLevel 10');

  const actionsL10 = engineLevel.getAvailableActions();
  assertEquals(actionsL10.length, 5, 'Should have exactly 5 skills available at level 10');
  const actionNames = actionsL10.map(a => a.name);
  assertEquals(actionNames.includes('たたく'), true, 'Should include たたく');
  assertEquals(actionNames.includes('火力上げ'), true, 'Should include 火力上げ');
  assertEquals(actionNames.includes('熱風おろし'), false, 'Should NOT include 熱風おろし (level 47)');

  let threwLevelError = false;
  try {
    engineLevel.step('熱風おろし', [0]);
  } catch (e: any) {
    threwLevelError = true;
    console.log(`PASS: Correctly threw level restriction error: ${e.message}`);
  }
  assertEquals(threwLevelError, true, 'Should throw error when calling an unlearned skill');

  console.log('--- All Specification Alignment Tests Passed! ---');
}

try {
  runTests();
} catch (e: any) {
  console.error(e.message);
  process.exit(1);
}
