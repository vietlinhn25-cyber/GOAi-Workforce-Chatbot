import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

type Bindings = {
  chat_history_db: D1Database
  VECTORIZE: VectorizeIndex
  DOCUMENTS_BUCKET: R2Bucket
  SECRET_TOKEN: string
  OPENAI_API_KEY: string
  ADMIN_TOKEN?: string
  MIN_SCORE?: string
  DRIVE_FOLDER_ID?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REFRESH_TOKEN?: string
  KB_META?: KVNamespace
  AI?: any
}
type Ctx = Context<{ Bindings: Bindings }>

const app = new Hono<{ Bindings: Bindings }>()
app.use('/*', cors())

app.use('/*', async (c, next) => {
  await next()
  const ct = c.res.headers.get('Content-Type') || ''
  if (/^application\/json\s*$/i.test(ct)) c.res.headers.set('Content-Type', 'application/json; charset=UTF-8')
})

// =====================================================================
// CẤU HÌNH HỆ THỐNG
// =====================================================================
const ALLOWED_SECRET_TOKEN = 'GO_AI_SECURE_TOKEN_2026_XYZ'
const FAQ_FILE_KEY = 'FAQs tĩnh.txt'
const KB_FOLDER_PREFIX = 'Knowledge Base-chatbotGoAI Cloudflare/'
const FAQ_MATCH_THRESHOLD = 0.45
const DEFAULT_MIN_SCORE = 0.16
const MAX_MESSAGE_LENGTH = 600
const FAQ_CACHE_TTL_MS = 20_000
const KB_TOP_K = 15

const ONLINE_FROM_HOUR = 7
const isOnlineVN = () => ((new Date().getUTCHours() + 7) % 24) >= ONLINE_FROM_HOUR
const OFFLINE_TEXT = '🌙 Hiện ngoài giờ hoạt động của trợ lý AI (07:00 – 24:00, giờ Việt Nam). Anh/chị vẫn có thể xem các câu hỏi thường gặp; tính năng đăng ký mở khóa AI suy luận sẽ hoạt động lại từ 07:00.'

const CONTACT_INTENTS = ['đặt lịch', 'liên hệ', 'hotline', 'số điện thoại', 'gặp chuyên gia', 'tư vấn 1-1', 'tư vấn trực tiếp', 'địa chỉ công ty']
const CONTACT_TEXT =
  "Dạ, anh/chị có thể trao đổi trực tiếp với chuyên gia Go AI qua:\n- Email: info@aifirstbusiness.vn\n- Điện thoại: +84 905 885 539\n- Địa chỉ: 29 Lê Duẩn, Sài Gòn, TP.HCM\nChuyên gia cũng sẽ chủ động liên hệ anh/chị theo thông tin đã đăng ký sớm nhất."

const OFF_TOPIC_TEXT =
  "Xin lỗi anh/chị, tôi là Trợ lý AI chuyên trách của Go AI và chỉ hỗ trợ giải đáp các giải pháp AI, tự động hóa quy trình và bảo mật dữ liệu doanh nghiệp trong phạm vi tài liệu nội bộ được cung cấp. Câu hỏi này không thuộc phạm vi hỗ trợ nên hệ thống **KHÔNG tính lượt hỏi** này."

// NGUYÊN BẢN CÂU HỎI FAQ TĨNH
const CORE_FAQS_TEXT = `
I. Giải pháp cốt lõi Go AI
1. Tự Động Tác Vụ?
**Tự Động Tác Vụ (Task Automation)** của Go AI giúp doanh nghiệp ứng dụng AI để tự động xử lý các công việc lặp lại hằng ngày của từng vị trí nhân sự như: soạn thảo, tóm tắt tài liệu, bóc tách dữ liệu từ hóa đơn/biểu mẫu, phân loại email và lập báo cáo nhanh. Giải pháp giúp tiết kiệm 40–70% thời gian thao tác tay và chuẩn hóa chất lượng đầu ra.

2. Tự Động Quy Trình?
**Tự Động Quy Trình (AI Workflow Automation)** kết nối liền mạch các bước công việc liên phòng ban (Bán hàng, Marketing, Tài chính - Kế toán, Nhân sự, Vận hành) với hệ thống CRM, ERP, MISA, Email và Zalo hiện có. Dữ liệu được luân chuyển tự động kèm các điểm kiểm duyệt rõ ràng, giúp giảm độ trễ vận hành và đo lường hiệu quả minh bạch.

3. Tự Động Đa Tác Nhân?
**Tự Động Đa Tác Nhân (Multi-Agent System - MAS)** là hệ thống nhiều AI Agent chuyên trách phối hợp cùng nhau như một đội ngũ nhân sự số (Agent thu thập thông tin, Agent phân tích nghiệp vụ, Agent đối soát chất lượng) dưới sự giám sát và phê duyệt của con người (Human-in-the-loop), giúp giải quyết trọn vẹn các nghiệp vụ phức tạp của doanh nghiệp.

4. Bảo mật dữ liệu DCS?
**Bảo mật dữ liệu trọng tâm (Data-Centric Security - DCS)** của Go AI bảo vệ trực tiếp vào từng tệp dữ liệu và tài liệu nội bộ thay vì chỉ bảo vệ lớp mạng hay thiết bị. Quyền truy cập, mã hóa, chống sao chép/chia sẻ trái phép và nhật ký kiểm toán (audit log) luôn đi kèm theo file ngay cả khi dữ liệu di chuyển, tuân thủ nghiêm ngặt quy định bảo vệ dữ liệu.

5. Tôi chưa biết bắt đầu từ đâu?
Với doanh nghiệp mới bắt đầu, Go AI đồng hành theo lộ trình 3 bước tinh gọn và thực chất:
1. **Đánh giá mức độ sẵn sàng AI (AI Readiness - EAR):** Khảo sát quy trình, dữ liệu và chọn đúng điểm nghẽn mang lại hiệu quả nhanh nhất.
2. **Thí điểm (Pilot) quy mô gọn:** Triển khai thử nghiệm trên 1 tác vụ hoặc 1 quy trình ưu tiên trong vài tuần để đo lường ROI thực tế.
3. **Chuẩn hóa & Nhân rộng:** Đào tạo nhân sự, thiết lập khung quản trị - bảo mật dữ liệu và mở rộng sang các phòng ban khác.

6. Doanh nghiệp của bạn đang ở đâu?
Mỗi doanh nghiệp thường nằm ở một trong 3 cấp độ chuyển đổi AI:
1. **Khởi đầu (Tự động tác vụ):** Ứng dụng AI hỗ trợ cá nhân xử lý công việc lặp lại.
2. **Kết nối (Tự động quy trình):** Tích hợp AI vào luồng việc liên phòng ban và phần mềm nội bộ (CRM, ERP).
3. **Chuyên sâu (Hệ thống đa tác nhân & Bảo mật DCS):** Vận hành đội ngũ AI Agent có kiểm soát và bảo vệ dữ liệu trọng tâm.

7. AI First Business là gì?
**AI First Business (by IEP - Go AI)** là hệ sinh thái giải pháp tư vấn, chuyển đổi AI, tự động hóa quy trình (AI Automation / Multi-Agent) và bảo mật dữ liệu trọng tâm (DCS) giúp doanh nghiệp Việt Nam ứng dụng AI vào vận hành thực tế một cách bài bản, an toàn và đo lường được hiệu quả (ROI).

8. Bảo mật dữ liệu doanh nghiệp là gì?
**Bảo mật dữ liệu doanh nghiệp** khi ứng dụng AI là việc kiểm soát chặt chẽ quyền truy cập, phân loại dữ liệu nhạy cảm, mã hóa tài liệu, ngăn chặn rò rỉ dữ liệu ra các nền tảng AI công cộng và duy trì nhật ký giám sát (audit log) tuân thủ Nghị định 13/2023/NĐ-CP.

9. Bảo mật lấy dữ liệu làm trung tâm – DCS là gì?
**Bảo mật lấy dữ liệu làm trung tâm (Data-Centric Security - DCS)** là phương pháp gắn trực tiếp chính sách bảo vệ, mã hóa và phân quyền vào chính tệp dữ liệu thay vì chỉ dựng hàng rào bảo vệ thiết bị hay mạng. Nhờ đó, dữ liệu luôn được an toàn ngay cả khi được chia sẻ hoặc di chuyển ra ngoài phạm vi ban đầu.
`;

