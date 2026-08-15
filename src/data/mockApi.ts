export const metricCards = [
  {
    id: 1,
    label: "ĐƠN CHỐT HÔM NAY",
    value: "7",
    subtext: "Tổng 4.350.000 đ",
    trend: "+3 so với hôm qua",
    trendUp: true
  },
  {
    id: 2,
    label: "KHÁCH ĐANG CHỜ BẠN",
    value: "3",
    subtext: "Lâu nhất đã chờ 18 phút",
    hasBlinkingDot: true,
    action: "Xử lý ngay"
  },
  {
    id: 3,
    label: "SẮP HẾT 24 GIỜ",
    value: "5",
    subtext: "AI sắp không được nhắn nữa"
  },
  {
    id: 4,
    label: "TRẠNG THÁI AI",
    value: "Đang hoạt động",
    subtext: "Vận hành ổn định",
    isStatus: true
  }
];

export const miniCharts = [
  { id: 1, label: "ĐÃ NHẮN TIN ĐẦU", value: "142", data: [40, 50, 60, 45, 80, 100, 142] },
  { id: 2, label: "KHÁCH PHẢN HỒI", value: "89 (63%)", data: [20, 25, 40, 30, 55, 70, 89] },
  { id: 3, label: "ĐANG TƯ VẤN", value: "34", data: [10, 15, 20, 18, 25, 30, 34] },
  { id: 4, label: "TỶ LỆ CHỐT ĐƠN", value: "12,5%", data: [5, 8, 12, 10, 11, 12, 12.5] }
];

export const recentOrders = [
  {
    id: "ORD-001",
    customerInitial: "A",
    customerName: "Nguyễn Văn An",
    productName: "Sản phẩm A",
    productDesc: "Phân loại 1",
    price: "450.000 đ",
    source: "AI chốt",
    status: "Đã báo Telegram",
    statusColor: "bg-primary text-on-primary border-primary",
    dotColor: "bg-on-primary"
  },
  {
    id: "ORD-002",
    customerInitial: "B",
    customerName: "Trần Thị Bình",
    productName: "Gói dịch vụ 1",
    productDesc: "Phân loại 2",
    price: "1.200.000 đ",
    source: "Bạn chốt",
    status: "Chờ xác nhận",
    statusColor: "bg-surface-variant text-on-surface border-outline-variant",
    dotColor: "bg-on-surface-variant"
  },
  {
    id: "ORD-003",
    customerInitial: "C",
    customerName: "Lê Văn Cường",
    productName: "Sản phẩm B",
    productDesc: "Phân loại 1",
    price: "850.000 đ",
    source: "AI chốt",
    status: "Đã báo Telegram",
    statusColor: "bg-primary text-on-primary border-primary",
    dotColor: "bg-on-primary"
  },
  {
    id: "ORD-004",
    customerInitial: "D",
    customerName: "Phạm Thị Dung",
    productName: "Gói dịch vụ 2",
    productDesc: "Phân loại 3",
    price: "2.500.000 đ",
    source: "AI chốt",
    status: "Chờ xác nhận",
    statusColor: "bg-surface-variant text-on-surface border-outline-variant",
    dotColor: "bg-on-surface-variant"
  },
  {
    id: "ORD-005",
    customerInitial: "E",
    customerName: "Hoàng Văn Em",
    productName: "Sản phẩm C",
    productDesc: "Phân loại 1",
    price: "350.000 đ",
    source: "Bạn chốt",
    status: "Đã báo Telegram",
    statusColor: "bg-primary text-on-primary border-primary",
    dotColor: "bg-on-primary"
  }
];

export const aiInsights = {
  raw: "Hôm nay có 5 khách hỏi cùng một câu rồi im lặng. Tỷ lệ chốt của nhóm này chỉ 8%, thấp hơn mức chung 12,5%.",
  recommendation: "Bổ sung câu trả lời cho tình huống này vào phần đào tạo AI. Ước tính tăng tỷ lệ chốt thêm 4%."
};

export const actionRequired = [
  { id: 1, initial: "T", name: "Ngọc Trinh", reason: "Hỏi giá", waitTime: "chờ 18 phút" },
  { id: 2, initial: "H", name: "Minh Hoàng", reason: "Khiếu nại", waitTime: "chờ 9 phút" },
  { id: 3, initial: "H", name: "Thanh Hà", reason: "Đòi gặp người thật", waitTime: "chờ 4 phút" }
];

export const aiActivity = [
  { id: 1, time: "Vừa xong", content: "AI đã chốt đơn với Nguyễn Văn An", color: "bg-primary" },
  { id: 2, time: "8 phút trước", content: "AI nhắn tin đầu cho 4 khách vừa bình luận", color: "bg-secondary" },
  { id: 3, time: "25 phút trước", content: "Bài đăng mới đã lên sóng", color: "bg-tertiary" },
  { id: 4, time: "32 phút trước", content: "Chuyển người thật: Trần Thị Mai", color: "bg-error" }
];

export const aiTones = [
  { id: 'friendly', name: 'Thân thiện', example: 'Dạ shop còn hàng nha bạn ơi!' },
  { id: 'professional', name: 'Chuyên nghiệp', example: 'Chào anh/chị, sản phẩm hiện còn hàng ạ.' },
  { id: 'enthusiastic', name: 'Nhiệt tình', example: 'Dạ còn nha! Bạn cho em xin thông tin em tư vấn nhé!' },
  { id: 'concise', name: 'Ngắn gọn', example: 'Còn hàng ạ. Bạn cần loại nào?' }
];

export const trainingProducts = [
  { id: 1, name: 'Sản phẩm A', price: '450.000 đ', stock: '12', desc: 'Phân loại 1' },
  { id: 2, name: 'Gói dịch vụ 1', price: '1.200.000 đ', stock: 'Không giới hạn', desc: 'Phân loại 2' },
  { id: 3, name: 'Sản phẩm B', price: '850.000 đ', stock: '5', desc: 'Phân loại 1' },
];

export const requiredInfo = ['Họ tên', 'Số điện thoại', 'Địa chỉ', 'Sản phẩm', 'Số lượng'];

export const handoffRules = [
  { id: 'complaint', title: 'Khách khiếu nại hoặc không hài lòng', desc: 'AI dừng ngay, tránh làm khách bức xúc thêm', locked: true, active: true },
  { id: 'human', title: 'Khách đòi gặp người thật', desc: 'Khách yêu cầu thì phải chuyển, không được từ chối', locked: true, active: true },
  { id: 'discount', title: 'Khách xin giảm giá ngoài khung cho phép', desc: 'Quyết định giảm giá nên do bạn', locked: false, active: true },
  { id: 'shipping', title: 'Khách hỏi về đơn cũ hoặc tình trạng giao hàng', desc: 'AI không nắm được tình hình vận chuyển thực tế', locked: false, active: true },
  { id: 'unsure', title: 'AI không chắc chắn câu trả lời', desc: 'Thà im lặng còn hơn trả lời sai làm mất khách', locked: false, active: true },
  { id: 'media', title: 'Khách gửi ảnh hoặc video', desc: 'Bật nếu bạn cần xem ảnh để tư vấn', locked: false, active: false },
  { id: 'timeout', title: 'Trao đổi quá nhiều lần chưa chốt', desc: 'Khách phân vân lâu thì người thật vào chốt hiệu quả hơn', locked: false, active: true, hasInput: true, inputValue: 8, inputUnit: 'lượt' },
];

export const suggestedPrompts = [
  "Cái này bao nhiêu tiền?",
  "Còn hàng không shop?",
  "Giảm giá được không?",
  "Sao đơn tôi lâu thế?"
];

