import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {getItem, setItem} from 'node-persist';
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
import {verifyReCaptcha} from '@utils/recaptcha';

type LoginReq = {
  username: string;
  password: string;
  honeypot: string;
  token: string;
};

type UserLoggedInNotif = {
  id: string;
  session: {
    status: 'online' | 'away' | 'offline';
    lastOnline: string;
  };
};

const redact: string[] = ['request.password', 'request.token'];

const login = (socket: Socket, logger: Logger): void => {
  socket.on(
    'login',
    (request: LoginReq, callback: (response: ClientResponse) => void): void => {
      logger.info({request: request}, 'login');
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
        token: joi.string().required().messages({
          'string.base': "4220401|'token' must be a string.",
          'string.empty': "4220402|'token' must not be empty.",
          'any.required': "40004|'token' is required."
        })
      });
      const {value: validatedValue, error: validationError} =
        requestSchema.validate(request);
      if (validationError) {
        const response: ClientResponse = createErrorResponse({
          code: validationError.message.split('|')[0],
          message: validationError.message.split('|')[1]
        });
        logger.warn({response: response}, 'login failed');
        return callback(response);
      }
      let data = validatedValue as LoginReq;
      data = {
        ...data,
        username: sanitize(data.username).trim().toLowerCase(),
        token: sanitize(data.token).trim()
      };
      verifyReCaptcha({
        version: 2,
        token: data.token
      })
        .then((success): void => {
          if (!success) {
            const response: ClientResponse = createErrorResponse({
              code: '40303',
              message: 'access denied for bot form submission.'
            });
            logger.warn({response: response}, 'login failed');
            return callback(response);
          }
          storage
            .then((): void => {
              getItem('breezy users').then((users: User[]): void => {
                const account = users?.find(
                  (user): boolean =>
                    user.username === data.username &&
                    DateTime.utc()
                      .endOf('day')
                      .diff(
                        DateTime.fromISO(user.session.lastOnline)
                          .toUTC()
                          .startOf('day'),
                        ['months']
                      ).months <= 1
                );
                compare(data.password, account?.password ?? '').then(
                  (correctPassword): void => {
                    if (!account || !correctPassword) {
                      const response: ClientResponse = createErrorResponse({
                        code: '401',
                        message: 'invalid username or password.'
                      });
                      logger.warn({response: response}, 'login failed');
                      return callback(response);
                    }
                    let oldSessionSocket: string | null = null;
                    const newSessionId = nanoid();
                    const timestamp: string =
                      DateTime.utc().toISO() ?? new Date().toISOString();
                    const updatedUsers = users.map((user): User => {
                      if (user.id === account.id) {
                        oldSessionSocket = user.session.socket;
                        const updatedUser: User = {
                          ...user,
                          session: {
                            ...user.session,
                            id: newSessionId,
                            socket: socket.id,
                            status: 'online',
                            lastOnline: timestamp
                          }
                        };
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
                      .plus({months: 1})
                      .diff(DateTime.utc(), ['milliseconds']).milliseconds;
                    setItem('breezy users', updatedUsers, {ttl: ttl}).then(
                      (): void => {
                        if (oldSessionSocket) {
                          socket.broadcast
                            .to(oldSessionSocket)
                            .emit('logout old session');
                        }
                        const loggedInUser: UserLoggedInNotif = {
                          id: account.id,
                          session: {
                            status: 'online',
                            lastOnline: timestamp
                          }
                        };
                        socket.broadcast.emit('user logged in', loggedInUser);
                        const response: ClientResponse = createSuccessResponse({
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
                        logger.info({response: response}, 'login success');
                        return callback(response);
                      }
                    );
                    return undefined;
                  }
                );
              });
            })
            .catch((error: Error): void => {
              const response: ClientResponse = createErrorResponse({
                code: '500',
                message: 'an error occured while accessing the storage.'
              });
              logger.warn(
                {response: response, error: error.message},
                'login failed'
              );
              return callback(response);
            });
          return undefined;
        })
        .catch((error: Error): void => {
          const response: ClientResponse = createErrorResponse({
            code: '500',
            message: 'an error occured while attempting to verify captcha.'
          });
          logger.warn(
            {response: response, error: error.message},
            'login failed'
          );
          return callback(response);
        });
      return undefined;
    }
  );
};

export {redact};
export type {LoginReq, UserLoggedInNotif};
export default login;
