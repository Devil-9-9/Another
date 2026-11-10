// Block registry. `top/side/bottom` are tile indices into the procedural texture atlas (see TextureAtlas.js).
export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6,
  BRICK: 7, GLASS: 8, PLANKS: 9, BEDROCK: 10, METAL: 11,
  WATER: 12, LAVA: 13, CLOUD: 14, CRYSTAL: 15,
  OBSIDIAN: 16, PORTAL_UNDER: 17, PORTAL_SKY: 18, LAMP: 19, QUARTZ: 20, GOLD: 21, TILE: 22, WOOL_RED: 23,
  COBBLE: 24, SANDSTONE: 25, DIAMOND: 26, WOOL_BLUE: 27, WOOL_YELLOW: 28, BLACK: 29, SNOW: 30, ICE: 31,
  COAL_ORE: 32, IRON_ORE: 33, TORCH: 34, BED: 35,
};

export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD_SIDE: 5, WOOD_TOP: 6,
  LEAVES: 7, BRICK: 8, GLASS: 9, PLANKS: 10, BEDROCK: 11, METAL: 12,
  WATER: 13, LAVA: 14, CLOUD: 15, CRYSTAL: 16,
  OBSIDIAN: 17, PORTAL_UNDER: 18, PORTAL_SKY: 19, LAMP: 20, QUARTZ: 21, GOLD: 22, TILE: 23, WOOL_RED: 24,
  COBBLE: 25, SANDSTONE: 26, DIAMOND: 27, WOOL_BLUE: 28, WOOL_YELLOW: 29, BLACK: 30, SNOW: 31, ICE: 32,
  COAL_ORE: 33, IRON_ORE: 34, TORCH: 35,
};

