import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {object, string} from 'joi';
import type {Server} from 'socket.io';
import logger from '@utils/logger';
import {sanitize} from 'isomorphic-dompurify';
import {sendEmail} from '@utils/email';
import {verifyReCaptcha} from '@utils/recaptcha';

type AskChatbotReq = {
  input: string;
};

type SubmitContactFormReq = {
  name: string;
  email: string;
  message: string;
  honeypot: string;
  token: string;
};

const {dockStart} = require('@nlpjs/basic'); // eslint-disable-line

const mainRouter = async (server: Server): Promise<void> => {
  const main = server.of('/main');
  const chatbot = await dockStart().then((dock: any): any => dock.get('nlp')); // eslint-disable-line
  main.on('connection', (socket): void => {
    const mainLogger = logger.child({
      namespace: 'main',
      socketid: socket.id
    });
    mainLogger.info('socket connected');
    socket.on(
      'ask-chatbot',
      async (
        request: AskChatbotReq,
        callback: (response: ClientResponse) => void
      ): Promise<void> => {
        mainLogger.info({request: request}, 'ask chatbot');
        const requestSchema = object({
          input: string().min(1).max(160).required().messages({
            'string.base': "4220101|'input' must be a string.",
            'string.empty': "4220102|'input' must not be empty.",
            'string.min':
              "4220103|'input' must be between 1 and 160 characters.",
            'string.max':
              "4220104|'input' must be between 1 and 160 characters.",
            'any.required': "40001|'input' is required."
          })
        });
        const {value: validatedValue, error: validationError} =
          requestSchema.validate(request);
        if (validationError) {
          const response: ClientResponse = createErrorResponse({
            code: validationError.message.split('|')[0],
            message: validationError.message.split('|')[1]
          });
          mainLogger.warn({response: response}, 'ask chatbot failed');
          return callback(response);
        }
        let data = validatedValue as AskChatbotReq;
        data = {
          ...data,
          input: sanitize(data.input).trim()
        };
        const reply = await chatbot.process(data.input);
        const response: ClientResponse = createSuccessResponse({
          data: {
            reply: reply.answer
          }
        });
        mainLogger.info({response: response}, 'ask chatbot success');
        return callback(response);
      }
    );
    socket.on(
      'submit-contact-form',
      (
        request: SubmitContactFormReq,
        callback: (response: ClientResponse) => void
      ): void => {
        mainLogger.info({request: request}, 'submit contact form');
        const requestSchema = object({
          name: string()
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
          email: string().min(3).max(320).email().required().messages({
            'string.base': "4220201|'email' must be a string.",
            'string.empty': "4220202|'email' must not be empty.",
            'string.min':
              "4220203|'email' must be between 3 and 320 characters.",
            'string.max':
              "4220204|'email' must be between 3 and 320 characters.",
            'string.email': "4220205|'email' must be in a valid format.",
            'any.required': "40002|'email' is required."
          }),
          message: string().min(15).max(2000).required().messages({
            'string.base': "4220301|'message' must be a string.",
            'string.empty': "4220302|'message' must not be empty.",
            'string.min':
              "4220303|'message' must be between 15 and 2000 characters.",
            'string.max':
              "4220304|'message' must be between 15 and 2000 characters.",
            'any.required': "40003|'message' is required."
          }),
          honeypot: string().allow('').length(0).required().messages({
            'string.base': "4220401|'honeypot' must be a string.",
            'string.length': "4220402|'honeypot' must be empty.",
            'any.required': "40004|'honeypot' is required."
          }),
          token: string().required().messages({
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
          mainLogger.warn({response: response}, 'submit contact form failed');
          return callback(response);
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
          token: sanitize(data.token).trim()
        };
        verifyReCaptcha({
          version: 3,
          token: data.token
        })
          .then((score): void => {
            if (Number(score) <= 0.5) {
              const response: ClientResponse = createErrorResponse({
                code: '403',
                message: 'access denied for bot form submission.'
              });
              mainLogger.warn(
                {response: response},
                'submit contact form failed'
              );
              return callback(response);
            }
            sendEmail({
              name: data.name,
              email: data.email,
              message: data.message
            })
              .then((): void => {
                const response: ClientResponse = createSuccessResponse({});
                mainLogger.info(
                  {response: response},
                  'submit contact form success'
                );
                return callback(response);
              })
              .catch((error: Error): void => {
                const response: ClientResponse = createErrorResponse({
                  code: '500',
                  message:
                    'an error occured while attempting to send the email.'
                });
                mainLogger.warn(
                  {response: response, error: error.message},
                  'submit contact form failed'
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
            mainLogger.warn(
              {response: response, error: error.message},
              'submit contact form failed'
            );
            return callback(response);
          });
        return undefined;
      }
    );
    socket.on('disconnect', (): void => {
      mainLogger.info('socket disconnected');
    });
  });
};

export type {AskChatbotReq, SubmitContactFormReq};
export default mainRouter;