export const mockTestResponses: Record<string, { reply: string, verdict: string, verdictType: string }> = {
  "Giảm giá được không?": {
    reply: "Dạ hiện tại shop đang có chương trình miễn phí giao hàng thôi ạ, giá sản phẩm đã rất sát rồi ạ.",
    verdict: "Chuyển cho người thật — lý do: khách xin giảm giá",
    verdictType: "handoff"
  },
  "Sao đơn tôi lâu thế?": {
    reply: "Dạ để em kiểm tra lại mã vận đơn cho mình nhé. Chờ em một chút ạ.",
    verdict: "Chuyển cho người thật — lý do: khách hỏi về đơn cũ",
    verdictType: "handoff"
  },
  "default": {
    reply: "Dạ sản phẩm này bên em đang có sẵn hàng. Mình muốn lấy loại nào để em tư vấn thêm ạ?",
    verdict: "AI tự xử lý được",
    verdictType: "success"
  }
};

export const mockConversations = [
  {
    id: "conv-1",
    customerInitial: "H",
    customerName: "Nguyễn Thị Hoa",
    platform: "facebook", source: "Từ bình luận bài đăng ngày 12/08",
    status: "waiting", // waiting, ai, expiring, expired, done
    time: "18 phút",
    lastMessage: "Giảm giá thêm được không shop?",
    timeLeft: "còn 22h",
    infoCollected: {
      name: "Nguyễn Thị Hoa",
      phone: "0987 123 456",
      address: "Chưa có",
      product: "Sản phẩm A",
      quantity: "2"
    },
    history: {
      orders: "1 đơn",
      totalSpent: "850.000 đ",
      lastPurchase: "20 ngày trước"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "AI", text: "Xin chào! Đây là trợ lý tự động của shop, em có thể tư vấn ngay cho mình ạ.", time: "18:20" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Sản phẩm A còn hàng không shop?", time: "18:21" },
      { id: 3, sender: "shop", senderType: "AI", text: "Dạ sản phẩm A bên em vẫn còn hàng ạ. Giá đang là 450.000 đ. Mình lấy số lượng bao nhiêu để em lên đơn ạ?", time: "18:22" },
      { id: 4, sender: "customer", senderType: "Khách", text: "Mình lấy 2 cái.", time: "18:25" },
      { id: 5, sender: "shop", senderType: "AI", text: "Dạ vâng, 2 cái sản phẩm A tổng là 900.000 đ ạ. Dạ cho em xin tên người nhận, sđt và địa chỉ để em giao hàng nhé.", time: "18:26" },
      { id: 6, sender: "customer", senderType: "Khách", text: "Hoa, 0987123456", time: "18:28" },
      { id: 7, sender: "shop", senderType: "AI", text: "Dạ em nhận được thông tin rồi ạ. Chị Hoa chưa gửi địa chỉ giao hàng, chị nhắn nốt giúp em nha.", time: "18:28" },
      { id: 8, sender: "customer", senderType: "Khách", text: "Giảm giá thêm được không shop?", time: "18:30" }
    ],
    handoffReason: "khách xin giảm giá"
  },
  {
    id: "conv-2",
    customerInitial: "L",
    customerName: "Lê Văn Long",
    platform: "facebook", source: "Từ tin nhắn trực tiếp",
    status: "expired",
    time: "2 ngày",
    lastMessage: "Ok shop để mình xem lại",
    timeLeft: "Quá hạn",
    infoCollected: {
      name: "Lê Văn Long",
      phone: "Chưa có",
      address: "Chưa có",
      product: "Gói dịch vụ 1",
      quantity: "Chưa có"
    },
    history: {
      orders: "0 đơn",
      totalSpent: "0 đ",
      lastPurchase: "Chưa từng mua"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "AI", text: "Xin chào! Đây là trợ lý tự động của shop, em có thể tư vấn ngay cho mình ạ.", time: "14:00 (12/08)" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Tư vấn gói dịch vụ 1", time: "14:05 (12/08)" },
      { id: 3, sender: "shop", senderType: "AI", text: "Dạ Gói dịch vụ 1 bên em đang có giá 1.200.000 đ, dùng trọn đời ạ. Anh cần hỏi thêm về tính năng nào không?", time: "14:06 (12/08)" },
      { id: 4, sender: "customer", senderType: "Khách", text: "Ok shop để mình xem lại", time: "15:20 (12/08)" }
    ]
  },
  {
    id: "conv-3",
    customerInitial: "M",
    customerName: "Mai Phương",
    platform: "tiktok", source: "Từ quảng cáo Video",
    status: "ai",
    time: "3 phút",
    lastMessage: "Chất liệu gì vậy em?",
    timeLeft: "còn 23h 57p",
    infoCollected: {
      name: "Chưa có",
      phone: "Chưa có",
      address: "Chưa có",
      product: "Chưa có",
      quantity: "Chưa có"
    },
    history: {
      orders: "3 đơn",
      totalSpent: "1.250.000 đ",
      lastPurchase: "3 tháng trước"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "AI", text: "Xin chào! Đây là trợ lý tự động của shop, em có thể tư vấn ngay cho mình ạ.", time: "19:00" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Chào shop", time: "19:01" },
      { id: 3, sender: "shop", senderType: "AI", text: "Dạ em chào chị Phương. Chị đang quan tâm đến sản phẩm nào bên em ạ?", time: "19:01" },
      { id: 4, sender: "customer", senderType: "Khách", text: "Chất liệu gì vậy em?", time: "19:04" }
    ]
  },
  {
    id: "conv-4",
    customerInitial: "T",
    customerName: "Trần Bình",
    platform: "facebook", source: "Từ bình luận bài đăng ngày 14/08",
    status: "expiring",
    time: "21 giờ",
    lastMessage: "Mình bận xíu",
    timeLeft: "còn 2h 15p",
    infoCollected: {
      name: "Trần Bình",
      phone: "0909 xxx 123",
      address: "Chưa có",
      product: "Sản phẩm B",
      quantity: "1"
    },
    history: {
      orders: "0 đơn",
      totalSpent: "0 đ",
      lastPurchase: "Chưa từng mua"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "AI", text: "Xin chào! Đây là trợ lý tự động của shop, em có thể tư vấn ngay cho mình ạ.", time: "22:00 (Hôm qua)" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Mình bận xíu", time: "22:15 (Hôm qua)" }
    ]
  },
  {
    id: "conv-5",
    customerInitial: "V",
    customerName: "Vũ Hải",
    platform: "facebook", source: "Từ tin nhắn trực tiếp",
    status: "done",
    time: "1 giờ",
    lastMessage: "Cảm ơn em",
    timeLeft: "còn 23h",
    infoCollected: {
      name: "Vũ Hải",
      phone: "0933 xxx 888",
      address: "Hà Nội",
      product: "Sản phẩm C",
      quantity: "1"
    },
    history: {
      orders: "5 đơn",
      totalSpent: "4.500.000 đ",
      lastPurchase: "10 ngày trước"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "Bạn", text: "Đơn của anh Hải đã lên mã rồi nhé. Cảm ơn anh đã ủng hộ ạ.", time: "18:00" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Cảm ơn em", time: "18:05" }
    ]
  },
  {
    id: "conv-6",
    customerInitial: "D",
    customerName: "Đặng Khoa",
    platform: "instagram", source: "Từ quảng cáo Hình ảnh",
    status: "waiting",
    time: "9 phút",
    lastMessage: "Cho mình gặp nhân viên",
    timeLeft: "còn 23h 51p",
    infoCollected: {
      name: "Chưa có",
      phone: "Chưa có",
      address: "Chưa có",
      product: "Gói dịch vụ 2",
      quantity: "Chưa có"
    },
    history: {
      orders: "0 đơn",
      totalSpent: "0 đ",
      lastPurchase: "Chưa từng mua"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "AI", text: "Xin chào! Đây là trợ lý tự động của shop, em có thể tư vấn ngay cho mình ạ.", time: "18:50" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Cho mình gặp nhân viên", time: "18:58" }
    ],
    handoffReason: "khách đòi gặp người thật"
  },
  {
    id: "conv-7",
    customerInitial: "Q",
    customerName: "Quỳnh Như",
    platform: "facebook", source: "Từ bình luận bài đăng ngày 10/08",
    status: "ai",
    time: "12 phút",
    lastMessage: "Ship tỉnh bao nhiêu?",
    timeLeft: "còn 23h 48p",
    infoCollected: {
      name: "Chưa có",
      phone: "Chưa có",
      address: "Chưa có",
      product: "Sản phẩm A",
      quantity: "3"
    },
    history: {
      orders: "1 đơn",
      totalSpent: "450.000 đ",
      lastPurchase: "6 tháng trước"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "AI", text: "Xin chào! Đây là trợ lý tự động của shop, em có thể tư vấn ngay cho mình ạ.", time: "18:40" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Ship tỉnh bao nhiêu?", time: "18:55" }
    ]
  },
  {
    id: "conv-8",
    customerInitial: "P",
    customerName: "Phạm Phúc",
    platform: "facebook", source: "Từ tin nhắn trực tiếp",
    status: "expiring",
    time: "23 giờ",
    lastMessage: "Để tối về anh đo lại",
    timeLeft: "còn 45p",
    infoCollected: {
      name: "Phạm Phúc",
      phone: "Chưa có",
      address: "Chưa có",
      product: "Sản phẩm B",
      quantity: "Chưa có"
    },
    history: {
      orders: "2 đơn",
      totalSpent: "1.700.000 đ",
      lastPurchase: "2 tháng trước"
    },
    messages: [
      { id: 1, sender: "shop", senderType: "AI", text: "Xin chào! Đây là trợ lý tự động của shop, em có thể tư vấn ngay cho mình ạ.", time: "19:00 (Hôm qua)" },
      { id: 2, sender: "customer", senderType: "Khách", text: "Để tối về anh đo lại", time: "20:00 (Hôm qua)" }
    ]
  }
];