function getOpenAiKey(env: Bindings): string {
  const k = String(env.OPENAI_API_KEY || '').trim();
  if (k.length < 20) throw new Error('Thiếu OPENAI_API_KEY trong cấu hình.');
  return k;
}

function formatChatHistory(rows: any[]) {
  return rows.map(row => `${row.type === 'human' ? 'Khách hàng' : 'Go AI'}: ${row.message}`).join('\n');
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isAdmin(c: Ctx): boolean {
  const t = String(c.env.ADMIN_TOKEN || 'goai-admin-secure-2026').trim();
  const qKey = String(c.req.query('key') || c.req.header('x-admin-token') || '').trim();
  return Boolean(t && qKey === t);
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// =====================================================================
// 1. FAQs TĨNH
// =====================================================================
interface FaqEntry { id: number; section: string; question: string; answer: string; norm: string; grams: Set<string>; topic: Set<string> }

function normalize(s: string): string {
  return s.normalize('NFD').toLowerCase().replace(/đ/g, 'd').replace(/[\u0300-\u036f]/g, '')
    .replace(/↗/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\d+\s+/, '');
}
function makeGrams(norm: string): Set<string> {
  const w = norm.split(' ').filter(Boolean);
  const set = new Set<string>(w);
  for (let i = 0; i < w.length - 1; i++) set.add(w[i] + '_' + w[i + 1]);
  return set;
}
function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}
function topicWords(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(w => w.length >= 4));
}
function topicSim(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.sqrt(a.size * b.size);
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const START_LOWER = /^\p{Ll}/u;
const TERMINAL = /[.!?？:;…)\]"”'’»*]$/;
const STRUCTURAL = /^(?:[IVXLCDM]+\.\s|\d{1,4}\s*[.)]\s|[-*•–]\s|(?:Hỏi|Câu\s*hỏi|Q|Đáp|Trả\s*lời|A)(?:\s*\d+)?\s*[:.\-]|[_\-=─—]{3,}$)/i;

function unwrapSoftWraps(text: string): string {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const prev = out.length ? out[out.length - 1] : '';
    if (line && prev && !TERMINAL.test(prev) && START_LOWER.test(line) && !STRUCTURAL.test(line)) {
      out[out.length - 1] = prev + ' ' + line;
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

const goodSuggestion = (e: FaqEntry) =>
  e.question.length >= 8 && e.question.length <= 150 && /^[\p{Lu}\d]/u.test(e.question) && e.answer.length >= 40;

function parseFaqs(text: string): FaqEntry[] {
  const lines = unwrapSoftWraps(text.replace(/^\uFEFF/, '')).split(/\r?\n/);
  const entries: FaqEntry[] = [];
  let section = 'Thông tin chung';
  let cur: { question: string; answer: string[] } | null = null;

  const flush = () => {
    if (cur && cur.question) {
      const q = cur.question.trim();
      const answer = cur.answer.join('\n').trim();
      if (answer) {
        const prev = entries[entries.length - 1];
        if (prev && (START_LOWER.test(q) || (answer.length < 40 && !TERMINAL.test(answer)))) {
          prev.answer = (prev.answer + '\n' + q + '\n' + answer).trim();
          prev.topic = topicWords(prev.question + ' ' + prev.answer);
        } else {
          const norm = normalize(q);
          entries.push({
            id: entries.length,
            section,
            question: q,
            answer,
            norm,
            grams: makeGrams(norm),
            topic: topicWords(q + ' ' + answer)
          });
        }
      }
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (cur && cur.answer.length && cur.answer[cur.answer.length - 1] !== '') cur.answer.push('');
      continue;
    }
    if (/^[_\-=─—]{3,}$/.test(line)) { flush(); continue; }

    const sec = line.match(/^[IVXLCDM]+\.\s+(\S.*)$/i);
    if (sec && !/[?？]$/.test(line)) { flush(); section = sec[1].trim(); continue; }

    const oldQ = line.match(/^(?:(?:\d+[\.\)]|\*|-)\s*)?(?:\*\*|__)?(?:Hỏi|Câu\s*hỏi|Q)(?:\s*\d+)?(?:\*\*|__)?\s*[:.-]\s*(.+)$/i);
    if (oldQ) { flush(); cur = { question: oldQ[1].replace(/[*_]/g, '').trim(), answer: [] }; continue; }

    const oldA = line.match(/^(?:(?:\d+[\.\)]|\*|-)\s*)?(?:\*\*|__)?(?:Đáp|Trả\s*lời|A)(?:\s*\d+)?(?:\*\*|__)?\s*[:.-]\s*(.*)$/i);
    if (oldA && cur) { if (oldA[1].trim()) cur.answer.push(oldA[1].trim()); continue; }

    const numQ = line.match(/^(\d{1,4})\s*[.)]\s*(.+[?？])$/);
    if (numQ && !(cur && START_LOWER.test(numQ[2].trim()))) { flush(); cur = { question: numQ[2].trim(), answer: [] }; continue; }

    if (cur) cur.answer.push(line);
  }
  flush();
  return entries;
}

