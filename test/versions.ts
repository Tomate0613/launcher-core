import { isAfter, isBefore, isBetween } from "../src/versions.ts";

console.assert(isAfter("1.19", "1.21"), '1.21 >= 1.18');
console.assert(isAfter("1.19", "does-not-exist"), 'does-not-exist >= 1.19');

console.assert(isBefore("22w14a", "22w13a"), '22w13a < 22w14a');

console.assert(isBetween("22w03a", "25w21a", "1.21"), '1.21 between 22w03a - 25w21a');
console.assert(!isBetween("22w03a", "23w03a", "1.21"), '1.21 not between 22w03a - 23w03a');
console.assert(!isBetween("1.0", "1.21.10", "does-not-exist"), 'does-not-exist not between 1.0 - 1.21.10');
console.assert(isBetween("1.21", "1.21", "1.21"), '1.21 between 1.21 - 1.21');