export const mockOrders = [
  {
    id: "#DH-1042",
    time: "14:32",
    date: "14/08",
    customerInitial: "H",
    customerName: "Nguyễn Thị Hoa",
    phone: "0987 123 456",
    productName: "Sản phẩm A",
    quantity: 2,
    value: "900.000 đ",
    source: "AI chốt",
    status: "Chờ xác nhận",
    address: "Số 12 ngõ 34, Phường Ô Chợ Dừa, Đống Đa, Hà Nội",
    timeline: [
      { time: "14:02", text: "AI bắt đầu tư vấn" },
      { time: "14:15", text: "Khách đồng ý mua" },
      { time: "14:19", text: "AI chốt đơn thành công" },
      { time: "14:19", text: "Đã gửi thông báo sang Telegram" },
      { time: "14:45", text: "Bạn đã xác nhận đơn" }
    ],
    items: [
      { name: "Sản phẩm A", qty: 2, price: "450.000 đ", total: "900.000 đ" }
    ]
  },
  {
    id: "#DH-1041",
    time: "11:15",
    date: "14/08",
    customerInitial: "L",
    customerName: "Lê Văn Long",
    phone: "0912 345 678",
    productName: "Gói dịch vụ 1",
    quantity: 1,
    value: "1.200.000 đ",
    source: "Bạn chốt",
    status: "Chờ xác nhận",
    address: "Số 5 đường ABC, Phường 1, Quận 2, TP.HCM",
    timeline: [
      { time: "10:30", text: "Khách bắt đầu chat" },
      { time: "11:10", text: "Bạn bắt đầu tư vấn" },
      { time: "11:15", text: "Bạn tạo đơn hàng" }
    ],
    items: [
      { name: "Gói dịch vụ 1", qty: 1, price: "1.200.000 đ", total: "1.200.000 đ" }
    ]
  },
  {
    id: "#DH-1040",
    time: "09:45",
    date: "14/08",
    customerInitial: "M",
    customerName: "Mai Phương",
    phone: "0945 678 901",
    productName: "Sản phẩm B",
    quantity: 3,
    value: "1.500.000 đ",
    source: "AI chốt",
    status: "Đang giao",
    address: "Toà nhà XYZ, Quận 7, TP.HCM",
    timeline: [
      { time: "09:00", text: "AI bắt đầu tư vấn" },
      { time: "09:40", text: "Khách đồng ý mua" },
      { time: "09:45", text: "AI chốt đơn thành công" },
      { time: "09:45", text: "Đã gửi thông báo sang Telegram" },
      { time: "10:00", text: "Bạn đã xác nhận đơn" },
      { time: "13:00", text: "Đã giao cho đơn vị vận chuyển" }
    ],
    items: [
      { name: "Sản phẩm B", qty: 3, price: "500.000 đ", total: "1.500.000 đ" }
    ]
  },
  {
    id: "#DH-1039",
    time: "20:10",
    date: "13/08",
    customerInitial: "T",
    customerName: "Trần Bình",
    phone: "0909 111 222",
    productName: "Gói dịch vụ 2",
    quantity: 1,
    value: "2.000.000 đ",
    source: "AI chốt",
    status: "Hoàn thành",
    address: "Online",
    timeline: [
      { time: "19:30", text: "AI bắt đầu tư vấn" },
      { time: "20:05", text: "Khách đồng ý mua" },
      { time: "20:10", text: "AI chốt đơn thành công" },
      { time: "20:15", text: "Bạn đã xác nhận đơn" },
      { time: "20:30", text: "Đơn hàng hoàn thành" }
    ],
    items: [
      { name: "Gói dịch vụ 2", qty: 1, price: "2.000.000 đ", total: "2.000.000 đ" }
    ]
  },
  {
    id: "#DH-1038",
    time: "16:20",
    date: "13/08",
    customerInitial: "V",
    customerName: "Vũ Hải",
    phone: "0933 888 999",
    productName: "Sản phẩm C",
    quantity: 1,
    value: "800.000 đ",
    source: "Bạn chốt",
    status: "Đã hủy",
    address: "Phường ABC, Quận Đống Đa, Hà Nội",
    timeline: [
      { time: "15:00", text: "Khách bắt đầu chat" },
      { time: "16:00", text: "Bạn bắt đầu tư vấn" },
      { time: "16:20", text: "Bạn tạo đơn hàng" },
      { time: "17:00", text: "Khách báo hủy đơn" },
      { time: "17:05", text: "Đơn hàng đã hủy" }
    ],
    items: [
      { name: "Sản phẩm C", qty: 1, price: "800.000 đ", total: "800.000 đ" }
    ]
  },
  {
    id: "#DH-1037",
    time: "14:00",
    date: "13/08",
    customerInitial: "D",
    customerName: "Đặng Khoa",
    phone: "0977 444 555",
    productName: "Sản phẩm A",
    quantity: 2,
    value: "900.000 đ",
    source: "AI chốt",
    status: "Đã xác nhận",
    address: "Đường DEF, TP. Đà Nẵng",
    timeline: [
      { time: "13:30", text: "AI bắt đầu tư vấn" },
      { time: "13:55", text: "Khách đồng ý mua" },
      { time: "14:00", text: "AI chốt đơn thành công" },
      { time: "14:00", text: "Đã gửi thông báo sang Telegram" },
      { time: "14:15", text: "Bạn đã xác nhận đơn" }
    ],
    items: [
      { name: "Sản phẩm A", qty: 2, price: "450.000 đ", total: "900.000 đ" }
    ]
  },
  {
    id: "#DH-1036",
    time: "10:30",
    date: "13/08",
    customerInitial: "Q",
    customerName: "Quỳnh Như",
    phone: "0922 666 777",
    productName: "Sản phẩm B",
    quantity: 1,
    value: "500.000 đ",
    source: "AI chốt",
    status: "Chờ xác nhận",
    address: "Ngõ 123, Đường 456, TP. Cần Thơ",
    timeline: [
      { time: "09:45", text: "AI bắt đầu tư vấn" },
      { time: "10:25", text: "Khách đồng ý mua" },
      { time: "10:30", text: "AI chốt đơn thành công" }
    ],
    items: [
      { name: "Sản phẩm B", qty: 1, price: "500.000 đ", total: "500.000 đ" }
    ]
  },
  {
    id: "#DH-1035",
    time: "08:15",
    date: "13/08",
    customerInitial: "P",
    customerName: "Phạm Phúc",
    phone: "0966 333 111",
    productName: "Gói dịch vụ 1",
    quantity: 1,
    value: "1.200.000 đ",
    source: "Bạn chốt",
    status: "Đang giao",
    address: "Toà nhà ABC, Đường XYZ, TP. Hà Nội",
    timeline: [
      { time: "07:30", text: "Khách bắt đầu chat" },
      { time: "08:00", text: "Bạn bắt đầu tư vấn" },
      { time: "08:15", text: "Bạn tạo đơn hàng" },
      { time: "09:00", text: "Đã giao cho đơn vị vận chuyển" }
    ],
    items: [
      { name: "Gói dịch vụ 1", qty: 1, price: "1.200.000 đ", total: "1.200.000 đ" }
    ]
  }
];

