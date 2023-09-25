import axios from 'axios';

export const verifyReCaptcha = ({
  version,
  token
}: {
  version: 2 | 3;
  token: string;
}): Promise<boolean | number | string> =>
  new Promise<boolean | number | string>((resolve, reject): void => {
    axios
      .post(
        'https://www.google.com/recaptcha/api/siteverify',
        new URLSearchParams({
          secret:
            version === 2
              ? process.env.GOOGLE_RECAPTCHA_KEY_V2_CHECKBOX
              : process.env.GOOGLE_RECAPTCHA_KEY_V3,
          response: token
        })
      )
      .then((response): void => {
        if (!response.data.success) {
          reject(new Error(response.data['error-codes'][0]));
        }
        resolve(version === 2 ? response.data.success : response.data.score);
      });
  });
