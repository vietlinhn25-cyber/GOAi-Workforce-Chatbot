# 🤖 GOAi Workforce Chatbot (`ai-agent-worker`)
Backend chatbot tiếng Việt tra cứu tài liệu nội bộ để trả lời khách hàng và thu thập thông tin liên hệ trên Cloudflare Workers.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Hono](https://img.shields.io/badge/Hono_Framework-E36002?style=for-the-badge&logo=hono&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI_GPT--4o--mini-412991?style=for-the-badge&logo=openai&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google_Drive_KB-4285F4?style=for-the-badge&logo=googledrive&logoColor=white)

## 🎯 Dự án làm gì?
Khách hàng truy cập website thường hỏi lặp lại nhiều câu về dịch vụ. Hệ thống tự động đọc tài liệu nội bộ trên Google Drive để giải đáp các thắc mắc này qua widget chat. Ngoài việc trả lời câu hỏi, hệ thống còn thu thập thông tin liên hệ của khách để lưu vào Google Sheets. Cách làm này giúp phản hồi khách hàng nhanh chóng và tiết kiệm chi phí gọi API AI.

## 💡 Quá trình nghiên cứu và phát triển
*   **Tìm hiểu** nền tảng Cloudflare Workers, Hono framework và ngôn ngữ TypeScript để xây dựng hệ thống backend serverless.
*   **Nghiên cứu** kỹ thuật **RAG** (*Retrieval-Augmented Generation: phương pháp giúp AI tra cứu tài liệu có sẵn trước khi trả lời, giống như học sinh được mở sách giáo khoa khi làm bài thi*).
*   **Sử dụng** các công cụ AI (ChatGPT, Claude, Gemini) để giải thích khái niệm **Embedding** (*chuyển câu chữ thành dãy số để máy tính hiểu ý nghĩa*) và **Vector Database** (*giống một thủ thư thông minh, tìm tài liệu theo ý nghĩa chứ không chỉ theo từ khóa*).
*   **Viết** mã nguồn xử lý API `/chat`, thiết lập kết nối với cơ sở dữ liệu Cloudflare D1, Vectorize, R2 và KV dưới sự gợi ý cấu trúc từ AI.
*   **Kiểm tra** toàn bộ luồng hoạt động, phát hiện các điểm lệch cấu hình và xây dựng lộ trình khắc phục bảo mật.

## ✨ Tính năng chính
*   **So khớp câu hỏi thường gặp (`action: faq`)** [✅ Đã làm]: Dùng thuật toán Sørensen–Dice để đo độ giống nhau giữa câu hỏi và file `FAQs.txt` trên R2 (ngưỡng `>= 0.45`). Nếu trùng với câu gợi ý do AI từng tạo trong `KB_META`, hệ thống chuyển thẳng sang luồng RAG và không trừ lượt hỏi.
*   **Thu thập thông tin khách hàng (`action: submit_lead`)** [✅ Đã làm]: Nhận họ tên, số điện thoại, email từ widget và gửi qua Google Apps Script để ghi vào Google Sheets. Sau khi ghi nhận thông tin, hệ thống mở khóa giới hạn lượt hỏi để tiếp tục tư vấn.
*   **Trả lời tự động bằng RAG (`action: chat`)** [✅ Đã làm]: Tìm 3 câu FAQ và 15 đoạn tài liệu liên quan nhất trong `kb_documents` (điểm tương đồng `>= 0.16`). Sau đó gửi ngữ cảnh cho `gpt-4o-mini` tạo câu trả lời kèm 3 câu hỏi gợi ý `[SUGGESTIONS: a | b | c]`.
*   **Giới hạn lượt hỏi và khung giờ** [✅ Đã làm]: Tự động ngưng suy luận từ `00:00 – 07:00` (giờ Việt Nam) và chặn các chủ đề lạc đề (`[OFF_TOPIC]`). Mỗi phiên chỉ được hỏi tối đa 5 lượt trong vòng 8 giờ.
*   **Đồng bộ tài liệu từ Google Drive** [🔧 Đang làm]: Nạp tài liệu qua 3 đường gồm script dòng lệnh (`sync-kb.mjs`), giao diện web `/admin/sync-ui` (dùng PDF.js và Mammoth.js) và hàm `runDriveSync` trên server.
*   **Nâng cấp bảo mật và đồng bộ cấu hình** [🔧 Đang làm]: Chuyển các khóa bí mật sang `wrangler secret put`, thêm cấu hình `triggers.crons`, giới hạn CORS và bổ sung index `(session_id, created_at)` cho bảng lịch sử chat.

## 🧩 Cách hoạt động
Hệ thống vận hành theo 2 quy trình: nạp tài liệu vào kho vector và xử lý tin nhắn của khách hàng.

```mermaid
graph TD
    A[Khách gửi tin nhắn qua POST /chat] --> B{Kiểm tra action}
    B -->|faq| C[So khớp mờ với FAQs.txt trên R2]
    C -->|Khớp >= 0.45| D[Trả lời ngay không tốn phí gọi LLM]
    C -->|Trùng câu gợi ý trong KV| E[Chuyển sang luồng RAG & miễn phí lượt]
    B -->|submit_lead| F[Gửi thông tin qua Apps Script vào Google Sheets]
    F --> G[Mở khóa giới hạn lượt hỏi]
    B -->|chat| H[Kiểm tra giờ 00:00-07:00 & hạn mức 5 lượt/8h trong D1]
    H --> I[Tìm Top-3 FAQ + Top-15 đoạn trong Vectorize >= 0.16]
    I --> J[Gửi ngữ cảnh cho gpt-4o-mini sinh câu trả lời]