export const mockPosts = [
  {
    id: "post-1",
    status: "Chờ duyệt",
    hasImage: true,
    content: "🎉 Cập nhật cửa hàng: Dòng sản phẩm mới đã chính thức lên kệ! Thiết kế tối giản, công năng vượt trội, phù hợp cho mọi không gian sống hiện đại. Đừng bỏ lỡ cơ hội sở hữu với mức giá ưu đãi trong tuần lễ ra mắt nhé mọi người.",
    aiTime: "AI viết lúc 09:15 hôm nay",
    scheduleTime: "Chưa đặt lịch",
    stats: null
  },
  {
    id: "post-2",
    status: "Chờ duyệt",
    hasImage: false,
    content: "💡 Mẹo nhỏ cho ngày mới: Bạn có biết việc duy trì thói quen sử dụng đúng cách không chỉ giúp tăng tuổi thọ sản phẩm mà còn mang lại trải nghiệm tuyệt vời hơn mỗi ngày? Cùng tìm hiểu 3 bí quyết dưới đây...",
    aiTime: "AI viết lúc 10:30 hôm nay",
    scheduleTime: "Chưa đặt lịch",
    stats: null
  },
  {
    id: "post-3",
    status: "Chờ duyệt",
    hasImage: true,
    content: "🔥 KHUYẾN MÃI CUỐI TUẦN CHỈ CÒN 2 NGÀY! \nGiảm trực tiếp 30% cho toàn bộ sản phẩm trong bộ sưu tập mới. Nhanh tay inbox cho shop để được tư vấn kích thước và màu sắc phù hợp nhé.",
    aiTime: "AI viết lúc 11:45 hôm nay",
    scheduleTime: "Chưa đặt lịch",
    stats: null
  },
  {
    id: "post-4",
    status: "Đã lên lịch",
    hasImage: true,
    content: "Chất lượng làm nên thương hiệu! Cảm ơn anh/chị khách hàng thân thiết đã luôn tin tưởng và lựa chọn sản phẩm của chúng tôi. Mỗi phản hồi tích cực là động lực để shop hoàn thiện hơn mỗi ngày. ❤️",
    aiTime: "AI viết lúc 14:20 hôm qua",
    scheduleTime: "Sẽ đăng 20:00 ngày 15/08",
    stats: null
  },
  {
    id: "post-5",
    status: "Đã lên lịch",
    hasImage: false,
    content: "Chuẩn bị ra mắt một bất ngờ lớn vào tuần sau! Các bạn đoán thử xem đó là gì nào? Hãy theo dõi Fanpage để là người đầu tiên nhận được thông báo nhé. 😉",
    aiTime: "AI viết lúc 16:10 hôm qua",
    scheduleTime: "Sẽ đăng 09:00 ngày 16/08",
    stats: null
  },
  {
    id: "post-6",
    status: "Đã đăng",
    hasImage: true,
    content: "Góc chia sẻ: Hình ảnh thực tế từ khách hàng sử dụng gói dịch vụ nâng cao. Thay đổi rõ rệt chỉ sau 2 tuần! Nếu bạn đang băn khoăn, hãy nhắn tin ngay để chuyên viên của chúng tôi hỗ trợ tư vấn lộ trình nhé.",
    aiTime: "AI viết lúc 08:00 ngày 14/08",
    scheduleTime: "Đã đăng 09:00 ngày 14/08",
    stats: {
      likes: 124,
      comments: 32,
      shares: 8
    }
  }
];

export const mockAutoScripts = [
  {
    id: "script-1",
    name: "Khách hỏi giá",
    status: "Đang chạy",
    keywords: ["giá", "bao nhiêu", "inbox", "quan tâm"],
    matchType: "Khớp nguyên từ · Có bỏ qua lỗi chính tả",
    message: "Xin chào! Đây là trợ lý tự động của shop. Em thấy mình quan tâm sản phẩm, em tư vấn ngay cho mình nhé!",
    delay: "Gửi sau 30 giây",
    stats: { triggered: 84, sent: 84, replied: "52 (62%)" },
    appliedTo: "Tất cả bài đăng"
  },
  {
    id: "script-2",
    name: "Khách quan tâm sản phẩm",
    status: "Đang chạy",
    keywords: ["tư vấn", "chi tiết", "xem mẫu", "mua"],
    matchType: "Khớp nguyên từ · Có bỏ qua lỗi chính tả",
    message: "Chào bạn, trợ lý tự động xin gửi bạn thông tin chi tiết về sản phẩm ạ. Bạn cần tư vấn thêm màu nào không?",
    delay: "Gửi sau 60 giây",
    stats: { triggered: 120, sent: 120, replied: "80 (66%)" },
    appliedTo: "3 bài đăng cụ thể"
  },
  {
    id: "script-3",
    name: "Khách hỏi còn hàng",
    status: "Tạm dừng",
    keywords: ["còn không", "còn hàng", "sẵn không", "đặt hàng"],
    matchType: "Khớp nguyên từ · Không bỏ qua lỗi",
    message: "Dạ sản phẩm bên shop vẫn đang còn hàng sẵn ạ. Trợ lý tự động xin phép tư vấn kỹ hơn cho mình nhé!",
    delay: "Gửi sau 15 giây",
    stats: { triggered: 45, sent: 45, replied: "20 (44%)" },
    appliedTo: "Tất cả bài đăng"
  }
];

export const mockAdsChartData = [
  { name: '01/08', reach: 24000, orders: 4 },
  { name: '05/08', reach: 35000, orders: 8 },
  { name: '10/08', reach: 42000, orders: 12 },
  { name: '15/08', reach: 28000, orders: 5 },
  { name: '20/08', reach: 55000, orders: 15 },
  { name: '25/08', reach: 48000, orders: 11 },
  { name: '30/08', reach: 62000, orders: 18 }
];

