// postcss.config.mjs
const isProd = process.env.NODE_ENV === 'production';

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {},
    ...(isProd ? { cssnano: { preset: 'default' } } : {}),
  },
};
