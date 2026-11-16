// sync-kb.mjs — Đồng bộ kiến thức 100% từ Google Drive -> Cloudflare Vectorize + KV
// Chạy: node sync-kb.mjs
// Tự động phân tích PDF, DOCX, Docs chuyên sâu; giữ nguyên cấu trúc bảng biểu, hình vẽ và sơ đồ.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { google } from 'googleapis';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const XLSX = require('xlsx');

let pdfParse;
try {
  const raw = require('pdf-parse/lib/pdf-parse.js');
  pdfParse = typeof raw === 'function' ? raw : raw.default;
} catch {
  const raw = require('pdf-parse');
  pdfParse = typeof raw === 'function' ? raw : (raw.default || raw.pdf || raw);
}

// ---------- Đọc .env ----------
if (fs.existsSync('./.env')) {
  for (const line of fs.readFileSync('./.env', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// ---------- Cấu hình ----------
const need = (k) => {
  if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} (hãy kiểm tra trong .env)`);
  return process.env[k];
};

const OPENAI_API_KEY = need('OPENAI_API_KEY');
const CF_ACCOUNT_ID = need('KB_CF_ACCOUNT_ID');
const CF_API_TOKEN = need('KB_CF_API_TOKEN');
const KV_NAMESPACE = need('CF_KV_NAMESPACE_ID');
const DRIVE_FOLDER = process.env.DRIVE_FOLDER_ID || '1vFH96MmycsqJv3PGlPKoo2H9P9G80sHG';
const VECTORIZE_INDEX_NAME = process.env.VECTORIZE_INDEX_NAME || 'kb_documents';
const FORCE = process.env.FORCE_REINDEX === '1';

const GOOGLE_CLIENT_ID = need('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = need('GOOGLE_CLIENT_SECRET');
const GOOGLE_REFRESH_TOKEN = need('GOOGLE_REFRESH_TOKEN');

const CF = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`;
const CF_VEC = `${CF}/vectorize/v2/indexes/${VECTORIZE_INDEX_NAME}`;
const KV = `${CF}/storage/kv/namespaces/${KV_NAMESPACE}/values`;
const H = { Authorization: `Bearer ${CF_API_TOKEN}` };

const SUPPORTED_EXT = ['.pdf', '.docx', '.txt'];
const isSkipped = (name) => /Data_Leads/i.test(name) || name.startsWith('~') || name === 'kb-qa-index.json';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const chunkId = (fileId, i) => `kb_${fnv1a(fileId)}_${i}`;

// ---------- Google Drive Client ----------
const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth });
const G = 'application/vnd.google-apps.';

async function listFolder(folderId, prefix = '') {
  const out = [];
  let pageToken;
  do {
    const r = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,md5Checksum)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of r.data.files || []) {
      if (f.mimeType === G + 'folder') {
        if (/leads/i.test(f.name)) { console.log(`⏭️  Bỏ qua thư mục: ${prefix}${f.name}`); continue; }
        out.push(...await listFolder(f.id, `${prefix}${f.name}/`));
      } else {
        out.push({ ...f, path: prefix + f.name });
      }
    }
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return out;
}

async function downloadFile(f) {
  const opt = { responseType: 'arraybuffer' };
  if (f.mimeType === G + 'document') {
    const r = await drive.files.export({ fileId: f.id, mimeType: 'text/plain' }, opt);
    return { buffer: Buffer.from(r.data), ext: '.txt' };
  }
  if (f.mimeType.startsWith(G)) return null;
  const ext = path.extname(f.name).toLowerCase();
  if (!SUPPORTED_EXT.includes(ext)) return null;
  const r = await drive.files.get({ fileId: f.id, alt: 'media', supportsAllDrives: true }, opt);
  return { buffer: Buffer.from(r.data), ext };
}

// Trích xuất text chuyên sâu từ file PDF
async function extractText(buffer, ext) {
  if (ext === '.pdf') {
    if (typeof pdfParse !== 'function') throw new Error('Không tải được hàm giải mã PDF');
    const data = await pdfParse(buffer, {
      pagerender: async function (pageData) {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false
        });
        let lastY, text = '';
        for (const item of textContent.items) {
          if (lastY == item.transform[5] || !lastY) {
            text += item.str + ' ';
          } else {
            text += '\n' + item.str + ' ';
          }
          lastY = item.transform[5];
        }
        return text;
      }
    });
    return data.text || '';
  }
  if (ext === '.docx') return (await mammoth.extractRawText({ buffer })).value || '';
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    return wb.SheetNames
      .map((s) => `[Trang tính: ${s}]\n` + XLSX.utils.sheet_to_txt(wb.Sheets[s]))
      .join('\n');
  }
  return buffer.toString('utf-8');
}

