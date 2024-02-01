declare namespace NodeJS {
  interface ProcessEnv {
    APP_PORT: number;
    APP_CLIENT: string;
    APP_CLIENT_RECAPTCHA_DUMMY: string;
    GOOGLE_RECAPTCHA_KEY_V2_CHECKBOX: string;
    GOOGLE_RECAPTCHA_KEY_V3: string;
    JWT_KEY_PRIVATE_BASE64: string;
    MAILJET_KEY_API: string;
    MAILJET_KEY_SECRET: string;
    MAILJET_USER_NAME: string;
    MAILJET_USER_EMAIL: string;
    MYSQL_HOST: string;
    MYSQL_USER: string;
    MYSQL_PASSWORD: string;
    MYSQL_DATABASE: string;
    NODE_ENV: 'development' | 'production';
  }
}
