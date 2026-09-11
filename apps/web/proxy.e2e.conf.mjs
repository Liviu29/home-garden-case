/**
 * Dev-server proxy for the Playwright suite. Same rules as proxy.conf.json, but
 * pointed at the API instance the suite starts for itself (its own port, its
 * own throwaway database), so an e2e run never touches the dev API.
 */
const port = process.env['E2E_API_PORT'] ?? '3310';

export default {
  '/api': {
    target: `http://localhost:${port}`,
    secure: false,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
  },
};