const BUTTON_SYNONYMS: Record<string, string[]> = {
  'tu dong tac vu': ['task automation', 'tu dong hoa tac vu', 'ai automation la gi'],
  'tu dong quy trinh': ['workflow automation', 'tu dong hoa quy trinh', 'quy trinh nao nen tu dong hoa'],
  'tu dong da tac nhan': ['multi agent', 'da tac nhan', 'he thong da tac nhan', 'mas la gi'],
  'bao mat du lieu dcs': ['data centric security', 'bao mat du lieu dsc', 'bao ve du lieu', 'bao mat lay du lieu lam trung tam dcs la gi'],
  'toi chua biet bat dau tu dau': ['bat dau tu dau', 'nen bat dau ai tu dau', 'buoc dau tien', 'doanh nghiep cua ban dang o dau']
};

function matchFaq(entries: FaqEntry[], message: string) {
  const norm = normalize(message);
  const g = makeGrams(norm);
  const altTerms = BUTTON_SYNONYMS[norm] || [];

  const ranked = entries.map(entry => {
    let score = 0;
    if (norm && norm === entry.norm) {
      score = 1;
    } else if (altTerms.some(t => entry.norm.includes(t) || t.includes(entry.norm))) {
      score = 0.96;
    } else {
      const [short, long] = norm.length <= entry.norm.length ? [norm, entry.norm] : [entry.norm, norm];
      if (short.length >= 8 && long.includes(short)) score = 0.95;
      else score = dice(g, entry.grams);
    }
    return { entry, score };
  }).sort((a, b) => b.score - a.score || a.entry.norm.length - b.entry.norm.length);
  return { best: ranked[0]?.entry ?? null, score: ranked[0]?.score ?? 0, ranked };
}

let faqCache: { entries: FaqEntry[]; at: number; source: string } | null = null;

async function loadFaqs(bucket: R2Bucket): Promise<FaqEntry[]> {
  const now = Date.now();
  if (faqCache && now - faqCache.at < FAQ_CACHE_TTL_MS) return faqCache.entries;

  const coreEntries = parseFaqs(CORE_FAQS_TEXT);
  let r2Entries: FaqEntry[] = [];
  let sourceUsed = 'core_builtin';

  try {
    const keysToTry = [
      FAQ_FILE_KEY,
      FAQ_FILE_KEY.normalize('NFD'),
      FAQ_FILE_KEY.normalize('NFC'),
      KB_FOLDER_PREFIX + FAQ_FILE_KEY,
      (KB_FOLDER_PREFIX + FAQ_FILE_KEY).normalize('NFD'),
      (KB_FOLDER_PREFIX + FAQ_FILE_KEY).normalize('NFC')
    ];

    let obj: R2ObjectBody | null = null;
    for (const k of keysToTry) {
      obj = await bucket.get(k);
      if (obj) { sourceUsed = k; break; }
    }

    if (!obj) {
      const listed = await bucket.list();
      const found = listed.objects.find(o => {
        const k = o.key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return o.key.toLowerCase().endsWith('.txt') && k.includes('faq');
      });
      if (found) {
        obj = await bucket.get(found.key);
        sourceUsed = found.key;
      }
    }

    if (obj) {
      r2Entries = parseFaqs(await obj.text());
    }
  } catch (err) {
    console.error('Lỗi đọc FAQs tĩnh.txt từ R2:', err);
  }

  const merged: FaqEntry[] = [...r2Entries];
  const existingNorms = new Set(r2Entries.map(e => e.norm));
  for (const cEntry of coreEntries) {
    if (!existingNorms.has(cEntry.norm)) {
      merged.push({ ...cEntry, id: merged.length });
    }
  }

  faqCache = { entries: merged, at: now, source: sourceUsed };
  return merged;
}

function formatSuggestions(list: FaqEntry[]): string {
  if (!list.length) return '';
  return `\n\n[SUGGESTIONS: ${list.map(e => e.question.replace(/\|/g, '/')).join(' | ')}]`;
}

function defaultSuggestions(allEntries: FaqEntry[]): FaqEntry[] {
  const entries = allEntries.filter(goodSuggestion);
  const seen = new Set<string>();
  const out: FaqEntry[] = [];
  for (const e of entries) {
    if (!seen.has(e.section)) { seen.add(e.section); out.push(e); }
    if (out.length === 3) break;
  }
  if (out.length < 3) {
    for (const e of entries) {
      if (out.length >= 3) break;
      if (!out.some(o => o.id === e.id)) out.push(e);
    }
  }
  return out;
}

function relatedSuggestions(entries: FaqEntry[], hit: FaqEntry, asked: unknown = []): FaqEntry[] {
  const askedNorm = new Set((Array.isArray(asked) ? asked : []).map(q => normalize(String(q))));
  askedNorm.add(hit.norm);
  const pool = entries.filter(e => e.id !== hit.id && !askedNorm.has(e.norm) && goodSuggestion(e));
  if (!pool.length) return [];

  const scored = pool.map(e => ({ e, s: topicSim(hit.topic, e.topic) })).sort((x, y) => y.s - x.s);
  const out: FaqEntry[] = [];
  const take = (e?: FaqEntry) => { if (e && !out.some(o => o.id === e.id)) out.push(e); };

  const same = pool.filter(e => e.section === hit.section);
  const sameOrdered = [...same.filter(e => e.id > hit.id), ...same.filter(e => e.id < hit.id)];
  take(sameOrdered[Math.floor(Math.random() * Math.min(2, sameOrdered.length))]);

  const cross = scored.filter(x => x.e.section !== hit.section && x.s > 0).slice(0, 2);
  take(cross.length ? cross[Math.floor(Math.random() * cross.length)].e : undefined);

  take(shuffle(scored.filter(x => !out.some(o => o.id === x.e.id)).slice(0, 8).map(x => x.e))[0]);

  for (const x of scored) { if (out.length >= 3) break; take(x.e); }
  return out.slice(0, 3);
}

