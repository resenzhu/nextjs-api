import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse,
  obfuscateResponse
} from '@utils/response';
import {getItem, keys, removeItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
import {compare} from 'bcrypt';
import joi from 'joi';
import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
import {sign} from 'jsonwebtoken';
import {storage} from '@utils/storage';
import {verifyRecaptcha} from '@utils/recaptcha';

type LoginReq = {
  username: string;
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
    (request: LoginReq, callback: (response: ClientResponse) => void): void => {
      logger.info({request: request}, event);
      const requestSchema = joi.object({
        username: joi
          .string()
          .min(2)
          .max(15)
          .pattern(/^[a-zA-Z0-9_-]+$/u)
          .required()
          .messages({
            'string.base': "4220101|'username' must be a string.",
            'string.empty': "4220102|'username' must not be empty.",
            'string.min':
              "4220103|'username' must be between 2 and 15 characters.",
            'string.max':
              "4220104|'username' must be between 2 and 15 characters.",
            'string.pattern.base':
              "4220105|'username' must only contain letters, numbers, hyphen, and underscore.",
            'any.required': "40001|'username' is required."
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
        const response: ClientResponse = createErrorResponse({
          code: validationError.message.split('|')[0],
          message: validationError.message.split('|')[1]
        });
        logger.warn({response: response}, `${event} failed`);
        return callback(response);
      }
      let data = validatedValue as LoginReq;
      data = {
        ...data,
        username: sanitize(data.username).trim().toLowerCase(),
        honeypot: sanitize(data.honeypot).trim(),
        recaptcha: sanitize(data.recaptcha).trim()
      };
      verifyRecaptcha({
        version: 2,
        recaptcha: data.recaptcha
      })
        .then((success): void => {
          if (!success) {
            const response: ClientResponse = createErrorResponse({
              code: '40303',
              message: 'access denied for bot form submission.'
            });
            logger.warn({response: response}, `${event} failed`);
            return callback(response);
          }
          storage
            .then((): void => {
              getItem('breezy users').then(
                (users: User[] | undefined): void => {
                  const account = users?.find(
                    (user): boolean =>
                      user.username === data.username &&
                      DateTime.utc()
                        .endOf('day')
                        .diff(
                          DateTime.fromISO(user.session.lastOnline)
                            .toUTC()
                            .startOf('day'),
                          ['weeks']
                        ).weeks <= 1
                  );
                  compare(data.password, account?.password ?? '').then(
                    (correctPassword): void => {
                      if (!users || !account || !correctPassword) {
                        const response: ClientResponse = createErrorResponse({
                          code: '401',
                          message: 'username or password is invalid.'
                        });
                        logger.warn({response: response}, `${event} failed`);
                        return callback(response);
                      }
                      let oldSocket: string | null = null;
                      let persistentStatus: typeof account.session.status =
                        'online';
                      const newSessionId = nanoid();
                      const timestamp =
                        DateTime.utc().toISO() ?? new Date().toISOString();
                      const updatedUsers = users.map((user): User => {
                        if (user.id === account.id) {
                          oldSocket = user.session.socket;
                          const updatedUser: User = {
                            ...user,
                            session: {
                              ...user.session,
                              id: newSessionId,
                              socket: socket.id,
                              status:
                                user.session.status === 'offline'
                                  ? persistentStatus
                                  : user.session.status,
                              lastOnline: timestamp
                            }
                          };
                          persistentStatus = updatedUser.session.status;
                          return updatedUser;
                        }
                        return user;
                      });
                      const ttl = DateTime.max(
                        ...updatedUsers.map(
                          (user): DateTime =>
                            DateTime.fromISO(user.session.lastOnline, {
                              zone: 'utc'
                            })
                        )
                      )
                        .plus({weeks: 1})
                        .diff(DateTime.utc(), ['milliseconds']).milliseconds;
                      setItem('breezy users', updatedUsers, {ttl: ttl}).then(
                        (): void => {
                          if (oldSocket) {
                            socket.broadcast
                              .to(oldSocket)
                              .emit('logout old session');
                          }
                          const userStatusNotif: UserStatusNotif = {
                            user: {
                              id: account.id,
                              session: {
                                status: persistentStatus
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
                          const response: ClientResponse =
                            createSuccessResponse({
                              data: {
                                token: sign(
                                  {id: account.id, session: newSessionId},
                                  Buffer.from(
                                    process.env.JWT_KEY_PRIVATE_BASE64,
                                    'base64'
                                  ).toString(),
                                  {
                                    algorithm: 'RS256',
                                    issuer: 'resen',
                                    subject: account.username
                                  }
                                )
                              }
                            });
                          logger.info({response: response}, `${event} success`);
                          return callback(response);
                        }
                      );
                      return undefined;
                    }
                  );
                }
              );
            })
            .catch((storageError: Error): void => {
              keys()
                .then((storageKeys): void => {
                  for (const storageKey of storageKeys) {
                    if (storageKey.startsWith('breezy')) {
                      removeItem(storageKey);
                    }
                  }
                })
                .finally((): void => {
                  socket.broadcast.emit('force logout');
                  const response: ClientResponse = createErrorResponse({
                    code: '503',
                    message:
                      'an error occured while accessing the storage file.'
                  });
                  logger.warn(
                    {response: response, error: storageError.message},
                    `${event} failed`
                  );
                  return callback(obfuscateResponse(response));
                });
            });
          return undefined;
        })
        .catch((captchaError: Error): void => {
          const response: ClientResponse = createErrorResponse({
            code: '503',
            message: 'an error occured while verifying captcha.'
          });
          logger.warn(
            {response: response, error: captchaError.message},
            `${event} failed`
          );
          return callback(obfuscateResponse(response));
        });
      return undefined;
    }
  );
};

export {redact};
export type {LoginReq, UserStatusNotif};
export default loginEvent;
