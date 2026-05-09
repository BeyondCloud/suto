import { defineConfig } from 'vite';

// build 時部署到 https://beyondcloud.github.io/suto/，base 必須是 '/suto/'
// dev/preview 維持 '/' 以免本機開發每次都要加前綴
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/suto/' : '/',
}));