async function offTopicResponse(bucket: R2Bucket) {
  const entries = await loadFaqs(bucket);
  const sugg = defaultSuggestions(entries);
  return {
    reply: OFF_TOPIC_TEXT + formatSuggestions(sugg),
    suggestions: sugg.map(s => s.question),
    offTopic: true
  };
}

// =====================================================================
// GIAO DIỆN & ENGINE ĐỒNG BỘ PDF/DOCX TỪ GOOGLE DRIVE TRÊN TRÌNH DUYỆT
// =====================================================================

app.get('/admin/sync-ui', async (c) => {
  const html = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="utf-8">
    <title>Đồng bộ Knowledge Base từ Google Drive</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- Nạp pdf.js và mammoth.js trực tiếp trên trình duyệt để đọc sâu 100% tài liệu nhị phân PDF/Word -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; padding: 40px; color: #111827; }
      h2 { font-size: 24px; font-weight: 700; margin-bottom: 24px; }
      input { width: 100%; max-width: 500px; padding: 10px 14px; font-size: 14px; border: 1px solid #94a3b8; border-radius: 4px; outline: none; margin-bottom: 16px; display: block; }
      button { background: #e2e8f0; color: #0f172a; border: 1px solid #cbd5e1; padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 4px; }
      button:hover { background: #cbd5e1; }
      #logs { margin-top: 30px; font-family: monospace; font-size: 13.5px; line-height: 1.7; white-space: pre-wrap; color: #1e293b; }
    </style>
  </head>
  <body>
    <h2>Đồng bộ Knowledge Base từ Google Drive</h2>
    <input type="password" id="adminKey" placeholder="Nhập Token quản trị (ADMIN_TOKEN)" value="${escapeHtml(c.req.query('key') || '')}">
    <button type="button" id="btnSync">Bắt đầu đồng bộ</button>
    <div id="logs"></div>

    <script>
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      async function extractTextFromPdf(arrayBuffer) {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          let lastY, pageText = '';
          for (const item of content.items) {
            if (lastY == item.transform[5] || !lastY) {
              pageText += item.str + ' ';
            } else {
              pageText += '\\n' + item.str + ' ';
            }
            lastY = item.transform[5];
          }
          fullText += pageText + '\\n\\n';
        }
        return fullText;
      }

      async function extractTextFromDocx(arrayBuffer) {
        const res = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        return res.value || '';
      }

      document.getElementById('btnSync').onclick = async () => {
        const key = document.getElementById('adminKey').value.trim();
        const logs = document.getElementById('logs');
        if (!key) { alert('Vui lòng nhập Admin Token'); return; }
        logs.textContent = '⏳ Đang quét danh sách tệp từ Google Drive...\\n';

        try {
          // 1. Lấy danh sách tệp và link tải
          const listRes = await fetch('/admin/list-drive-files', {
            headers: { 'x-admin-token': key }
          });
          const listData = await listRes.json();
          if (listData.error) throw new Error(listData.message);

          const files = listData.files || [];
          logs.textContent += '📁 Tìm thấy ' + files.length + ' tệp trên Google Drive.\\n';

          for (let idx = 0; idx < files.length; idx++) {
            const f = files[idx];
            logs.textContent += '\\n[' + (idx + 1) + '/' + files.length + '] Đang đọc: ' + f.name + '...\\n';

            // 2. Tải nội dung nhị phân của tệp
            const fileRes = await fetch('/admin/download-drive-file?fileId=' + f.id, {
              headers: { 'x-admin-token': key }
            });
            const buffer = await fileRes.arrayBuffer();

            let text = '';
            if (f.name.toLowerCase().endsWith('.pdf')) {
              text = await extractTextFromPdf(buffer);
            } else if (f.name.toLowerCase().endsWith('.docx')) {
              text = await extractTextFromDocx(buffer);
            } else {
              text = new TextDecoder().decode(buffer);
            }

            if (!text || text.trim().length <= 10) {
              logs.textContent += '⚠️ Tệp rỗng hoặc không trích xuất được chữ: ' + f.name + '\\n';
              continue;
            }

            // 3. Gửi văn bản đã bóc tách lên Worker để chia đoạn và Embed vào Vectorize
            const ingestRes = await fetch('/admin/ingest-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-admin-token': key },
              body: JSON.stringify({ name: f.name, text: text })
            });
            const ingestData = await ingestRes.json();
            if (ingestData.error) throw new Error(ingestData.message);

            logs.textContent += '   ✔️ ' + f.name + ' - đã nạp ' + ingestData.chunks + ' đoạn vào Vectorize.\\n';
          }

          logs.textContent += '\\n🎉 Hoàn tất toàn bộ! Toàn bộ sơ đồ, bảng biểu và văn bản đã sẵn sàng trong Vectorize.';
        } catch(e) {
          logs.textContent += '\\n❌ Lỗi: ' + e.message;
        }
      };
    </script>
  </body>
  </html>`;
  return c.html(html);
});

// =====================================================================
// GOOGLE DRIVE + INGEST DÙNG CHUNG (trang /admin/sync-ui, Cron 2h sáng, /admin/run-sync)
// =====================================================================
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface DriveFile { id: string; name: string; mimeType: string; modifiedTime?: string; md5Checksum?: string }

// Helper lấy Google Access Token từ Refresh Token
async function getGoogleAccessToken(env: Bindings): Promise<string> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token'
    })
  });
  const data: any = await tokenRes.json();
  if (!tokenRes.ok || !data.access_token) {
    throw new Error('Lỗi Google OAuth: ' + (data.error_description || JSON.stringify(data)));
  }
  return data.access_token;
}

// Liệt kê tệp trong thư mục Drive (có phân trang, hỗ trợ thư mục "Được chia sẻ với tôi")
async function listDriveFiles(env: Bindings, accessToken: string): Promise<DriveFile[]> {
  const folderId = String(env.DRIVE_FOLDER_ID || '').trim();
  if (!folderId) throw new Error('Thiếu DRIVE_FOLDER_ID trong cấu hình.');
  const files: DriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false and mimeType != '${GOOGLE_FOLDER_MIME}'`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)',
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data: any = await res.json();
    if (!res.ok) throw new Error('Lỗi Google Drive: ' + (data?.error?.message || res.status));
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return files;
}

function isSupportedDriveFile(f: DriveFile): boolean {
  const n = f.name.toLowerCase();
  return f.mimeType === GOOGLE_DOC_MIME || f.mimeType === PDF_MIME || f.mimeType === DOCX_MIME ||
    n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.txt') || n.endsWith('.md');
}

