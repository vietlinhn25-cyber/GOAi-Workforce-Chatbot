# 🔐 Data Version Control (DVC)
Đồ án nghiên cứu cơ chế mã hóa tệp tin tự động và xây dựng bộ kiểm thử luồng mã hóa đa luồng.

![Kernel Encryption](https://img.shields.io/badge/Kernel_Ring0%2FRing3-1565C0?style=for-the-badge&logo=linux&logoColor=white)
![RSA-1024](https://img.shields.io/badge/Asymmetric_RSA--1024-2E7D32?style=for-the-badge&logo=letsencrypt&logoColor=white)
![Java](https://img.shields.io/badge/Java_EE-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![CAD Support](https://img.shields.io/badge/400%2B_CAD%2F3D_Apps-D84315?style=for-the-badge&logo=autodesk&logoColor=white)
![Throughput](https://img.shields.io/badge/Speed_20GB%2Fmin-00838F?style=for-the-badge&logo=speedtest&logoColor=white)

## 🎯 Dự án làm gì?
Các tệp bản vẽ kỹ thuật hoặc báo cáo tài chính nếu lưu ở dạng thông thường sẽ rất dễ đọc trộm khi bị sao chép ra ngoài. Dự án nghiên cứu mô hình **mã hóa tệp tin trong suốt** (*Transparent Encryption: tệp luôn bị khóa trên ổ cứng, nhưng máy tính có quyền trong công ty mở lên làm việc thì vẫn hiển thị bình thường mà không cần nhập mật khẩu*). Đồ án tập trung tìm hiểu kiến trúc của hệ thống **TRcore DVC (DaVincio)** và xây dựng các công cụ kiểm thử (test harness, worker pool) để mô phỏng luồng mã hóa, giải mã và kiểm tra tính toàn vẹn của dữ liệu.

## 💡 Quá trình nghiên cứu và phát triển
*   **Tìm hiểu** tài liệu kiến trúc của giải pháp TRcore DVC về cách bảo vệ tệp tin ở **tầng lõi hệ điều hành (Kernel Ring0)** và **tầng ứng dụng (Ring3)**.
*   **Sử dụng** AI (ChatGPT, Claude, Gemini) để giải thích các khái niệm hệ điều hành phức tạp như Minifilter Driver, Windows Cache Manager và cơ chế giải mã trực tiếp trên bộ nhớ RAM.
*   **Xây dựng** các module kiểm thử luồng mã hóa song song (`_worker_encrypt_test`, `_worker_test`) và bộ khung kiểm tra tính toàn vẹn tệp tin (`_temp_dvc_harness`) với sự hỗ trợ sinh mã nguồn từ AI.
*   **Thực hiện** Việt hóa bộ tài liệu và giao diện hệ thống trong gói `DCS-ASIA-VI`.

## ✨ Tính năng chính
*(Lưu ý: Phân tách rõ phần thực nghiệm trong kho mã nguồn và phần cơ chế theo tài liệu thiết kế từ nhà cung cấp TRcore DVC)*

*   **Kiểm thử luồng mã hóa đa luồng (`_worker_encrypt_test` & `_worker_test`)** [✅ Đã làm]: Mô phỏng nhiều tiến trình (worker) chạy song song để thực hiện mã hóa và giải mã tệp tin, phục vụ đo kiểm hiệu năng và độ ổn định.
*   **Khung xác minh tính toàn vẹn tệp tin (`_temp_dvc_harness`)** [✅ Đã làm]: Tự động đối chiếu dữ liệu trước khi mã hóa và sau khi giải mã để đảm bảo tệp không bị lỗi cấu trúc.
*   **Bản địa hóa giao diện và tài liệu (`DCS-ASIA-VI`)** [✅ Đã làm]: Dịch thuật và tích hợp gói ngôn ngữ tiếng Việt cho hệ thống.
*   **4 chế độ mã hóa theo phòng ban** [🔧 Đang làm / Thử nghiệm cấu hình]:
    1. *Mở mã hóa:* Tự động mã hóa ngay khi mở tệp (áp dụng cho phòng R&D).
    2. *Sửa đổi mã hóa:* Tự động mã hóa khi người dùng chỉnh sửa và lưu tệp.
    3. *Mã hóa thông minh:* Tệp mới tạo (như báo giá) thì không mã hóa, nhưng khi mở tệp đã mã hóa từ bộ phận khác thì vẫn giữ nguyên trạng thái khóa.
    4. *Khe mã hóa:* Thư mục chuyên dụng để người dùng chủ động kéo thả các tệp nhạy cảm vào mã hóa.
*   **Cơ chế mã hóa tầng Kernel Ring0/Ring3 & Bộ nhớ đệm** [📖 Mới nghiên cứu]:
    *   *Giải thích đời thường:* **Ring0 (Kernel)** là tầng sâu nhất điều khiển phần cứng của hệ điều hành, còn **Ring3 (User mode)** là nơi các phần mềm thông thường hoạt động. Đặt nhân mã hóa ở Ring0 giúp khóa tệp ngay lúc ghi xuống ổ cứng mà không tạo ra tệp tạm (`temp file`) chưa mã hóa.
    *   *(Theo tài liệu tham khảo của nhà cung cấp TRcore DVC, cơ chế này dùng thuật toán RSA-1024, hỗ trợ hơn 400 phần mềm CAD/3D như AutoCAD, SolidWorks và đạt tốc độ 20 GB/phút — các số liệu thương mại này trích dẫn từ tài liệu gốc, chưa tự kiểm chứng độc lập)*.
*   **Các phân hệ mở rộng (USB Agent, Online View, Mobile App, Cảnh báo ngưỡng)** [📖 Mới nghiên cứu]: Tìm hiểu cơ chế dùng USB chuyên dụng để giao dịch bản vẽ với nhà cung cấp, xem bản vẽ 3D trực tuyến không cần cài phần mềm, phê duyệt giải mã qua điện thoại và chặn hành vi xóa/sao chép hàng loạt.

## 🧩 Cách hoạt động
Sơ đồ dưới đây minh họa nguyên tắc **"Mã hóa sớm nhất – Giải mã muộn nhất"** theo kiến trúc DVC:

```mermaid
graph LR
    A[Tệp trên ổ cứng<br/>Đang ở trạng thái mã hóa] --> B[Windows Cache Manager<br/>Vẫn giữ trạng thái mã hóa]
    B --> C{Nhân DVC kiểm tra<br/>quyền của ứng dụng}
    C -->|Ứng dụng hợp lệ thực hiện Read| D[Giải mã tức thời trên RAM<br/>Ứng dụng nhận văn bản rõ]
    C -->|Sao chép ra USB / Gửi ra ngoài| E[Giữ nguyên dữ liệu mã hóa<br/>Máy bên ngoài không mở được]
