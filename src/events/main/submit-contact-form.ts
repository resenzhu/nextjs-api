import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import joi from 'joi';
import {sanitize} from 'isomorphic-dompurify';
import {sendEmail} from '@utils/email';
import {storage} from '@utils/storage';
import {verifyReCaptcha} from '@utils/recaptcha';

type SubmitContactFormReq = {
  name: string;
  email: string;
  message: string;
  honeypot: string;
  token: string;
};

type Submission = {
  submitter: string;
  timestamp: string;
};

const redact: string[] = ['request.name', 'request.email', 'request.token'];

const submitContactFormEvent = (socket: Socket, logger: Logger): void => {
  socket.on(
    'submit contact form',
    (
      request: SubmitContactFormReq,
      callback: (response: ClientResponse) => void
    ): void => {
      logger.info({request: request}, 'submit contact form');
      const requestSchema = joi.object({
        name: joi
          .string()
          .min(2)
          .max(120)
          .pattern(/^[a-zA-Z\s]*$/u)
          .required()
          .messages({
            'string.base': "4220101|'name' must be a string.",
            'string.empty': "4220102|'name' must not be empty.",
            'string.min':
              "4220103|'name' must be between 2 and 120 characters.",
            'string.max':
              "4220104|'name' must be between 2 and 120 characters.",
            'string.pattern.base':
              "4220105|'name' must only contain letters and spaces.",
            'any.required': "40001|'name' is required."
          }),
        email: joi.string().min(3).max(320).email().required().messages({
          'string.base': "4220201|'email' must be a string.",
          'string.empty': "4220202|'email' must not be empty.",
          'string.min': "4220203|'email' must be between 3 and 320 characters.",
          'string.max': "4220204|'email' must be between 3 and 320 characters.",
          'string.email': "4220205|'email' must be in a valid format.",
          'any.required': "40002|'email' is required."
        }),
        message: joi.string().min(15).max(2000).required().messages({
          'string.base': "4220301|'message' must be a string.",
          'string.empty': "4220302|'message' must not be empty.",
          'string.min':
            "4220303|'message' must be between 15 and 2000 characters.",
          'string.max':
            "4220304|'message' must be between 15 and 2000 characters.",
          'any.required': "40003|'message' is required."
        }),
        honeypot: joi.string().allow('').length(0).required().messages({
          'string.base': "4220401|'honeypot' must be a string.",
          'string.length': "4220402|'honeypot' must be empty.",
          'any.required': "40004|'honeypot' is required."
        }),
        token: joi.string().required().messages({
          'string.base': "4220501|'token' must be a string.",
          'string.empty': "4220502|'token' must not be empty.",
          'any.required': "40005|'token' is required."
        })
      });
      const {value: validatedValue, error: validationError} =
        requestSchema.validate(request);
      if (validationError) {
        const response: ClientResponse = createErrorResponse({
          code: validationError.message.split('|')[0],
          message: validationError.message.split('|')[1]
        });
        logger.warn({response: response}, 'submit contact form failed');
        return callback(response);
      }
      let data = validatedValue as SubmitContactFormReq;
      data = {
        ...data,
        name: sanitize(data.name)
          .trim()
          .split(' ')
          .map(
            (word): string =>
              `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
          )
          .join(' '),
        email: sanitize(data.email).trim().toLowerCase(),
        message: sanitize(data.message).trim(),
        token: sanitize(data.token).trim()
      };
      verifyReCaptcha({
        version: 3,
        token: data.token
      })
        .then((score): void => {
          if (Number(score) <= 0.5) {
            const response: ClientResponse = createErrorResponse({
              code: '40304',
              message: 'access denied for bot form submission.'
            });
            logger.warn({response: response}, 'submit contact form failed');
            return callback(response);
          }
          const userAgent = socket.handshake.headers['user-agent'];
          if (!userAgent) {
            const response: ClientResponse = createErrorResponse({
              code: '400',
              message: 'user agent header is required.'
            });
            logger.warn({response: response}, 'submit contact form failed');
            return callback(response);
          }
          storage.then((): void => {
            getItem('main contact form submissions').then(
              (submissions: Submission[]): void => {
                const todaySubmissions = submissions?.filter(
                  (submission): boolean =>
                    submission.submitter === btoa(userAgent) &&
                    DateTime.fromISO(submission.timestamp).toISODate() ===
                      DateTime.utc().toLocal().toISODate()
                );
                if (todaySubmissions && todaySubmissions.length === 5) {
                  const response: ClientResponse = createErrorResponse({
                    code: '429',
                    message: 'too many requests.'
                  });
                  logger.warn(
                    {response: response},
                    'submit contact form failed'
                  );
                  return callback(response);
                }
                sendEmail({
                  name: data.name,
                  email: data.email,
                  message: data.message
                })
                  .then((): void => {
                    const newSubmission: Submission = {
                      submitter: btoa(userAgent),
                      timestamp:
                        DateTime.utc().toISO() ??
                        new Date(Date.now()).toISOString()
                    };
                    setItem(
                      'main contact form submissions',
                      [...(submissions ?? []), newSubmission],
                      {ttl: 2 * 24 * 60 * 60 * 1000}
                    ).then((): void => {
                      const response: ClientResponse = createSuccessResponse(
                        {}
                      );
                      logger.info(
                        {response: response},
                        'submit contact form success'
                      );
                      return callback(response);
                    });
                  })
                  .catch((mailjetError: Error): void => {
                    const response: ClientResponse = createErrorResponse({
                      code: '500',
                      message:
                        'an error occured while attempting to send the email.'
                    });
                    logger.warn(
                      {response: response, error: mailjetError.message},
                      'submit contact form failed'
                    );
                    return callback(response);
                  });
                return undefined;
              }
            );
          });
          return undefined;
        })
        .catch((captchaError: Error): void => {
          const response: ClientResponse = createErrorResponse({
            code: '500',
            message: 'an error occured while attempting to verify captcha.'
          });
          logger.warn(
            {response: response, error: captchaError.message},
            'submit contact form failed'
          );
          return callback(response);
        });
      return undefined;
    }
  );
};

export {redact};
export type {SubmitContactFormReq, Submission};
export default submitContactFormEvent;
