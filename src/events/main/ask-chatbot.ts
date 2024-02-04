import {type Response, createResponse} from '@utils/response';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import joi from 'joi';
import {sanitize} from 'isomorphic-dompurify';

type AskChatbotReq = {
  input: string;
};

const askChatbotEvent = (
  socket: Socket,
  logger: Logger,
  {chatbot}: {chatbot: any} // eslint-disable-line
): void => {
  const event: string = 'ask chatbot';
  socket.on(
    event,
    async (
      request: AskChatbotReq,
      callback: (response: Response) => void
    ): Promise<void> => {
      logger.info({request: request}, event);
      const requestSchema = joi.object({
        input: joi.string().min(1).max(160).required().messages({
          'string.base': "4220101|'input' must be a string.",
          'string.empty': "4220102|'input' must not be empty.",
          'string.min': "4220103|'input' must be between 1 and 160 characters.",
          'string.max': "4220104|'input' must be between 1 and 160 characters.",
          'any.required': "40001|'input' is required."
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
      let data = validatedValue as AskChatbotReq;
      data = {
        ...data,
        input: sanitize(data.input).trim()
      };
      const reply = await chatbot.process(data.input);
      return callback(
        createResponse({
          event: event,
          logger: logger,
          data: {
            reply: reply.answer
          }
        })
      );
    }
  );
};

export type {AskChatbotReq};
export default askChatbotEvent;