// hp: damage needed to break (punch = 1, bullet = weapon.blockDamage)
// fluid: not solid (you swim / sink through it), bullets pass through. emissive: drawn bright even in the dark.
export const BLOCKS = {
  [B.GRASS]:   { name: 'Grass',   top: T.GRASS_TOP, side: T.GRASS_SIDE, bottom: T.DIRT, hp: 2 },
  [B.DIRT]:    { name: 'Dirt',    top: T.DIRT, side: T.DIRT, bottom: T.DIRT, hp: 2 },
  [B.STONE]:   { name: 'Stone',   top: T.STONE, side: T.STONE, bottom: T.STONE, hp: 6 },
  [B.SAND]:    { name: 'Sand',    top: T.SAND, side: T.SAND, bottom: T.SAND, hp: 1 },
  [B.WOOD]:    { name: 'Log',     top: T.WOOD_TOP, side: T.WOOD_SIDE, bottom: T.WOOD_TOP, hp: 4 },
  [B.LEAVES]:  { name: 'Leaves',  top: T.LEAVES, side: T.LEAVES, bottom: T.LEAVES, hp: 1, cutout: true },
  [B.BRICK]:   { name: 'Brick',   top: T.BRICK, side: T.BRICK, bottom: T.BRICK, hp: 8 },
  [B.GLASS]:   { name: 'Glass',   top: T.GLASS, side: T.GLASS, bottom: T.GLASS, hp: 1, glass: true },
  [B.PLANKS]:  { name: 'Planks',  top: T.PLANKS, side: T.PLANKS, bottom: T.PLANKS, hp: 3 },
  [B.BEDROCK]: { name: 'Bedrock', top: T.BEDROCK, side: T.BEDROCK, bottom: T.BEDROCK, hp: Infinity },
  [B.METAL]:   { name: 'Metal',   top: T.METAL, side: T.METAL, bottom: T.METAL, hp: 14 },
  [B.WATER]:   { name: 'Water',   top: T.WATER, side: T.WATER, bottom: T.WATER, hp: Infinity, glass: true, fluid: true },
  [B.LAVA]:    { name: 'Lava',    top: T.LAVA, side: T.LAVA, bottom: T.LAVA, hp: Infinity, fluid: true, emissive: true },
  [B.CLOUD]:   { name: 'Cloud',   top: T.CLOUD, side: T.CLOUD, bottom: T.CLOUD, hp: 1 },
  [B.CRYSTAL]: { name: 'Crystal', top: T.CRYSTAL, side: T.CRYSTAL, bottom: T.CRYSTAL, hp: 5, emissive: true },
  [B.OBSIDIAN]: { name: 'Obsidian', top: T.OBSIDIAN, side: T.OBSIDIAN, bottom: T.OBSIDIAN, hp: 20 },
  // portal blocks are walk-through (fluid = not solid) and glow; stand inside one for ~1.5 s to travel
  [B.PORTAL_UNDER]: { name: 'Underworld Portal', top: T.PORTAL_UNDER, side: T.PORTAL_UNDER, bottom: T.PORTAL_UNDER, hp: Infinity, glass: true, fluid: true, emissive: true, portal: 'under' },
  [B.PORTAL_SKY]:   { name: 'Sky Portal', top: T.PORTAL_SKY, side: T.PORTAL_SKY, bottom: T.PORTAL_SKY, hp: Infinity, glass: true, fluid: true, emissive: true, portal: 'sky' },
  [B.LAMP]:    { name: 'Lamp',    top: T.LAMP, side: T.LAMP, bottom: T.LAMP, hp: 2, emissive: true },
  [B.QUARTZ]:  { name: 'Quartz',  top: T.QUARTZ, side: T.QUARTZ, bottom: T.QUARTZ, hp: 5 },
  [B.GOLD]:    { name: 'Gold',    top: T.GOLD, side: T.GOLD, bottom: T.GOLD, hp: 10 },
  [B.TILE]:    { name: 'Tiles',   top: T.TILE, side: T.TILE, bottom: T.TILE, hp: 4 },
  [B.WOOL_RED]:    { name: 'Red Wool',    top: T.WOOL_RED, side: T.WOOL_RED, bottom: T.WOOL_RED, hp: 1 },
  [B.COBBLE]:  { name: 'Cobblestone', top: T.COBBLE, side: T.COBBLE, bottom: T.COBBLE, hp: 5 },
  [B.SANDSTONE]: { name: 'Sandstone', top: T.SANDSTONE, side: T.SANDSTONE, bottom: T.SANDSTONE, hp: 3 },
  [B.DIAMOND]: { name: 'Diamond', top: T.DIAMOND, side: T.DIAMOND, bottom: T.DIAMOND, hp: 12 },
  [B.WOOL_BLUE]:   { name: 'Blue Wool',   top: T.WOOL_BLUE, side: T.WOOL_BLUE, bottom: T.WOOL_BLUE, hp: 1 },
  [B.WOOL_YELLOW]: { name: 'Yellow Wool', top: T.WOOL_YELLOW, side: T.WOOL_YELLOW, bottom: T.WOOL_YELLOW, hp: 1 },
  [B.BLACK]:   { name: 'Black Concrete', top: T.BLACK, side: T.BLACK, bottom: T.BLACK, hp: 6 },
  [B.SNOW]:    { name: 'Snow',    top: T.SNOW, side: T.SNOW, bottom: T.SNOW, hp: 1 },
  [B.ICE]:     { name: 'Ice',     top: T.ICE, side: T.ICE, bottom: T.ICE, hp: 1, glass: true },
  [B.COAL_ORE]: { name: 'Coal Ore', top: T.COAL_ORE, side: T.COAL_ORE, bottom: T.COAL_ORE, hp: 6 },
  [B.IRON_ORE]: { name: 'Iron Ore', top: T.IRON_ORE, side: T.IRON_ORE, bottom: T.IRON_ORE, hp: 8 },
  [B.TORCH]:   { name: 'Torch',   top: T.TORCH, side: T.TORCH, bottom: T.TORCH, hp: 1, emissive: true },   // glows, lights the night, keeps mobs away
  [B.BED]:     { name: 'Bed',     top: T.WOOL_RED, side: T.WOOL_RED, bottom: T.PLANKS, hp: 2 },           // aim at it and press PLACE at night to sleep
};

// Default hotbar (8 slots). An entry is a block id, or a string item: 'struct:hotel', 'veh:jeep', 'tool:lighter' (see Items.js).
// The player edits their hotbar from the inventory; it is saved on the device.
export const HOTBAR = [B.PLANKS, B.BRICK, B.STONE, B.GLASS, B.QUARTZ, B.LAMP, B.OBSIDIAN, 'tool:lighter'];

export const isFluid = (id) => id !== B.AIR && !!BLOCKS[id]?.fluid;
export const isSolid = (id) => id !== B.AIR && !BLOCKS[id]?.fluid;
export const isOpaque = (id) => id !== B.AIR && !BLOCKS[id]?.glass && !BLOCKS[id]?.cutout;

export const isPortal = (id) => id === B.PORTAL_UNDER || id === B.PORTAL_SKY;