async function downloadDriveFile(accessToken: string, f: DriveFile): Promise<ArrayBuffer> {
  const id = encodeURIComponent(f.id);
  const url = f.mimeType === GOOGLE_DOC_MIME
    ? `${DRIVE_API}/files/${id}/export?mimeType=text/plain`
    : `${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Không tải được "${f.name}" (HTTP ${res.status})`);
  return res.arrayBuffer();
}

// Bóc tách chữ ngay trên server (Cron không có trình duyệt nên không dùng được pdf.js/mammoth).
// PDF/DOCX được đọc bằng Workers AI toMarkdown (cần binding "AI" trong wrangler.jsonc).
async function extractTextOnServer(env: Bindings, f: DriveFile, buf: ArrayBuffer): Promise<string> {
  const lower = f.name.toLowerCase();
  const isPdf = f.mimeType === PDF_MIME || lower.endsWith('.pdf');
  const isDocx = f.mimeType === DOCX_MIME || lower.endsWith('.docx');
  if (isPdf || isDocx) {
    if (!env.AI?.toMarkdown) throw new Error('Thiếu binding "AI" (Workers AI) trong wrangler.jsonc nên không đọc được PDF/DOCX trên server.');
    const blob = new Blob([buf], { type: isPdf ? PDF_MIME : DOCX_MIME });
    const out = await env.AI.toMarkdown([{ name: f.name, blob }]);
    const r = Array.isArray(out) ? out[0] : out;
    if (!r || r.format === 'error') throw new Error(r?.error || 'toMarkdown không đọc được tệp');
    return String(r.data || '');
  }
  return new TextDecoder().decode(buf);
}

// Băm nhỏ văn bản (kèm Header ngữ cảnh) và đưa vào Vectorize
async function ingestDocument(env: Bindings, name: string, text: string): Promise<number> {
  const embeddings = new OpenAIEmbeddings({ openAIApiKey: getOpenAiKey(env), modelName: "text-embedding-3-small" });
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1200, chunkOverlap: 300 });

  const docs = await splitter.createDocuments([text]);
  const texts = docs.map(d => `[Tài liệu: ${name}]\n${d.pageContent.trim()}`).filter(t => t.length >= 20);

  if (texts.length > 0) {
    const vectors = await embeddings.embedDocuments(texts);
    const prefix = fnv1a(name);
    const toInsert = vectors.map((values, i) => ({
      id: `kb_${prefix}_${i}`,
      values,
      metadata: { text: texts[i], source: name }
    }));

    for (let i = 0; i < toInsert.length; i += 100) {
      await env.VECTORIZE.upsert(toInsert.slice(i, i + 100));
    }
  }
  return texts.length;
}

interface SyncResult {
  trigger: string; startedAt: string; finishedAt?: string;
  total: number; synced: number; skipped: number; failed: number; chunks: number; log: string[];
}

// Đồng bộ toàn bộ Knowledge Base từ Drive → Vectorize. Tệp không đổi (md5/modifiedTime) sẽ được bỏ qua để tiết kiệm token.
async function runDriveSync(env: Bindings, trigger: string, force = false): Promise<SyncResult> {
  const result: SyncResult = {
    trigger, startedAt: new Date().toISOString(), total: 0, synced: 0, skipped: 0, failed: 0, chunks: 0, log: []
  };
  const log = (m: string) => { result.log.push(m); console.log(`[drive-sync] ${m}`); };

  try {
    const accessToken = await getGoogleAccessToken(env);
    const files = await listDriveFiles(env, accessToken);
    result.total = files.length;
    log(`Tìm thấy ${files.length} tệp trên Google Drive.`);

    for (const f of files) {
      if (!isSupportedDriveFile(f)) { result.skipped++; log(`Bỏ qua (định dạng không hỗ trợ): ${f.name}`); continue; }

      const signature = f.md5Checksum || f.modifiedTime || '';
      const kvKey = `drive-sync:${f.id}`;
      try {
        if (!force && env.KB_META && signature && (await env.KB_META.get(kvKey)) === signature) {
          result.skipped++; log(`Không thay đổi, bỏ qua: ${f.name}`); continue;
        }
        const buf = await downloadDriveFile(accessToken, f);
        const text = await extractTextOnServer(env, f, buf);
        if (!text || text.trim().length <= 10) { result.failed++; log(`Tệp rỗng hoặc không trích xuất được chữ: ${f.name}`); continue; }

        const n = await ingestDocument(env, f.name, text);
        if (env.KB_META && signature) await env.KB_META.put(kvKey, signature);
        result.synced++; result.chunks += n;
        log(`Đã nạp ${n} đoạn: ${f.name}`);
      } catch (e: any) {
        result.failed++; log(`LỖI ${f.name}: ${e?.message || e}`);
      }
    }
  } catch (e: any) {
    result.failed++; log(`LỖI: ${e?.message || e}`);
  }

  result.finishedAt = new Date().toISOString();
  if (env.KB_META) { try { await env.KB_META.put('drive-sync:last-run', JSON.stringify(result)); } catch { /* bỏ qua */ } }
  return result;
}

// API: Lấy danh sách tệp Drive (dùng cho trang /admin/sync-ui)
app.get('/admin/list-drive-files', async (c) => {
  if (!isAdmin(c)) return c.json({ error: true, message: 'Sai Admin Token' }, 401);
  try {
    const accessToken = await getGoogleAccessToken(c.env);
    return c.json({ files: await listDriveFiles(c.env, accessToken) });
  } catch (err: any) {
    return c.json({ error: true, message: err.message }, 500);
  }
});

// API: Tải tệp nhị phân từ Drive (dùng cho trang /admin/sync-ui)
app.get('/admin/download-drive-file', async (c) => {
  if (!isAdmin(c)) return c.text('Unauthorized', 401);

  const fileId = c.req.query('fileId');
  if (!fileId) return c.text('Thiếu fileId', 400);

  try {
    const accessToken = await getGoogleAccessToken(c.env);
    const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return c.text(`Drive trả về lỗi HTTP ${res.status}`, 502);
    return new Response(res.body, { headers: { 'Content-Type': 'application/octet-stream' } });
  } catch (err: any) {
    return c.text(err.message, 500);
  }
});

