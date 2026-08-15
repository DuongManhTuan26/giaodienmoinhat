const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regexModal = /\{\/\* Connect Modal \*\/\}[\s\S]*\}\n\n    <\/main>/;

const newModal = `{/* Connect Modal */
      {connectStep > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setConnectStep(0)}></div>
          <div className={clsx("bg-surface-container-low border border-outline-variant rounded-2xl shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden transition-all", connectStep === 1 ? "w-full max-w-4xl" : "w-full max-w-[560px]")}>
            
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/50">
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(step => (
                  <div key={step} className={clsx("h-1.5 rounded-full transition-all duration-300", step <= connectStep ? "bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]" : "bg-surface-variant w-8")}></div>
                ))}
              </div>
              <button onClick={() => setConnectStep(0)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className={clsx("p-6 md:p-8 overflow-y-auto custom-scrollbar", connectStep === 1 ? "max-h-[70vh]" : "")}>
              {connectStep === 1 && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-6">Bạn muốn kết nối nền tảng nào?</h2>
                  <div className="space-y-10">
                    <div>
                      <h3 className="font-mono text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">MẠNG XÃ HỘI</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {socialChannels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setSelectedPlatform({ id: channel.id, name: channel.name, icon: channel.icon })}
                            className={clsx(
                              "flex flex-col items-center justify-center p-4 rounded-xl border relative transition-all duration-200",
                              selectedPlatform?.id === channel.id 
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,229,255,0.15)]" 
                                : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                            )}
                          >
                            <span className={clsx("material-symbols-outlined text-[32px] mb-2", selectedPlatform?.id === channel.id ? "text-primary" : "text-on-surface")}>{channel.icon}</span>
                            <span className="text-xs font-bold text-on-surface text-center leading-tight">{channel.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">TÀI KHOẢN QUẢNG CÁO</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {adChannels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setSelectedPlatform({ id: channel.id, name: channel.name, icon: channel.icon })}
                            className={clsx(
                              "flex flex-col items-center justify-center p-4 rounded-xl border relative transition-all duration-200",
                              selectedPlatform?.id === channel.id 
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,229,255,0.15)]" 
                                : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                            )}
                          >
                            <span className={clsx("material-symbols-outlined text-[32px] mb-2", selectedPlatform?.id === channel.id ? "text-primary" : "text-on-surface")}>{channel.icon}</span>
                            <span className="text-xs font-bold text-on-surface text-center leading-tight">{channel.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">TIN NHẮN VÀ ĐIỆN THOẠI</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {communicationChannels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setSelectedPlatform({ id: channel.id, name: channel.name, icon: channel.icon })}
                            className={clsx(
                              "flex flex-col items-center justify-center p-4 rounded-xl border relative transition-all duration-200",
                              selectedPlatform?.id === channel.id 
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,229,255,0.15)]" 
                                : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                            )}
                          >
                            <span className={clsx("material-symbols-outlined text-[32px] mb-2", selectedPlatform?.id === channel.id ? "text-primary" : "text-on-surface")}>{channel.icon}</span>
                            <span className="text-xs font-bold text-on-surface text-center leading-tight">{channel.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-8 flex justify-end">
                    <button 
                      disabled={!selectedPlatform}
                      onClick={() => setConnectStep(2)}
                      className="py-3 px-8 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
                    >
                      Tiếp tục
                    </button>
                  </div>
                </>
              )}

              {connectStep === 2 && selectedPlatform && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-[32px] text-primary">{selectedPlatform.icon}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-on-surface mb-3">Đăng nhập tài khoản {selectedPlatform.name}</h2>
                  <p className="text-on-surface-variant font-medium leading-relaxed mb-8">
                    Bạn sẽ được chuyển sang {selectedPlatform.name} để đăng nhập. Chúng tôi không nhìn thấy mật khẩu của bạn.
                  </p>

                  <div className="space-y-4 mb-8">
                    <div className="flex gap-4">
                      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">1</div>
                      <div className="pt-0.5 text-sm font-medium text-on-surface">Bấm nút bên dưới, một cửa sổ {selectedPlatform.name} sẽ mở ra</div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">2</div>
                      <div className="pt-0.5 text-sm font-medium text-on-surface">Đăng nhập tài khoản {selectedPlatform.name} của bạn</div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">3</div>
                      <div className="pt-0.5 text-sm font-medium text-on-surface">Cấp đủ các quyền được yêu cầu</div>
                    </div>
                  </div>

                  <div className="bg-surface-container border border-outline-variant/50 rounded-xl p-5 mb-8">
                    <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">CÁC QUYỀN SẼ ĐƯỢC XIN</h3>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <span className="material-symbols-outlined text-primary text-[20px]">api</span>
                        <div>
                          <div className="text-sm font-bold text-on-surface mb-0.5">Truy cập API {selectedPlatform.name}</div>
                          <div className="text-xs text-on-surface-variant">Để AI có thể giao tiếp với nền tảng này</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <span className="material-symbols-outlined text-primary text-[20px]">manage_accounts</span>
                        <div>
                          <div className="text-sm font-bold text-on-surface mb-0.5">Quản lý tài nguyên</div>
                          <div className="text-xs text-on-surface-variant">Cho phép app đọc và phản hồi dữ liệu</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    {!loginSuccess ? (
                      <button 
                        onClick={handleSimulateLogin}
                        disabled={isLoggingIn}
                        className="w-full py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 disabled:opacity-80 disabled:hover:scale-100"
                      >
                        {isLoggingIn ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            Đang kết nối...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">link</span>
                            Đăng nhập với {selectedPlatform.name}
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="w-full py-3.5 px-4 bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-lg rounded-xl flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined">check_circle</span>
                        Đã đăng nhập: Hoàng Tuấn
                      </div>
                    )}
                  </div>
                </>
              )}

              {connectStep === 3 && selectedPlatform && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-2">Chọn trang muốn kết nối</h2>
                  <p className="text-on-surface-variant font-medium leading-relaxed mb-6">
                    Tài khoản Hoàng Tuấn đang quản lý 5 trang. Mỗi trang kết nối tính là một lượt trong gói của bạn.
                  </p>

                  <div className="space-y-3 mb-6">
                    {mockSubPagesToSelect.map(page => (
                      <label key={page.id} className={clsx("flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer", page.connected ? "bg-surface-variant/50 border-outline-variant/30 opacity-70" : selectedPages.includes(page.id) ? "bg-primary/5 border-primary shadow-[0_0_10px_rgba(0,229,255,0.1)]" : "bg-surface-container border-outline-variant hover:border-outline")}>
                        <div className="flex-1 flex items-center gap-4">
                          <img src={page.avatar} alt={page.name} className="w-12 h-12 rounded-full object-cover border border-outline-variant/50" />
                          <div>
                            <div className="text-base font-bold text-on-surface mb-0.5">{page.name}</div>
                            <div className="text-sm text-on-surface-variant">{page.followers} người theo dõi</div>
                          </div>
                        </div>
                        {page.connected ? (
                          <div className="text-sm font-bold text-on-surface-variant bg-surface px-3 py-1 rounded-full border border-outline-variant/50">Đã kết nối</div>
                        ) : (
                          <div className={clsx("w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors", selectedPages.includes(page.id) ? "bg-primary border-primary text-on-primary" : "bg-transparent border-outline-variant")}>
                            {selectedPages.includes(page.id) && <span className="material-symbols-outlined text-[16px] font-bold">check</span>}
                          </div>
                        )}
                        {/* Hidden input to handle click logic easily in React */}
                        {!page.connected && (
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={selectedPages.includes(page.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (selectedPages.length < 1) {
                                  setSelectedPages([...selectedPages, page.id]);
                                }
                              } else {
                                setSelectedPages(selectedPages.filter(id => id !== page.id));
                              }
                            }}
                          />
                        )}
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant">
                    <div className="text-sm">
                      <span className="text-on-surface-variant">Đã chọn: </span>
                      <span className="font-bold text-on-surface">{selectedPages.length} trang</span>
                    </div>
                    {selectedPages.length >= 1 ? (
                      <div className="text-sm font-medium text-orange-400 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">info</span>
                        Gói của bạn đã hết lượt
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-on-surface-variant">
                        Gói của bạn còn <span className="text-on-surface font-bold">1</span> lượt kết nối
                      </div>
                    )}
                  </div>

                  <div className="mt-8 flex gap-3 justify-end">
                    <button 
                      onClick={() => setConnectStep(2)}
                      className="py-3 px-6 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors"
                    >
                      Quay lại
                    </button>
                    <button 
                      disabled={selectedPages.length === 0}
                      onClick={() => setConnectStep(4)}
                      className="py-3 px-8 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
                    >
                      Tiếp tục
                    </button>
                  </div>
                </>
              )}

              {connectStep === 4 && selectedPlatform && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-8 text-center">Xác nhận kết nối</h2>
                  
                  <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
                    <div className="flex items-center gap-4 mb-6 pb-6 border-b border-outline-variant/50">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[24px] text-primary">{selectedPlatform.icon}</span>
                      </div>
                      <div>
                        <div className="text-sm text-on-surface-variant mb-1">Nền tảng & Tài khoản</div>
                        <div className="text-lg font-bold text-on-surface">{selectedPlatform.name} — Hoàng Tuấn</div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm text-on-surface-variant mb-4">Các trang sẽ được kết nối:</div>
                      <div className="space-y-3">
                        {mockSubPagesToSelect.filter(p => selectedPages.includes(p.id)).map(page => (
                          <div key={page.id} className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-green-400 text-[18px]">check_circle</span>
                            <img src={page.avatar} alt={page.name} className="w-6 h-6 rounded-full object-cover" />
                            <span className="font-bold text-on-surface">{page.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex gap-3">
                    <button 
                      onClick={() => setConnectStep(3)}
                      className="flex-1 py-3.5 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold text-lg rounded-xl hover:bg-surface-variant transition-colors"
                    >
                      Quay lại
                    </button>
                    <button 
                      onClick={() => {
                        setConnectStep(0);
                        // Show some success toast ideally
                      }}
                      className="flex-1 py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                    >
                      Hoàn tất kết nối
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </main>`;

content = content.replace(regexModal, newModal);
fs.writeFileSync('src/pages/Connections.tsx', content);
