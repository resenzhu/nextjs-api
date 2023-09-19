import {type ClientResponse, createErrorResponse, createSuccessResponse} from '@utils/response';
import type {Server, Socket} from 'socket.io';
import {type WriteFileResult, getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import {breezyStorage} from '@utils/storage';
import {hash} from 'bcrypt';
import joi from 'joi';
import logger from '@utils/logger';
import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
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

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.on('connection', (socket: Socket): void => {
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
        const data = validatedValue as SignUpReq;
        verifyReCaptcha({
          version: 2,
          token: sanitize(data.token).trim()
        })
          .then((success): void => {
            if (!Boolean(success)) {
              const response: ClientResponse = createErrorResponse({
                code: '403',
                message: 'access denied for bot form submission.'
              });
              breezyLogger.warn({response: response}, 'signup failed');
              return callback(response);
            }
            breezyStorage.then((): Promise<User[]> => getItem('users')).then((users): void => {
              if (!users) {
                hash(data.password, 10).then((hash: string): void => {
                  const newUser: User = {
                    id: nanoid(),
                    username: sanitize(data.username).trim().toLowerCase(),
                    displayName: sanitize(data.displayName).trim(),
                    password: hash,
                    createdDate:
                      DateTime.utc().toISO() ?? new Date(Date.now()).toISOString(),
                    modifiedDate:
                      DateTime.utc().toISO() ?? new Date(Date.now()).toISOString()
                  };
                  breezyStorage
                    .then((): Promise<WriteFileResult> => setItem('users', newUser))
                    .then((): void => {
                      const response: ClientResponse = createSuccessResponse({});
                      breezyLogger.info(
                        {response: response},
                        'signup success'
                      );
                      return callback(response);
                    })
                    .catch((error: Error): void => {
                      const response: ClientResponse = createErrorResponse({
                        code: '500',
                        message: 'an error occured while storing data on the server.'
                      });
                      breezyLogger.warn(
                        {response: response, error: error.message},
                        'signup failed'
                      );
                      return callback(response);
                    });
                });
              }
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
    socket.on('disconnect', (): void => {
      breezyLogger.info('socket disconnected');
    });
  });
};

export default breezyRouter;
