import {Client, type SendEmailV3_1 as SendEmailV31} from 'node-mailjet';

export const sendEmail = ({
  name,
  email,
  message
}: {
  name: string;
  email: string;
  message: string;
}): Promise<string | void> =>
  new Promise<string | void>((resolve, reject): void => {
    const mailjet = new Client({
      apiKey: process.env.MAILJET_KEY_API,
      apiSecret: process.env.MAILJET_KEY_SECRET
    });
    const mailjetBody: SendEmailV31.Body = {
      Messages: [
        {
          From: {
            Name: process.env.MAILJET_USER_NAME,
            Email: process.env.MAILJET_USER_EMAIL
          },
          To: [
            {
              Name: process.env.MAILJET_USER_NAME,
              Email: process.env.MAILJET_USER_EMAIL
            }
          ],
          Subject: `Message from ${name} <${email}>`,
          TextPart: message.replaceAll('\n', '\\n'),
          HTMLPart: message.replaceAll('\n', '<br />')
        }
      ]
    };
    mailjet
      .post('send', {version: 'v3.1'})
      .request(mailjetBody)
      .then((): void => {
        resolve();
      })
      .catch((error): void => {
        reject(new Error(error.ErrorMessage));
      });
  });