export const mockAdsCampaigns = [
  {
    id: "camp-1",
    name: "Đẩy bài sản phẩm mới",
    startDate: "Bắt đầu từ 10/08/2026",
    type: "Đẩy bài",
    budget: "300.000 đ/ngày",
    spent: { current: "1.200.000", total: "1.500.000 đ", percent: 80 },
    reach: "124K",
    comments: 342,
    orders: 18,
    status: "Đang chạy"
  },
  {
    id: "camp-2",
    name: "Chiến dịch tháng 8",
    startDate: "Bắt đầu từ 01/08/2026",
    type: "Chiến dịch mới",
    budget: "500.000 đ/ngày",
    spent: { current: "6.500.000", total: "15.000.000 đ", percent: 43 },
    reach: "450K",
    comments: 1120,
    orders: 54,
    status: "Đang chạy"
  },
  {
    id: "camp-3",
    name: "Đẩy bài khuyến mãi",
    startDate: "Bắt đầu từ 12/08/2026",
    type: "Đẩy bài",
    budget: "200.000 đ/ngày",
    spent: { current: "200.000", total: "600.000 đ", percent: 33 },
    reach: "45K",
    comments: 89,
    orders: 5,
    status: "Tạm dừng"
  },
  {
    id: "camp-4",
    name: "Tương tác bộ sưu tập Thu",
    startDate: "Bắt đầu từ 20/07/2026",
    type: "Chiến dịch mới",
    budget: "400.000 đ/ngày",
    spent: { current: "4.000.000", total: "4.000.000 đ", percent: 100 },
    reach: "320K",
    comments: 850,
    orders: 42,
    status: "Đã kết thúc"
  },
  {
    id: "camp-5",
    name: "Đẩy bài feedback khách hàng",
    startDate: "Bắt đầu từ 05/08/2026",
    type: "Đẩy bài",
    budget: "150.000 đ/ngày",
    spent: { current: "750.000", total: "750.000 đ", percent: 100 },
    reach: "85K",
    comments: 156,
    orders: 12,
    status: "Đã kết thúc"
  }
];

export const mockAdsAudiences = [
  { id: "aud-1", name: "Khách đã mua", size: "1.240 người", type: "Tệp tùy chỉnh" },
  { id: "aud-2", name: "Giống khách đã mua", size: "850.000 người", type: "Tệp tương tự" },
  { id: "aud-3", name: "Quan tâm sản phẩm", size: "320.000 người", type: "Theo sở thích" }
];

export const mockAdsPosts = [
  {
    id: "ad-post-1",
    hasImage: true,
    content: "🔥 KHUYẾN MÃI CUỐI TUẦN CHỈ CÒN 2 NGÀY! \nGiảm trực tiếp 30% cho toàn bộ sản phẩm trong bộ sưu tập mới. Nhanh tay inbox cho shop để được tư vấn kích thước và màu sắc phù hợp nhé.",
    date: "12/08/2026",
    stats: { likes: 1245, comments: 456, shares: 120 }
  },
  {
    id: "ad-post-2",
    hasImage: true,
    content: "🎉 Cập nhật cửa hàng: Dòng sản phẩm mới đã chính thức lên kệ! Thiết kế tối giản, công năng vượt trội, phù hợp cho mọi không gian sống hiện đại. Đừng bỏ lỡ cơ hội sở hữu với mức giá ưu đãi trong tuần lễ ra mắt nhé mọi người.",
    date: "10/08/2026",
    stats: { likes: 890, comments: 234, shares: 45 }
  },
  {
    id: "ad-post-3",
    hasImage: false,
    content: "💡 Mẹo nhỏ cho ngày mới: Bạn có biết việc duy trì thói quen sử dụng đúng cách không chỉ giúp tăng tuổi thọ sản phẩm mà còn mang lại trải nghiệm tuyệt vời hơn mỗi ngày? Cùng tìm hiểu 3 bí quyết dưới đây...",
    date: "08/08/2026",
    stats: { likes: 540, comments: 120, shares: 25 }
  },
  {
    id: "ad-post-4",
    hasImage: true,
    content: "Chất lượng làm nên thương hiệu! Cảm ơn anh/chị khách hàng thân thiết đã luôn tin tưởng và lựa chọn sản phẩm của chúng tôi. Mỗi phản hồi tích cực là động lực để shop hoàn thiện hơn mỗi ngày. ❤️",
    date: "05/08/2026",
    stats: { likes: 1450, comments: 85, shares: 60 }
  }
];

export const mockTelegramHistory = [
  {
    id: "th-1",
    time: "14:20 14/08",
    type: "Đơn hàng",
    content: "Đơn hàng mới: Nguyễn Thị Hoa - 900.000 đ",
    status: "Đã gửi"
  },
  {
    id: "th-2",
    time: "13:45 14/08",
    type: "Cần xử lý",
    content: "Khách khiếu nại giao hàng: Trần Thị Mai",
    status: "Đã gửi"
  },
  {
    id: "th-3",
    time: "10:15 14/08",
    type: "Cảnh báo",
    content: "Chiến dịch 'Đẩy bài sản phẩm mới' sắp hết ngân sách",
    status: "Gửi lỗi"
  },
  {
    id: "th-4",
    time: "09:00 14/08",
    type: "Đơn hàng",
    content: "Đơn hàng mới: Lê Văn Nam - 1.250.000 đ",
    status: "Đã gửi"
  },
  {
    id: "th-5",
    time: "20:00 13/08",
    type: "Tổng kết",
    content: "Tổng kết ngày: 15 đơn, DT 5.400.000 đ, tỷ lệ chốt 45%",
    status: "Đã gửi"
  },
  {
    id: "th-6",
    time: "18:30 13/08",
    type: "Cần xử lý",
    content: "Khách hỏi thông tin bảo hành phức tạp: Phạm Khang",
    status: "Đã gửi"
  }
];

export const mockConnections = [
  {
    id: "page-1",
    name: "Fanpage A",
    status: "Đang hoạt động",
    connectedDate: "10/08/2026",
    expiryDate: "09/10/2026",
    daysLeft: 56,
    messagesProcessed: "1.240",
    commentsReplied: "3.580",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: true },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]
  },
  {
    id: "page-2",
    name: "Fanpage B",
    status: "Sắp hết hạn",
    connectedDate: "05/06/2026",
    expiryDate: "19/08/2026",
    daysLeft: 5,
    messagesProcessed: "4.500",
    commentsReplied: "12.050",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: true },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]
  },
  {
    id: "page-3",
    name: "Fanpage C",
    status: "Mất kết nối",
    connectedDate: "12/01/2026",
    expiryDate: "12/07/2026",
    daysLeft: 0,
    messagesProcessed: "8.900",
    commentsReplied: "21.400",
    permissions: [
      { name: "Truy cập trang", granted: false },
      { name: "Đăng và quản lý bài", granted: false },
      { name: "Quản lý bình luận", granted: false },
      { name: "Đọc và trả lời tin nhắn", granted: false },
      { name: "Đọc dữ liệu phân tích", granted: false }
    ]
  },
  {
    id: "page-4",
    name: "Fanpage D",
    status: "Thiếu quyền",
    connectedDate: "14/08/2026",
    expiryDate: "14/10/2026",
    daysLeft: 60,
    messagesProcessed: "150",
    commentsReplied: "320",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: false },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]
  }
];

