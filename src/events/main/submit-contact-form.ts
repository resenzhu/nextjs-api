import {type Response, createResponse} from '@utils/response';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {RowDataPacket} from 'mysql2/promise';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';
import joi from 'joi';
import {sanitize} from 'isomorphic-dompurify';
import {sendEmail} from '@utils/email';
import {verifyRecaptcha} from '@utils/recaptcha';

type SubmitContactFormReq = {
  name: string;
  email: string;
  message: string;
  honeypot: string;
  recaptcha: string;
};

const redact: string[] = ['request.name', 'request.email', 'request.recaptcha'];

const submitContactFormEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'submit contact form';
  socket.on(
    event,
    (
      request: SubmitContactFormReq,
      callback: (response: Response) => void
    ): void => {
      logger.info({request: request}, event);
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
        recaptcha: joi.string().required().messages({
          'string.base': "4220501|'recaptcha' must be a string.",
          'string.empty': "4220502|'recaptcha' must not be empty.",
          'any.required': "40005|'recaptcha' is required."
        })
      });
      const {value: validatedValue, error: validationError} =
        requestSchema.validate(request);
      if (validationError) {
        return callback(
          createResponse({
            event: event,
            logger: logger,
            code: validationError.message.split('|')[0],
            message: validationError.message.split('|')[1]
          })
        );
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
        honeypot: sanitize(data.honeypot).trim(),
        recaptcha: sanitize(data.recaptcha).trim()
      };
      verifyRecaptcha({
        version: 3,
        recaptcha: data.recaptcha
      })
        .then((score): void => {
          if (Number(score) <= 0.5) {
            return callback(
              createResponse({
                event: event,
                logger: logger,
                code: '40304',
                message: 'access denied for bot form submission.'
              })
            );
          }
          const userAgent = socket.handshake.headers['user-agent'];
          if (!userAgent) {
            return callback(
              createResponse({
                event: event,
                logger: logger,
                code: '400',
                message: 'user agent header is required.'
              })
            );
          }
          database
            .getConnection()
            .then((connection): void => {
              connection
                .execute(
                  'SELECT submitter FROM main_contact_submissions WHERE submitter = :submitter AND DATE(created_at) = :currentDate',
                  {
                    submitter: btoa(userAgent),
                    currentDate: DateTime.utc().toISODate()
                  }
                )
                .then((rowDataPacket): void => {
                  const rows = rowDataPacket[0] as RowDataPacket[];
                  if (rows.length === 5) {
                    return callback(
                      createResponse({
                        event: event,
                        logger: logger,
                        code: '429',
                        message: 'too many requests.'
                      })
                    );
                  }
                  sendEmail({
                    name: data.name,
                    email: data.email,
                    message: data.message
                  })
                    .then((): void => {
                      connection
                        .execute(
                          'INSERT INTO main_contact_submissions (submitter, created_at, updated_at) VALUES (:submitter, :createdAt, :updatedAt)',
                          {
                            submitter: btoa(userAgent),
                            createdAt: DateTime.utc().toFormat(
                              'yyyy-MM-dd HH:mm:ss'
                            ),
                            updatedAt: DateTime.utc().toFormat(
                              'yyyy-MM-dd HH:mm:ss'
                            )
                          }
                        )
                        .then((): void =>
                          callback(
                            createResponse({
                              event: event,
                              logger: logger
                            })
                          )
                        );
                    })
                    .catch((mailjetError: Error): void =>
                      callback(
                        createResponse({
                          event: event,
                          logger: logger,
                          code: '503',
                          message: 'an error occured while sending the email.',
                          detail: mailjetError.message
                        })
                      )
                    );
                  return undefined;
                })
                .finally((): void => {
                  connection.release();
                });
            })
            .catch((connectionError: NodeJS.ErrnoException): void =>
              callback(
                createResponse({
                  event: event,
                  logger: logger,
                  code: '500',
                  message: 'an error occured while connecting to database.',
                  detail: connectionError.message
                })
              )
            );
          return undefined;
        })
        .catch((captchaError: Error): void =>
          callback(
            createResponse({
              event: event,
              logger: logger,
              code: '503',
              message: 'an error occured while verifying captcha.',
              detail: captchaError.message
            })
          )
        );
      return undefined;
    }
  );
};

export {redact};
export type {SubmitContactFormReq};
export default submitContactFormEvent;
