# 🤖 GOAi Workforce Chatbot: Hệ thống AI Agent RAG Tiếng Việt & Tự động hóa Thu Lead trên Cloudflare Edge

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Hono](https://img.shields.io/badge/Hono_Framework-E36002?style=for-the-badge&logo=hono&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI_GPT--4o--mini-412991?style=for-the-badge&logo=openai&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google_Drive_KB-4285F4?style=for-the-badge&logo=googledrive&logoColor=white)

## 📌 Tổng quan Dự án
**GOAi Workforce Chatbot (`ai-agent-worker`)** là hệ thống Backend AI Agent kiến trúc **RAG (Retrieval-Augmented Generation)** chuyên biệt cho tiếng Việt, được thiết kế cho nền tảng **Go AI / AI First Business** và vận hành hoàn toàn trên mạng lưới **Cloudflare Edge Serverless**.

Hệ thống kết nối trực tiếp với kho tri thức nội bộ trên **Google Drive**, tự động bóc tách, phân mảnh (chunking) và vector hóa tài liệu để giải đáp chính xác các truy vấn của khách hàng thông qua Web Widget theo thời gian thực. Song song với khả năng tư vấn tự động, nền tảng tích hợp phễu thu thập thông tin khách hàng tiềm năng (**Lead Generation Pipeline**) đồng bộ trực tiếp về Google Sheets và kiểm soát chi phí suy luận thông minh.

## 🏗️ Kiến trúc Hệ sinh thái Cloudflare Edge & AI
Hệ thống tận dụng tối đa sức mạnh của hệ sinh thái lưu trữ phân tán trên Cloudflare kết hợp với mô hình ngôn ngữ lớn từ OpenAI:

| Thành phần Hạ tầng | Tên Tài nguyên / Binding | Vai trò & Chức năng Cốt lõi |
| :--- | :--- | :--- |
| **Compute & Routing** | `ai-agent-worker` (Hono) | Xử lý định tuyến API độ trễ thấp, xác thực bảo mật, kiểm soát phiên và điều phối luồng RAG. |
| **Vector Database** | Vectorize (`kb_documents`) | Lưu trữ vector đa chiều và truy vấn ngữ nghĩa tốc độ cao các phân đoạn tài liệu nội bộ. |
| **Relational DB** | Cloudflare D1 (`chat_history_db`) | Lưu trữ lịch sử hội thoại theo `session_id`, phục vụ ngữ cảnh đa lượt và kiểm soát bộ đếm lượt hỏi. |
| **Object Storage** | Cloudflare R2 (`ai-kb-files`) | Lưu trữ bộ dữ liệu câu hỏi thường gặp tĩnh (`FAQs.txt`) và tài nguyên tri thức gốc. |
| **Key-Value Store** | Cloudflare KV (`KB_META`) | Lưu trữ chữ ký đồng bộ tệp (`MD5 manifest`), bộ nhớ đệm câu hỏi gợi ý từ AI (`TTL 24h`) và trạng thái đồng bộ. |
| **AI & LLM Engine** | OpenAI + LangChain | Sử dụng `text-embedding-3-small` để tạo vector nhúng và `gpt-4o-mini` để tổng hợp câu trả lời tự nhiên. |

## ✨ Luồng Xử lý Thông minh tại Endpoint `POST /chat`

Hệ thống phân luồng xử lý linh hoạt qua 3 tác vụ (`action`) nhằm tối ưu hóa tốc độ phản hồi và chi phí gọi API:

### 1. Luồng Khớp Mờ Tốc độ Cao (`action: faq`)
*   **Thuật toán So khớp Mờ (Fuzzy Matching):** Áp dụng hệ số tương đồng **Sørensen–Dice** trên cả *unigram* và *bigram* (với ngưỡng khớp `>= 0.45`) để đối chiếu tức thì câu hỏi của khách hàng với bộ FAQ tĩnh trên R2 mà không tốn chi phí gọi LLM.
*   **Bắc cầu Ngữ nghĩa Thông minh (AI Suggestion Bypass):** Nếu truy vấn không khớp FAQ tĩnh nhưng trùng khớp với **câu hỏi gợi ý do AI từng sinh ra** (được lưu đệm trong `KB_META`), hệ thống tự động chuyển hướng thẳng sang luồng suy luận RAG chuyên sâu và **miễn trừ tính lượt hỏi** cho khách hàng.

### 2. Luồng Thu thập Khách hàng Tiềm năng (`action: submit_lead`)
*   **Đồng bộ CRM Tự động:** Thu thập thông tin khách hàng (Họ tên, Số điện thoại, Email, Nhu cầu tư vấn) từ Widget và đẩy qua Webhook **Google Apps Script** để ghi nhận trực tiếp vào **Google Sheets**.
*   **Cơ chế Mở khóa Suy luận (Lead-Gated AI Unlock):** Sau khi khách hàng cung cấp thông tin liên hệ hợp lệ, hệ thống tự động mở khóa giới hạn phiên để tiếp tục hỗ trợ tư vấn chuyên sâu bằng AI.

### 3. Luồng Suy luận Ngữ cảnh RAG (`action: chat`)
*   **Kiểm soát Khung giờ Vận hành:** Tự động nhận diện múi giờ Việt Nam (`UTC+7`) và tạm ngưng suy luận ngoài giờ hành chính (`00:00 – 07:00`) để tối ưu tài nguyên và điều hướng khách để lại lời nhắn.
*   **Bộ lọc Ý định & Chủ đề (Intent & Off-topic Guardrails):** Tự động phát hiện ý định muốn liên hệ trực tiếp nhân viên tư vấn và chặn sớm các chủ đề nằm trong danh sách đen (blacklist) ngoài phạm vi doanh nghiệp.
*   **Quản lý Hạn mức Phiên (Session Quota):** Giới hạn **5 lượt hỏi chuyên sâu / phiên** trong chu kỳ **8 giờ** dựa trên lịch sử lưu tại cơ sở dữ liệu D1.
*   **Truy xuất Kết hợp (Hybrid Context Retrieval):** Kết hợp đồng thời **Top-3 kết quả FAQ** gần nhất cùng **Top-15 phân đoạn tài liệu từ Vectorize** (với ngưỡng điểm tương đồng tối thiểu `>= 0.16`).
*   **Sinh Phản hồi & Gợi ý Động:** Đưa toàn bộ ngữ cảnh vào `gpt-4o-mini` kèm System Prompt chuyên biệt; mô hình tự động đính kèm thẻ `[SUGGESTIONS: câu hỏi 1 | câu hỏi 2 | câu hỏi 3]` để dẫn dắt hội thoại hoặc gắn cờ `[OFF_TOPIC]` khi câu hỏi nằm ngoài phạm vi kiến thức.

## 🔄 Hệ thống Đồng bộ Tri thức Đa Kênh (3-Way Knowledge Base Ingestion)

Tài liệu từ **Google Drive** được chuẩn hóa qua quy trình: **Tách văn bản → Phân mảnh (`chunk size: 1200`, `overlap: 300`) → Tạo Embedding → Upsert vào Vectorize** thông qua 3 phương thức linh hoạt:

1.  **Đồng bộ Tự động phía Server (`runDriveSync`):** Chạy trực tiếp trên Worker, sử dụng **Cloudflare Workers AI (`toMarkdown`)** để chuyển đổi tài liệu và đối chiếu mã băm `MD5` nhằm bỏ qua các tệp không thay đổi.
2.  **Giao diện Quản trị Trực quan (`/admin/sync-ui`):** Cho phép quản trị viên duyệt tệp Google Drive, bóc tách nội dung tệp `.PDF` và `.DOCX` ngay trên trình duyệt bằng thư viện **PDF.js** và **Mammoth.js** trước khi nạp vào Vectorize.
3.  **Công cụ Đồng bộ Dòng lệnh (`sync-kb.mjs`):** Script chạy локал hỗ trợ quét đệ quy toàn bộ cây thư mục Google Drive, quản lý trạng thái qua `KV Manifest` và tự động dọn dẹp các vector cũ khi tài liệu gốc được cập nhật hoặc xóa bỏ.

## 🛠️ Hệ thống API & Endpoints Quản trị

| Phương thức | Đường dẫn Endpoint | Mô tả Chức năng |
| :--- | :--- | :--- |
| `POST` | `/chat` | Endpoint chính xử lý hội thoại khách hàng (`faq`, `submit_lead`, `chat`). |
| `GET` | `/admin/sync-ui` | Giao diện Web quản trị và đồng bộ tài liệu trực quan. |
| `GET` | `/admin/list-drive-files` | Liệt kê danh sách tài liệu hiện có trong thư mục Google Drive. |
| `GET` | `/admin/download-drive-file` | Tải và trích xuất nội dung tệp tin từ Google Drive. |
| `POST` | `/admin/ingest-text` | Nhận văn bản đã bóc tách, thực hiện chunking, embedding và lưu vào Vectorize. |
| `POST` | `/admin/run-sync` | Kích hoạt tiến trình đồng bộ toàn bộ kho tri thức phía Server. |
| `GET` | `/admin/sync-status` | Kiểm tra kết quả và lịch sử của phiên đồng bộ gần nhất từ `KB_META`. |
| `GET` | `/admin/trace` | Truy xuất nhật ký kiểm tra và gỡ lỗi luồng truy vấn RAG. |

## 🔒 Lộ trình Nâng cấp Bảo mật & Tối ưu Hóa Hạ tầng (Hardening Roadmap)
Dự án áp dụng quy trình kiểm toán bảo mật và tối ưu hóa vận hành theo 4 giai đoạn:
*   **Quản lý Khóa Bí mật (Secrets Management):** Chuyển toàn bộ thông tin xác thực nhạy cảm (`Google OAuth Client Secret`, `Refresh Token`, `OpenAI API Key`, `SECRET_TOKEN`, `ADMIN_TOKEN`) sang cơ chế mã hóa `wrangler secret put`, loại bỏ hoàn toàn khóa mặc định và không truyền token quản trị qua URL query string.
*   **Chống Lạm dụng & Bảo vệ Chi phí (Rate Limiting & CORS):** Tích hợp **Cloudflare Turnstile / IP Rate Limiting** để ngăn chặn hành vi giả mạo `sessionId` vượt hạn mức 5 lượt hỏi, đồng thời giới hạn chính sách `CORS` chỉ cho phép các tên miền chính thức của hệ thống Go AI.
*   **Chuẩn hóa Luồng Đồng bộ & Lập lịch Tự động:** Cấu hình `triggers.crons` (tự động đồng bộ lúc 02:00 sáng hàng ngày) cùng binding `AI` trong `wrangler.jsonc`; hợp nhất định dạng khóa Vector ID theo `fileId` và hỗ trợ xuất nội dung (`export`) đối với định dạng Google Docs gốc.
*   **Tối ưu Cơ sở dữ liệu D1 & Xác thực Lead:** Thực thi tự động `schema.sql`, bổ sung chỉ mục複合 `(session_id, created_at)` để tăng tốc truy vấn lịch sử, ghi nhận đầy đủ cả hai chiều hội thoại (`user` & `ai`) ở nhánh gợi ý và kiểm tra chặt chẽ mã trạng thái phản hồi từ Google Apps Script khi ghi nhận Lead.

## 👨‍💻 Tác giả
*   **Nguyễn Việt Linh** (JK-ENR-HA-11617) — *Cloud Infrastructure, AI Automation & System Administration*
