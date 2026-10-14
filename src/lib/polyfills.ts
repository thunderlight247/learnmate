// Global polyfills for Node.js runtime compatibility.

// Polyfill for Math.sumPrecise (TC39 proposal):
// unpdf / pdfjs-dist uses Math.sumPrecise for font metrics and range calculations.
// Node.js environments without native support log `TypeError: Math.sumPrecise is not a function`.
if (typeof (Math as unknown as { sumPrecise?: unknown }).sumPrecise !== 'function') {
  Object.defineProperty(Math, 'sumPrecise', {
    value: function sumPrecise(items: Iterable<number>): number {
      let sum = 0;
      for (const item of items) {
        sum += Number(item) || 0;
      }
      return sum;
    },
    writable: true,
    configurable: true,
  });
}