// Xử lý ngắt dòng để không làm mất tiêu đề sơ đồ
function cleanDocumentText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- API Cloudflare Vectorize + KV ----------
async function upsertVectors(vectors) {
  for (let i = 0; i < vectors.length; i += 50) {
    const body = vectors.slice(i, i + 50).map((v) => JSON.stringify(v)).join('\n');
    const res = await fetch(`${CF_VEC}/upsert`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/x-ndjson' },
      body,
    });
    if (!res.ok) throw new Error(`Lỗi upsert Vectorize (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function deleteVectors(ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch(`${CF_VEC}/delete_by_ids`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.slice(i, i + 100) }),
    });
    if (!res.ok) throw new Error(`Lỗi xóa vector (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function kvGet(key) {
  const res = await fetch(`${KV}/${key}`, { headers: H });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lỗi KV get (HTTP ${res.status}): ${await res.text()}`);
  return JSON.parse(await res.text());
}

async function kvPut(key, value) {
  const res = await fetch(`${KV}/${key}`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Lỗi KV put (HTTP ${res.status}): ${await res.text()}`);
}

// ---------- Chạy đồng bộ ----------
async function run() {
  console.log('🚀 Bắt đầu đọc toàn bộ tài liệu PDF/DOCX từ Google Drive...');

  const oldManifest = (await kvGet('manifest')) || {};
  const newManifest = {};

  const embeddings = new OpenAIEmbeddings({ 
    openAIApiKey: OPENAI_API_KEY, 
    modelName: 'text-embedding-3-small' 
  });
  
  // Tăng kích thước chunk và overlap để bảo toàn trọn vẹn sơ đồ và lưu đồ
  const splitter = new RecursiveCharacterTextSplitter({ 
    chunkSize: 1200, 
    chunkOverlap: 300 
  });

  const files = await listFolder(DRIVE_FOLDER);
  console.log(`📁 Tìm thấy ${files.length} tệp trên Google Drive`);
  const liveIds = new Set(files.map((f) => f.id));

  for (const f of files) {
    const name = f.path.normalize('NFC');
    if (isSkipped(f.name)) { console.log(`⏭️  Bỏ qua: ${name}`); continue; }

    const version = f.md5Checksum || f.modifiedTime;
    const old = oldManifest[f.id];

    try {
      const dl = await downloadFile(f);
      if (!dl) { console.log(`⏭️  Không hỗ trợ định dạng: ${name}`); continue; }

      const rawExtracted = await extractText(dl.buffer, dl.ext);
      const cleaned = cleanDocumentText(rawExtracted);

      if (!cleaned || cleaned.length <= 10) {
        console.log(`⚠️  Tệp không có nội dung text: ${name}`);
        if (old) newManifest[f.id] = old;
        continue;
      }

      // Kiểm tra thay đổi
      if (!FORCE && old && old.version === version) {
        newManifest[f.id] = { ...old, name };
        console.log(`✔️  Tệp không đổi: ${name}`);
        continue;
      }

      const docs = await splitter.createDocuments([cleaned]);
      // Gắn kèm tiền tố ngữ cảnh tên tài liệu vào từng đoạn
      const texts = docs
        .map((d) => `[Tài liệu: ${name}]\n${d.pageContent.replace(/[\u0000-\u001F\uFFFD]/g, '').trim()}`)
        .filter((t) => t.length >= 20);

      console.log(`🧠 Đang tạo Embedding ${texts.length} đoạn cho: ${name}`);
      const vectors = (await embeddings.embedDocuments(texts)).map((values, i) => ({
        id: chunkId(f.id, i),
        values,
        metadata: { text: texts[i], source: name },
      }));
      
      await upsertVectors(vectors);

      // Xoá các chunk cũ dư thừa
      if (old && old.chunks > texts.length) {
        await deleteVectors(
          Array.from({ length: old.chunks - texts.length }, (_, k) => chunkId(f.id, texts.length + k))
        );
      }

      newManifest[f.id] = { name, version, chunks: texts.length };
      console.log(`   ✔️ Đã nạp thành công ${texts.length} đoạn vào Vectorize.`);
    } catch (err) {
      console.error(`❌ Lỗi khi xử lý ${name}:`, err.message);
      if (old) newManifest[f.id] = old;
    }
  }

  // Dọn dẹp vector của các tệp đã xóa
  for (const [id, info] of Object.entries(oldManifest)) {
    if (newManifest[id]) continue;
    if (liveIds.has(id) && !isSkipped(info.name.split('/').pop())) continue;
    try {
      await deleteVectors(Array.from({ length: info.chunks }, (_, k) => chunkId(id, k)));
      console.log(`🗑️  Đã xóa dữ liệu vector cũ: ${info.name}`);
    } catch (err) {
      console.error(`❌ Không thể xóa vector của ${info.name}:`, err.message);
      newManifest[id] = info;
    }
  }

  await kvPut('manifest', newManifest);
  const total = Object.values(newManifest).reduce((a, b) => a + (b.chunks || 0), 0);
  console.log(`\n🎉 HOÀN TẤT ĐỒNG BỘ: ${Object.keys(newManifest).length} tệp, tổng cộng ${total} đoạn vector sẵn sàng phục vụ RAG.`);
}

run().catch((err) => { console.error(err); process.exit(1); });