// API: Băm nhỏ văn bản và đưa vào Vectorize (dùng cho trang /admin/sync-ui)
app.post('/admin/ingest-text', async (c) => {
  if (!isAdmin(c)) return c.json({ error: true, message: 'Unauthorized' }, 401);

  const body = await c.req.json();
  const name = String(body.name || 'document');
  const text = String(body.text || '');

  try {
    const chunks = await ingestDocument(c.env, name, text);
    return c.json({ success: true, chunks });
  } catch (err: any) {
    return c.json({ error: true, message: err.message }, 500);
  }
});

// API: Chạy đồng bộ ngay trên server (giống hệt Cron). Thêm ?force=1 để nạp lại cả tệp không đổi.
app.all('/admin/run-sync', async (c) => {
  if (!isAdmin(c)) return c.json({ error: true, message: 'Unauthorized' }, 401);
  const result = await runDriveSync(c.env, 'manual', c.req.query('force') === '1');
  return c.json(result);
});

// API: Xem kết quả lần đồng bộ gần nhất (Cron hoặc thủ công)
app.get('/admin/sync-status', async (c) => {
  if (!isAdmin(c)) return c.json({ error: true, message: 'Unauthorized' }, 401);
  const raw = c.env.KB_META ? await c.env.KB_META.get('drive-sync:last-run') : null;
  return c.json(raw ? JSON.parse(raw) : { message: 'Chưa có lần đồng bộ nào được ghi nhận.' });
});

// API: Truy vết nguồn của một câu hỏi. Mở: /admin/trace?key=ADMIN_TOKEN&q=cách đo lường hiệu quả AI
// Chỉ tốn 1 lượt embedding, không gọi mô hình trả lời.
app.get('/admin/trace', async (c) => {
  if (!isAdmin(c)) return c.json({ error: true, message: 'Unauthorized' }, 401);
  const q = String(c.req.query('q') || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!q) return c.json({ error: true, message: 'Thiếu tham số q (câu hỏi cần truy vết)' }, 400);
  try {
    const t = await retrieveContexts(c.env, q);
    return c.json({
      question: q,
      minScore: t.minScore,
      sources: summarizeSources(t.faqHits, t.kbHits),
      faqMatches: t.faqHits.map(h => ({ question: h.question, score: +h.score.toFixed(3) })),
      kbMatches: t.kbHits.map(h => ({ source: h.source, score: +h.score.toFixed(3), preview: h.text.slice(0, 300) }))
    });
  } catch (err: any) {
    return c.json({ error: true, message: err.message }, 500);
  }
});

// =====================================================================
// RAG TỪ KNOWLEDGE BASE (dùng cho luồng chat và cho câu hỏi gợi ý do AI sinh ra)
// =====================================================================
interface KbHit { source: string; score: number; text: string }
interface FaqHit { question: string; score: number; answer: string }

// Truy xuất ngữ cảnh: FAQ tĩnh (R2) + các đoạn KB trong Vectorize (mỗi đoạn mang tên tệp Drive trong metadata.source)
async function retrieveContexts(env: Bindings, userMessage: string) {
  // Query Expansion động cho từ khóa sơ đồ/hình ảnh
  let retrievalQuery = userMessage;
  if (/(lưu đồ|sơ đồ|hình|bảng|quy trình|chuỗi bước)/i.test(userMessage)) {
    retrievalQuery = `${userMessage}\nQuy trình các bước lưu đồ tương tác Tác nhân AI Agent`;
  }

  const entries = await loadFaqs(env.DOCUMENTS_BUCKET);
  const { ranked } = matchFaq(entries, userMessage);
  const faqHits: FaqHit[] = ranked
    .filter(r => r.score >= 0.20)
    .slice(0, 3)
    .map(r => ({ question: r.entry.question, score: r.score, answer: r.entry.answer }));

  const embeddings = new OpenAIEmbeddings({ openAIApiKey: getOpenAiKey(env), modelName: "text-embedding-3-small" });
  const queryVector = await embeddings.embedQuery(retrievalQuery);

  const minScore = parseFloat(env.MIN_SCORE || '') || DEFAULT_MIN_SCORE;
  const vectorResults = await env.VECTORIZE.query(queryVector, { topK: KB_TOP_K, returnMetadata: 'all' });
  const kbHits: KbHit[] = (vectorResults?.matches || [])
    .filter(m => m.score >= minScore)
    .map(m => ({ source: String(m.metadata?.source || '(không rõ nguồn)'), score: m.score, text: String(m.metadata?.text || '') }))
    .filter(h => h.text.length > 0);

  return { retrievalQuery, minScore, faqHits, kbHits };
}

// Danh sách tên tệp nguồn (không trùng) của các đoạn đã đưa cho AI
function summarizeSources(faqHits: FaqHit[], kbHits: KbHit[]): string[] {
  const out: string[] = [];
  if (faqHits.length) out.push('FAQs tĩnh (R2 / FAQ tích hợp sẵn)');
  for (const h of kbHits) if (!out.includes(h.source)) out.push(h.source);
  return out;
}

