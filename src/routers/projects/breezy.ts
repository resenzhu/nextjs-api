import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Server} from 'socket.io';
import {breezyStorage} from '@utils/storage';
import {hash} from 'bcrypt';
import joi from 'joi';
import logger from '@utils/logger';
import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
import {sign} from 'jsonwebtoken';
import {verifyReCaptcha} from '@utils/recaptcha';

type SignUpReq = {
  username: string;
  displayName: string;
  password: string;
  honeypot: string;
  token: string;
};

type LoginReq = {
  username: string;
  password: string;
  honeypot: string;
  token: string;
};

type User = {
  id: string;
  username: string;
  displayName: string;
  password: string;
  createdDate: string;
  modifiedDate: string;
};

type Session = {
  id: string;
  userId: string;
  socket: string | null;
  status: 'online' | 'away' | 'offline';
  lastOnline: string;
};

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.on('connection', (socket): void => {
    const breezyLogger = logger.child({
      namespace: 'project/breezy',
      socketid: socket.id
    });
    breezyLogger.info('socket connected');
    socket.on(
      'signup',
      (
        request: SignUpReq,
        callback: (response: ClientResponse) => void
      ): void => {
        breezyLogger.info({request: request}, 'signup');
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
              'any.required': "40001|'displayName' is required."
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
          breezyLogger.warn({response: response}, 'signup failed');
          return callback(response);
        }
        let data = validatedValue as SignUpReq;
        data = {
          ...data,
          username: sanitize(data.username).trim().toLowerCase(),
          displayName: sanitize(data.displayName).trim(),
          token: sanitize(data.token).trim()
        };
        verifyReCaptcha({
          version: 2,
          token: data.token
        })
          .then((success): void => {
            if (!success) {
              const response: ClientResponse = createErrorResponse({
                code: '40304',
                message: 'access denied for bot form submission.'
              });
              breezyLogger.warn({response: response}, 'signup failed');
              return callback(response);
            }
            breezyStorage
              .then((): void => {
                getItem('users').then((users: User[]): void => {
                  const exists: boolean =
                    users &&
                    users.some(
                      (user): boolean => user.username === data.username
                    );
                  if (exists) {
                    const response: ClientResponse = createErrorResponse({
                      code: '40901',
                      message: 'username already exists.'
                    });
                    breezyLogger.warn({response: response}, 'signup failed');
                    return callback(response);
                  }
                  getItem('sessions').then((sessions: Session[]): void => {
                    hash(data.password, 10).then((hashedPassword): void => {
                      const newUser: User = {
                        id: nanoid(),
                        username: data.username,
                        displayName: data.displayName,
                        password: hashedPassword,
                        createdDate:
                          DateTime.utc().toISO() ??
                          new Date(Date.now()).toISOString(),
                        modifiedDate:
                          DateTime.utc().toISO() ??
                          new Date(Date.now()).toISOString()
                      };
                      const newSession: Session = {
                        id: nanoid(),
                        userId: newUser.id,
                        socket: socket.id,
                        status: 'online',
                        lastOnline:
                          DateTime.utc().toISO() ??
                          new Date(Date.now()).toISOString()
                      };
                      setItem('users', [...(users ?? []), newUser]).then(
                        (): void => {
                          setItem('sessions', [
                            ...(sessions ?? []),
                            newSession
                          ]).then((): void => {
                            const response: ClientResponse =
                              createSuccessResponse({
                                data: {
                                  token: sign(
                                    {id: newUser.id, session: newSession.id},
                                    Buffer.from(
                                      process.env.JWT_KEY_PRIVATE_BASE64,
                                      'base64'
                                    ).toString(),
                                    {
                                      algorithm: 'RS256',
                                      issuer: 'resen',
                                      subject: newUser.username,
                                      expiresIn: '8d'
                                    }
                                  )
                                }
                              });
                            breezyLogger.info(
                              {response: response},
                              'signup success'
                            );
                            return callback(response);
                          });
                        }
                      );
                    });
                  });
                  return undefined;
                });
              })
              .catch((error: Error): void => {
                const response: ClientResponse = createErrorResponse({
                  code: '500',
                  message: 'an error occured while accessing the storage.'
                });
                breezyLogger.warn(
                  {response: response, error: error.message},
                  'signup failed'
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
            breezyLogger.warn(
              {response: response, error: error.message},
              'signup failed'
            );
            return callback(response);
          });
        return undefined;
      }
    );
    socket.on(
      'login',
      (
        request: LoginReq,
        callback: (response: ClientResponse) => void
      ): void => {
        breezyLogger.info({request: request}, 'login');
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
          breezyLogger.warn({response: response}, 'login failed');
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
              breezyLogger.warn({response: response}, 'login failed');
              return callback(response);
            }
            breezyStorage
              .then((): void => {
                getItem('users').then((users: User[]): void => {});
              })
              .catch((error: Error): void => {
                const response: ClientResponse = createErrorResponse({
                  code: '500',
                  message: 'an error occured while accessing the storage.'
                });
                breezyLogger.warn(
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
            breezyLogger.warn(
              {response: response, error: error.message},
              'login failed'
            );
            return callback(response);
          });
        return undefined;
      }
    );
    socket.on('disconnect', (): void => {
      breezyLogger.info('socket disconnected');
    });
  });
};

export default breezyRouter;
