import Mailjet from 'node-mailjet';

export const sendEmail = ({
  name,
  email,
  message
}: {
  name: string;
  email: string;
  message: string;
}): Promise<string> =>
  new Promise((resolve, reject): void => {
    const mailjet = Mailjet.apiConnect(
      process.env.MAILJET_KEY_API,
      process.env.MAILJET_KEY_SECRET
    );
    mailjet
      .post('send', {version: 'v3.1'})
      .request({
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
      })
      .then((): void => {
        resolve('OK');
      })
      .catch((error): void => {
        reject(error.ErrorMessage);
      });
  });
