import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import {type Response, createResponse} from '@utils/response';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
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
                .execute('CALL SP_BREEZY_PURGE_INACTIVE_USERS')
                .then((): void => {
                  connection
                    .execute('CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERNAME (:userName)', {userName: data.userName})
                    .then((packet): void => {
                      const [userResult] = (packet[0] as ProcedureCallPacket<RowDataPacket[]>)[0];
                      compare(data.password, userResult?.password ?? '').then(
                        (correctPassword): void => {
                          if (!userResult || !correctPassword) {
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
                            id: userResult.userid,
                            userName: userResult.username,
                            displayName: userResult.displayname,
                            password: userResult.password,
                            joinDate: userResult.createdtime,
                            session: {
                              id: userResult.sessionid,
                              socket: userResult.socketid,
                              status: userResult.status,
                              lastOnline: userResult.lastonline
                            }
                          };
                          const updatedUser: User = {
                            ...existingUser,
                            session: {
                              ...existingUser.session,
                              id: nanoid(),
                              socket: socket.id,
                              status: existingUser.session.status === 'offline' ? 'online' : existingUser.session.status
                            }
                          };
                          connection
                            .execute(
                              `UPDATE breezy_users
                               SET sessionid = :sessionId, socketid = :socketId, status = :status, lastonline = :lastOnline, updatedtime = :updatedTime
                               WHERE userid = :userId`,
                              {
                                sessionId: updatedUser.session.id,
                                socketId: updatedUser.session.socket,
                                status: updatedUser.session.status,
                                lastOnline: DateTime.fromISO(
                                  updatedUser.session.lastOnline
                                ).toFormat('yyyy-MM-dd HH:mm:ss'),
                                updatedTime: DateTime.utc().toFormat(
                                  'yyyy-MM-dd HH:mm:ss'
                                ),
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
                                    status: updatedUser.session.status
                                      .replace('appear', '')
                                      .trim() as 'online' | 'away' | 'offline',
                                    lastOnline: updatedUser.session.lastOnline
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
                                        session: updatedUser.session.id
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
