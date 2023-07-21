declare namespace NodeJS {
  interface ProcessEnv {
    APP_CLIENT: string;
    APP_PORT: number;
    NODE_ENV: 'development' | 'production';
  }
}
