import assert from 'node:assert';
import { calculatePi } from './main.js';

// Test that calculatePi returns pi rounded to 5 decimal places
const result = calculatePi();
assert.strictEqual(result, 3.14159, 'calculatePi should return 3.14159');

console.log('✓ All tests passed!');
console.log(`  calculatePi() = ${result}`);
