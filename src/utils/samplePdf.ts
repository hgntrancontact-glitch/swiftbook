export const SAMPLE_PDF_NAME = 'Nghe-Thuat-Doc-Sach.pdf';

/**
 * Generates a clean 6-page sample PDF about "Nghệ Thuật Đọc Sách" (The Art of Reading)

 * so users can immediately test all book viewer features, text highlighting, drawing, and notes.
 */
export function generateSamplePdfBytes(): Uint8Array {
  // A minimal valid multi-page PDF generator
  const pagesContent = [
    // Page 1: Bìa sách & Lời mở đầu
    [
      "BT /F1 28 Tf 50 720 Td (NGHE THUAT DOC SACH) Tj ET",
      "BT /F1 16 Tf 50 680 Td (Huong Dan Phuong Phap Doc Hieu & Ghi Chu Hieu Qua) Tj ET",
      "BT /F1 12 Tf 50 640 Td (Tac gia: Thu Vien Tri Thuc) Tj ET",
      "0 0 0 RG 2 w 50 620 m 545 620 l S",
      "BT /F1 14 Tf 50 580 Td (LOI MO DAU) Tj ET",
      "BT /F1 11 Tf 50 540 Td (Chao mung ban den voi ung dung Doc Sach PDF hien dai!) Tj ET",
      "BT /F1 11 Tf 50 515 Td (Doc sach la mot trong nhung thoi quen tuyet voi nhat de mo rong kien thuc.) Tj ET",
      "BT /F1 11 Tf 50 490 Td (Voi trinh doc sach nay, ban co the:) Tj ET",
      "BT /F1 11 Tf 70 465 Td (- Boi den doan van ban bat ky de HighLight (Vang, Xanh la, Hong, Do)) Tj ET",
      "BT /F1 11 Tf 70 440 Td (- Them Text Notes ghi chu truc tiep vao tung trang sach) Tj ET",
      "BT /F1 11 Tf 70 415 Td (- Su dung but ve tay truc tiep de khoanh tron, gach chan y chinh) Tj ET",
      "BT /F1 11 Tf 70 390 Td (- Tu tao Muc Luc ca nhan o Sidebar ben trai va dong bo so trang) Tj ET",
      "BT /F1 11 Tf 70 365 Td (- Tu dong luu trang thai va du lieu vao LocalStorage (Auto-Save)) Tj ET",
      "BT /F1 11 Tf 50 320 Td (Hay thu chon mot doan chu tren trang nay va bam Highlight de bat dau.) Tj ET",
      "BT /F1 9 Tf 260 50 Td (- Trang 1 -) Tj ET",
    ],
    // Page 2: Chuong 1 - 4 Cap Do Doc Sach
    [
      "BT /F1 18 Tf 50 720 Td (CHUONG 1: BON CAP DO DOC SACH) Tj ET",
      "0 0 0 RG 1 w 50 705 m 545 705 l S",
      "BT /F1 13 Tf 50 665 Td (1. Cap do 1: Doc So Cap (Elementary Reading)) Tj ET",
      "BT /F1 11 Tf 50 640 Td (Day la muc do nhan biet chu viet va nghia co ban cua tung cau.) Tj ET",
      "BT /F1 11 Tf 50 615 Td (Hau het moi nguoi deu dat duoc cap do nay tu khi con hoc tieu hoc.) Tj ET",
      "BT /F1 13 Tf 50 570 Td (2. Cap do 2: Doc Kiem Tra (Inspectional Reading)) Tj ET",
      "BT /F1 11 Tf 50 545 Td (Doc luot qua tieu de, muc luc, loi noi dau va phan ket luan.) Tj ET",
      "BT /F1 11 Tf 50 520 Td (Muc tieu la nam bat cau truc tong the cua cuon sach trong thoi gian ngan.) Tj ET",
      "BT /F1 13 Tf 50 475 Td (3. Cap do 3: Doc Phan Tich (Analytical Reading)) Tj ET",
      "BT /F1 11 Tf 50 450 Td (Doc ky luong, dat cau hoi, phan tich lap luan va ghi chu chu dong.) Tj ET",
      "BT /F1 11 Tf 50 425 Td (Day la luc cong cu Highlight va Text Note phat huy hieu qua cao nhat.) Tj ET",
      "BT /F1 13 Tf 50 380 Td (4. Cap do 4: Doc Dong Chu De (Syntopical Reading)) Tj ET",
      "BT /F1 11 Tf 50 355 Td (Doc nhieu cuon sach cung viet ve mot de tai de tong hop goc nhin toan dien.) Tj ET",
      "BT /F1 9 Tf 260 50 Td (- Trang 2 -) Tj ET",
    ],
    // Page 3: Chuong 2 - Ky Thuat Ghi Chu & Highlight
    [
      "BT /F1 18 Tf 50 720 Td (CHUONG 2: KY THUAT GHI CHU HIEN DAI) Tj ET",
      "0 0 0 RG 1 w 50 705 m 545 705 l S",
      "BT /F1 13 Tf 50 665 Td (Nguyen Tac Highlight Hieu Qua:) Tj ET",
      "BT /F1 11 Tf 50 635 Td (1. Mau Vang: Danh cho cac khai niem then chot va dinh nghia quan trong.) Tj ET",
      "BT /F1 11 Tf 50 605 Td (2. Mau Xanh La: Danh cho cac vi du thuc te va bai hoc rut ra.) Tj ET",
      "BT /F1 11 Tf 50 575 Td (3. Mau Hong: Danh cho cac so lieu, trich dan tam dac hoac y kien doi lap.) Tj ET",
      "BT /F1 11 Tf 50 545 Td (4. Mau Do: Danh cho cac canh bao, loi thuong gap hoac van de can suy ngam.) Tj ET",
      "BT /F1 13 Tf 50 495 Td (Phuong Phap Ghi Chu Tinh Gon \\(Smart Notes\\):) Tj ET",
      "BT /F1 11 Tf 50 465 Td (- Khong nen boi den ca trang sach, chi highlight tu khoa va cau cot loi.) Tj ET",
      "BT /F1 11 Tf 50 435 Td (- Dung cong cu Text Note de ghi lai suy nghi cua chinh ban ngay tai doan van.) Tj ET",
      "BT /F1 11 Tf 50 405 Td (- Dung but ve de ve so do tu duy nhanh ben le trang sach.) Tj ET",
      "BT /F1 9 Tf 260 50 Td (- Trang 3 -) Tj ET",
    ],
    // Page 4: Chuong 3 - Quan Ly Muc Luc & Tri Thuc
    [
      "BT /F1 18 Tf 50 720 Td (CHUONG 3: XAY DUNG MUC LUC & HE THONG TRI THUC) Tj ET",
      "0 0 0 RG 1 w 50 705 m 545 705 l S",
      "BT /F1 13 Tf 50 665 Td (Tu Tao Muc Luc Ca Nhan:) Tj ET",
      "BT /F1 11 Tf 50 635 Td (Moi nguoi co mot cach tiep can noi dung khac nhau. Ban co the su dung) Tj ET",
      "BT /F1 11 Tf 50 610 Td (thanh ben Sidebar de them cac muc danh dau trang yeu thich cua minh.) Tj ET",
      "BT /F1 13 Tf 50 560 Td (Dong Bo So Trang Nhanh Chong:) Tj ET",
      "BT /F1 11 Tf 50 530 Td (Khi ban nhap tieu de va so trang vao Muc Luc, he thong se tu dong) Tj ET",
      "BT /F1 11 Tf 50 505 Td (lien ket va cho phep ban nhay den trang do chi bang 1 cu click chuot.) Tj ET",
      "BT /F1 13 Tf 50 455 Td (Luu Tru Tu Dong (Continuous Auto-Save):) Tj ET",
      "BT /F1 11 Tf 50 425 Td (Tat ca cac highlight, ghi chu, but ve deu duoc luu tuc thi vao bo nho) Tj ET",
      "BT /F1 11 Tf 50 400 Td (trinh duyet. Ban co the yen tam tat tab hoac F5 ma khong lo mat du lieu.) Tj ET",
      "BT /F1 9 Tf 260 50 Td (- Trang 4 -) Tj ET",
    ],
    // Page 5: Chuong 4 - Thuc Hanh Doc Sach Nhanh
    [
      "BT /F1 18 Tf 50 720 Td (CHUONG 4: BI QUYET TANG TOC DO DOC) Tj ET",
      "0 0 0 RG 1 w 50 705 m 545 705 l S",
      "BT /F1 13 Tf 50 665 Td (Cac Ky Thuat Tang Toc Do:) Tj ET",
      "BT /F1 11 Tf 50 635 Td (1. Han che doc tham (Subvocalization): Tap trung doc bang mat thay vi phat am.) Tj ET",
      "BT /F1 11 Tf 50 605 Td (2. Mo rong tam nhin ngoai vi: Nhin cum 3-4 tu cung mot luc thay vi tung tu.) Tj ET",
      "BT /F1 11 Tf 50 575 Td (3. Su dung con tro dan duong: Di chuyen chuot hoac but de mat di chuyen deu.) Tj ET",
      "BT /F1 11 Tf 50 545 Td (4. Chon che do xem phu hop: Chuyen doi giua che do 1 trang va 2 trang (Sach).) Tj ET",
      "BT /F1 13 Tf 50 495 Td (Loi Khuyen Danh Cho Ban:) Tj ET",
      "BT /F1 11 Tf 50 465 Td (Doc nhanh nhung van phai hieu sau. Dung bo qua cac cong doan phan tich.) Tj ET",
      "BT /F1 9 Tf 260 50 Td (- Trang 5 -) Tj ET",
    ],
    // Page 6: Tong Ket & Loi Cam On
    [
      "BT /F1 18 Tf 50 720 Td (TONG KET & LOI CAM ON) Tj ET",
      "0 0 0 RG 1 w 50 705 m 545 705 l S",
      "BT /F1 13 Tf 50 665 Td (Chuc mung ban da hoan thanh cuon sach mau!) Tj ET",
      "BT /F1 11 Tf 50 635 Td (Gio day ban da nam ro cac tinh nang cua Trinh Doc Sach PDF:) Tj ET",
      "BT /F1 11 Tf 70 605 Td (- Thu tai len file PDF cua chinh ban bang nut 'Tai file PDF') Tj ET",
      "BT /F1 11 Tf 70 580 Td (- Thu them ghi chu, ve hinh va tao muc luc de quan ly de dang) Tj ET",
      "BT /F1 11 Tf 70 555 Td (- Su dung phim mui ten Trai/Phai hoac o nhap so trang de chuyen trang) Tj ET",
      "BT /F1 11 Tf 50 500 Td (Chuc ban co nhung gio phut doc sach that hieu qua va thu vi!) Tj ET",
      "0 0 0 RG 1 w 50 440 m 545 440 l S",
      "BT /F1 10 Tf 50 410 Td (Tao boi AI Studio - Trinh doc sach PDF Minimalist hien dai) Tj ET",
      "BT /F1 9 Tf 260 50 Td (- Trang 6 -) Tj ET",
    ],
  ];

  const objects: string[] = [];
  const totalPages = pagesContent.length;

  // Obj 1: Catalog
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);

  // Obj 2: Pages root
  const pageRefs = Array.from({ length: totalPages }, (_, i) => `${i + 3} 0 R`).join(' ');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${totalPages} >>\nendobj`);

  // Font Obj
  const fontObjIndex = totalPages * 2 + 3;

  // For each page, create Page Obj and Content Stream Obj
  pagesContent.forEach((lines, index) => {
    const pageObjNum = index + 3;
    const contentObjNum = totalPages + 3 + index;
    const streamData = lines.join('\n');
    const streamLength = streamData.length;

    // Page object
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjIndex} 0 R >> >> >>\nendobj`
    );
  });

  pagesContent.forEach((lines, index) => {
    const contentObjNum = totalPages + 3 + index;
    const streamData = lines.join('\n');
    const streamLength = streamData.length;

    // Content stream object
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamData}\nendstream\nendobj`
    );
  });

  // Font object (Helvetica standard 14 font)
  objects.push(
    `${fontObjIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
  );

  let pdfString = `%PDF-1.4\n`;
  const xrefOffsets: number[] = [0];

  objects.forEach((obj) => {
    xrefOffsets.push(pdfString.length);
    pdfString += `${obj}\n`;
  });

  const startXref = pdfString.length;
  pdfString += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= objects.length; i++) {
    const offset = xrefOffsets[i].toString().padStart(10, '0');
    pdfString += `${offset} 00000 n \n`;
  }

  pdfString += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

  const encoder = new TextEncoder();
  return encoder.encode(pdfString);
}
