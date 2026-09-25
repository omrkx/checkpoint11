import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, PRODUCT_MAP, getProduct, EVIDENCE } from './src/catalog.mjs';
import { calculateComparison, calculateQualityState, detectAnomalies, normalizeSimulationInput, recommendActions, shipmentSummary, simulateShipment } from './src/engine.mjs';
import { getEvaluationSummary, runSyntheticEvaluation, writeEvaluationArtifacts } from './src/evaluation.mjs';
import { explainShipment, listEvidence } from './src/advisor.mjs';
import { getFleetSnapshot, getShipment, ingestObservations, listAlerts, listShipments } from './src/store.mjs';
import { getPublicBenchmarkSummary, listPublicBenchmarkShipments, getPublicBenchmarkShipment, runPublicBenchmarkEvaluation } from './src/public-benchmark.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
let latestEvaluation = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const parts = [];
  let bytes = 0;
  for await (const part of request) {
    bytes += part.length;
    if (bytes > 4 * 1024 * 1024) throw new Error('Request body exceeds the 4 MB limit.');
    parts.push(part);
  }
  if (!parts.length) return {};
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function apiPath(pathname) {
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

async function serveStatic(request, response, pathname) {
  const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const resolved = path.resolve(PUBLIC_DIR, `.${relative}`);
  const relToRoot = path.relative(PUBLIC_DIR, resolved);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return sendJson(response, 404, { error: 'Not found.' });
  try {
    const info = await stat(resolved);
    if (!info.isFile()) return sendJson(response, 404, { error: 'Not found.' });
    const content = await readFile(resolved);
    response.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
  }
}

async function routeApi(request, response, pathname, searchParams) {
  const method = request.method || 'GET';
  let match;
  if (method === 'GET' && pathname === '/health') {
    return sendJson(response, 200, { status: 'ok', service: 'ColdChain Guardian', mode: 'offline-capable', timestamp: new Date().toISOString() });
  }
  if (method === 'GET' && pathname === '/shipments') {
    return sendJson(response, 200, { fleet: getFleetSnapshot(), shipments: listShipments() });
  }
  if (method === 'GET' && pathname === '/alerts') return sendJson(response, 200, { alerts: listAlerts() });
  if (method === 'GET' && (match = pathname.match(/^\/shipments\/([^/]+)$/))) {
    const shipment = getShipment(decodeURIComponent(match[1]));
    return shipment ? sendJson(response, 200, shipment) : sendJson(response, 404, { error: 'Shipment not found.' });
  }
  if (method === 'GET' && pathname === '/products') return sendJson(response, 200, { products: PRODUCTS });
  if (method === 'GET' && (match = pathname.match(/^\/products\/([^/]+)$/))) {
    const product = getProduct(decodeURIComponent(match[1]));
    return product ? sendJson(response, 200, product) : sendJson(response, 404, { error: 'Product model not found.' });
  }
  if (method === 'GET' && pathname === '/evidence') {
    const evidence = await listEvidence();
    return sendJson(response, 200, { evidence: evidence.map(({ content, ...meta }) => meta) });
  }
  if (method === 'GET' && (match = pathname.match(/^\/evidence\/([^/]+)$/))) {
    const document = (await listEvidence()).find((item) => item.id === decodeURIComponent(match[1]));
    return document ? sendJson(response, 200, document) : sendJson(response, 404, { error: 'Evidence document not found.' });
  }
  if (method === 'GET' && pathname === '/evaluation/summary') {
    const summary = getEvaluationSummary();
    return sendJson(response, 200, latestEvaluation ? { ...summary, latestRun: latestEvaluation } : summary);
  }
  if (method === 'POST' && pathname === '/evaluation/run') {
    latestEvaluation = runSyntheticEvaluation();
    await writeEvaluationArtifacts(latestEvaluation);
    return sendJson(response, 200, latestEvaluation);
  }
  if (method === 'POST' && pathname === '/observations/ingest') {
    const uploaded = ingestObservations(await readJson(request));
    return sendJson(response, 201, { summary: shipmentSummary(uploaded), shipment: uploaded, notice: 'User-supplied telemetry is retained in memory for this server session. It is not marked as observed ground truth.' });
  }
  if (method === 'GET' && pathname === '/public-benchmark/summary') {
    return sendJson(response, 200, await getPublicBenchmarkSummary());
  }
  if (method === 'GET' && pathname === '/field-data/samples') {
    const samplesPath = path.join(PUBLIC_DIR, 'field-data-samples.json');
    const samples = JSON.parse(await readFile(samplesPath, 'utf8'));
    return sendJson(response, 200, samples);
  }
  if (method === 'GET' && pathname === '/public-benchmark/shipments') {
    return sendJson(response, 200, { shipments: await listPublicBenchmarkShipments() });
  }
  if (method === 'GET' && (match = pathname.match(/^\/public-benchmark\/shipments\/([^/]+)$/))) {
    const shipment = await getPublicBenchmarkShipment(decodeURIComponent(match[1]));
    return shipment ? sendJson(response, 200, shipment) : sendJson(response, 404, { error: 'Public shipment not found.' });
  }
  if (method === 'POST' && pathname === '/public-benchmark/evaluation/run') {
    const { predictions, ...summary } = await runPublicBenchmarkEvaluation();
    return sendJson(response, 200, summary);
  }
  if (method === 'POST' && pathname === '/simulate') {
    const shipment = simulateShipment(await readJson(request));
    return sendJson(response, 200, { summary: shipmentSummary(shipment), shipment });
  }
  if (method === 'POST' && pathname === '/simulate/compare') {
    return sendJson(response, 200, calculateComparison(await readJson(request)));
  }
  if (method === 'POST' && pathname === '/predict/rsl') {
    const body = await readJson(request);
    const shipment = body.shipmentId ? getShipment(String(body.shipmentId)) : null;
    if (body.shipmentId && !shipment) return sendJson(response, 404, { error: 'Shipment not found.' });
    const scenario = shipment ?? simulateShipment(body);
    const state = calculateQualityState(scenario);
    state.sensorTrust = scenario.sensorTrust?.score ?? null;
    state.safetyStatus = 'NOT_DETERMINED';
    return sendJson(response, 200, { qualityState: state, groundTruthType: scenario.groundTruthType ?? 'PHYSICS_SIMULATED', modelVersion: state.modelVersion });
  }
  if (method === 'POST' && pathname === '/detect/anomalies') {
    const body = await readJson(request);
    const shipment = body.shipmentId ? getShipment(String(body.shipmentId)) : simulateShipment(body);
    if (!shipment) return sendJson(response, 404, { error: 'Shipment not found.' });
    return sendJson(response, 200, { shipmentId: shipment.id, events: detectAnomalies(shipment), sensorTrust: shipment.sensorTrust, method: 'Heuristic rules and event coalescing', groundTruthType: shipment.groundTruthType });
  }
  if (method === 'POST' && pathname === '/recommendations') {
    const body = await readJson(request);
    const shipment = body.shipmentId ? getShipment(String(body.shipmentId)) : simulateShipment(body);
    if (!shipment) return sendJson(response, 404, { error: 'Shipment not found.' });
    const state = calculateQualityState(shipment);
    const actions = recommendActions(shipment, state);
    return sendJson(response, 200, { shipmentId: shipment.id, recommendation: actions[0], actions, safetyStatus: state.safetyStatus, costProvenance: 'DEMO_INPUT' });
  }
  if (method === 'POST' && pathname === '/advisor/query') {
    const body = await readJson(request);
    const shipment = body.shipmentId ? getShipment(String(body.shipmentId)) : simulateShipment(body);
    if (!shipment) return sendJson(response, 404, { error: 'Shipment not found.' });
    const responseBody = await explainShipment(shipment, String(body.question ?? 'Why did you alert?'));
    return sendJson(response, 200, responseBody);
  }
  return sendJson(response, 404, { error: 'API route not found.' });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const pathname = apiPath(url.pathname);
    if (pathname.startsWith('/health') || pathname.startsWith('/shipments') || pathname.startsWith('/observations') || pathname.startsWith('/predict') || pathname.startsWith('/detect') || pathname.startsWith('/alerts') || pathname.startsWith('/simulate') || pathname.startsWith('/recommendations') || pathname.startsWith('/advisor') || pathname.startsWith('/evaluation') || pathname.startsWith('/products') || pathname.startsWith('/evidence') || pathname.startsWith('/public-benchmark') || pathname === '/field-data/samples') {
      return await routeApi(request, response, pathname, url.searchParams);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed.' });
    return await serveStatic(request, response, url.pathname);
  } catch (error) {
    if (response.headersSent) return response.end();
    return sendJson(response, 400, { error: error.message || 'Request could not be handled.' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ColdChain Guardian is available at http://127.0.0.1:${PORT}`);
  console.log('Demo data is synthetic. Food quality estimates do not determine food safety.');
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