async function answerFromKb(env: Bindings, userMessage: string, chatHistory: string): Promise<{ reply: string; sources: string[] } | null> {
  const apiKey = getOpenAiKey(env);
  const { faqHits, kbHits } = await retrieveContexts(env, userMessage);

  const combinedContexts = [
    ...faqHits.map(h => `[FAQ Khớp] Câu hỏi: ${h.question}\nNội dung: ${h.answer}`),
    ...kbHits.map(h => `[Nguồn: ${h.source}] ${h.text}`)
  ];
  if (!combinedContexts.length) return null;
  const contextText = combinedContexts.join("\n\n---\n\n");

  // System Prompt diễn giải biểu đồ và hình vẽ
  const systemPrompt = `Bạn là Chuyên gia Tư vấn Cấp cao của AI First Business (by IEP - Go AI). Bạn có nhiệm vụ giải đáp các câu hỏi dựa trên TÀI LIỆU NỘI BỘ được trích xuất tự động từ hệ thống.

TÀI LIỆU NỘI BỘ TRÍCH XUẤT:
${contextText}

LỊCH SỬ HỘI THOẠI:
${chatHistory}

QUY TẮC PHẢN HỒI THÔNG MINH (TUYỆT ĐỐI TUÂN THỦ):
1. XỬ LÝ HÌNH VẼ, SƠ ĐỒ, BẢNG BIỂU & QUY TRÌNH:
   - Khi tài liệu có trích xuất được đề mục sơ đồ, hình ảnh (ví dụ: "Hình 3.3", "Lưu đồ tương tác", "Quy trình", "Bảng..."): Bạn PHẢI đọc toàn bộ các bước/hành động xuất hiện trong các đoạn tài liệu trên và trình bày lại rõ ràng, đầy đủ từng bước theo dạng danh sách gạch đầu dòng hoặc đánh số.
   - TUYỆT ĐỐI KHÔNG mở đầu bằng câu xin lỗi kiểu "Go AI xin lỗi không có thông tin cụ thể" nếu tài liệu đã có các bước hoặc từ khóa giải thích đối tượng đó.
2. XỬ LÝ CÂU HỎI KHÁI NIỆM / ĐỊNH NGHĨA:
   - Nếu khách hỏi "X là gì" mà tài liệu mô tả X dưới dạng sơ đồ quy trình gồm các bước, hãy giải thích X chính là quy trình khép kín gồm các bước cụ thể đó.
3. PHẠM VI NỘI DUNG:
   - Chỉ sử dụng các dữ kiện, thuật ngữ và khái niệm có trong TÀI LIỆU NỘI BỘ trích xuất ở trên. Không suy diễn vượt ngoài tài liệu.
   - Nếu câu hỏi HOÀN TOÀN KHÔNG liên quan đến giải pháp, quy trình, bảo mật hay công nghệ của Go AI: CHỈ trả lời đúng một dòng: [OFF_TOPIC]

PHONG CÁCH TRÌNH BÀY:
- Xưng "Go AI", gọi khách là "anh/chị". Văn phong đĩnh đạc, rõ ràng, dùng **in đậm** cho các bước chính.
- Kết thúc bằng 1 câu gợi ý tinh tế.

TAG GỢI Ý (BẮT BUỘC nằm ở DÒNG CUỐI CÙNG, trừ khi trả lời [OFF_TOPIC]):
[SUGGESTIONS: câu 1 | câu 2 | câu 3]
- 3 câu hỏi ngắn gọn (tối đa 12 từ/câu), không lặp lại câu khách vừa hỏi, bám sát ngữ cảnh tài liệu ở trên.`;

  const model = new ChatOpenAI({ openAIApiKey: apiKey, modelName: "gpt-4o-mini", temperature: 0.2, maxTokens: 750 });
  const response = await model.invoke([
    ["system", systemPrompt],
    ["human", userMessage]
  ]);

  let aiReply = String(response.content ?? '').trim();
  if (!aiReply || aiReply.includes('[OFF_TOPIC]')) return null;

  if (!/\[SUGGESTIONS:[^\]]*\]/.test(aiReply)) {
    aiReply += '\n\n[SUGGESTIONS: Lộ trình triển khai AI ra sao? | Bảo mật dữ liệu DCS là gì? | Đặt lịch tư vấn 1-1]';
  }
  return { reply: aiReply, sources: summarizeSources(faqHits, kbHits) };
}

// Ghi nhớ các câu gợi ý do AI sinh ra (24h) để khi khách bấm vào, luồng FAQ biết đó là câu gợi ý hợp lệ và chuyển sang truy xuất KB.
async function rememberSuggestions(env: Bindings, list: string[]) {
  if (!env.KB_META) return;
  await Promise.all(list.map(s =>
    env.KB_META!.put(`sugg:${fnv1a(normalize(s))}`, '1', { expirationTtl: 86400 }).catch(() => {})
  ));
}
async function wasIssuedSuggestion(env: Bindings, msg: string): Promise<boolean> {
  if (!env.KB_META) return false;
  try { return (await env.KB_META.get(`sugg:${fnv1a(normalize(msg))}`)) !== null; } catch { return false; }
}

