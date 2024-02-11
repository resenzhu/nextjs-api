import {type Response, createResponse} from '@utils/response';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {RowDataPacket} from 'mysql2/promise';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy';
import {compare} from 'bcrypt';
import {database} from '@utils/database';
import joi from 'joi';
import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
import {sign} from 'jsonwebtoken';
import {verifyRecaptcha} from '@utils/recaptcha';

type LoginReq = {
  userName: string;
  password: string;
  honeypot: string;
  recaptcha: string;
};

type UserStatusNotif = {
  user: {
    id: string;
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

const loginEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'login';
  socket.on(
    event,
    (request: LoginReq, callback: (response: Response) => void): void => {
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
        password: joi.string().min(8).max(64).required().messages({
          'string.base': "4220201|'password' must be a string.",
          'string.empty': "4220202|'password' must not be empty.",
          'string.min':
            "4220203|'password' must be between 8 and 64 characters.",
          'string.max':
            "4220204|'password' must be between 8 and 64 characters.",
          'any.required': "40002|'password' is required."
        }),
        honeypot: joi.string().allow('').length(0).required().messages({
          'string.base': "4220301|'honeypot' must be a string.",
          'string.length': "4220302|'honeypot' must be empty.",
          'any.required': "40003|'honeypot' is required."
        }),
        recaptcha: joi.string().required().messages({
          'string.base': "4220401|'recaptcha' must be a string.",
          'string.empty': "4220402|'recaptcha' must not be empty.",
          'any.required': "40004|'recaptcha' is required."
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
      let data = validatedValue as LoginReq;
      data = {
        ...data,
        userName: sanitize(data.userName).trim().toLowerCase(),
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
                code: '40303',
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
                      const [account] = rows;
                      compare(data.password, account?.password ?? '').then(
                        (correctPassword): void => {
                          if (!account || !correctPassword) {
                            return callback(
                              createResponse({
                                event: event,
                                logger: logger,
                                code: '401',
                                message: 'username or password is invalid.'
                              })
                            );
                          }
                          const existingUser: User = {
                            id: account.userid,
                            userName: account.username,
                            displayName: account.displayname,
                            password: account.password,
                            joinDate:
                              DateTime.fromFormat(
                                account.createdtime,
                                'yyyy-MM-dd HH:mm:ss',
                                {zone: 'utc'}
                              ).toISO() ??
                              `${account.createdtime.replace(' ', 'T')}.000Z`,
                            session: {
                              id: account.sessionid,
                              socket: account.socketid,
                              status: account.status,
                              lastOnline:
                                DateTime.fromFormat(
                                  account.lastonline,
                                  'yyyy-MM-dd HH:mm:ss',
                                  {zone: 'utc'}
                                ).toISO() ??
                                `${account.createdtime.replace(' ', 'T')}.000Z`
                            }
                          };
                          const newSessionId = nanoid();
                          const newSocketId = socket.id;
                          const newStatus =
                            existingUser.session.status === 'offline'
                              ? 'online'
                              : existingUser.session.status;
                          const timestamp = DateTime.utc().toISO();
                          connection
                            .execute(
                              `UPDATE breezy_users
                               SET sessionid = :sessionId, socketid = :socketId, status = :status, lastonline = :lastOnline
                               WHERE userid = :userId`,
                              {
                                sessionId: newSessionId,
                                socketId: newSocketId,
                                status: newStatus,
                                lastOnline: DateTime.fromISO(
                                  timestamp
                                ).toFormat('yyyy-MM-dd HH:mm:ss'),
                                userId: existingUser.id
                              }
                            )
                            .then((): void => {
                              if (existingUser.session.socket) {
                                socket.broadcast
                                  .to(existingUser.session.socket)
                                  .emit('logout old session');
                              }
                              const userStatusNotif: UserStatusNotif = {
                                user: {
                                  id: existingUser.id,
                                  session: {
                                    status: newStatus
                                      .replace('appear', '')
                                      .trim() as 'online' | 'away' | 'offline',
                                    lastOnline: timestamp
                                  }
                                }
                              };
                              socket.broadcast.emit(
                                'update user status',
                                userStatusNotif
                              );
                              return callback(
                                createResponse({
                                  event: event,
                                  logger: logger,
                                  data: {
                                    token: sign(
                                      {
                                        id: existingUser.id,
                                        session: newSessionId
                                      },
                                      Buffer.from(
                                        process.env.JWT_KEY_PRIVATE_BASE64,
                                        'base64'
                                      ).toString(),
                                      {
                                        algorithm: 'RS256',
                                        issuer: 'resen',
                                        subject: existingUser.userName
                                      }
                                    )
                                  }
                                })
                              );
                            });
                          return undefined;
                        }
                      );
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
export type {LoginReq, UserStatusNotif};
export default loginEvent;
