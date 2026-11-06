
// [B6-fix2 · audit #4] Resolve a token to its literal value by following `var(--x)` chains
// through tokens.css. Tests must assert the COLOUR IN FORCE, not the spelling of one
// declaration — otherwise making the forest/gold ramp load-bearing (roles pointing at
// primitives) breaks assertions that were never about the ramp.
function resolveToken(tokensCss, name, depth = 0) {
  if (depth > 8) return null;
  const m = tokensCss.match(new RegExp('--' + name + '\\s*:\\s*([^;]+);'));
  if (!m) return null;
  const val = m[1].trim();
  const ref = val.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (ref) return resolveToken(tokensCss, ref[1], depth + 1);
  return val;
}
module.exports = { resolveToken };
