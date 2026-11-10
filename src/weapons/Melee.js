import { Sword } from './Sword.js';
// Survival melee. Wooden sword kills a 20 HP zombie in 4 hits, stone in 3, iron in 2, bare hands in 7.
export class Fists extends Sword { constructor() { super({ name: 'HANDS', damage: 3, range: 2.6, rpm: 150, blockDamage: 1, fists: true, color: 0xe0b090 }); } }
export class WoodenSword extends Sword { constructor() { super({ name: 'WOOD SWORD', damage: 6, rpm: 120, bladeColor: 0xb58a5a, color: 0xb58a5a }); } }
export class StoneSword extends Sword { constructor() { super({ name: 'STONE SWORD', damage: 9, rpm: 115, bladeColor: 0x8d8d94, color: 0x8d8d94 }); } }
export class IronSword extends Sword { constructor() { super({ name: 'IRON SWORD', damage: 14, rpm: 110, bladeColor: 0xd5dde6, color: 0xd5dde6 }); } }
