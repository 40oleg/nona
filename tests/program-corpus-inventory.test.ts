import {test} from 'node:test';
import {verifyInventory} from './helpers/program-corpus.js';
test('program corpus contains exactly 1,000 registered, distinct, current sources', verifyInventory);
