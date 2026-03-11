const statusEl = document.getElementById('status');
const exportBtn = document.getElementById('exportBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const logEl = document.getElementById('log');

const CHUNK_SIZE = 500;

let accessToken = null;
let cancelled = false;

function log(msg) {
  logEl.textContent = msg;
}

// Silent auto-download using chrome.downloads API (no dialog)
async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      // Clean up object URL after download starts
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      resolve(downloadId);
    });
  });
}

// --- Auth ---
chrome.storage.local.get(['accessToken'], (r) => {
  if (r.accessToken) {
    accessToken = r.accessToken;
    statusEl.textContent = 'Authenticated';
    statusEl.className = 'status ok';
    exportBtn.disabled = false;
  } else {
    statusEl.textContent = 'No auth token found. Open chatgpt.com in another tab first, wait a moment, then refresh this page.';
    statusEl.className = 'status error';
  }
});

// --- API helpers ---
async function apiFetch(path) {
  const res = await fetch(`https://chatgpt.com${path}`, {
    headers: {
      'content-type': 'application/json',
      'Authorization': accessToken,
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Auth failed (${res.status}). Refresh chatgpt.com tab, then refresh this page.`);
    }
    if (res.status === 429) {
      log('Rate limited, waiting 10s...');
      await new Promise(r => setTimeout(r, 10000));
      const retry = await fetch(`https://chatgpt.com${path}`, {
        headers: { 'content-type': 'application/json', 'Authorization': accessToken },
      });
      if (retry.ok) return retry.json();
      throw new Error(`Rate limited, retry also failed (${retry.status})`);
    }
    throw new Error(`API error ${res.status} on ${path}`);
  }
  return res.json();
}

async function getAllConversationIds() {
  let all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    log(`Fetching conversations ${offset}...`);
    const data = await apiFetch(`/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`);
    if (!data.items || data.items.length === 0) break;
    all = all.concat(data.items.map(c => ({ id: c.id, title: c.title, create_time: c.create_time })));
    progressText.textContent = `Found ${all.length} of ${data.total} conversations...`;
    if (all.length >= data.total) break;
    offset += data.items.length;
  }
  return all;
}

async function getConversation(id) {
  return apiFetch(`/backend-api/conversation/${id}`);
}

// --- Formatters ---
function formatConversation(conversation, format, mode) {
  if (format === 'json') {
    return JSON.stringify(conversation, null, 2);
  }

  let currentNode = conversation.current_node;
  let messages = [];
  while (currentNode) {
    const node = conversation.mapping[currentNode];
    if (node?.message) messages.push(node.message);
    currentNode = node?.parent;
  }
  messages.reverse();

  if (mode === 'assistant') {
    messages = messages.filter(m => (m.author?.role || m.role) === 'assistant');
  } else {
    messages = messages.filter(m => {
      const role = m.author?.role || m.role;
      const recipient = m.recipient;
      return role === 'user' || (recipient === 'all' && role === 'assistant');
    });
  }

  if (format === 'markdown') {
    return messages.map(m => {
      const role = (m.author?.role || m.role || '').toUpperCase();
      const content = m.content?.parts?.join('\n') || '';
      return mode === 'both' ? `## ${role}\n${content}` : content;
    }).join('\n\n');
  }

  // text
  return messages.map(m => {
    const role = (m.author?.role || m.role || '').toUpperCase();
    const content = m.content?.parts?.join('\n') || '';
    return mode === 'both' ? `>> ${role}: ${content}` : content;
  }).join('\n\n');
}

function fileExt(format) {
  return { json: 'json', markdown: 'md', text: 'txt' }[format] || 'txt';
}

function sanitize(name) {
  return (name || 'untitled').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 100);
}

// --- Export logic ---
exportBtn.addEventListener('click', async () => {
  cancelled = false;
  const format = document.querySelector('input[name="format"]:checked').value;
  const mode = document.querySelector('input[name="mode"]:checked').value;

  exportBtn.disabled = true;
  cancelBtn.style.display = 'block';
  progressWrap.style.display = 'block';
  progressFill.style.width = '0%';

  try {
    log('Fetching conversation list...');
    const conversations = await getAllConversationIds();
    const total = conversations.length;
    progressText.textContent = `0 / ${total}`;

    if (total === 0) {
      log('No conversations found.');
      exportBtn.disabled = false;
      cancelBtn.style.display = 'none';
      return;
    }

    const datePrefix = new Date().toISOString().slice(0, 10);
    let zip = new JSZip();
    let done = 0;
    let errors = 0;
    let chunkIndex = 0;
    let chunkCount = 0;
    const totalChunks = Math.ceil(total / CHUNK_SIZE);

    for (const conv of conversations) {
      if (cancelled) {
        log('Export cancelled.');
        break;
      }

      try {
        const full = await getConversation(conv.id);
        const content = formatConversation(full, format, mode);

        // Use create_time from full conversation detail (list endpoint may not have it)
        const createTime = full.create_time || conv.create_time || 0;
        const date = new Date(createTime * 1000);
        const isValidDate = !isNaN(date.getTime()) && createTime > 0;
        const folder = isValidDate
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          : 'unknown-date';
        const time = isValidDate
          ? `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`
          : String(done).padStart(5, '0');
        const filename = `${folder}/${time}-${sanitize(conv.title || full.title)}.${fileExt(format)}`;

        zip.file(filename, content);
        done++;
        chunkCount++;
      } catch (e) {
        done++;
        chunkCount++;
        errors++;
        log(`Error on "${conv.title}": ${e.message}`);
      }

      const pct = Math.round((done / total) * 100);
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `${done} / ${total}${errors ? ` (${errors} errors)` : ''}`;
      log(`${done}/${total}: ${sanitize(conv.title)}`);

      // Save chunk every CHUNK_SIZE conversations
      if (chunkCount >= CHUNK_SIZE) {
        chunkIndex++;
        log(`Saving chunk ${chunkIndex} of ~${totalChunks}...`);
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        await downloadBlob(blob, `${datePrefix}-chatgpt-export-part${chunkIndex}.zip`);
        log(`Chunk ${chunkIndex} saved! Continuing...`);
        zip = new JSZip();
        chunkCount = 0;
      }

      // Rate limit: wait 500ms between requests
      if (!cancelled) await new Promise(r => setTimeout(r, 500));
    }

    // Save remaining conversations in final chunk
    if (!cancelled && chunkCount > 0) {
      chunkIndex++;
      log(`Saving final chunk ${chunkIndex} of ${totalChunks}...`);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      await downloadBlob(blob, `${datePrefix}-chatgpt-export-part${chunkIndex}.zip`);
      log(`Done! Exported ${done - errors} conversations in ${chunkIndex} parts${errors ? `, ${errors} errors` : ''}.`);
    }
  } catch (e) {
    log(`Error: ${e.message}`);
    statusEl.textContent = e.message;
    statusEl.className = 'status error';
  }

  exportBtn.disabled = false;
  cancelBtn.style.display = 'none';
});

cancelBtn.addEventListener('click', () => {
  cancelled = true;
});
