export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('./mock-three.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
