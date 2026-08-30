const ROOT_SELECTOR = '#dni-sectors-root';
const MIN_SCALE = 0.65;
const NODE_HEIGHT = 60;
const GAP_X = 14;
const GAP_Y = 12;
let resizeObserver = null;
let mutationObserver = null;
let observedSchematic = null;
let frame = 0;

function intersects(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseDistributedSlots(candidates, nodes) {
  if (nodes.length >= candidates.length) return candidates.slice(0, nodes.length);
  const chosen = [];
  const remaining = candidates.slice();
  const seed = nodes.length ? hashText(nodes[0].dataset.assetId) % remaining.length : 0;
  chosen.push(remaining.splice(seed, 1)[0]);

  while (chosen.length < nodes.length && remaining.length) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const minDistance = Math.min(...chosen.map(slot => Math.hypot(candidate.x - slot.x, candidate.y - slot.y)));
      if (minDistance > bestScore) {
        bestScore = minDistance;
        bestIndex = index;
      }
    }
    chosen.push(remaining.splice(bestIndex, 1)[0]);
  }
  return chosen;
}

function buildSlots(width, height, count) {
  const leftPad = 18;
  const rightPad = 18;
  const topPad = 70;
  const bottomPad = 88;
  const usableWidth = Math.max(1, width - leftPad - rightPad);
  const usableHeight = Math.max(1, height - topPad - bottomPad);
  const baseNodeWidth = Math.min(128, Math.max(82, width * 0.23));
  const primaryRect = {
    left: width * 0.5 - 78,
    right: width * 0.5 + 78,
    top: height * 0.52 - 48,
    bottom: height * 0.52 + 48
  };

  let selectedScale = 1;
  let candidates = [];
  let selectedNodeWidth = baseNodeWidth;

  for (let scale = 1; scale >= MIN_SCALE - 0.001; scale -= 0.05) {
    const nodeWidth = baseNodeWidth * scale;
    const nodeHeight = NODE_HEIGHT * scale;
    const columns = Math.max(1, Math.floor(usableWidth / (nodeWidth + GAP_X)));
    const rows = Math.max(1, Math.floor(usableHeight / (nodeHeight + GAP_Y)));
    const cellWidth = usableWidth / columns;
    const cellHeight = usableHeight / rows;
    const next = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = leftPad + cellWidth * (column + 0.5);
        const y = topPad + cellHeight * (row + 0.5);
        const bounds = {
          left: x - nodeWidth / 2,
          right: x + nodeWidth / 2,
          top: y - nodeHeight / 2,
          bottom: y + nodeHeight / 2
        };
        if (!intersects(bounds, primaryRect)) next.push({ x, y, bounds });
      }
    }

    selectedScale = Math.max(MIN_SCALE, scale);
    selectedNodeWidth = nodeWidth;
    candidates = next;
    if (candidates.length >= count) break;
  }

  return { candidates, scale: selectedScale, nodeWidth: selectedNodeWidth };
}

function layoutSchematic(schematic) {
  const nodes = [...schematic.querySelectorAll('.sector-map-node')];
  if (!nodes.length) return;
  const width = schematic.clientWidth;
  const height = schematic.clientHeight;
  if (width < 1 || height < 1) return;

  const { candidates, scale, nodeWidth } = buildSlots(width, height, nodes.length);
  if (!candidates.length) return;
  const slots = chooseDistributedSlots(candidates, nodes);
  const lines = [...schematic.querySelectorAll('.sector-map-lines line')];

  nodes.forEach((node, index) => {
    const slot = slots[index] || candidates[index % candidates.length];
    const xPercent = Math.max(0, Math.min(100, slot.x / width * 100));
    const yPercent = Math.max(0, Math.min(100, slot.y / height * 100));
    node.style.left = `${xPercent}%`;
    node.style.top = `${yPercent}%`;
    node.style.width = `${Math.max(72, nodeWidth / Math.max(scale, 0.01))}px`;
    node.style.minWidth = '0';
    node.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(2)})`;
    node.style.transformOrigin = 'center';
    node.dataset.collisionFree = '1';

    const line = lines[index];
    if (line) {
      line.setAttribute('x2', xPercent.toFixed(2));
      line.setAttribute('y2', yPercent.toFixed(2));
    }
  });

  schematic.dataset.collisionLayout = `${nodes.length}:${Math.round(width)}x${Math.round(height)}:${scale.toFixed(2)}`;
}

function attachResizeObserver(schematic) {
  if (observedSchematic === schematic) return;
  resizeObserver?.disconnect();
  observedSchematic = schematic;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => scheduleLayout());
    resizeObserver.observe(schematic);
  }
}

function scheduleLayout() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const root = document.querySelector(ROOT_SELECTOR);
    const schematic = root?.querySelector('.sector-schematic');
    if (!schematic) return;
    attachResizeObserver(schematic);
    layoutSchematic(schematic);
  });
}

function start() {
  const root = document.querySelector(ROOT_SELECTOR);
  if (!root) return false;
  mutationObserver?.disconnect();
  mutationObserver = new MutationObserver(() => scheduleLayout());
  mutationObserver.observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleLayout, { passive: true });
  window.addEventListener('dni:sectors-network-data', scheduleLayout);
  scheduleLayout();
  return true;
}

if (!start()) {
  const bootObserver = new MutationObserver(() => {
    if (start()) bootObserver.disconnect();
  });
  bootObserver.observe(document.documentElement, { childList: true, subtree: true });
}
