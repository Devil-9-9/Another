export const CHUNK = 16;              // chunks are 16x16x16 cubes: the world has NO height or depth limit
export const SEA = 20;                // sea level (y)
export const MAX_SURFACE = 90;        // highest possible terrain/tree/house top; air above until the sky realm
export const SKY_BASE = 128;          // first sky realm starts here (multiple of 16); realms repeat every SKY_BAND blocks upward forever
export const SKY_BAND = 128;
export const GRAVITY = 9.81;          // m/s^2, block = 1 m
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;
export const PLAYER_CROUCH_HEIGHT = 1.25;
export const PLAYER_CROUCH_EYE = 1.1;
export const PLAYER_RADIUS = 0.3;
export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 6.8;
export const CROUCH_SPEED = 2.0;
export const JUMP_SPEED = 5.2;        // v^2 / 2g = ~1.38 blocks: clears one block, not two
export const REACH = 6;               // build/break reach in blocks
export const MAX_HP = 100;
export const DAY_SEC = 1200;     // daytime length in seconds (1200 = 20 minutes)
export const NIGHT_SEC = 120;    // night length in seconds (120 = 2 minutes)
export const SPAWN_RADIUS = 6;
export const TEAM_NAMES = ['BLUE', 'RED'];
export const FLY_SPEED = 11;        // fly mode: no fuel, no height or depth limit
export const FLY_FAST = 34;         // fly mode with SPRINT held
