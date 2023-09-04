import axios, {type AxiosResponse} from 'axios';

export const verifyCaptchaV3 = ({
  token
}: {
  token: string;
}): Promise<number | string> =>
  new Promise<number | string>((resolve, reject): void => {
    axios
      .post(
        'https://www.google.com/recaptcha/api/siteverify',
        new URLSearchParams({
          secret: process.env.GOOGLE_RECAPTCHA_KEY_V3,
          response: token
        })
      )
      .then((response: AxiosResponse): void => {
        if (!response.data.success) {
          reject(new Error(response.data['error-codes'][0]));
        }
        resolve(response.data.score);
      });
  });
