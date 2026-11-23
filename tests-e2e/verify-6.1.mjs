// The ceremony timer and input gates are verified with the personalized deck.
import { verifyCeremonyPersonalization } from './verify-ceremony-personalization.mjs';

await verifyCeremonyPersonalization();
console.log('VERIFY 6.1 PASS');
