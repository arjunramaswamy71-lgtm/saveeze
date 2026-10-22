import { createServer, type Server } from 'node:http';

/**
 * A tiny fake store. Signed-in visitors (cookie member=1) get a higher price on /product,
 * which is exactly what savEEZE should catch.
 */
export function startShop(): Promise<{ url: string; server: Server }> {
  let tick = 0;
  const page = (price: string) =>
    `<!doctype html><html><head><title>Test Kettle</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Test Kettle","offers":{"@type":"Offer","priceCurrency":"USD","price":"${price}"}}</script>
</head><body><h1>Test Kettle</h1><p class="price">$${price}</p></body></html>`;

  const server = createServer((req, res) => {
    const member = /(^|;\s*)member=1/.test(req.headers.cookie ?? '');
    const send = (body: string, extra: Record<string, string> = {}) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra });
      res.end(body);
    };
    switch (req.url) {
      case '/login':
        return send('<p>signed in</p>', { 'set-cookie': 'member=1; Path=/; SameSite=Lax' });
      case '/product':
        return send(page(member ? '10.00' : '8.99'));
      case '/fair':
        return send(page('25.00'));
      case '/moving':
        tick += 1;
        return send(page(tick % 2 ? '30.00' : '27.00'));
      case '/notice':
        return send(page('15.00').replace('</body>', '<small>This price was set by an algorithm using your personal data.</small></body>'));
      default:
        return send('<h1>Home</h1><p>No products here.</p>');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, server });
    });
  });
}
