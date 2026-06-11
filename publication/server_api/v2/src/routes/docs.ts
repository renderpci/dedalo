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
  
  let logoBase64 = '';
  try {
    const logoPath = join(import.meta.dir, 'asests', 'dd_coding.png');
    if (existsSync(logoPath)) {
      logoBase64 = readFileSync(logoPath).toString('base64');
    }
  } catch (e) {
    console.error('Failed to load logo image', e);
  }

  const logoContent = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" alt="Dédalo Coding" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 15px rgba(247, 138, 28, 0.3));" />`
    : '';

  return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dédalo API v2 - Documentation</title>
  <style>
    :root {
      --bg: #050505;
      --surface: rgba(255, 255, 255, 0.03);
      --surface-hover: rgba(255, 255, 255, 0.08);
      --border: rgba(255, 255, 255, 0.1);
      --border-hover: rgba(247, 138, 28, 0.5);
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --orange: #F78A1C;
      --purple: #bc13fe;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background-image: 
        linear-gradient(rgba(247, 138, 28, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(247, 138, 28, 0.03) 1px, transparent 1px);
      background-size: 30px 30px;
      background-position: center center;
    }

    /* Cyber scanline effect */
    body::before {
      content: " ";
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
      z-index: 2;
      background-size: 100% 2px, 3px 100%;
      pointer-events: none;
    }

    .container {
      max-width: 900px;
      width: 100%;
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 3rem;
    }

    .header {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      animation: fadeIn 1s ease-out;
    }

    .logo-container {
      width: 240px;
      height: 160px;
      margin-bottom: 1rem;
      position: relative;
    }

    /* Subtle glow behind the logo */
    .logo-container::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80%;
      height: 80%;
      background: var(--orange);
      filter: blur(50px);
      opacity: 0.15;
      border-radius: 50%;
      z-index: -1;
    }

    .title {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: 0.15em;;
      color: #F78A1C;
      //text-shadow: 0 0 5px rgba(247, 138, 28, 0.5), 0 0 15px rgba(247, 138, 28, 0.3);
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .cursor {
      display: inline-block;
      width: 10px;
      height: 1.2em;
      background-color: var(--orange);
      vertical-align: middle;
      margin-left: 5px;
      animation: blink 1s step-end infinite;
      box-shadow: 0 0 10px var(--orange);
    }

    .options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
    }

    .option {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      text-decoration: none;
      color: var(--text);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .option::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(45deg, transparent, rgba(255,255,255,0.05), transparent);
      transform: translateX(-100%);
      transition: transform 0.6s;
    }

    .option:hover {
      transform: translateY(-5px);
      border-color: var(--border-hover);
      background: var(--surface-hover);
      box-shadow: 0 10px 30px -10px rgba(247, 138, 28, 0.2);
    }

    .option:hover::before {
      transform: translateX(100%);
    }

    .option-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .option-title {
      font-size: 1.4rem;
      font-weight: 600;
      color: #fff;
    }

    .option-icon {
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--orange);
    }

    .option-desc {
      font-size: 0.95rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    .tag {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-top: 1.5rem;
    }

    .tag-swagger {
      background: rgba(133, 234, 45, 0.1);
      color: #85ea2d;
      border: 1px solid rgba(133, 234, 45, 0.2);
    }

    .tag-scalar {
      background: rgba(229, 62, 62, 0.1);
      color: #fc8181;
      border: 1px solid rgba(229, 62, 62, 0.2);
    }

    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    
    @media (max-width: 600px) {
      .options { grid-template-columns: 1fr; }
      .title { font-size: 2rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-container">
        ${logoContent}
      </div>
      <div class="title">Dédalo API v2</div>
      <div class="subtitle">> GET /publication/server_api/v2<span class="cursor"></span></div>
    </div>
    
    <div class="options">
      <a href="${basePath}/docs/swagger" class="option">
        <div class="option-header">
          <div class="option-title">Swagger UI</div>
          <div class="option-icon">[ 1 ]</div>
        </div>
        <div class="option-desc">Industry standard OpenAPI documentation with interactive testing capabilities and comprehensive model schemas.</div>
        <div class="tag tag-swagger">Interactive Mode</div>
      </a>
      
      <a href="${basePath}/docs/scalar" class="option">
        <div class="option-header">
          <div class="option-title">Scalar</div>
          <div class="option-icon">[ 2 ]</div>
        </div>
        <div class="option-desc">Modern, fast API reference with a beautiful developer-centric design and excellent code snippet generation.</div>
        <div class="tag tag-scalar">High Performance</div>
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