export const connectedAccounts = [
  {
    id: "fb_acc_1",
    platformId: "fb",
    platformName: "Facebook",
    platformIcon: "facebook",
    accountName: "Hoàng Tuấn",
    connectionDate: "10/08/2026",
    expiryDate: "09/10/2026",
    status: "Đang hoạt động",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: true },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ],
    pages: [
      {
        id: "page-1",
        name: "Fanpage A",
        status: "Đang hoạt động",
        avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
        messagesProcessed: "1.240",
        commentsReplied: "3.580"
      },
      {
        id: "page-2",
        name: "Fanpage B",
        status: "Sắp hết hạn",
        avatar: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
        messagesProcessed: "4.500",
        commentsReplied: "12.050"
      }
    ]
  },
  {
    id: "ig_acc_1",
    platformId: "ig",
    platformName: "Instagram",
    platformIcon: "photo_camera",
    accountName: "Hoàng Tuấn",
    connectionDate: "12/01/2026",
    expiryDate: "12/07/2026",
    status: "Mất kết nối",
    permissions: [
      { name: "Thông tin cá nhân", granted: true },
      { name: "Đăng bài và Reels", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn (DMs)", granted: false },
      { name: "Dữ liệu phân tích", granted: true }
    ],
    pages: [
      {
        id: "page-3",
        name: "Fanpage C",
        status: "Mất kết nối",
        avatar: "https://i.pravatar.cc/150?u=a042581f4e29026702d",
        messagesProcessed: "8.900",
        commentsReplied: "21.400"
      }
    ]
  }
];