// =====================================================================
// XỬ LÝ CHAT / FAQ / LEAD
// =====================================================================
app.post('/chat', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: true, action: 'error', reply: 'Dữ liệu gửi lên không hợp lệ.' }, 400); }
  const incomingToken = String(c.req.header('x-goai-secret') || body.secret || '').trim();

  if (incomingToken !== ALLOWED_SECRET_TOKEN) {
    return c.json({ error: true, action: 'error', reply: 'Token không hợp lệ.' }, 401);
  }

  const action = body.action || 'chat';
  const sessionId = String(body.sessionId || '').slice(0, 120);
  const userMessage = String(body.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);

  if ((action === 'submit_lead' || action === 'chat') && !isOnlineVN()) {
    return c.json({ error: true, offline: true, counted: false, reply: OFFLINE_TEXT }, 403);
  }

  // 1. Luồng FAQ Tĩnh
  if (action === 'faq') {
    const entries = await loadFaqs(c.env.DOCUMENTS_BUCKET);
    const { best, score, ranked } = matchFaq(entries, userMessage);

    if (best && score >= FAQ_MATCH_THRESHOLD) {
      const rel = relatedSuggestions(entries, best, body.asked);
      return c.json({
        reply: best.answer + formatSuggestions(rel),
        suggestions: rel.map(s => s.question),
        offTopic: false
      });
    }

    // Câu gợi ý do AI sinh ra (không nằm trong FAQ tĩnh): truy xuất Knowledge Base và trả lời, không tính lượt
    if (userMessage && isOnlineVN() && await wasIssuedSuggestion(c.env, userMessage)) {
      try {
        let history = '';
        if (sessionId) {
          const { results: hRows } = await c.env.chat_history_db.prepare(
            `SELECT type, message FROM chat_history WHERE session_id = ? AND created_at >= datetime('now', '-8 hours') ORDER BY id DESC LIMIT 6`
          ).bind(sessionId).all();
          history = formatChatHistory([...(hRows as any[])].reverse());
        }
        const kb = await answerFromKb(c.env, userMessage, history);
        if (kb) {
          const kbSugg = kb.reply.match(/\[SUGGESTIONS:\s*(.+?)\]/i)?.[1]?.split('|').map(x => x.trim()).filter(Boolean) || [];
          await rememberSuggestions(c.env, kbSugg);
          if (sessionId) {
            await c.env.chat_history_db.prepare(
              `INSERT INTO chat_history (session_id, type, message) VALUES (?, 'ai', ?)`
            ).bind(sessionId, kb.reply).run();
          }
          return c.json({ reply: kb.reply, suggestions: kbSugg, offTopic: false, counted: false, sources: kb.sources });
        }
      } catch (err) {
        console.error('Lỗi truy xuất KB cho câu gợi ý:', err);
      }
    }

    const near = ranked.filter(r => r.score >= 0.2 && goodSuggestion(r.entry)).slice(0, 3).map(r => r.entry);
    const sugg = near.length ? near : defaultSuggestions(entries);
    return c.json({
      reply: 'Câu hỏi này hiện chưa có trong mục Câu hỏi thường gặp. Anh/chị có thể chọn một câu gợi ý bên dưới, hoặc để lại thông tin để được AI phân tích chuyên sâu theo tài liệu nội bộ.' + formatSuggestions(sugg),
      suggestions: sugg.map(s => s.question)
    });
  }

  // 2. Thu Lead
  if (action === 'submit_lead') {
    const leadData = body.lead_data;
    if (!sessionId || !leadData || !leadData.name || !leadData.phone) {
      return c.json({ error: true, reply: 'Thiếu thông tin đăng ký. Vui lòng điền đầy đủ biểu mẫu.' }, 400);
    }
    const submitTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const formattedPhone = "'" + String(leadData.phone).replace(/\D/g, '');

    const rowData = {
      "Lead ID": sessionId,
      "Submitted At": submitTime,
      "Họ & tên": leadData.name,
      "Điện thoại": formattedPhone,
      "Email": leadData.email,
      "Công ty": leadData.company,
      "Chức danh": leadData.title,
      "Ngành": leadData.industry,
      "Quy mô DN": leadData.size,
      "Tỉnh/TP": leadData.province,
      "Nguồn / Campaign": body.pageUrl || "Website",
      "Use case ưu tiên": leadData.needs,
      "Notes": leadData.note
    };

    try {
      await fetch('https://script.google.com/macros/s/AKfycbyKuCApk8n_7pOLxU1n3A1OMFp9RkiB9s_TMqTjgXdk8WTbr_4xmWgX7bdSalptDNhp/exec', {
        method: 'POST',
        body: JSON.stringify(rowData),
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error("Lỗi Google Sheets:", err);
    }

    const welcomeSuggestions = [
      "Doanh nghiệp của bạn đang ở đâu?",
      "AI First Business là gì?",
      "Bảo mật dữ liệu doanh nghiệp là gì?",
      "Bảo mật lấy dữ liệu làm trung tâm – DCS là gì?"
    ];

    return c.json({
      reply: `Cảm ơn anh/chị. Thông tin đăng ký đã được ghi nhận vào hệ thống!\n\n✨ **Đã kích hoạt AI Suy Luận.** Anh/chị có tối đa 5 câu hỏi phân tích chuyên sâu trong phạm vi tài liệu nội bộ, hoặc có thể khám phá ngay các câu hỏi gợi ý bên dưới (không tính lượt):\n\n[SUGGESTIONS: ${welcomeSuggestions.join(' | ')}]`,
      suggestions: welcomeSuggestions
    });
  }

  // 3. AI Suy Luận (RAG ĐÍCH THỰC)
  if (action === 'chat') {
    try {
      if (!sessionId) return c.json({ error: true, reply: 'Thiếu mã phiên, vui lòng bấm Làm mới và thử lại.' }, 400);
      if (!userMessage) return c.json(await offTopicResponse(c.env.DOCUMENTS_BUCKET));

      const lower = userMessage.toLowerCase();

      if (CONTACT_INTENTS.some(t => lower.includes(t))) {
        const entries = await loadFaqs(c.env.DOCUMENTS_BUCKET);
        const sugg = defaultSuggestions(entries);
        return c.json({
          reply: CONTACT_TEXT + formatSuggestions(sugg),
          suggestions: sugg.map(s => s.question),
          offTopic: false,
          counted: false
        });
      }

      const { results: countRes } = await c.env.chat_history_db.prepare(
        `SELECT COUNT(*) as count FROM chat_history WHERE session_id = ? AND type = 'human' AND created_at >= datetime('now', '-8 hours')`
      ).bind(sessionId).all();
      const currentCount = (countRes[0] as any)?.count || 0;

      if (currentCount >= 5) {
        return c.json({
          reply: "🔒 Anh/chị đã sử dụng hết **5 lượt** phân tích chuyên sâu của AI. Nhu cầu của anh/chị đã được chuyển tới Chuyên gia Go AI để liên hệ trực tiếp. Xin cảm ơn!",
          limitReached: true,
          used: 5,
          counted: false
        });
      }

      const directBlacklist = [
        'thời tiết', 'trời mưa', 'trời đẹp', 'đẹp trai', 'đẹp zai', 'xấu gái',
        'người yêu', 'nấu ăn', 'bóng đá', 'thể thao', 'hôm nay ăn gì', 'ai là ai',
        'ca sĩ', 'bài hát', 'xổ số', 'chứng khoán'
      ];
      if (directBlacklist.some(term => lower.includes(term))) {
        return c.json(await offTopicResponse(c.env.DOCUMENTS_BUCKET));
      }

      const { results: historyRows } = await c.env.chat_history_db.prepare(
        `SELECT type, message FROM chat_history WHERE session_id = ? AND created_at >= datetime('now', '-8 hours') ORDER BY id DESC LIMIT 6`
      ).bind(sessionId).all();
      const chatHistory = formatChatHistory([...(historyRows as any[])].reverse());

      const kb = await answerFromKb(c.env, userMessage, chatHistory);
      if (!kb) return c.json(await offTopicResponse(c.env.DOCUMENTS_BUCKET));
      const aiReply = kb.reply;

      await c.env.chat_history_db.prepare(
        `INSERT INTO chat_history (session_id, type, message) VALUES (?, ?, ?), (?, ?, ?)`
      ).bind(sessionId, 'human', userMessage, sessionId, 'ai', aiReply).run();

      const parsedSugg = aiReply.match(/\[SUGGESTIONS:\s*(.+?)\]/i)?.[1]?.split('|').map(s => s.trim()).filter(Boolean) || [];
      await rememberSuggestions(c.env, parsedSugg);

      return c.json({
        reply: aiReply,
        suggestions: parsedSugg,
        offTopic: false,
        counted: true,
        used: currentCount + 1,
        sources: kb.sources
      });

    } catch (error) {
      console.error("Lỗi AI Chat:", error);
      return c.json({ error: true, reply: "Hệ thống AI đang quá tải, vui lòng thử lại sau giây lát." }, 500);
    }
  }

  return c.json({ error: 'Invalid action' }, 400);
});

export default {
  fetch: app.fetch,
  // Cron Trigger: tự động đồng bộ Knowledge Base từ Google Drive (xem "triggers" trong wrangler.jsonc)
  async scheduled(event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runDriveSync(env, `cron ${event.cron}`));
  }
};