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

// DNS resolution fix for Linux Node.js runtimes:
// Node 18+ undici fetch tries IPv6 first by default. If the network interface
// has unroutable IPv6, it causes a 20-30 second delay or ETIMEDOUT on external API calls.
// Setting ipv4first makes external fetch calls (OpenRouter) instant.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dns = require('node:dns');
  if (typeof dns?.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore in browser or environments without node:dns
}

