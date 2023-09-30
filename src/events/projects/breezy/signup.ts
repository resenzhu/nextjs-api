import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import {hash} from 'bcrypt';
import joi from 'joi';
import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
import {sign} from 'jsonwebtoken';
import {storage} from '@utils/storage';
import {verifyReCaptcha} from '@utils/recaptcha';

type SignUpReq = {
  username: string;
  displayName: string;
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

const signupEvent = (socket: Socket, logger: Logger): void => {
  socket.on(
    'signup',
    (
      request: SignUpReq,
      callback: (response: ClientResponse) => void
    ): void => {
      logger.info({request: request}, 'signup');
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
        logger.warn({response: response}, 'signup failed');
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
            logger.warn({response: response}, 'signup failed');
            return callback(response);
          }
          storage
            .then((): void => {
              getItem('breezy users').then((users: User[]): void => {
                const account = users?.find(
                  (user): boolean => user.username === data.username
                );
                if (account) {
                  const response: ClientResponse = createErrorResponse({
                    code: '40901',
                    message: 'username already exists.'
                  });
                  logger.warn({response: response}, 'signup failed');
                  return callback(response);
                }
                getItem('breezy sessions').then((sessions: Session[]): void => {
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
                    setItem('breezy users', [...(users ?? []), newUser]).then(
                      (): void => {
                        setItem('breezy sessions', [
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
                          logger.info({response: response}, 'signup success');
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
              logger.warn(
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
          logger.warn(
            {response: response, error: error.message},
            'signup failed'
          );
          return callback(response);
        });
      return undefined;
    }
  );
};

export type {SignUpReq, User, Session};
export default signupEvent;
