import axios from 'axios';

export const verifyRecaptcha = ({
  version,
  recaptcha
}: {
  version: 2 | 3;
  recaptcha: string;
}): Promise<boolean | number | string> =>
  new Promise<boolean | number | string>((resolve, reject): void => {
    if (
      process.env.NODE_ENV !== 'production' &&
      recaptcha === process.env.APP_CLIENT_RECAPTCHA_DUMMY
    ) {
      resolve(version === 2 ? true : 10);
    } else {
      axios
        .post(
          'https://www.google.com/recaptcha/api/siteverify',
          new URLSearchParams({
            secret:
              version === 2
                ? process.env.GOOGLE_RECAPTCHA_KEY_V2_CHECKBOX
                : process.env.GOOGLE_RECAPTCHA_KEY_V3,
            response: recaptcha
          })
        )
        .then((response): void => {
          if (!response.data.success) {
            reject(new Error(response.data['error-codes'][0]));
          }
          resolve(version === 2 ? response.data.success : response.data.score);
        });
    }
  });
