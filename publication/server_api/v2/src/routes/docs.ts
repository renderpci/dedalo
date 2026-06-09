import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { html, yaml, binary, json } from '../utils/response';

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    js: 'application/javascript',
    css: 'text/css',
    html: 'text/html',
    png: 'image/png',
    svg: 'image/svg+xml',
    json: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    ico: 'image/x-icon',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

function getPackagePath(packageName: string): string {
  try {
    const resolved = import.meta.resolve(packageName);
    const url = new URL(resolved);
    const pathParts = url.pathname.split('/');
    pathParts.pop();
    if (pathParts[pathParts.length - 1] === 'dist') {
      pathParts.pop();
    }
    return pathParts.join('/');
  } catch {
    throw new Error(`Package "${packageName}" not found. Run 'bun install' to install dependencies.`);
  }
}

function serveStaticFile(packageName: string, filename: string): Response {
  if (filename.includes('..')) {
    return json({ error: 'Invalid asset path', status: 400 }, 400);
  }

  try {
    const packageRoot = getPackagePath(packageName);
    const filePath = join(packageRoot, filename);

    if (!existsSync(filePath)) {
      return json({ error: 'Asset not found', file: filename, status: 404 }, 404);
    }

    const content = readFileSync(filePath);
    const mimeType = getMimeType(filename);
    return binary(content, mimeType);
  } catch (error) {
    return json({ error: 'Failed to load asset', file: filename, status: 500 }, 500);
  }
}

function extractAssetFilename(pathname: string, basePath: string, prefix: string): string {
  let path = pathname;
  if (basePath && path.startsWith(basePath)) {
    path = path.slice(basePath.length);
  }
  if (path.startsWith(prefix)) {
    path = path.slice(prefix.length);
  }
  if (path.includes('..') || path.includes('/')) {
    throw new Error('Invalid asset path');
  }
  return path;
}

export async function handleDocs(req: Request): Promise<Response> {
  const basePath = config.BASE_PATH || '';

  return html(`<!DOCTYPE html>
<html>
<head>
  <title>Dédalo API v2 - Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Consolas, monospace;
      background: #1a1a1a;
      color: #00ff00;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container { max-width: 800px; width: 100%; }
    .header { border: 2px solid #00ff00; padding: 1rem; margin-bottom: 2rem; }
    .title { font-size: 1.5rem; color: #00ffff; margin-bottom: 0.5rem; }
    .subtitle { color: #888; font-size: 0.9rem; }
    .options { display: grid; gap: 1rem; }
    .option {
      border: 1px solid #00ff00; padding: 1.5rem;
      text-decoration: none; color: #00ff00;
      transition: all 0.2s; display: block;
    }
    .option:hover { background: #00ff00; color: #1a1a1a; }
    .option-title { font-size: 1.2rem; margin-bottom: 0.5rem; color: #00ffff; }
    .option:hover .option-title { color: #1a1a1a; }
    .option-desc { font-size: 0.85rem; color: #888; }
    .option:hover .option-desc { color: #333; }
    .cursor { display: inline-block; animation: blink 1s infinite; }
    @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">Dédalo Publication API v2<span class="cursor">_</span></div>
      <div class="subtitle">Read-only REST API for published cultural heritage data</div>
    </div>
    <div class="options">
      <a href="${basePath}/docs/swagger" class="option">
        <div class="option-title">[1] Swagger UI</div>
        <div class="option-desc">Industry standard OpenAPI documentation with interactive testing</div>
      </a>
      <a href="${basePath}/docs/scalar" class="option">
        <div class="option-title">[2] Scalar</div>
        <div class="option-desc">Modern, fast API documentation with beautiful design</div>
      </a>
    </div>
  </div>
</body>
</html>`);
}

export async function handleSwaggerUI(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const basePath = url.pathname.replace(/\/docs\/swagger$/, '');

  return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dédalo Publication API v2 - Swagger UI</title>
  <link rel="stylesheet" href="${basePath}/docs/swagger/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .swagger-ui .topbar { background-color: #1a1a1a; }
    .swagger-ui .topbar .download-url-wrapper .select-label { color: #fff; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${basePath}/docs/swagger/swagger-ui-bundle.js"></script>
  <script src="${basePath}/docs/swagger/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${basePath}/openapi.yaml',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
        deepLinking: true,
        showExtensions: true,
        showCommonExtensions: true
      });
      window.ui = ui;
    };
  </script>
</body>
</html>`);
}

export async function handleScalarUI(_req: Request): Promise<Response> {
  const basePath = config.BASE_PATH || '';

  return html(`<!DOCTYPE html>
<html>
<head>
  <title>Dédalo API v2 - Scalar</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${basePath}/docs/scalar/style.css">
  <style>
    body { margin: 0; padding: 0; }
    .error { padding: 2rem; background: #fee; color: #c33; font-family: monospace; border: 2px solid #c33; margin: 2rem; }
  </style>
</head>
<body>
  <div id="scalar-app"></div>
  <div id="error-container"></div>
  <script src="${basePath}/docs/scalar/standalone.js"></script>
  <script>
    try {
      if (typeof Scalar !== 'undefined' && Scalar.createApiReference) {
        Scalar.createApiReference('#scalar-app', { spec: { url: '${basePath}/openapi.yaml' } });
      } else {
        throw new Error('Scalar library not loaded');
      }
    } catch (error) {
      document.getElementById('error-container').innerHTML =
        '<div class="error"><strong>Error loading Scalar:</strong><br>' +
        error.message + '<br><br><strong>Solution:</strong> Run <code>bun install</code> to install dependencies.</div>';
    }
  </script>
</body>
</html>`);
}

export async function handleSwaggerAssets(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    const filename = extractAssetFilename(url.pathname, config.BASE_PATH, '/docs/swagger/');
    return serveStaticFile('swagger-ui-dist', filename);
  } catch {
    return json({ error: 'Invalid asset path', status: 400 }, 400);
  }
}

export async function handleScalarAssets(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    const filename = extractAssetFilename(url.pathname, config.BASE_PATH, '/docs/scalar/');

    if (filename === 'style.css') {
      return serveStaticFile('@scalar/api-reference', 'dist/style.css');
    }
    if (filename === 'standalone.js') {
      return serveStaticFile('@scalar/api-reference', 'dist/browser/standalone.js');
    }

    return serveStaticFile('@scalar/api-reference', `dist/browser/${filename}`);
  } catch {
    return json({ error: 'Invalid asset path', status: 400 }, 400);
  }
}

export async function handleOpenApiSpec(_req: Request): Promise<Response> {
  try {
    const specPath = join(import.meta.dir, '..', 'docs', 'openapi.yaml');
    const spec = readFileSync(specPath, 'utf-8');
    return yaml(spec);
  } catch {
    return json({ error: 'OpenAPI spec not found', status: 500 }, 500);
  }
}
