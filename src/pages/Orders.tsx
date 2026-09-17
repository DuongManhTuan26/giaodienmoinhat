import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, formatCurrency, type Order } from '../lib/api';
import BangLoi from '../components/BangLoi';

const FILTERS = ['Tất cả', 'Chờ xác nhận', 'Đã xác nhận', 'Đang giao', 'Hoàn thành', 'Đã hủy'];

/** Nhãn tiếng Việt trên giao diện <-> trạng thái trong database. */
const LABEL_TO_STATUS: Record<string, Order['status']> = {
  'Chờ xác nhận': 'pending',
  'Đã xác nhận': 'confirmed',
  'Đang giao': 'shipping',
  'Hoàn thành': 'completed',
  'Đã hủy': 'cancelled',
};
const STATUS_TO_LABEL: Record<Order['status'], string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

interface DisplayOrder {
  raw: Order;
  id: string;
  time: string;
  date: string;
  customerInitial: string;
  customerName: string;
  phone: string;
  productName: string;
  quantity: number;
  value: string;
  source: string;
  status: string;
  address: string;
  note: string | null;
  telegramSent: boolean;
  conversationId: string | null;
}

export default function Orders() {
  const navigate = useNavigate();

  const [activeFilters, setActiveFilters] = useState<string[]>(['Tất cả']);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<DisplayOrder | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, shipping: 0, completed: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, summary: s } = await api.orders.list();
      setOrders(data);
      setSummary(s);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được đơn hàng');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleFilter = (filter: string) => {
    if (filter === 'Tất cả') { setActiveFilters(['Tất cả']); return; }
    let newFilters = activeFilters.filter((f) => f !== 'Tất cả');
    if (newFilters.includes(filter)) newFilters = newFilters.filter((f) => f !== filter);
    else newFilters.push(filter);
    if (newFilters.length === 0) newFilters = ['Tất cả'];
    setActiveFilters(newFilters);
  };

  /** Đơn hàng thật chuyển sang hình dạng mà bảng đang vẽ. */
  const displayOrders: DisplayOrder[] = useMemo(
    () => orders.map((order) => {
      const created = new Date(order.created_at);
      return {
        raw: order,
        id: `#${order.code}`,
        time: created.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        date: created.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        customerInitial: (order.customer_name || '?').trim().charAt(0).toUpperCase(),
        customerName: order.customer_name || 'Khách chưa có tên',
        phone: order.phone || '',
        productName: order.product,
        quantity: order.quantity,
        value: formatCurrency(order.total),
        source: order.closed_by === 'ai' ? 'AI chốt' : 'Nhân viên chốt',
        status: STATUS_TO_LABEL[order.status],
        address: order.address || 'Chưa có địa chỉ',
        note: order.note,
        telegramSent: Boolean(order.telegram_sent_at),
        conversationId: (order as any).conversation_id ?? null,
      };
    }),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return displayOrders.filter((order) => {
      const matchSearch = !term
        || order.customerName.toLowerCase().includes(term)
        || order.phone.includes(term)
        || order.id.toLowerCase().includes(term);
      const matchFilter = activeFilters.includes('Tất cả') || activeFilters.includes(order.status);
      return matchSearch && matchFilter;
    });
  }, [displayOrders, search, activeFilters]);

  /** Số đơn tạo trong hôm nay. */
  const ordersToday = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((o) => new Date(o.created_at).toDateString() === today).length;
  }, [orders]);

  const handleChangeStatus = async (order: DisplayOrder, label: string) => {
    const status = LABEL_TO_STATUS[label];
    if (!status) return;
    setBusyId(order.raw.id);
    setErrorMessage('');
    setOpenDropdownId(null);
    try {
      await api.orders.update(order.raw.id, { status });
      await load();
      if (selectedOrder?.raw.id === order.raw.id) setSelectedOrder(null);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không đổi được trạng thái');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Xuất danh sách đơn ra tệp CSV mở được bằng Excel.
   * Dùng dấu chấm phẩy và thêm BOM để Excel bản tiếng Việt đọc đúng dấu.
   */
  const handleExport = () => {
    if (filteredOrders.length === 0) {
      setErrorMessage('Không có đơn nào để xuất.');
      return;
    }
    const header = ['Mã đơn', 'Ngày', 'Khách hàng', 'Điện thoại', 'Địa chỉ',
                    'Sản phẩm', 'Số lượng', 'Đơn giá', 'Tổng tiền', 'Trạng thái', 'Chốt bởi', 'Ghi chú'];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filteredOrders.map((o) => [
      o.raw.code,
      new Date(o.raw.created_at).toLocaleString('vi-VN'),
      o.customerName, o.phone, o.address,
      o.productName, o.quantity, o.raw.unit_price, o.raw.total,
      o.status, o.source, o.note ?? '',
    ].map(escape).join(';'));

    const csv = '\uFEFF' + [header.map(escape).join(';'), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Chờ xác nhận': return 'bg-yellow-500';
      case 'Đã xác nhận': return 'bg-blue-500';
      case 'Đang giao': return 'bg-purple-500';
      case 'Hoàn thành': return 'bg-green-500';
      case 'Đã hủy': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'Chờ xác nhận': return 'bg-yellow-500/20 text-yellow-500';
      case 'Đã xác nhận': return 'bg-blue-500/20 text-blue-500';
      case 'Đang giao': return 'bg-purple-500/20 text-purple-400';
      case 'Hoàn thành': return 'bg-green-500/20 text-green-400';
      case 'Đã hủy': return 'bg-red-500/20 text-red-500';
      default: return 'bg-surface-variant text-on-surface-variant';
    }
  };

  const handleCopyPhone = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 2000);
  };

  return (
    <main className="flex-1  p-6 md:p-8 max-w-7xl mx-auto w-full relative    bg-background">

      <BangLoi noiDung={errorMessage} onDong={() => setErrorMessage('')} className="mb-6" />

      {/* Dropdown Overlay */}
      {openDropdownId && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setOpenDropdownId(null)}
        ></div>
      )}

      {/* Toast Notification */}
      {showCopyToast && (
        <div className="fixed top-20 right-8 z-[100] bg-surface-container-high border border-primary/30 text-primary px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <span className="font-bold text-sm">Đã sao chép số điện thoại</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">Đơn hàng</h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              {ordersToday} ĐƠN HÔM NAY
            </span>
          </div>
          <p className="text-on-surface-variant text-sm">Tất cả đơn hàng AI chốt được và bạn chốt tay</p>
        </div>
        
        <div className="flex items-center gap-2 bg-surface-container/50 border border-outline-variant rounded-lg px-3 py-2 cursor-pointer hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">calendar_today</span>
          <span className="text-sm font-medium text-on-surface">30 ngày qua</span>
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">arrow_drop_down</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card 1 */}
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">ĐƠN HÔM NAY</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">7</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">{`Tổng ${formatCurrency(summary.revenue)}`}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 self-start px-2 py-1 rounded-md mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            +3 so với hôm qua
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">CHỜ XÁC NHẬN</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">{summary.pending}</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Cần bạn gọi lại cho khách</p>
          </div>
          <button
            onClick={() => setActiveFilters(['Chờ xác nhận'])}
            className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 self-start px-3 py-1.5 rounded-md transition-colors mt-auto"
          >
            Xem ngay
          </button>
        </div>

        {/* Card 3 */}
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">ĐANG GIAO</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">12</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Đang trên đường tới khách</p>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">DOANH THU THÁNG</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-2xl font-bold text-on-surface">48.500.000 đ</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 self-start px-2 py-1 rounded-md mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            +18% so với tháng trước
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div className="relative w-full xl:w-80 shrink-0">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input 
            type="text" 
            placeholder="Tìm theo tên khách hoặc số điện thoại..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-container/30 border border-outline-variant rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {FILTERS.map(filter => {
            const isActive = activeFilters.includes(filter);
            return (
              <button 
                key={filter}
                onClick={() => toggleFilter(filter)}
                className={clsx(
                  "px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors border",
                  isActive 
                    ? "bg-primary text-on-primary border-primary shadow-[0_0_10px_rgba(0,229,255,0.2)]" 
                    : "bg-surface-container/30 text-on-surface-variant border-outline-variant hover:bg-surface-container hover:text-on-surface"
                )}
              >
                {filter}
              </button>
            );
          })}
        </div>

        <button className="shrink-0 px-4 py-2 text-sm font-bold text-on-surface bg-surface-container border border-outline-variant hover:bg-surface-variant rounded-lg transition-colors flex items-center gap-2 self-start xl:self-auto" onClick={handleExport}>
          <span className="material-symbols-outlined text-[18px]">download</span>
          Xuất Excel
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface-container/20 border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto ">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container/40">
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap">MÃ ĐƠN</th>
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap">THỜI GIAN</th>
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap">KHÁCH HÀNG</th>
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap">SỐ ĐIỆN THOẠI</th>
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap">SẢN PHẨM</th>
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap text-right">GIÁ TRỊ</th>
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap text-center">NGUỒN</th>
                <th className="py-4 px-5 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase whitespace-nowrap">TRẠNG THÁI</th>
                <th className="py-4 px-5 w-[60px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    className="hover:bg-surface-container/30 transition-colors cursor-pointer group"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="py-4 px-5">
                      <span className="font-mono text-sm font-bold text-primary">{order.id}</span>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-on-surface">{order.time}</span>
                        <span className="text-xs text-on-surface-variant">{order.date}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center font-bold text-on-surface shrink-0 text-sm">
                          {order.customerInitial}
                        </div>
                        <span className="text-sm font-bold text-on-surface whitespace-nowrap">{order.customerName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <span className="text-sm font-medium text-on-surface whitespace-nowrap">{order.phone}</span>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-on-surface whitespace-nowrap">{order.productName}</span>
                        <span className="text-xs text-on-surface-variant whitespace-nowrap">Số lượng: {order.quantity}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <span className="text-sm font-bold text-on-surface whitespace-nowrap">{order.value}</span>
                    </td>
                    <td className="py-4 px-5 text-center">
                      <span className={clsx(
                        "inline-block px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap",
                        order.source === 'AI chốt' ? "bg-primary/20 text-primary border border-primary/30" : "bg-surface-variant text-on-surface-variant border border-outline-variant"
                      )}>
                        {order.source}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap", getStatusBgColor(order.status))}>
                        <div className={clsx("w-2 h-2 rounded-full", getStatusColor(order.status))}></div>
                        <span className="text-xs font-bold">{order.status}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-center relative">
                      <button 
                        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors focus:outline-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === order.id ? null : order.id);
                        }}
                      >
                        <span className="material-symbols-outlined text-[20px]">more_vert</span>
                      </button>

                      {openDropdownId === order.id && (
                        <div className="absolute right-12 top-10 w-[200px] bg-surface-container-high border border-outline-variant rounded-xl shadow-lg z-50 flex flex-col py-1.5 animate-in fade-in zoom-in-95 duration-150">
                          <button 
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors w-full text-left"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setOpenDropdownId(null); 
                              setSelectedOrder(order); 
                            }}
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span> Xem chi tiết
                          </button>
                          <button 
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors w-full text-left"
                            onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }}
                          >
                            <span className="material-symbols-outlined text-[18px]">forum</span> Mở đoạn chat
                          </button>
                          <button 
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors w-full text-left"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(null);
                              if (order.phone) window.location.href = `tel:${order.phone.replace(/\s/g, '')}`;
                            }}
                          >
                            <span className="material-symbols-outlined text-[18px]">call</span> Gọi cho khách
                          </button>
                          <button 
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors w-full text-left"
                            onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }}
                          >
                            <span className="material-symbols-outlined text-[18px]">change_circle</span> Đổi trạng thái
                          </button>
                          <div className="h-[1px] bg-outline-variant/50 my-1"></div>
                          <button 
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-error hover:bg-error/10 transition-colors w-full text-left"
                            onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }}
                          >
                            <span className="material-symbols-outlined text-[18px] text-error">block</span> Hủy đơn
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-on-surface-variant">
                    Không tìm thấy đơn hàng nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="border-t border-outline-variant px-5 py-4 flex items-center justify-between bg-surface-container/20">
          <span className="text-sm text-on-surface-variant font-medium">
            {filteredOrders.length === 0
              ? 'Chưa có đơn hàng nào'
              : `Hiển thị ${filteredOrders.length} trên tổng ${summary.total} đơn hàng`}
          </span>
        </div>
      </div>

      {/* Centered Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setSelectedOrder(null)}
          ></div>
          <div className="relative w-full max-w-[640px] max-h-[90vh] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
            {/* Panel Header */}
            <div className="px-6 py-5 border-b border-outline-variant flex items-start justify-between bg-surface-container/50">
              <div>
                <h2 className="font-mono text-2xl font-bold text-on-surface mb-2 tracking-tight">{selectedOrder.id}</h2>
                <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-full", getStatusBgColor(selectedOrder.status))}>
                  <div className={clsx("w-2 h-2 rounded-full", getStatusColor(selectedOrder.status))}></div>
                  <span className="text-xs font-bold">{selectedOrder.status}</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-variant text-on-surface hover:bg-outline-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1  p-6 space-y-8 ">
              
              {/* Block 1: Customer Info */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-4">THÔNG TIN KHÁCH HÀNG</h3>
                <div className="bg-surface-container rounded-xl p-4 border border-outline-variant space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-sm font-medium text-on-surface-variant shrink-0">Họ tên</span>
                    <span className="text-sm font-bold text-on-surface text-right">{selectedOrder.customerName}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-sm font-medium text-on-surface-variant shrink-0">Số điện thoại</span>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-sm font-bold text-on-surface">{selectedOrder.phone}</span>
                      <button onClick={(e) => handleCopyPhone(selectedOrder.phone, e)} className="text-on-surface-variant hover:text-primary transition-colors p-1" title="Sao chép số">
                        <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (selectedOrder.phone) window.location.href = `tel:${selectedOrder.phone.replace(/\s/g, '')}`; }}
                        disabled={!selectedOrder.phone}
                        className="text-on-surface-variant hover:text-green-400 transition-colors p-1 disabled:opacity-30"
                        title="Gọi ngay"
                      >
                        <span className="material-symbols-outlined text-[16px]">call</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-sm font-medium text-on-surface-variant shrink-0">Địa chỉ</span>
                    <span className="text-sm font-medium text-on-surface text-right leading-relaxed">{selectedOrder.address}</span>
                  </div>
                </div>
              </div>

              {/* Block 2: Products */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-4">SẢN PHẨM</h3>
                <div className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/50">
                        <th className="py-3 px-4 text-xs font-bold text-on-surface-variant">Tên sản phẩm</th>
                        <th className="py-3 px-4 text-xs font-bold text-on-surface-variant text-center">SL</th>
                        <th className="py-3 px-4 text-xs font-bold text-on-surface-variant text-right">Đơn giá</th>
                        <th className="py-3 px-4 text-xs font-bold text-on-surface-variant text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {selectedOrder.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-3 px-4 text-sm font-bold text-on-surface">{item.name}</td>
                          <td className="py-3 px-4 text-sm text-on-surface text-center">{item.qty}</td>
                          <td className="py-3 px-4 text-sm text-on-surface text-right">{item.price}</td>
                          <td className="py-3 px-4 text-sm font-bold text-on-surface text-right">{item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-4 border-t border-outline-variant bg-surface-container-high flex justify-between items-center">
                    <span className="text-base font-bold text-on-surface">TỔNG CỘNG</span>
                    <span className="text-xl font-bold text-primary">{selectedOrder.value}</span>
                  </div>
                </div>
              </div>

              {/* Block 3: Timeline */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-4">DÒNG THỜI GIAN</h3>
                <div className="bg-surface-container rounded-xl p-5 border border-outline-variant">
                  <div className="relative border-l-2 border-outline-variant/30 ml-2 space-y-6">
                    {selectedOrder.timeline.map((event, idx) => (
                      <div key={idx} className="relative pl-6">
                        <div className={clsx(
                          "absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-surface-container",
                          idx === selectedOrder.timeline.length - 1 ? "bg-primary" : "bg-on-surface-variant"
                        )}></div>
                        <div className="flex justify-between items-start">
                          <span className={clsx("text-sm font-medium", idx === selectedOrder.timeline.length - 1 ? "text-on-surface font-bold" : "text-on-surface-variant")}>
                            {event.text}
                          </span>
                          <span className="text-xs font-bold text-on-surface-variant ml-4 shrink-0">{event.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Padding to allow scrolling past bottom buttons */}
              <div className="h-10"></div>
            </div>

            {/* Panel Footer Actions */}
            <div className="p-5 border-t border-outline-variant bg-surface-container/50 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {FILTERS.filter((f) => f !== 'Tất cả' && f !== selectedOrder.status).map((label) => (
                  <button
                    key={label}
                    onClick={() => handleChangeStatus(selectedOrder, label)}
                    disabled={busyId === selectedOrder.raw.id}
                    className="px-3 py-2 text-xs font-bold text-on-surface bg-surface-container border border-outline-variant rounded-lg hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => selectedOrder.conversationId
                  ? navigate('/inbox')
                  : setErrorMessage('Đơn này không được tạo từ hội thoại nào.')}
                className="px-4 py-3 text-sm font-bold text-on-surface bg-surface-container border border-outline-variant rounded-xl hover:bg-surface-variant transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">forum</span>
                Mở đoạn chat gốc
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
