# 🤖 GOAi Workforce Chatbot (`ai-agent-worker`)
Backend chatbot tiếng Việt dùng tài liệu nội bộ để trả lời khách hàng và thu thập thông tin liên hệ trên Cloudflare Workers.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Hono](https://img.shields.io/badge/Hono_Framework-E36002?style=for-the-badge&logo=hono&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI_GPT--4o--mini-412991?style=for-the-badge&logo=openai&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google_Drive_KB-4285F4?style=for-the-badge&logo=googledrive&logoColor=white)

## 🎯 Dự án này làm gì?
Khi khách hàng vào website, họ thường hỏi nhiều câu lặp lại về dịch vụ. Nhóm mình làm backend chatbot này để tự động đọc tài liệu trên Google Drive và trả lời khách. Ngoài việc giải đáp thắc mắc, bot còn xin thông tin liên hệ (như tên, số điện thoại) để lưu vào Google Sheets. Nhờ vậy, nhóm vừa hỗ trợ khách nhanh hơn, vừa tiết kiệm tiền gọi API AI.

## 💡 Tụi mình đã tự học và làm những gì?
Nhóm mình tự tìm hiểu cách triển khai ứng dụng serverless trên Cloudflare Workers kết hợp với Hono và TypeScript. Tụi mình học cách xây dựng luồng **RAG** (*Retrieval-Augmented Generation*: kỹ thuật giúp AI tra cứu tài liệu có sẵn trước khi trả lời, giống như học sinh được mở sách giáo khoa khi làm bài thi). 

Trong quá trình làm, tụi mình dùng AI (ChatGPT, Claude, Gemini) làm trợ lý để giải thích các khái niệm mới như **Embedding** (*chuyển câu chữ thành các con số để máy tính hiểu được ý nghĩa*) và **Vector Database** (*giống một thủ thư thông minh, tìm tài liệu theo ý nghĩa chứ không chỉ theo từ khóa*). AI cũng hỗ trợ nhóm viết code, gợi ý thuật toán so khớp câu hỏi và rà soát lại các lỗi bảo mật trong cấu hình.

## ✨ Tính năng chính
*   **So khớp câu hỏi thường gặp (`action: faq`)** [✅ Đã làm]: Dùng thuật toán Sørensen–Dice để đo độ giống nhau giữa câu khách hỏi và file `FAQs.txt` có sẵn (ngưỡng `>= 0.45`). Nếu trùng với câu gợi ý do AI từng tạo trong `KB_META`, bot chuyển thẳng sang luồng RAG và không trừ lượt hỏi.
*   **Thu thập thông tin khách hàng (`action: submit_lead`)** [✅ Đã làm]: Nhận họ tên, số điện thoại, email từ widget và gửi qua Google Apps Script để ghi vào Google Sheets. Khi khách điền xong, bot sẽ mở khóa để khách hỏi tiếp.
*   **Trả lời tự động bằng RAG (`action: chat`)** [✅ Đã làm]: Tìm 3 câu FAQ và 15 đoạn tài liệu liên quan nhất trong `kb_documents` (điểm tương đồng `>= 0.16`), sau đó gửi cho `gpt-4o-mini` viết câu trả lời kèm 3 câu hỏi gợi ý `[SUGGESTIONS: a | b | c]`.
*   **Giới hạn lượt hỏi và khung giờ** [✅ Đã làm]: Tự động nghỉ từ `00:00 – 07:00` (giờ Việt Nam), chặn các chủ đề lạc đề (`[OFF_TOPIC]`) và giới hạn 5 lượt hỏi mỗi phiên trong 8 giờ để tránh tốn chi phí.
*   **Đồng bộ tài liệu từ Google Drive** [🔧 Đang làm]: Hỗ trợ nạp tài liệu qua 3 cách: script chạy ở máy cá nhân (`sync-kb.mjs`), giao diện web `/admin/sync-ui` (đọc PDF/DOCX trên trình duyệt) và hàm `runDriveSync` trên server.
*   **Nâng cấp bảo mật và tối ưu cấu hình** [🔧 Đang làm]: Chuyển các khóa bí mật sang `wrangler secret put`, thêm `triggers.crons`, giới hạn CORS và thêm index `(session_id, created_at)` cho bảng lịch sử chat.

## 🧩 Cách hoạt động
Hệ thống xử lý theo 2 luồng chính: nạp tài liệu và trả lời tin nhắn.

```mermaid
graph TD
    A[Khách gửi tin nhắn qua POST /chat] --> B{Kiểm tra action}
    B -->|faq| C[So khớp mờ với FAQs.txt trên R2]
    C -->|Khớp >= 0.45| D[Trả lời ngay không tốn tiền gọi LLM]
    C -->|Trùng câu gợi ý trong KV| E[Chuyển sang luồng RAG & miễn phí lượt]
    B -->|submit_lead| F[Gửi thông tin qua Apps Script vào Google Sheets]
    F --> G[Mở khóa giới hạn lượt hỏi]
    B -->|chat| H[Kiểm tra giờ 00:00-07:00 & hạn mức 5 lượt/8h trong D1]
    H --> I[Tìm Top-3 FAQ + Top-15 đoạn trong Vectorize >= 0.16]
    I --> J[Gửi ngữ cảnh cho gpt-4o-mini sinh câu trả lời]
Các bước nạp tài liệu từ Google Drive:Tải file từ Google Drive và tách lấy nội dung chữ.Cắt văn bản dài thành các đoạn nhỏ (chunk size: 1200, gối nhau overlap: 300).Gọi mô hình text-embedding-3-small để đổi từng đoạn chữ thành vector số.Lưu các vector này vào kho kb_documents trên Cloudflare Vectorize.Các đường dẫn quản trị (Admin Endpoints):GET /admin/sync-ui: Mở giao diện web để chọn và đồng bộ file.GET /admin/list-drive-files & GET /admin/download-drive-file: Xem danh sách và tải file từ Google Drive.POST /admin/ingest-text & POST /admin/run-sync: Nạp văn bản đã tách hoặc chạy đồng bộ trên server.GET /admin/sync-status & GET /admin/trace: Xem kết quả đồng bộ trong KB_META và kiểm tra log truy vấn.🛠️ Công nghệ sử dụngCông nghệDùng để làm gìCloudflare Workers & HonoChạy code backend (bằng TypeScript) trực tiếp trên server của Cloudflare, xử lý API /chat và /admin/*.Cloudflare Vectorize (kb_documents)Lưu trữ các vector tài liệu và tìm kiếm đoạn văn bản có ý nghĩa giống với câu hỏi của khách.Cloudflare D1 (chat_history_db)Cơ sở dữ liệu SQL dùng để lưu lịch sử trò chuyện theo session_id và đếm số lượt khách đã hỏi.Cloudflare R2 (ai-kb-files)Kho lưu trữ file tĩnh, dùng để chứa file câu hỏi thường gặp FAQs.txt.Cloudflare KV (KB_META)Bộ nhớ lưu nhanh chữ ký file (MD5 manifest), câu gợi ý của AI (lưu 24 giờ) và trạng thái đồng bộ.OpenAI & LangChainDùng text-embedding-3-small để tạo vector và gpt-4o-mini để viết câu trả lời tiếng Việt.PDF.js & Mammoth.jsĐọc nội dung chữ từ file .PDF và .DOCX ngay trên trình duyệt tại trang /admin/sync-ui.📂 Cấu trúc thư mục(Lưu ý: Bản gốc chưa liệt kê cây thư mục chi tiết, dưới đây là cấu trúc chuẩn của dự án Cloudflare Workers để nhóm kiểm tra và xác nhận)PlaintextGOAi-Workforce-Chatbot/
├── src/                        # Chứa mã nguồn chính của Worker (Hono routes, xử lý RAG) [CẦN BỔ SUNG: xác nhận tên file trong src]
├── test/                       # Chứa file kiểm thử (index.spec.ts)
├── sync-kb.mjs                 # Script chạy ở máy cá nhân để quét thư mục Drive và nạp vector
├── schema.sql                  # File tạo bảng dữ liệu lịch sử chat cho Cloudflare D1
├── wrangler.jsonc              # File cấu hình kết nối D1, Vectorize, R2, KV của Cloudflare
└── package.json                # Khai báo các thư viện sử dụng trong dự án
