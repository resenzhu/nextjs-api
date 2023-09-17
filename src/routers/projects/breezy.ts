import type {Server, Socket} from 'socket.io';
import joi from 'joi';
import {logger} from '@utils/logger';

type SignUpReq = {
  username: string;
  displayName: string;
  password: string;
  honeypot: string;
  token: string;
};

type SignUpRes = {
  success: boolean;
  error:
    | {
        code: number;
        message: string;
      }
    | Record<string, never>;
  data: object;
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
      (request: SignUpReq, callback: (response: SignUpRes) => void): void => {
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
            .max(120)
            .pattern(/^[a-zA-Z\s]*$/u)
            .required()
            .messages({
              'string.base': "4220101|'displayName' must be a string.",
              'string.empty': "4220102|'displayName' must not be empty.",
              'string.min':
                "4220103|'displayName' must be between 2 and 120 characters.",
              'string.max':
                "4220104|'displayName' must be between 2 and 120 characters.",
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
      }
    );
    socket.on('disconnect', (): void => {
      breezyLogger.info('socket disconnected');
    });
  });
};

export default breezyRouter;
