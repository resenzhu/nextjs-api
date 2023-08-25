declare namespace NodeJS {
  interface ProcessEnv {
    APP_PORT: number;
    APP_CLIENT: string;
    MAILJET_KEY_API: string;
    MAILJET_KEY_SECRET: string;
    MAILJET_USER_NAME: string;
    MAILJET_USER_EMAIL: string;
    NODE_ENV: 'development' | 'production';
  }
}