export const mockSubPagesToSelect = [
    { id: 'sel_1', name: 'Cửa hàng Phụ kiện', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d', followers: '12.5k', connected: true },
    { id: 'sel_2', name: 'Shop Thời trang Nam', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d', followers: '45.2k', connected: true },
    { id: 'sel_3', name: 'Giày dép Authentic', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026025d', followers: '8.9k', connected: false },
    { id: 'sel_4', name: 'Túi xách cao cấp', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026026d', followers: '1.2k', connected: false },
    { id: 'sel_5', name: 'Đồ gia dụng thông minh', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026027d', followers: '23k', connected: false },
];

export const socialChannels: any[] = [
  { id: 'fb', name: 'Facebook', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'facebook', connectionType: 'oauth_with_selection', selectionLabel: 'Trang', 
    warnings: ['Chỉ hỗ trợ kết nối với Trang (Fanpage), không hỗ trợ Trang cá nhân.'],
    instructions: ['Bấm nút bên dưới, một cửa sổ xác thực Facebook sẽ mở ra.', 'Cấp quyền truy cập cho tất cả các Trang mà bạn muốn quản lý.'],
    requestedPermissions: [
    { icon: 'list', name: 'pages_show_list', desc: 'Liệt kê các Trang bạn quản lý.' },
    { icon: 'edit', name: 'pages_manage_posts', desc: 'Tạo, chỉnh sửa và xóa bài viết trên Trang.' },
    { icon: 'analytics', name: 'pages_read_engagement & read_insights', desc: 'Đọc nội dung và phân tích dữ liệu (lượt xem, nhấp chuột, tương tác).' },
    { icon: 'forum', name: 'pages_manage_engagement & pages_read_user_content', desc: 'Đọc và trả lời bình luận trên bài viết.' },
    { icon: 'chat', name: 'pages_messaging', desc: 'Quản lý hội thoại Messenger trong hộp thư.' },
    { icon: 'settings', name: 'pages_manage_metadata & business_management', desc: 'Quản lý webhook và các Trang trong Business Manager.' }
  ] },
  { id: 'ig', name: 'Instagram', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'photo_camera', connectionType: 'oauth_simple',
    warnings: ['Tài khoản Instagram của bạn BẮT BUỘC phải là Tài khoản Doanh nghiệp (Professional/Business/Creator).', 'Phải được liên kết với một Fanpage Facebook mà bạn có quyền quản trị.'],
    instructions: ['Bạn sẽ được chuyển sang Facebook để xác thực.', 'Chọn Fanpage Facebook có liên kết với tài khoản Instagram Doanh nghiệp của bạn.'],
    requestedPermissions: [
    { icon: 'person', name: 'instagram_business_basic', desc: 'Dữ liệu hồ sơ cơ bản và danh tính tài khoản.' },
    { icon: 'publish', name: 'instagram_business_content_publish', desc: 'Đăng bài viết, reels, stories và carousels.' },
    { icon: 'analytics', name: 'instagram_business_manage_insights', desc: 'Phân tích dữ liệu tài khoản và bài viết.' },
    { icon: 'forum', name: 'instagram_business_manage_comments', desc: 'Đọc và trả lời bình luận (bao gồm tính năng bình luận đầu tiên).' },
    { icon: 'chat', name: 'instagram_business_manage_messages', desc: 'Quản lý tin nhắn Instagram DMs trong hộp thư.' }
  ] },
  { id: 'tt', name: 'TikTok', connected: false, statusText: 'Kết nối', statusColor: 'text-primary', icon: 'music_note', connectionType: 'oauth_simple', publishOnly: true,
    warnings: ['API TikTok đang khóa hộp thư: Không hỗ trợ đọc/trả lời tin nhắn & bình luận trực tiếp.'],
    instructions: ['Đăng nhập bằng tài khoản TikTok của bạn.', 'Xác nhận để cấp quyền xuất bản video.'],
    requestedPermissions: [
    { icon: 'person', name: 'user.info.basic & user.info.profile', desc: 'Danh tính tài khoản (username, avatar, bio, verified status).' },
    { icon: 'analytics', name: 'user.info.stats & video.list', desc: 'Đọc dữ liệu phân tích (lượt theo dõi, thích, video).' },
    { icon: 'publish', name: 'video.publish', desc: 'Đăng trực tiếp video và ảnh.' },
    { icon: 'upload', name: 'video.upload', desc: 'Tải video lên hộp thư nháp của TikTok.' }
  ] },
  { id: 'yt', name: 'YouTube', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'play_circle', connectionType: 'oauth_simple',
    instructions: ['Đăng nhập bằng tài khoản Google.', 'Chọn đúng kênh YouTube mà bạn muốn quản lý.'],
    requestedPermissions: [
    { icon: 'upload', name: 'youtube.upload', desc: 'Tải video lên kênh YouTube.' },
    { icon: 'settings', name: 'youtube', desc: 'Quản lý kênh: siêu dữ liệu video, playlist, hình thu nhỏ.' },
    { icon: 'forum', name: 'youtube.force-ssl', desc: 'Đọc và đăng bình luận.' },
    { icon: 'analytics', name: 'yt-analytics.readonly', desc: 'Đọc phân tích kênh và video.' }
  ] },
  { id: 'th', name: 'Threads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'alternate_email', connectionType: 'oauth_simple',
    instructions: ['Sử dụng tài khoản Instagram của bạn để xác thực cấp quyền.'],
    requestedPermissions: [
    { icon: 'person', name: 'threads_basic', desc: 'Dữ liệu hồ sơ cơ bản của Threads.' },
    { icon: 'publish', name: 'threads_content_publish', desc: 'Đăng bài viết và luồng Threads.' },
    { icon: 'forum', name: 'threads_manage_replies', desc: 'Đọc và trả lời bài viết.' },
    { icon: 'analytics', name: 'threads_read_insights', desc: 'Đọc phân tích dữ liệu Threads.' }
  ] },
  { id: 'x', name: 'X (Twitter)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'close', connectionType: 'oauth_simple',
    warnings: ['Giới hạn của X API có thể ảnh hưởng đến số lượng bài đăng và tin nhắn mỗi ngày tùy gói của bạn.'],
    instructions: ['Xác thực với X để cho phép nền tảng gửi nội dung thay mặt bạn.'],
    requestedPermissions: [
    { icon: 'person', name: 'users.read', desc: 'Đọc thông tin hồ sơ người dùng.' },
    { icon: 'publish', name: 'tweet.read & tweet.write', desc: 'Đọc và đăng Tweet.' },
    { icon: 'chat', name: 'dm.read & dm.write', desc: 'Quản lý tin nhắn trực tiếp.' },
    { icon: 'settings', name: 'offline.access', desc: 'Duy trì kết nối liên tục.' }
  ] },
  { id: 'li', name: 'LinkedIn', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'work', connectionType: 'oauth_with_selection', selectionLabel: 'Tổ chức hoặc Trang cá nhân',
    instructions: ['Đăng nhập LinkedIn bằng tài khoản cá nhân.', 'Sau khi đăng nhập thành công, bạn sẽ chọn có muốn dùng Tổ chức (Company Page) hay Trang cá nhân hay không.'],
    requestedPermissions: [
    { icon: 'person', name: 'openid, profile, email', desc: 'Danh tính tài khoản qua OpenID Connect.' },
    { icon: 'publish', name: 'w_organization_social & w_member_social', desc: 'Đăng bài và bình luận với tư cách cá nhân hoặc tổ chức.' },
    { icon: 'forum', name: 'r_organization_social & r_member_social', desc: 'Đọc bài viết và bình luận.' },
    { icon: 'analytics', name: 'r_organization_followers & r_member_postAnalytics', desc: 'Đọc phân tích dữ liệu và người theo dõi.' }
  ] },
  { id: 'pi', name: 'Pinterest', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'push_pin', connectionType: 'oauth_with_selection', selectionLabel: 'Bảng', publishOnly: true,
    warnings: ['Không hỗ trợ nhắn tin và bình luận qua API (Chỉ hỗ trợ đăng/ghim bài).'],
    instructions: ['Xác thực Pinterest.', 'Chọn Bảng (Board) mặc định để lưu các ghim do AI tạo ra.'],
    requestedPermissions: [
    { icon: 'folder', name: 'boards:read & boards:write', desc: 'Đọc và tạo các bảng (boards).' },
    { icon: 'push_pin', name: 'pins:read & pins:write', desc: 'Đọc, đăng các ghim (pins) và phân tích.' },
    { icon: 'person', name: 'user_accounts:read', desc: 'Danh tính và phân tích tài khoản.' }
  ] },
  { id: 're', name: 'Reddit', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'forum', connectionType: 'oauth_with_selection', selectionLabel: 'Subreddit',
    warnings: ['Để quản lý và tương tác với Subreddit, bạn phải có quyền Moderator.'],
    instructions: ['Đăng nhập tài khoản Reddit.', 'Cấp quyền ứng dụng và lựa chọn Subreddit.'],
    requestedPermissions: [
    { icon: 'person', name: 'identity', desc: 'Xác minh danh tính tài khoản Reddit.' },
    { icon: 'publish', name: 'submit', desc: 'Đăng bài viết mới lên Subreddit.' },
    { icon: 'forum', name: 'read & edit & history', desc: 'Đọc, trả lời bình luận và lịch sử tương tác.' },
    { icon: 'chat', name: 'privatemessages', desc: 'Quản lý tin nhắn riêng tư.' }
  ] },
  { id: 'bs', name: 'Bluesky', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'cloud', connectionType: 'manual_credentials',
    warnings: ['Tuyệt đối KHÔNG DÙNG mật khẩu đăng nhập chính. API hộp thư không hỗ trợ đính kèm Media.'],
    instructions: ['Mở ứng dụng Bluesky > Cài đặt > Advanced > App Passwords.', 'Tạo một mật khẩu ứng dụng mới.', 'Nhập Handle (Tên người dùng) và Mật khẩu ứng dụng vừa tạo vào bước tiếp theo.'],
    requestedPermissions: [
    { icon: 'lock', name: 'App Password', desc: 'Đăng nhập thông qua mật khẩu ứng dụng (App Password) thay vì OAuth.' }
  ] },
  { id: 'sc', name: 'Snapchat', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'filter_vintage', connectionType: 'oauth_simple', publishOnly: true,
    warnings: ['Tài khoản bắt buộc phải là Hồ sơ Công khai (Public Profile).', 'Giới hạn API: Chỉ đăng tối đa 1 nội dung (ảnh hoặc video) mỗi bài.'],
    instructions: ['Cấp quyền truy cập vào Public Profile Snapchat của bạn.'],
    requestedPermissions: [
    { icon: 'public', name: 'snapchat-profile-api', desc: 'Quản lý Hồ sơ Công khai: đăng lên Spotlight và Stories, đọc dữ liệu và phân tích hồ sơ.' }
  ] },
  { id: 'wa', name: 'WhatsApp', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'chat', connectionType: 'oauth_simple',
    warnings: ['Gửi tin nhắn tự động sau 24h kể từ khi khách hàng nhắn tin phải sử dụng Mẫu tin (Template) đã duyệt trước bởi Meta.'],
    instructions: ['Đảm bảo bạn có tài khoản WhatsApp Business.', 'Bạn sẽ được chuyển hướng sang giao diện thiết lập của Meta Business Suite.'],
    requestedPermissions: [
    { icon: 'chat', name: 'whatsapp_business_messaging', desc: 'Gửi và nhận tin nhắn, quản lý hội thoại khách hàng qua WhatsApp Business.' }
  ] },
  { id: 'tg', name: 'Telegram', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'send', connectionType: 'access_code',
    warnings: ['Chỉ hỗ trợ kết nối Kênh (Channel) hoặc Nhóm (Group).', 'Bot của chúng tôi phải được thêm làm Quản trị viên (Admin).'],
    instructions: ['Thêm Bot Zernio làm quản trị viên trong kênh/nhóm Telegram của bạn.', 'Mở hộp thoại với Bot và gửi Mã truy cập được cấp.', 'Hệ thống sẽ tự động xác nhận và hoàn tất kết nối.'],
    requestedPermissions: [
    { icon: 'key', name: 'Zernio Bot', desc: 'Gửi mã Access Code cho Bot để ủy quyền kết nối.' }
  ] },
  { id: 'di', name: 'Discord', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'sports_esports', connectionType: 'oauth_simple',
    instructions: ['Cài đặt Zernio Bot vào Server (Guild) Discord của bạn.', 'Đảm bảo bạn có quyền Quản trị (Admin) trong Server.'],
    requestedPermissions: [
    { icon: 'sports_esports', name: 'bot', desc: 'Cài đặt Zernio bot vào máy chủ của bạn; mọi bài đăng đều qua bot.' },
    { icon: 'list', name: 'guilds', desc: 'Liệt kê các máy chủ bạn quản lý để chọn nơi đăng bài.' }
  ] },
  { id: 'sl', name: 'Slack', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'tag', connectionType: 'oauth_simple',
    instructions: ['Cấp quyền và thêm ứng dụng Zernio vào Workspace Slack của bạn.'],
    requestedPermissions: [
    { icon: 'chat', name: 'chat:write & chat:write.public', desc: 'Đăng tin nhắn với tư cách bot vào các kênh công cộng/riêng tư.' },
    { icon: 'forum', name: 'channels:history & im:history', desc: 'Nhận tin nhắn đến từ kênh hoặc tin nhắn trực tiếp.' },
    { icon: 'group', name: 'channels:read & team:read', desc: 'Đọc thông tin workspace và danh sách kênh.' }
  ] },
  { id: 'gb', name: 'Google Business', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'storefront', connectionType: 'oauth_with_selection', selectionLabel: 'Địa điểm',
    instructions: ['Xác thực bằng tài khoản Google đang quản lý Hồ sơ doanh nghiệp.', 'Hệ thống sẽ tải danh sách Địa điểm kinh doanh để bạn lựa chọn quản lý.'],
    requestedPermissions: [
    { icon: 'storefront', name: 'business.manage', desc: 'Quản lý địa điểm: bài đăng địa phương, đánh giá, Hỏi & Đáp và phân tích.' },
    { icon: 'person', name: 'userinfo.profile & userinfo.email', desc: 'Danh tính và email tài khoản khi kết nối.' }
  ] }
];

export const adChannels: any[] = [
  { id: 'fb_ads', name: 'Meta Ads', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'campaign', connectionType: 'oauth_simple',
    warnings: ['Chỉ hỗ trợ quyền quản lý quảng cáo. Nếu bạn muốn đăng nội dung thông thường, hãy kết nối ở mục Mạng xã hội.'],
    instructions: ['Đăng nhập và cấp quyền truy cập trình quản lý Meta Ads.'],
    requestedPermissions: [
    { icon: 'campaign', name: 'ads_management', desc: 'Đọc và quản lý tài khoản quảng cáo, chiến dịch Meta Ads.' }
  ] },
  { id: 'gg_ads', name: 'Google Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'ads_click', connectionType: 'oauth_simple',
    instructions: ['Kết nối bằng tài khoản Google đang sở hữu tài khoản quảng cáo.'],
    requestedPermissions: [
    { icon: 'ads_click', name: 'adwords', desc: 'Quản lý các chiến dịch Google Ads.' }
  ] },
  { id: 'tt_ads', name: 'TikTok Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'music_note', connectionType: 'oauth_simple',
    instructions: ['Đăng nhập bằng tài khoản quản lý TikTok Business Center.'],
    requestedPermissions: [
    { icon: 'music_note', name: 'business_management', desc: 'Quản lý Business Center của TikTok Ads.' }
  ] },
  { id: 'li_ads', name: 'LinkedIn Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'work', connectionType: 'oauth_simple',
    instructions: ['Liên kết thông qua tài khoản quản trị Quảng cáo LinkedIn.'],
    requestedPermissions: [
    { icon: 'analytics', name: 'r_ads & r_ads_reporting', desc: 'Đọc tài khoản quảng cáo và báo cáo phân tích.' },
    { icon: 'campaign', name: 'rw_ads & rw_conversions', desc: 'Quản lý chiến dịch, quảng cáo và Conversions API.' }
  ] },
  { id: 'pi_ads', name: 'Pinterest Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'push_pin', connectionType: 'oauth_simple',
    instructions: ['Đảm bảo tài khoản Pinterest đã được nâng cấp lên hạng Business.'],
    requestedPermissions: [
    { icon: 'analytics', name: 'ads:read', desc: 'Đọc tài khoản quảng cáo và dữ liệu.' },
    { icon: 'campaign', name: 'ads:write', desc: 'Tạo và quản lý các chiến dịch quảng cáo.' }
  ] },
  { id: 'x_ads', name: 'X Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'close', connectionType: 'oauth_simple',
    instructions: ['Xác thực bằng X (Twitter) để lấy quyền Ads API.'],
    requestedPermissions: [
    { icon: 'campaign', name: 'ads.read & ads.write', desc: 'Quản lý tài khoản quảng cáo X.' }
  ] },
  { id: 'ai_ads', name: 'OpenAI Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'smart_toy', connectionType: 'oauth_simple',
    warnings: ['Đây là kết nối API tối ưu quảng cáo tự động hóa, không phải mạng lưới phân phối quảng cáo tiêu chuẩn.'],
    instructions: ['Sử dụng API Key OpenAI chuyên dụng để kích hoạt module.'],
    requestedPermissions: [
    { icon: 'api', name: 'API Key', desc: 'Sử dụng API Key để tối ưu quảng cáo qua OpenAI.' }
  ] }
];

export const communicationChannels: any[] = [
  { id: 'sms', name: 'SMS (Twilio)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'sms', connectionType: 'manual_credentials',
    warnings: ['Yêu cầu khai báo A2P 10DLC nếu bạn dùng đầu số Mỹ để gửi tin.'],
    instructions: ['Truy cập Console của Twilio.', 'Sao chép chuỗi Account SID và Auth Token.', 'Nhập vào ô ở màn hình tiếp theo.'],
    requestedPermissions: [
    { icon: 'key', name: 'Account SID & Auth Token', desc: 'Kết nối với Twilio để gửi và nhận tin nhắn SMS.' }
  ] },
  { id: 'voice', name: 'Voice (Twilio)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'call', connectionType: 'manual_credentials',
    warnings: ['API hiện tại không hỗ trợ luồng IVR động phức tạp. Các thay đổi sâu hơn cần được cấu hình trực tiếp tại Twilio.'],
    instructions: ['Tương tự SMS, bạn cần Account SID và Auth Token từ trang Twilio Console để thiết lập.'],
    requestedPermissions: [
    { icon: 'key', name: 'Account SID & Auth Token', desc: 'Kết nối với Twilio để thực hiện gọi tự động và nhận cuộc gọi.' }
  ] }
];

export const mockPricingPlans = [
  {
    id: 'starter',
    name: 'Khởi đầu',
    price: '390.000 đ/tháng',
    features: [
      { name: '1 kênh', included: true },
      { name: 'AI trả lời tin nhắn và bình luận', included: true },
      { name: 'Kịch bản comment sang tin nhắn', included: true },
      { name: 'Cảnh báo Telegram', included: true },
      { name: 'Không giới hạn tin nhắn', included: true },
      { name: 'Chạy quảng cáo', included: false },
      { name: 'AI tự viết bài', included: false },
    ],
    buttonText: 'Chọn gói này',
    isCurrent: false
  },
  {
    id: 'pro',
    name: 'Chuyên nghiệp',
    price: '990.000 đ/tháng',
    features: [
      { name: '3 kênh', included: true },
      { name: 'Tất cả tính năng gói Khởi đầu', included: true },
      { name: 'AI tự viết bài và lên lịch', included: true },
      { name: 'Chạy quảng cáo trong app', included: true },
      { name: 'Tệp đối tượng quảng cáo', included: true },
      { name: 'Báo cáo chi tiết', included: true }
    ],
    buttonText: 'Gói hiện tại',
    isCurrent: true
  },
  {
    id: 'enterprise',
    name: 'Doanh nghiệp',
    price: '2.490.000 đ/tháng',
    features: [
      { name: '10 kênh', included: true },
      { name: 'Tất cả tính năng gói Chuyên nghiệp', included: true },
      { name: 'Nhiều người cùng quản lý', included: true },
      { name: 'Hỗ trợ riêng qua Telegram', included: true },
      { name: 'Ưu tiên xử lý khi có sự cố', included: true }
    ],
    buttonText: 'Nâng cấp',
    isCurrent: false
  }
];

export const mockAccountSafety = {
  blockRate: '0.8%',
  msgSpeed: 12,
  rejectedMsgs: 3
};

export const mockFacebookRules = [
  { title: "Mỗi bình luận chỉ được nhắn riêng một lần", desc: "Facebook chỉ cho phép gửi đúng một tin nhắn cho người vừa bình luận. Hệ thống tự chặn nếu gửi trùng." },
  { title: "AI ngừng nhắn sau 24 giờ khách im lặng", desc: "Quá 24 giờ, chỉ bạn nhắn tay được, tối đa trong 7 ngày." },
  { title: "Phải cho khách biết đang nói chuyện với trợ lý tự động", desc: "Câu giới thiệu bắt buộc có ở đầu mỗi cuộc trò chuyện." },
  { title: "Người thật phải là người thật", desc: "Tin nhắn sau 24 giờ phải do chính bạn gõ. Để AI giả làm người là vi phạm và có thể bị Facebook khóa trang." },
  { title: "Giới hạn tốc độ gửi tin", desc: "Gửi quá nhanh khiến Facebook coi trang là spam." }
];
