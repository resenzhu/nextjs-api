import {type Response, createResponse} from '@utils/response';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {RowDataPacket} from 'mysql2/promise';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';
import {hash} from 'bcrypt';
import joi from 'joi';
import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
import {sign} from 'jsonwebtoken';
import {verifyRecaptcha} from '@utils/recaptcha';

type SignUpReq = {
  userName: string;
  displayName: string;
  password: string;
  honeypot: string;
  recaptcha: string;
};

type User = {
  id: string;
  userName: string;
  displayName: string;
  password: string;
  joinDate: string;
  session: {
    id: string;
    socket: string | null;
    status: 'online' | 'away' | 'appear away' | 'offline' | 'appear offline';
    lastOnline: string;
  };
};

type NewUserNotif = {
  user: {
    id: string;
    userName: string;
    displayName: string;
    session: {
      status: 'online' | 'away' | 'offline';
      lastOnline: string;
    };
  };
};

const redact: string[] = [
  'request.password',
  'request.recaptcha',
  'response.data.token'
];

const signupEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'signup';
  socket.on(
    event,
    (request: SignUpReq, callback: (response: Response) => void): void => {
      logger.info({request: request}, event);
      const requestSchema = joi.object({
        userName: joi
          .string()
          .min(2)
          .max(15)
          .pattern(/^[a-zA-Z0-9_-]+$/u)
          .required()
          .messages({
            'string.base': "4220101|'userName' must be a string.",
            'string.empty': "4220102|'userName' must not be empty.",
            'string.min':
              "4220103|'userName' must be between 2 and 15 characters.",
            'string.max':
              "4220104|'userName' must be between 2 and 15 characters.",
            'string.pattern.base':
              "4220105|'userName' must only contain letters, numbers, hyphen, and underscore.",
            'any.required': "40001|'userName' is required."
          }),
        displayName: joi
          .string()
          .min(2)
          .max(25)
          .pattern(/^[a-zA-Z\s]*$/u)
          .required()
          .messages({
            'string.base': "4220101|'displayName' must be a string.",
            'string.empty': "4220102|'displayName' must not be empty.",
            'string.min':
              "4220103|'displayName' must be between 2 and 25 characters.",
            'string.max':
              "4220104|'displayName' must be between 2 and 25 characters.",
            'string.pattern.base':
              "4220105|'displayName' must only contain letters and spaces.",
            'any.required': "40002|'displayName' is required."
          }),
        password: joi.string().min(8).max(64).required().messages({
          'string.base': "4220301|'password' must be a string.",
          'string.empty': "4220302|'password' must not be empty.",
          'string.min':
            "4220303|'password' must be between 8 and 64 characters.",
          'string.max':
            "4220304|'password' must be between 8 and 64 characters.",
          'any.required': "40003|'password' is required."
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
      let data = validatedValue as SignUpReq;
      data = {
        ...data,
        userName: sanitize(data.userName).trim().toLowerCase(),
        displayName: sanitize(data.displayName).trim(),
        honeypot: sanitize(data.honeypot).trim(),
        recaptcha: sanitize(data.recaptcha).trim()
      };
      verifyRecaptcha({
        version: 2,
        recaptcha: data.recaptcha
      })
        .then((success): void => {
          if (!success) {
            return callback(
              createResponse({
                event: event,
                logger: logger,
                code: '40304',
                message: 'access denied for bot form submission.'
              })
            );
          }
          database
            .getConnection()
            .then((connection): void => {
              connection
                .execute(
                  `DELETE FROM breezy_users
                   WHERE TIMESTAMPDIFF(DAY, DATE(lastonline), :currentDate) > 14`,
                  {currentDate: DateTime.utc().toISODate()}
                )
                .then((): void => {
                  connection
                    .execute(
                      `SELECT DISTINCT userid FROM breezy_users
                       WHERE username = :userName AND TIMESTAMPDIFF(DAY, DATE(lastonline), :currentDate) <= 14`,
                      {
                        userName: data.userName,
                        currentDate: DateTime.utc().toISODate()
                      }
                    )
                    .then((rowDataPacket): void => {
                      const rows = rowDataPacket[0] as RowDataPacket[];
                      if (rows.length !== 0) {
                        return callback(
                          createResponse({
                            event: event,
                            logger: logger,
                            code: '40901',
                            message: 'username already exists.'
                          })
                        );
                      }
                      hash(data.password, 10).then((hashedPassword): void => {
                        const timestamp = DateTime.utc().toISO();
                        const newUser: User = {
                          id: nanoid(),
                          userName: data.userName,
                          displayName: data.displayName,
                          password: hashedPassword,
                          joinDate: timestamp,
                          session: {
                            id: nanoid(),
                            socket: socket.id,
                            status: 'online',
                            lastOnline: timestamp
                          }
                        };
                        connection
                          .execute(
                            `INSERT INTO breezy_users (userid, username, displayname, password, sessionid, socketid, status, lastonline, createdtime, updatedtime) VALUES
                             (:userId, :userName, :displayName, :password, :sessionId, :socketId, :status, :lastOnline, :createdTime, :updatedTime)`,
                            {
                              userId: newUser.id,
                              userName: newUser.userName,
                              displayName: newUser.displayName,
                              password: newUser.password,
                              sessionId: newUser.session.id,
                              socketId: newUser.session.socket,
                              status: newUser.session.status,
                              lastOnline: DateTime.fromISO(
                                newUser.session.lastOnline
                              ).toFormat('yyyy-MM-dd HH:mm:ss'),
                              createdTime: DateTime.fromISO(
                                newUser.joinDate
                              ).toFormat('yyyy-MM-dd HH:mm:ss'),
                              updatedTime: DateTime.fromISO(
                                newUser.joinDate
                              ).toFormat('yyyy-MM-dd HH:mm:ss')
                            }
                          )
                          .then((): void => {
                            const newUserNotif: NewUserNotif = {
                              user: {
                                id: newUser.id,
                                userName: newUser.userName,
                                displayName: newUser.displayName,
                                session: {
                                  status: newUser.session.status
                                    .replace('appear', '')
                                    .trim() as 'online' | 'away' | 'offline',
                                  lastOnline: newUser.session.lastOnline
                                }
                              }
                            };
                            socket.broadcast.emit('add new user', newUserNotif);
                            return callback(
                              createResponse({
                                event: event,
                                logger: logger,
                                data: {
                                  token: sign(
                                    {
                                      id: newUser.id,
                                      session: newUser.session.id
                                    },
                                    Buffer.from(
                                      process.env.JWT_KEY_PRIVATE_BASE64,
                                      'base64'
                                    ).toString(),
                                    {
                                      algorithm: 'RS256',
                                      issuer: 'resen',
                                      subject: newUser.userName
                                    }
                                  )
                                }
                              })
                            );
                          });
                      });
                    });
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
export type {SignUpReq, User, NewUserNotif};
export default signupEvent;
