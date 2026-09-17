import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      /*
       * Giao diện dựng riêng sang dist/client.
       *
       * Trước đây giao diện và mã máy chủ nằm chung dist/, mà express phục vụ
       * tĩnh cả thư mục đó. Đã tải thử được /server.mjs.map (755 KB, chứa 41
       * tệp mã máy chủ gốc, có cả server/services/zernio.ts) và
       * /migrations/001_initial_schema.sql. Bất kỳ ai biết đường dẫn đều lấy
       * được toàn bộ mã nguồn và cấu trúc database.
       */
      outDir: 'dist/client',
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
